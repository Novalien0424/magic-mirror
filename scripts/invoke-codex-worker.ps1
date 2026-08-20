[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('implementer', 'surveyor', 'tester')]
    [string]$Role,

    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$PromptPath,

    [Parameter(Mandatory = $false)]
    [ValidateRange(1, 3600)]
    [int]$TimeoutSeconds = 600,

    [Parameter(Mandatory = $false)]
    [ValidateRange(1024, 67108864)]
    [long]$MaxOutputBytes = 4194304,

    [Parameter(Mandatory = $false)]
    [string]$CodexCommandPath
)

$ErrorActionPreference = 'Stop'

function Stop-Launcher {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Stage,

        [Parameter(Mandatory = $true)]
        [string]$Reason,

        [int]$ExitCode = 2
    )

    [Console]::Error.WriteLine("codex_worker_launcher stage=$Stage status=failed reason=$Reason")
    exit $ExitCode
}

if ([string]::IsNullOrWhiteSpace($PromptPath)) {
    Stop-Launcher -Stage 'preflight' -Reason 'missing_prompt_path'
}

function Get-FieldLines {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string[]]$Lines,

        [Parameter(Mandatory = $true)]
        [string]$FieldName
    )

    $fieldPattern = '^[ \t]*' + [regex]::Escape($FieldName) + ':[ \t]*.*[ \t]*$'
    return @($Lines | Where-Object { $_ -match $fieldPattern })
}

function Assert-ExactScalar {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string[]]$Lines,

        [Parameter(Mandatory = $true)]
        [string]$FieldName,

        [Parameter(Mandatory = $true)]
        [string]$ExpectedPattern
    )

    $fieldLines = @(Get-FieldLines -Lines $Lines -FieldName $FieldName)
    if ($fieldLines.Count -eq 0) {
        Stop-Launcher -Stage 'preflight' -Reason ("missing_$FieldName")
    }
    if ($fieldLines.Count -ne 1) {
        Stop-Launcher -Stage 'preflight' -Reason ("duplicate_$FieldName")
    }
    if ($fieldLines[0] -notmatch $ExpectedPattern) {
        Stop-Launcher -Stage 'preflight' -Reason ("mismatch_$FieldName")
    }
}

function Assert-RequiredField {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string[]]$Lines,

        [Parameter(Mandatory = $true)]
        [string]$FieldName
    )

    $fieldLines = @(Get-FieldLines -Lines $Lines -FieldName $FieldName)
    if ($fieldLines.Count -eq 0) {
        Stop-Launcher -Stage 'preflight' -Reason ("missing_$FieldName")
    }
    if ($fieldLines.Count -ne 1) {
        Stop-Launcher -Stage 'preflight' -Reason ("duplicate_$FieldName")
    }
}

function ConvertTo-ProcessArgument {
    param(
        [AllowEmptyString()]
        [string]$Value
    )

    if ($null -eq $Value -or $Value.Length -eq 0) {
        return '""'
    }
    if ($Value -notmatch '[\s"]') {
        return $Value
    }

    $escaped = $Value -replace '(\\*)"', '$1$1\"'
    $escaped = $escaped -replace '(\\+)$', '$1$1'
    return '"' + $escaped + '"'
}

