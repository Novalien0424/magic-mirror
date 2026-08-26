[CmdletBinding()]
param(
    [string]$ProjectRoot = 'C:\Project\magic-mirror'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
    throw "Project root not found: $ProjectRoot"
}

$BundleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $env:TEMP "magic-mirror-codex-control-plane-backup-$Timestamp"

$Mappings = @(
    @{ Source = 'AGENTS.md'; Destination = 'AGENTS.md' },
    @{ Source = '.codex\config.toml'; Destination = '.codex\config.toml' },
    @{ Source = '.codex\agents\surveyor.toml'; Destination = '.codex\agents\surveyor.toml' },
    @{ Source = '.codex\agents\implementer.toml'; Destination = '.codex\agents\implementer.toml' },
    @{ Source = '.codex\agents\tester.toml'; Destination = '.codex\agents\tester.toml' },
    @{ Source = '.codex\agents\deep-reviewer.toml'; Destination = '.codex\agents\deep-reviewer.toml' }
)

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

foreach ($Mapping in $Mappings) {
    $SourcePath = Join-Path $BundleRoot $Mapping.Source
    $DestinationPath = Join-Path $ProjectRoot $Mapping.Destination

    if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
        throw "Bundle file missing: $SourcePath"
    }

    if (Test-Path -LiteralPath $DestinationPath -PathType Leaf) {
        $BackupPath = Join-Path $BackupRoot $Mapping.Destination
        $BackupDirectory = Split-Path -Parent $BackupPath
        New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
        Copy-Item -LiteralPath $DestinationPath -Destination $BackupPath -Force
    }

    $DestinationDirectory = Split-Path -Parent $DestinationPath
    New-Item -ItemType Directory -Path $DestinationDirectory -Force | Out-Null
    Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
    Write-Host "Applied $($Mapping.Destination)"
}

Write-Host ""
Write-Host "Backup: $BackupRoot"
Write-Host "Start a fresh Codex session so AGENTS.md and config changes reload."
Write-Host "The retired H6 protocol and external worker launcher are not part of this bundle."
