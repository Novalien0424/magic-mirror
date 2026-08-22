#requires -Version 5.1

[CmdletBinding()]
param()

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$targetVersion = [version]'24.19.0'
$downloadUrl = 'https://nodejs.org/dist/v24.19.0/node-v24.19.0-x64.msi'
$expectedSha256 = 'F0F66C2A80C08A30A5AB5179EE9EA9E45F9B46289436A8CC87FF833B852DB351'

$tempMsiPath = $null
$tempMsiOwned = $false
$exitCode = 1

function Get-NodeVersion {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ExecutablePath
    )

    if (-not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
        throw "Node.js executable was not found at '$ExecutablePath'."
    }

    $nodeOutput = @(& $ExecutablePath '--version' 2>&1)
    $nodeExitCode = $LASTEXITCODE
    if ($nodeExitCode -ne 0) {
        throw "Node.js executable at '$ExecutablePath' could not report its version (exit code $nodeExitCode)."
    }

    $versionText = (($nodeOutput | ForEach-Object { [string]$_ }) -join "`n").Trim()
    if ($versionText -notmatch '^v(?<version>\d+\.\d+\.\d+)$') {
        throw "Node.js executable at '$ExecutablePath' returned an unrecognized version format."
    }

    $versionToken = $Matches['version']
    try {
        return [version]::Parse($versionToken)
    }
    catch {
        throw "Node.js executable at '$ExecutablePath' returned an invalid semantic version."
    }
}

function New-TemporaryMsiPath {
    [CmdletBinding()]
    param()

    $temporaryDirectory = [System.IO.Path]::GetTempPath()
    if ([string]::IsNullOrWhiteSpace($temporaryDirectory)) {
        throw 'The Windows temporary directory could not be determined.'
    }

    for ($attempt = 1; $attempt -le 5; $attempt++) {
        $candidatePath = Join-Path -Path $temporaryDirectory -ChildPath (
            'node-v24.19.0-{0}.msi' -f ([guid]::NewGuid().ToString('N'))
        )
        $reservedFile = $null

        try {
            $reservedFile = [System.IO.File]::Open(
                $candidatePath,
                [System.IO.FileMode]::CreateNew,
                [System.IO.FileAccess]::Write,
                [System.IO.FileShare]::None
            )
            return $candidatePath
        }
        catch [System.IO.IOException] {
            if ($attempt -eq 5) {
                throw 'Could not reserve a unique temporary MSI path after five attempts.'
            }
        }
        catch {
            throw 'Could not reserve a temporary MSI path due to a filesystem error.'
        }
        finally {
            if ($null -ne $reservedFile) {
                $reservedFile.Dispose()
            }
        }
    }

    throw 'Could not reserve a temporary MSI path.'
}

function Download-NodeMsi {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,

        [Parameter(Mandatory = $true)]
        [string]$DestinationPath
    )

    $webClient = $null
    $previousSecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol

    try {
        $webClient = New-Object -TypeName System.Net.WebClient
        [System.Net.ServicePointManager]::SecurityProtocol =
            $previousSecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12
        $webClient.DownloadFile($Uri, $DestinationPath)
    }
    catch {
        $exceptionType = $_.Exception.GetType().Name
        throw "Download from the official Node.js URL failed (exception_type=$exceptionType)."
    }
    finally {
        if ($null -ne $webClient) {
            $webClient.Dispose()
        }
        [System.Net.ServicePointManager]::SecurityProtocol = $previousSecurityProtocol
    }
}