function Resolve-PowerShellHost {
    $currentHostIsPowerShell7 = (
        [string]$PSVersionTable.PSEdition -eq 'Core' -and
        [int]$PSVersionTable.PSVersion.Major -ge 7
    )

    if ($currentHostIsPowerShell7) {
        foreach ($candidatePath in @(
            (Join-Path -Path $PSHOME -ChildPath 'pwsh.exe'),
            (Join-Path -Path $PSHOME -ChildPath 'pwsh')
        )) {
            if ([System.IO.File]::Exists($candidatePath)) {
                return $candidatePath
            }
        }
    }

    foreach ($commandName in @('pwsh.exe', 'pwsh')) {
        $hostCommand = Get-Command -Name $commandName -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -ne $hostCommand) {
            $hostPath = [string]$hostCommand.Source
            if ([string]::IsNullOrWhiteSpace($hostPath)) {
                $hostPath = [string]$hostCommand.Path
            }
            if (-not [string]::IsNullOrWhiteSpace($hostPath) -and [System.IO.File]::Exists($hostPath)) {
                return $hostPath
            }
        }
    }

    $currentPowerShellPath = Join-Path -Path $PSHOME -ChildPath 'powershell.exe'
    if ([System.IO.File]::Exists($currentPowerShellPath)) {
        return $currentPowerShellPath
    }

    $hostCommand = Get-Command -Name 'powershell.exe' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $hostCommand) {
        $hostPath = [string]$hostCommand.Source
        if ([string]::IsNullOrWhiteSpace($hostPath)) {
            $hostPath = [string]$hostCommand.Path
        }
        if (-not [string]::IsNullOrWhiteSpace($hostPath) -and [System.IO.File]::Exists($hostPath)) {
            return $hostPath
        }
    }

    return $null
}

function Confirm-ChildTreeTermination {
    param(
        [Parameter(Mandatory = $true)]
        [System.Diagnostics.Process]$Process
    )

    $treeTerminated = $false
    try {
        $Process.Kill($true)
        $treeTerminated = $Process.WaitForExit(5000)
        if ($treeTerminated -and -not $Process.HasExited) {
            $treeTerminated = $false
        }
    }
    catch {
        $treeTerminated = $false
    }

    return [bool]$treeTerminated
}

try {
    $repoRoot = (Resolve-Path -LiteralPath (Join-Path -Path $PSScriptRoot -ChildPath '..') -ErrorAction Stop).Path
}
catch {
    Stop-Launcher -Stage 'preflight' -Reason 'repo_not_found'
}

try {
    $promptItem = Get-Item -LiteralPath $PromptPath -Force -ErrorAction Stop
    if ($promptItem.PSIsContainer -or -not [System.IO.File]::Exists($promptItem.FullName)) {
        Stop-Launcher -Stage 'preflight' -Reason 'prompt_not_regular_file'
    }
    $promptBytes = [System.IO.File]::ReadAllBytes($promptItem.FullName)
}
catch {
    Stop-Launcher -Stage 'preflight' -Reason 'prompt_not_readable'
}

try {
    $utf8 = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false, $true
    $promptText = $utf8.GetString($promptBytes)
    if ($promptText.Length -gt 0 -and $promptText[0] -eq [char]0xFEFF) {
        $promptText = $promptText.Substring(1)
    }
    $promptLines = @($promptText -split '\r\n|\n|\r')
}
catch {
    Stop-Launcher -Stage 'preflight' -Reason 'prompt_not_utf8'
}

Assert-ExactScalar -Lines $promptLines -FieldName 'model' -ExpectedPattern '^[ \t]*model:[ \t]*"gpt-5\.6-luna"[ \t]*$'
Assert-ExactScalar -Lines $promptLines -FieldName 'reasoning_effort' -ExpectedPattern '^[ \t]*reasoning_effort:[ \t]*"max"[ \t]*$'
$rolePattern = '^[ \t]*role:[ \t]*"' + [regex]::Escape($Role) + '"[ \t]*$'
Assert-ExactScalar -Lines $promptLines -FieldName 'role' -ExpectedPattern $rolePattern
Assert-ExactScalar -Lines $promptLines -FieldName 'fresh_worker' -ExpectedPattern '^[ \t]*fresh_worker:[ \t]*true[ \t]*$'

foreach ($requiredField in @('task', 'write_scope', 'skills', 'self_invariants', 'evidence', 'self_review', 'root_review')) {
    Assert-RequiredField -Lines $promptLines -FieldName $requiredField
}

