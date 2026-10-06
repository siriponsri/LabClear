$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Checked { param([scriptblock]$Command) & $Command; if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" } }
Write-Host "LabClear — starting on http://127.0.0.1:8000" -ForegroundColor Cyan
if (-not (Test-Path ".venv")) { Invoke-Checked { py -3.12 -m venv .venv } }
$Python = Join-Path (Get-Location) ".venv\Scripts\python.exe"
Invoke-Checked { & $Python -m pip install -r requirements.txt }
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example. Add your API keys there to enable the AI (see README)." -ForegroundColor Yellow
}
Start-Process "http://127.0.0.1:8000"
Invoke-Checked { & $Python -m uvicorn main:app --host 127.0.0.1 --port 8000 }
