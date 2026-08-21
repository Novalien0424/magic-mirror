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
    [ValidateRange(1, 3600)]
    [int]$FirstWriteTimeoutSeconds = 420,

    [Parameter(Mandatory = $false)]
    [ValidateRange(1, 3600)]
    [int]$PostWriteIdleTimeoutSeconds = 120,

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

if ($env:MIRROR_CODEX_WORKER_ACTIVE -ceq '1') {
    Stop-Launcher -Stage 'preflight' -Reason 'recursive_invocation'
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

function Get-WorkerContextPreambleBytes {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('implementer', 'surveyor', 'tester')]
        [string]$Role
    )

    $preambleText = @(
        'worker_context_version: "H6"'
        'already_launched: true'
        ('role: "{0}"' -f $Role)
        'root_authority: false'
        'recursive_codex: forbidden'
        'recursive_launcher: forbidden'
        'global_skill_mode: "subagent-stop"'
        'quiet_reads: true'
        'read_scope_enforcement: "exact_only"'
        'source_body_output: "forbidden_unless_evidence_requires"'
        'terminal_read_output: "metadata_only"'
        'repository_wide_discovery: "forbidden"'
        'first_write_deadline_seconds: 420'
        'post_write_idle_deadline_seconds: 120'
        'max_read_output_lines: 200'
        '--- BEGIN ORIGINAL PROMPT ---'
    ) -join "`r`n"

    $utf8NoBom = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
    return ,$utf8NoBom.GetBytes($preambleText + "`r`n")
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

function ConvertFrom-WorkerJsonLine {
    param(
        [Parameter(Mandatory = $true)]
        [byte[]]$LineBytes,

        [Parameter(Mandatory = $true)]
        [System.Text.UTF8Encoding]$Utf8
    )

    $invalidResult = [pscustomobject]@{
        Valid = $false
        Kind = 'invalid'
        Text = ''
    }

    if ($LineBytes.Length -eq 0) {
        return $invalidResult
    }

    try {
        $lineText = $Utf8.GetString($LineBytes)
        $parsed = ConvertFrom-Json -InputObject $lineText -ErrorAction Stop
    }
    catch {
        return $invalidResult
    }

    if ($null -eq $parsed -or $parsed -isnot [pscustomobject]) {
        return $invalidResult
    }

    $typeProperty = $parsed.PSObject.Properties['type']
    if ($null -eq $typeProperty -or $typeProperty.Value -isnot [string]) {
        return $invalidResult
    }

    $eventType = [string]$typeProperty.Value
    if ($eventType -ceq 'item.completed') {
        $itemProperty = $parsed.PSObject.Properties['item']
        if (
            $null -eq $itemProperty -or
            $null -eq $itemProperty.Value -or
            $itemProperty.Value -isnot [pscustomobject]
        ) {
            return $invalidResult
        }

        $item = $itemProperty.Value
        $itemTypeProperty = $item.PSObject.Properties['type']
        if ($null -eq $itemTypeProperty -or $itemTypeProperty.Value -isnot [string]) {
            return $invalidResult
        }

        $itemType = [string]$itemTypeProperty.Value
        if ($itemType -ceq 'file_change') {
            return [pscustomobject]@{
                Valid = $true
                Kind = 'file_change'
                Text = ''
            }
        }

        if ($itemType -ceq 'agent_message') {
            $textProperty = $item.PSObject.Properties['text']
            if ($null -eq $textProperty -or $textProperty.Value -isnot [string]) {
                return $invalidResult
            }
            return [pscustomobject]@{
                Valid = $true
                Kind = 'agent_message'
                Text = [string]$textProperty.Value
            }
        }
    }

    return [pscustomobject]@{
        Valid = $true
        Kind = 'progress'
        Text = ''
    }
}

