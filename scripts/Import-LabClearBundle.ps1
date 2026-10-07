[CmdletBinding()]
param(
    [string]$Repo = 'C:\Users\User\Desktop\myProject\LabClear',
    [string]$Bundle = (Join-Path $PSScriptRoot 'LabClear-3.0.2.bundle'),
    [switch]$Push
)
$ErrorActionPreference = 'Stop'
function Invoke-GitChecked {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$GitArgs)
    & git @GitArgs
    if ($LASTEXITCODE -ne 0) { throw "Git failed: $($GitArgs -join ' '). Stop here; do not reset or force push." }
}
$Bundle = (Resolve-Path -LiteralPath $Bundle).Path
Set-Location -LiteralPath $Repo
$repoRoot = & git rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0) { throw 'This folder is not a Git repository.' }
Set-Location -LiteralPath $repoRoot
$dirty = & git status --porcelain
if ($LASTEXITCODE -ne 0 -or $dirty) { throw "Working tree is not clean. Save/review these files first:`n$($dirty -join "`n")" }
$remote = & git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $remote -notmatch '^(https://github\.com/|git@github\.com:)siriponsri/LabClear(?:\.git)?/?$') { throw 'origin is not siriponsri/LabClear. Check the repo before continuing.' }
Invoke-GitChecked switch main
Invoke-GitChecked pull --ff-only origin main
Invoke-GitChecked bundle verify $Bundle
Invoke-GitChecked fetch $Bundle refs/heads/delivery/labclear-3.0.2
$target = & git rev-parse FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve bundle commit.' }
Invoke-GitChecked merge --ff-only $target
Invoke-GitChecked log -3 --oneline
if ($Push) {
    Invoke-GitChecked push origin main
    Write-Host 'main pushed. Wait for Render Deploy live, then run scripts\Run-LabClearEval.ps1 -Round 4.'
} else { Write-Host 'Bundle imported into main. Run git push origin main when ready.' }
