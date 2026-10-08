# Deploy LabClear to Cloudflare from Windows (Docker Desktop running, `npx wrangler login` done).
#   .\scripts\Deploy-LabClearCloudflare.ps1           # dry run: type check and build, no upload
#   .\scripts\Deploy-LabClearCloudflare.ps1 -Deploy   # API (container) first, then the website
[CmdletBinding()]
param([switch]$Deploy)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$commit = & git -C $root rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot determine the release commit.' }
if ($Deploy -and (& git -C $root status --porcelain)) { throw 'Commit or review local changes before deploying; do not reset them.' }
& docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop before building the Linux container.' }

function Run([string]$dir, [string[]]$commands) {
    Set-Location -LiteralPath (Join-Path $root $dir)
    foreach ($c in $commands) {
        Write-Host "> $c"
        Invoke-Expression $c
        if ($LASTEXITCODE -ne 0) { throw "Failed: $c" }
    }
}
$apiDeploy = if ($Deploy) { "npx wrangler deploy --var LABCLEAR_COMMIT_SHA:$commit" } else { "npx wrangler deploy --dry-run --var LABCLEAR_COMMIT_SHA:$commit" }
Run 'deploy\cloudflare' @('npm ci', 'npm run check', $apiDeploy)
$webDeploy = if ($Deploy) { 'npx opennextjs-cloudflare deploy' } else { 'npx wrangler deploy --dry-run' }
Run 'web' @('npm ci', 'npx tsc --noEmit -p .', 'npx opennextjs-cloudflare build', $webDeploy)
Set-Location -LiteralPath $root
Write-Host "Done. Check https://<your domain>/health shows version 4.0.0 and commit $commit before switching traffic."