function Apply-WorkerJsonEvent {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Event,

        [Parameter(Mandatory = $true)]
        [bool]$FirstWriteEnforced,

        [Parameter(Mandatory = $true)]
        [ref]$FirstWriteObserved,

        [Parameter(Mandatory = $true)]
        [ref]$PostWriteEnforced,

        [Parameter(Mandatory = $true)]
        [ref]$PostWriteIdleOriginMilliseconds,

        [Parameter(Mandatory = $true)]
        [ref]$LatestAgentMessage,

        [Parameter(Mandatory = $true)]
        [long]$NowMilliseconds
    )

    if ($Event.Kind -eq 'agent_message' -and -not [string]::IsNullOrEmpty([string]$Event.Text)) {
        [void]($LatestAgentMessage.Value = [string]$Event.Text)
    }

    if ($FirstWriteEnforced -and $Event.Kind -eq 'file_change' -and -not $FirstWriteObserved.Value) {
        [void]($FirstWriteObserved.Value = $true)
        [void]($PostWriteEnforced.Value = $true)
    }

    if ($PostWriteEnforced.Value) {
        [void]($PostWriteIdleOriginMilliseconds.Value = $NowMilliseconds)
    }
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

$workerContextPreambleBytes = Get-WorkerContextPreambleBytes -Role $Role
$promptInputBytes = New-Object byte[] ($workerContextPreambleBytes.Length + $promptBytes.Length)
[System.Buffer]::BlockCopy($workerContextPreambleBytes, 0, $promptInputBytes, 0, $workerContextPreambleBytes.Length)
[System.Buffer]::BlockCopy($promptBytes, 0, $promptInputBytes, $workerContextPreambleBytes.Length, $promptBytes.Length)

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
    '--json',
    '-'
)

