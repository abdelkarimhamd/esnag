$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..')
Set-Location 'web'

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
}

cmd /c "npm install"

Write-Host 'Web bootstrap complete.' -ForegroundColor Green