try {
    if ($PSBoundParameters.ContainsKey('CodexCommandPath')) {
        $commandItem = Get-Item -LiteralPath $CodexCommandPath -Force -ErrorAction Stop
        if ($commandItem.PSIsContainer -or -not [System.IO.File]::Exists($commandItem.FullName)) {
            Stop-Launcher -Stage 'resolve' -Reason 'codex_path_not_regular_file'
        }
        $commandPath = $commandItem.FullName
    }
    else {
        $codexCommand = Get-Command -Name 'codex' -ErrorAction Stop | Select-Object -First 1
        $commandPath = [string]$codexCommand.Source
        if ([string]::IsNullOrWhiteSpace($commandPath)) {
            $commandPath = [string]$codexCommand.Path
        }
        if ([string]::IsNullOrWhiteSpace($commandPath)) {
            Stop-Launcher -Stage 'resolve' -Reason 'codex_command_path_missing'
        }
        $commandItem = Get-Item -LiteralPath $commandPath -Force -ErrorAction Stop
        if ($commandItem.PSIsContainer -or -not [System.IO.File]::Exists($commandItem.FullName)) {
            Stop-Launcher -Stage 'resolve' -Reason 'codex_command_not_regular_file'
        }
        $commandPath = $commandItem.FullName
    }
}
catch {
    Stop-Launcher -Stage 'resolve' -Reason 'codex_command_not_found'
}

$childArguments = @(
    'exec',
    '--profile',
    'nova-auto',
    '--ephemeral',
    '--cd',
    $repoRoot,
    '-m',
    'gpt-5.6-luna',
    '-c',
    'model_reasoning_effort="max"',
    '-'
)

