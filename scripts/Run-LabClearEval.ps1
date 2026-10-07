[CmdletBinding()]
param(
    [int]$Round = 4,
    [string]$Base = 'https://labclear.onrender.com'
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$expected = & git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot determine the expected commit.' }
$health = Invoke-RestMethod ($Base.TrimEnd('/') + '/health')
if ($health.commit -ne $expected -or $health.version -ne '3.0.2') {
    throw "Render is not on this release yet. Live: $($health.commit) / $($health.version); expected: $expected / 3.0.2. Wait for Deploy live."
}
$python = Join-Path (Get-Location) '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    & py -3.12 -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.12 with the Windows launcher, then rerun.' }
}
& $python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
Write-Host 'Running 20 live evaluation cases. These call the configured AI/OCR providers and consume the server budget.'
& $python scripts/course_eval.py --base $Base --round $Round --expected-commit $expected --out "course_eval_round$Round.json"
if ($LASTEXITCODE -ne 0) { throw 'Evaluation did not complete. Keep any partial JSON and console error.' }
Write-Host "Send course_eval_round$Round.json back for review."