try {
    if (-not [Environment]::Is64BitOperatingSystem) {
        throw 'The x64 Node.js installer requires a 64-bit Windows operating system.'
    }
    if (-not [Environment]::Is64BitProcess) {
        throw 'Run this script with 64-bit Windows PowerShell 5.1 so the x64 Node.js installation is verified in Program Files.'
    }

    $programFilesPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles)
    if ([string]::IsNullOrWhiteSpace($programFilesPath)) {
        throw 'The Windows Program Files directory could not be determined.'
    }
    $nodeExePath = Join-Path -Path $programFilesPath -ChildPath 'nodejs\node.exe'

    $shouldInstall = $true
    if (Test-Path -LiteralPath $nodeExePath -PathType Leaf) {
        $installedVersion = Get-NodeVersion -ExecutablePath $nodeExePath

        # Any installed version at or above the requirement is compatible for
        # this prerequisite; never replace it with an older MSI.
        if ($installedVersion -ge $targetVersion) {
            Write-Output (
                'Node.js v{0} is already available at Program Files; skipping the MSI to avoid a downgrade.' -f
                $installedVersion.ToString(3)
            )
            $shouldInstall = $false
        }
        else {
            Write-Output (
                'Node.js v{0} is older than the required v{1}; installing the official x64 MSI.' -f
                $installedVersion.ToString(3),
                $targetVersion.ToString(3)
            )
        }
    }
    else {
        Write-Output 'Node.js was not found in Program Files; installing the official x64 MSI.'
    }

    if ($shouldInstall) {
        $windowsDirectory = [Environment]::GetEnvironmentVariable('WINDIR')
        if ([string]::IsNullOrWhiteSpace($windowsDirectory)) {
            throw 'The Windows directory could not be determined for Windows Installer.'
        }
        $msiexecPath = Join-Path -Path $windowsDirectory -ChildPath 'System32\msiexec.exe'
        if (-not (Test-Path -LiteralPath $msiexecPath -PathType Leaf)) {
            throw "Windows Installer was not found at '$msiexecPath'."
        }

        $tempMsiPath = New-TemporaryMsiPath
        $tempMsiOwned = $true

        Download-NodeMsi -Uri $downloadUrl -DestinationPath $tempMsiPath
        if (-not (Test-Path -LiteralPath $tempMsiPath -PathType Leaf)) {
            throw 'The Node.js MSI download did not produce the expected temporary file.'
        }

        $downloadedMsi = Get-Item -LiteralPath $tempMsiPath -Force
        if ($downloadedMsi.Length -le 0) {
            throw 'The Node.js MSI download was empty.'
        }

        $actualSha256 = (Get-FileHash -LiteralPath $tempMsiPath -Algorithm SHA256).Hash.ToUpperInvariant()
        if (-not [string]::Equals($actualSha256, $expectedSha256, [StringComparison]::OrdinalIgnoreCase)) {
            throw "The Node.js MSI SHA-256 hash did not match the required value (actual=$actualSha256)."
        }

        $msiArguments = @(
            '/i'
            ('"{0}"' -f $tempMsiPath)
            '/passive'
            '/norestart'
        )
        try {
            $startProcessParameters = @{
                FilePath = $msiexecPath
                ArgumentList = $msiArguments
                Verb = 'RunAs'
                Wait = $true
                PassThru = $true
                ErrorAction = 'Stop'
            }
            $msiProcess = Start-Process @startProcessParameters
        }
        catch {
            $exceptionType = $_.Exception.GetType().Name
            throw "Could not launch elevated Windows Installer (exception_type=$exceptionType). Confirm UAC approval and retry."
        }

        if ($null -eq $msiProcess -or $null -eq $msiProcess.ExitCode) {
            throw 'Windows Installer did not return an exit code.'
        }
        $msiExitCode = [int]$msiProcess.ExitCode
        if ($msiExitCode -ne 0 -and $msiExitCode -ne 3010) {
            throw "Windows Installer failed with MSI exit code $msiExitCode; accepted codes are 0 and 3010."
        }

        if (-not (Test-Path -LiteralPath $nodeExePath -PathType Leaf)) {
            throw "Windows Installer returned $msiExitCode, but Program Files node.exe was not found at '$nodeExePath'."
        }
        $verifiedVersion = Get-NodeVersion -ExecutablePath $nodeExePath
        if ($verifiedVersion -ne $targetVersion) {
            throw (
                'Windows Installer returned {0}, but Program Files node.exe reports v{1}; expected v{2}.' -f
                $msiExitCode,
                $verifiedVersion.ToString(3),
                $targetVersion.ToString(3)
            )
        }

        if ($msiExitCode -eq 3010) {
            Write-Warning 'Node.js v24.19.0 was installed successfully; Windows Installer requested a restart (3010), and no restart was performed.'
        }
        else {
            Write-Output 'Node.js v24.19.0 was installed and verified in Program Files.'
        }
    }

    $exitCode = 0
}
catch {
    $failureMessage = $_.Exception.Message
    if ([string]::IsNullOrWhiteSpace($failureMessage)) {
        $failureMessage = 'The installer stopped without a detailed error message.'
    }
    Write-Error -Message ('Node.js v24.19.0 installation failed: {0}' -f $failureMessage) -ErrorAction Continue
    $exitCode = 1
}
finally {
    if ($tempMsiOwned -and -not [string]::IsNullOrWhiteSpace($tempMsiPath)) {
        try {
            if (Test-Path -LiteralPath $tempMsiPath -PathType Leaf) {
                Remove-Item -LiteralPath $tempMsiPath -Force -ErrorAction Stop
            }
        }
        catch {
            $cleanupExceptionType = $_.Exception.GetType().Name
            Write-Error -Message (
                'Cleanup failed for the exact temporary MSI path (exception_type={0}): {1}' -f
                $cleanupExceptionType,
                $tempMsiPath
            ) -ErrorAction Continue
            $exitCode = 1
        }
    }
}

exit $exitCode