$process = $null
$parentStdoutStream = $null
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

    $processStartInfo.EnvironmentVariables['MIRROR_CODEX_WORKER_ACTIVE'] = '1'

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processStartInfo

    if (-not $process.Start()) {
        Stop-Launcher -Stage 'launch' -Reason 'child_not_started'
    }
    $processStarted = $true

    $lifetimeClock = [System.Diagnostics.Stopwatch]::StartNew()
    $timeoutMilliseconds = [long]$TimeoutSeconds * 1000
    $firstWriteEnforced = $Role -ceq 'implementer'
    $firstWriteSignalObserved = -not $firstWriteEnforced
    $firstWriteTimeoutMilliseconds = [long]$FirstWriteTimeoutSeconds * 1000
    $postWriteIdleTimeoutMilliseconds = [long]$PostWriteIdleTimeoutSeconds * 1000
    $postWriteEnforced = $false
    [long]$postWriteIdleOriginMilliseconds = 0
    $latestAgentMessage = ''
    $stdoutUtf8 = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false, $true
    $stdoutLineBytes = New-Object 'System.Collections.Generic.List[byte]'
    $stdoutSkipLf = $false

    $inputStream = $process.StandardInput.BaseStream
    $stdoutStream = $process.StandardOutput.BaseStream
    $stderrStream = $process.StandardError.BaseStream
    $parentStdoutStream = [Console]::OpenStandardOutput()

    $stdoutBuffer = New-Object byte[] 4096
    $stderrBuffer = New-Object byte[] 4096
    $stdoutReadTask = $stdoutStream.ReadAsync($stdoutBuffer, 0, $stdoutBuffer.Length)
    $stderrReadTask = $stderrStream.ReadAsync($stderrBuffer, 0, $stderrBuffer.Length)
    $inputWriteTask = $inputStream.WriteAsync($promptInputBytes, 0, $promptInputBytes.Length)
    $inputFlushTask = $null

    $stdoutActive = $true
    $stderrActive = $true
    $inputWriteActive = $true
    $inputFlushActive = $false
    $timeoutExceeded = $false
    $firstWriteExceeded = $false
    $postWriteExceeded = $false
    $outputLimitExceeded = $false
    $protocolFailureReason = $null
    $streamFailureReason = $null
    $launchFailureReason = $null
    [long]$totalOutputBytes = 0

    while ($stdoutActive -or $stderrActive -or $inputWriteActive -or $inputFlushActive) {
        $remainingOverallMilliseconds = $timeoutMilliseconds - $lifetimeClock.ElapsedMilliseconds
        $remainingMilliseconds = $remainingOverallMilliseconds
        $deadlineStage = 'timeout'
        if ($firstWriteEnforced -and -not $firstWriteSignalObserved) {
            $remainingFirstWriteMilliseconds = $firstWriteTimeoutMilliseconds - $lifetimeClock.ElapsedMilliseconds
            if ($remainingFirstWriteMilliseconds -le $remainingMilliseconds) {
                $remainingMilliseconds = $remainingFirstWriteMilliseconds
                $deadlineStage = 'first_write'
            }
        }
        if ($postWriteEnforced) {
            $remainingPostWriteMilliseconds = $postWriteIdleTimeoutMilliseconds - (
                $lifetimeClock.ElapsedMilliseconds - $postWriteIdleOriginMilliseconds
            )
            if ($remainingPostWriteMilliseconds -le $remainingMilliseconds) {
                $remainingMilliseconds = $remainingPostWriteMilliseconds
                $deadlineStage = 'post_write'
            }
        }
        if ($remainingMilliseconds -le 0) {
            if ($deadlineStage -eq 'first_write') {
                $firstWriteExceeded = $true
            }
            elseif ($deadlineStage -eq 'post_write') {
                $postWriteExceeded = $true
            }
            else {
                $timeoutExceeded = $true
            }
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
            if ($deadlineStage -eq 'first_write') {
                $firstWriteExceeded = $true
            }
            elseif ($deadlineStage -eq 'post_write') {
                $postWriteExceeded = $true
            }
            else {
                $timeoutExceeded = $true
            }
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

        $totalOutputBytes += $bytesRead
        if ($totalOutputBytes -gt $MaxOutputBytes) {
            $outputLimitExceeded = $true
            break
        }

        if ($isStdout) {
            for ($stdoutIndex = 0; $stdoutIndex -lt $bytesRead; $stdoutIndex++) {
                $stdoutByte = $stdoutBuffer[$stdoutIndex]
                if ($stdoutByte -eq 0x0A) {
                    if ($stdoutSkipLf) {
                        $stdoutSkipLf = $false
                        continue
                    }
                    $jsonEvent = ConvertFrom-WorkerJsonLine -LineBytes ([byte[]]$stdoutLineBytes.ToArray()) -Utf8 $stdoutUtf8
                    $stdoutLineBytes.Clear()
                    if (-not $jsonEvent.Valid) {
                        $protocolFailureReason = 'invalid_jsonl'
                        break
                    }
                    Apply-WorkerJsonEvent `
                        -Event $jsonEvent `
                        -FirstWriteEnforced $firstWriteEnforced `
                        -FirstWriteObserved ([ref]$firstWriteSignalObserved) `
                        -PostWriteEnforced ([ref]$postWriteEnforced) `
                        -PostWriteIdleOriginMilliseconds ([ref]$postWriteIdleOriginMilliseconds) `
                        -LatestAgentMessage ([ref]$latestAgentMessage) `
                        -NowMilliseconds $lifetimeClock.ElapsedMilliseconds
                    continue
                }

                if ($stdoutByte -eq 0x0D) {
                    $jsonEvent = ConvertFrom-WorkerJsonLine -LineBytes ([byte[]]$stdoutLineBytes.ToArray()) -Utf8 $stdoutUtf8
                    $stdoutLineBytes.Clear()
                    $stdoutSkipLf = $true
                    if (-not $jsonEvent.Valid) {
                        $protocolFailureReason = 'invalid_jsonl'
                        break
                    }
                    Apply-WorkerJsonEvent `
                        -Event $jsonEvent `
                        -FirstWriteEnforced $firstWriteEnforced `
                        -FirstWriteObserved ([ref]$firstWriteSignalObserved) `
                        -PostWriteEnforced ([ref]$postWriteEnforced) `
                        -PostWriteIdleOriginMilliseconds ([ref]$postWriteIdleOriginMilliseconds) `
                        -LatestAgentMessage ([ref]$latestAgentMessage) `
                        -NowMilliseconds $lifetimeClock.ElapsedMilliseconds
                    continue
                }

                $stdoutSkipLf = $false
                [void]$stdoutLineBytes.Add($stdoutByte)
            }

            if ($null -ne $protocolFailureReason) {
                break
            }
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

    if (
        -not $outputLimitExceeded -and
        -not $timeoutExceeded -and
        -not $firstWriteExceeded -and
        -not $postWriteExceeded -and
        $null -eq $protocolFailureReason -and
        $null -eq $streamFailureReason -and
        $stdoutLineBytes.Count -gt 0
    ) {
        $jsonEvent = ConvertFrom-WorkerJsonLine -LineBytes ([byte[]]$stdoutLineBytes.ToArray()) -Utf8 $stdoutUtf8
        $stdoutLineBytes.Clear()
        if (-not $jsonEvent.Valid) {
            $protocolFailureReason = 'invalid_jsonl'
        }
        else {
            Apply-WorkerJsonEvent `
                -Event $jsonEvent `
                -FirstWriteEnforced $firstWriteEnforced `
                -FirstWriteObserved ([ref]$firstWriteSignalObserved) `
                -PostWriteEnforced ([ref]$postWriteEnforced) `
                -PostWriteIdleOriginMilliseconds ([ref]$postWriteIdleOriginMilliseconds) `
                -LatestAgentMessage ([ref]$latestAgentMessage) `
                -NowMilliseconds $lifetimeClock.ElapsedMilliseconds
        }
    }

    if ($outputLimitExceeded) {
        $treeTerminated = Confirm-ChildTreeTermination -Process $process
        if (-not $treeTerminated) {
            Stop-Launcher -Stage 'output' -Reason 'tree_termination_failed'
        }
        Stop-Launcher -Stage 'output' -Reason 'limit_exceeded'
    }

    if ($null -ne $protocolFailureReason) {
        if (-not $process.HasExited) {
            $treeTerminated = Confirm-ChildTreeTermination -Process $process
            if (-not $treeTerminated) {
                Stop-Launcher -Stage 'protocol' -Reason 'tree_termination_failed'
            }
        }
        Stop-Launcher -Stage 'protocol' -Reason $protocolFailureReason
    }

    if ($firstWriteExceeded) {
        $treeTerminated = Confirm-ChildTreeTermination -Process $process
        if (-not $treeTerminated) {
            Stop-Launcher -Stage 'first_write' -Reason 'tree_termination_failed'
        }
        Stop-Launcher -Stage 'first_write' -Reason 'deadline_exceeded'
    }

    if ($postWriteExceeded) {
        $treeTerminated = Confirm-ChildTreeTermination -Process $process
        if (-not $treeTerminated) {
            Stop-Launcher -Stage 'post_write' -Reason 'tree_termination_failed'
        }
        Stop-Launcher -Stage 'post_write' -Reason 'deadline_exceeded'
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

    $remainingOverallMilliseconds = $timeoutMilliseconds - $lifetimeClock.ElapsedMilliseconds
    $remainingMilliseconds = $remainingOverallMilliseconds
    $deadlineStage = 'timeout'
    if ($firstWriteEnforced -and -not $firstWriteSignalObserved) {
        $remainingFirstWriteMilliseconds = $firstWriteTimeoutMilliseconds - $lifetimeClock.ElapsedMilliseconds
        if ($remainingFirstWriteMilliseconds -le $remainingMilliseconds) {
            $remainingMilliseconds = $remainingFirstWriteMilliseconds
            $deadlineStage = 'first_write'
        }
    }
    if ($postWriteEnforced) {
        $remainingPostWriteMilliseconds = $postWriteIdleTimeoutMilliseconds - (
            $lifetimeClock.ElapsedMilliseconds - $postWriteIdleOriginMilliseconds
        )
        if ($remainingPostWriteMilliseconds -le $remainingMilliseconds) {
            $remainingMilliseconds = $remainingPostWriteMilliseconds
            $deadlineStage = 'post_write'
        }
    }
    if ($remainingMilliseconds -le 0) {
        if ($deadlineStage -eq 'first_write') {
            $treeTerminated = Confirm-ChildTreeTermination -Process $process
            if (-not $treeTerminated) {
                Stop-Launcher -Stage 'first_write' -Reason 'tree_termination_failed'
            }
            Stop-Launcher -Stage 'first_write' -Reason 'deadline_exceeded'
        }
        elseif ($deadlineStage -eq 'post_write') {
            $treeTerminated = Confirm-ChildTreeTermination -Process $process
            if (-not $treeTerminated) {
                Stop-Launcher -Stage 'post_write' -Reason 'tree_termination_failed'
            }
            Stop-Launcher -Stage 'post_write' -Reason 'deadline_exceeded'
        }
        else {
            $treeTerminated = Confirm-ChildTreeTermination -Process $process
            if (-not $treeTerminated) {
                Stop-Launcher -Stage 'timeout' -Reason 'tree_termination_failed'
            }
            Stop-Launcher -Stage 'timeout' -Reason 'deadline_exceeded'
        }
    }

    $completed = $process.WaitForExit([int]$remainingMilliseconds)
    if (-not $completed) {
        if ($deadlineStage -eq 'first_write') {
            $treeTerminated = Confirm-ChildTreeTermination -Process $process
            if (-not $treeTerminated) {
                Stop-Launcher -Stage 'first_write' -Reason 'tree_termination_failed'
            }
            Stop-Launcher -Stage 'first_write' -Reason 'deadline_exceeded'
        }
        elseif ($deadlineStage -eq 'post_write') {
            $treeTerminated = Confirm-ChildTreeTermination -Process $process
            if (-not $treeTerminated) {
                Stop-Launcher -Stage 'post_write' -Reason 'tree_termination_failed'
            }
            Stop-Launcher -Stage 'post_write' -Reason 'deadline_exceeded'
        }
        else {
            $treeTerminated = Confirm-ChildTreeTermination -Process $process
            if (-not $treeTerminated) {
                Stop-Launcher -Stage 'timeout' -Reason 'tree_termination_failed'
            }
            Stop-Launcher -Stage 'timeout' -Reason 'deadline_exceeded'
        }
    }

    try {
        $childExitCode = $process.ExitCode
    }
    catch {
        Stop-Launcher -Stage 'child' -Reason 'exit_nonzero' -ExitCode 1
    }

    if ($childExitCode -ne 0) {
        Stop-Launcher -Stage 'child' -Reason 'exit_nonzero' -ExitCode 1
    }

    if ([string]::IsNullOrEmpty($latestAgentMessage)) {
        if (-not $process.HasExited) {
            $treeTerminated = Confirm-ChildTreeTermination -Process $process
            if (-not $treeTerminated) {
                Stop-Launcher -Stage 'protocol' -Reason 'tree_termination_failed'
            }
        }
        Stop-Launcher -Stage 'protocol' -Reason 'missing_final_message'
    }

    try {
        $finalMessageBytes = $stdoutUtf8.GetBytes($latestAgentMessage)
        $parentStdoutStream.Write($finalMessageBytes, 0, $finalMessageBytes.Length)
        $parentStdoutStream.Flush()
    }
    catch {
        Stop-Launcher -Stage 'output' -Reason 'stream_write_failed'
    }

    exit 0
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
    if ($null -ne $parentStdoutStream) {
        $parentStdoutStream.Dispose()
    }
    if ($null -ne $process) {
        $process.Dispose()
    }
}
