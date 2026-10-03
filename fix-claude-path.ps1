[CmdletBinding()]
param(
    [switch]$Undo
)

$ErrorActionPreference = 'Stop'

$claudeBin = Join-Path $env:APPDATA 'npm\node_modules\@anthropic-ai\claude-code\bin'
$claudeExe = Join-Path $claudeBin 'claude.exe'
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$pathEntries = @($userPath -split ';' | Where-Object { $_ })

if ($Undo) {
    $updatedEntries = @($pathEntries | Where-Object {
        $_.Trim().TrimEnd('\') -ine $claudeBin.TrimEnd('\')
    })
    [Environment]::SetEnvironmentVariable('Path', ($updatedEntries -join ';'), 'User')

    $env:Path = (@($env:Path -split ';' | Where-Object {
        $_ -and $_.Trim().TrimEnd('\') -ine $claudeBin.TrimEnd('\')
    }) -join ';')

    Write-Host "Removed Claude Code's native binary directory from your user PATH."
    Write-Host 'Restart Codex and open a new terminal to apply the change everywhere.'
    exit 0
}

if (-not (Test-Path -LiteralPath $claudeExe -PathType Leaf)) {
    throw "Claude Code's native executable was not found at: $claudeExe"
}

$remainingEntries = @($pathEntries | Where-Object {
    $_.Trim().TrimEnd('\') -ine $claudeBin.TrimEnd('\')
})
$updatedUserPath = (@($claudeBin) + $remainingEntries) -join ';'
[Environment]::SetEnvironmentVariable('Path', $updatedUserPath, 'User')

$currentEntries = @($env:Path -split ';' | Where-Object {
    $_ -and $_.Trim().TrimEnd('\') -ine $claudeBin.TrimEnd('\')
})
$env:Path = (@($claudeBin) + $currentEntries) -join ';'

Write-Host "Prepended Claude Code's native binary directory to your user PATH:"
Write-Host "  $claudeBin"
Write-Host ''
Write-Host 'Current-shell verification:'
& where.exe claude
& $claudeExe --version
Write-Host ''
Write-Host 'Restart Codex and open a new terminal before retrying claude-in-codex.'
