[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'

try {
    if ($env:OS -ne 'Windows_NT') {
        [Console]::Error.WriteLine('[error] code=windows-only')
        exit 1
    }

    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent() # WindowsIdentity::GetCurrent()
    $principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
    $isAdministrator = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator) # IsInRole(WindowsBuiltInRole::Administrator)
    $currentPowerShell = (Get-Process -Id $PID -ErrorAction Stop).Path

    $tcpRuleName = 'MagicMirror.Development.Electron.TCP'
    $udpRuleName = 'MagicMirror.Development.Electron.UDP'
    $ruleNames = @($tcpRuleName, $udpRuleName)

    if ($Remove) {
        $elevatedProcess = $null
        $elevationCancelled = $false
        if (-not $isAdministrator -and -not $WhatIfPreference) {
            if ($PSCmdlet.ShouldProcess($PSCommandPath, 'Run elevated firewall configuration')) {
                $elevatedProcess = Start-Process -FilePath $currentPowerShell -ArgumentList @('-NoProfile', '-File', ('"{0}"' -f $PSCommandPath), '-Remove') -Verb RunAs -Wait -PassThru
            }
            else {
                $elevationCancelled = $true
            }
        }

        if ($null -eq $elevatedProcess -and -not $elevationCancelled) {
            foreach ($ruleName in $ruleNames) {
                $existingRule = Get-NetFirewallRule -Name $ruleName -PolicyStore PersistentStore -ErrorAction SilentlyContinue
                if ($null -eq $existingRule) {
                    Write-Output "[status] action=already-absent rule=$ruleName store=PersistentStore"
                    continue
                }

                if ($PSCmdlet.ShouldProcess($ruleName, 'Remove persistent firewall rule')) {
                    Remove-NetFirewallRule -Name $ruleName -PolicyStore PersistentStore -ErrorAction Stop
                    Write-Output "[status] action=removed rule=$ruleName store=PersistentStore"
                }
                else {
                    Write-Output "[status] action=planned rule=$ruleName store=PersistentStore"
                }
            }
        }

        if ($null -ne $elevatedProcess) {
            exit [int]$elevatedProcess.ExitCode
        }
        if ($elevationCancelled) {
            Write-Output '[status] action=elevation status=skipped'
        }
        return
    }

    function Install-MagicMirrorElectronFirewallRules {
        [CmdletBinding(SupportsShouldProcess = $true)]
        param(
            [Parameter(Mandatory)]
            [string]$electronPath
        )

        if ($PSCmdlet.ShouldProcess('MagicMirror.Development.Electron.TCP', 'Create persistent inbound TCP firewall rule')) {
            New-NetFirewallRule -Name 'MagicMirror.Development.Electron.TCP' -DisplayName 'MagicMirror.Development.Electron.TCP' -Program $electronPath -Protocol TCP -Direction Inbound -Profile Private -Action Allow -Enabled True -EdgeTraversalPolicy Block -PolicyStore PersistentStore -ErrorAction Stop
            Write-Output '[status] action=installed rule=MagicMirror.Development.Electron.TCP protocol=TCP profile=Private'
        }
        else {
            Write-Output '[status] action=planned rule=MagicMirror.Development.Electron.TCP protocol=TCP profile=Private'
        }

        if ($PSCmdlet.ShouldProcess('MagicMirror.Development.Electron.UDP', 'Create persistent inbound UDP firewall rule')) {
            New-NetFirewallRule -Name 'MagicMirror.Development.Electron.UDP' -DisplayName 'MagicMirror.Development.Electron.UDP' -Program $electronPath -Protocol UDP -Direction Inbound -Profile Private -Action Allow -Enabled True -EdgeTraversalPolicy Block -PolicyStore PersistentStore -ErrorAction Stop
            Write-Output '[status] action=installed rule=MagicMirror.Development.Electron.UDP protocol=UDP profile=Private'
        }
        else {
            Write-Output '[status] action=planned rule=MagicMirror.Development.Electron.UDP protocol=UDP profile=Private'
        }
    }

    $repoRoot = (Resolve-Path -LiteralPath (Join-Path -Path $PSScriptRoot -ChildPath '..') -ErrorAction Stop).Path
    $repoRoot = [System.IO.Path]::GetFullPath($repoRoot)
    $electronPath = [System.IO.Path]::GetFullPath((Join-Path -Path $repoRoot -ChildPath 'node_modules\electron\dist\electron.exe'))
    $repoPrefix = $repoRoot.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar
    $resolvedElectronPath = (Resolve-Path -LiteralPath $electronPath -ErrorAction Stop).Path

    if (-not $resolvedElectronPath.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'electron path is outside the repository root'
    }

    $electronFile = Get-Item -LiteralPath $electronPath -ErrorAction Stop
    if ($electronFile.PSIsContainer -or -not ($electronFile -is [System.IO.FileInfo])) {
        throw 'electron path is not a file'
    }

    $elevationCancelled = $false
    if (-not $isAdministrator -and -not $WhatIfPreference) {
        if ($PSCmdlet.ShouldProcess($PSCommandPath, 'Run elevated firewall configuration')) {
            $elevatedProcess = Start-Process -FilePath $currentPowerShell -ArgumentList @('-NoProfile', '-File', ('"{0}"' -f $PSCommandPath)) -Verb RunAs -Wait -PassThru
            exit [int]$elevatedProcess.ExitCode
        }
        $elevationCancelled = $true
    }

    if (-not $elevationCancelled) {
        foreach ($ruleName in $ruleNames) {
            $existingRule = Get-NetFirewallRule -Name $ruleName -PolicyStore PersistentStore -ErrorAction SilentlyContinue
            if ($null -eq $existingRule) {
                Write-Output "[status] action=already-absent rule=$ruleName store=PersistentStore"
                continue
            }

            if ($PSCmdlet.ShouldProcess($ruleName, 'Remove existing persistent firewall rule')) {
                Remove-NetFirewallRule -Name $ruleName -PolicyStore PersistentStore -ErrorAction Stop
                Write-Output "[status] action=removed rule=$ruleName store=PersistentStore"
            }
            else {
                Write-Output "[status] action=planned rule=$ruleName store=PersistentStore"
            }
        }

        Install-MagicMirrorElectronFirewallRules -electronPath $electronPath
    }
    else {
        Write-Output '[status] action=elevation status=skipped'
    }
}
catch {
    [Console]::Error.WriteLine('[error] code=firewall-configuration-failed')
    exit 1
}