$process = $null
$processStarted = $false
try {
    $processStartInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processStartInfo.UseShellExecute = $false
    $processStartInfo.CreateNoWindow = $true
    $processStartInfo.RedirectStandardInput = $true
    $processStartInfo.RedirectStandardOutput = $true
    $processStartInfo.RedirectStandardError = $true

    if ([System.IO.Path]::GetExtension($commandPath) -ieq '.ps1') {
        $powerShellHost = Resolve-PowerShellHost
        if ([string]::IsNullOrWhiteSpace($powerShellHost)) {
            Stop-Launcher -Stage 'launch' -Reason 'powershell_host_not_found'
        }
        $processStartInfo.FileName = $powerShellHost
        $effectiveArguments = @('-NoLogo', '-NoProfile', '-NonInteractive', '-File', $commandPath) + $childArguments
    }
    else {
        $processStartInfo.FileName = $commandPath
        $effectiveArguments = $childArguments
    }

    $argumentListProperty = $processStartInfo.GetType().GetProperty('ArgumentList')
    if ($null -ne $argumentListProperty) {
        foreach ($argument in $effectiveArguments) {
            [void]$processStartInfo.ArgumentList.Add([string]$argument)
        }
    }
    else {
        $processStartInfo.Arguments = (($effectiveArguments | ForEach-Object {
            ConvertTo-ProcessArgument -Value ([string]$_)
        }) -join ' ')
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processStartInfo

    if (-not $process.Start()) {
        Stop-Launcher -Stage 'launch' -Reason 'child_not_started'
    }
    $processStarted = $true

    $lifetimeClock = [System.Diagnostics.Stopwatch]::StartNew()
    $timeoutMilliseconds = [long]$TimeoutSeconds * 1000

    $inputStream = $process.StandardInput.BaseStream
    $stdoutStream = $process.StandardOutput.BaseStream
    $stderrStream = $process.StandardError.BaseStream
    $parentStdoutStream = [Console]::OpenStandardOutput()
    $parentStderrStream = [Console]::OpenStandardError()

    $stdoutBuffer = New-Object byte[] 4096
    $stderrBuffer = New-Object byte[] 4096
    $stdoutReadTask = $stdoutStream.ReadAsync($stdoutBuffer, 0, $stdoutBuffer.Length)
    $stderrReadTask = $stderrStream.ReadAsync($stderrBuffer, 0, $stderrBuffer.Length)
    $inputWriteTask = $inputStream.WriteAsync($promptBytes, 0, $promptBytes.Length)
    $inputFlushTask = $null

    $stdoutActive = $true
    $stderrActive = $true
    $inputWriteActive = $true
    $inputFlushActive = $false
    $timeoutExceeded = $false
    $outputLimitExceeded = $false
    $streamFailureReason = $null
    $launchFailureReason = $null
    [long]$totalOutputBytes = 0

    while ($stdoutActive -or $stderrActive -or $inputWriteActive -or $inputFlushActive) {
        $remainingMilliseconds = $timeoutMilliseconds - $lifetimeClock.ElapsedMilliseconds
        if ($remainingMilliseconds -le 0) {
            $timeoutExceeded = $true
            break
        }

        $activeTasks = @()
        if ($stdoutActive) {
            $activeTasks += $stdoutReadTask
        }
        if ($stderrActive) {
            $activeTasks += $stderrReadTask
        }
        if ($inputWriteActive) {
            $activeTasks += $inputWriteTask
        }
        if ($inputFlushActive) {
            $activeTasks += $inputFlushTask
        }
        $activeTasks = [System.Threading.Tasks.Task[]]$activeTasks

        try {
            $completedIndex = [System.Threading.Tasks.Task]::WaitAny(
                $activeTasks,
                [int]$remainingMilliseconds
            )
        }
        catch {
            $streamFailureReason = 'stream_wait_failed'
            break
        }

        if ($completedIndex -lt 0) {
            $timeoutExceeded = $true
            break
        }

        $completedTask = $activeTasks[$completedIndex]

        if ($inputWriteActive -and [object]::ReferenceEquals($completedTask, $inputWriteTask)) {
            try {
                [void]$completedTask.GetAwaiter().GetResult()
                $inputWriteActive = $false
                $inputWriteTask = $null
                $inputFlushTask = $inputStream.FlushAsync()
                $inputFlushActive = $true
            }
            catch {
                $launchFailureReason = 'child_input_failed'
                break
            }
            continue
        }

        if ($inputFlushActive -and [object]::ReferenceEquals($completedTask, $inputFlushTask)) {
            try {
                [void]$completedTask.GetAwaiter().GetResult()
                $process.StandardInput.Close()
                $inputFlushActive = $false
                $inputFlushTask = $null
            }
            catch {
                $launchFailureReason = 'child_input_failed'
                break
            }
            continue
        }

        $isStdout = $stdoutActive -and [object]::ReferenceEquals($completedTask, $stdoutReadTask)
        $isStderr = $stderrActive -and [object]::ReferenceEquals($completedTask, $stderrReadTask)
        if (-not $isStdout -and -not $isStderr) {
            $streamFailureReason = 'stream_task_unknown'
            break
        }

        try {
            $bytesRead = [int]$completedTask.GetAwaiter().GetResult()
        }
        catch {
            $streamFailureReason = 'stream_read_failed'
            break
        }

        if ($bytesRead -eq 0) {
            if ($isStdout) {
                $stdoutActive = $false
                $stdoutReadTask = $null
            }
            else {
                $stderrActive = $false
                $stderrReadTask = $null
            }
            continue
        }

        [long]$forwardBytes = $bytesRead
        [long]$remainingOutputBytes = $MaxOutputBytes - $totalOutputBytes
        if ($forwardBytes -gt $remainingOutputBytes) {
            $forwardBytes = $remainingOutputBytes
        }

        try {
            if ($forwardBytes -gt 0) {
                if ($isStdout) {
                    $parentStdoutStream.Write($stdoutBuffer, 0, [int]$forwardBytes)
                    $parentStdoutStream.Flush()
                }
                else {
                    $parentStderrStream.Write($stderrBuffer, 0, [int]$forwardBytes)
                    $parentStderrStream.Flush()
                }
            }
        }
        catch {
            $streamFailureReason = 'stream_write_failed'
            break
        }

        $totalOutputBytes += $bytesRead
        if ($totalOutputBytes -gt $MaxOutputBytes) {
            $outputLimitExceeded = $true
            break
        }

        try {
            if ($isStdout) {
                $stdoutReadTask = $stdoutStream.ReadAsync($stdoutBuffer, 0, $stdoutBuffer.Length)
            }
            else {
                $stderrReadTask = $stderrStream.ReadAsync($stderrBuffer, 0, $stderrBuffer.Length)
            }
        }
        catch {
            $streamFailureReason = 'stream_read_failed'
            break
        }
    }

    if ($outputLimitExceeded) {
        $treeTerminated = Confirm-ChildTreeTermination -Process $process
        if (-not $treeTerminated) {
            Stop-Launcher -Stage 'output' -Reason 'tree_termination_failed'
        }
        Stop-Launcher -Stage 'output' -Reason 'limit_exceeded'
    }

    if ($timeoutExceeded) {
        $treeTerminated = Confirm-ChildTreeTermination -Process $process
        if (-not $treeTerminated) {
            Stop-Launcher -Stage 'timeout' -Reason 'tree_termination_failed'
        }
        Stop-Launcher -Stage 'timeout' -Reason 'deadline_exceeded'
    }

    if ($null -ne $launchFailureReason) {
        $treeTerminated = Confirm-ChildTreeTermination -Process $process
        if (-not $treeTerminated) {
            Stop-Launcher -Stage 'launch' -Reason 'tree_termination_failed' -ExitCode 1
        }
        Stop-Launcher -Stage 'launch' -Reason $launchFailureReason -ExitCode 1
    }

    if ($null -ne $streamFailureReason) {
        $treeTerminated = Confirm-ChildTreeTermination -Process $process
        if (-not $treeTerminated) {
            Stop-Launcher -Stage 'output' -Reason 'tree_termination_failed'
        }
        Stop-Launcher -Stage 'output' -Reason $streamFailureReason
    }

    $remainingMilliseconds = $timeoutMilliseconds - $lifetimeClock.ElapsedMilliseconds
    if ($remainingMilliseconds -le 0) {
        $treeTerminated = Confirm-ChildTreeTermination -Process $process
        if (-not $treeTerminated) {
            Stop-Launcher -Stage 'timeout' -Reason 'tree_termination_failed'
        }
        Stop-Launcher -Stage 'timeout' -Reason 'deadline_exceeded'
    }

    $completed = $process.WaitForExit([int]$remainingMilliseconds)
    if (-not $completed) {
        $treeTerminated = Confirm-ChildTreeTermination -Process $process
        if (-not $treeTerminated) {
            Stop-Launcher -Stage 'timeout' -Reason 'tree_termination_failed'
        }
        Stop-Launcher -Stage 'timeout' -Reason 'deadline_exceeded'
    }

    try {
        $parentStdoutStream.Flush()
        $parentStderrStream.Flush()
    }
    catch {
        Stop-Launcher -Stage 'output' -Reason 'stream_write_failed'
    }

    $childExitCode = $process.ExitCode
    if ($childExitCode -eq 0) {
        exit 0
    }

    Stop-Launcher -Stage 'child' -Reason 'exit_nonzero' -ExitCode 1
}
catch {
    if ($processStarted) {
        $treeTerminated = Confirm-ChildTreeTermination -Process $process
        if (-not $treeTerminated) {
            Stop-Launcher -Stage 'launch' -Reason 'tree_termination_failed' -ExitCode 1
        }
    }
    Stop-Launcher -Stage 'launch' -Reason 'child_launch_failed' -ExitCode 1
}
finally {
    if ($null -ne $process) {
        $process.Dispose()
    }
}
