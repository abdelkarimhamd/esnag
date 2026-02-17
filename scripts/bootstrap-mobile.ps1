$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..')
Set-Location 'mobile'

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
}

cmd /c "npm install"

Write-Host 'Mobile bootstrap complete.' -ForegroundColor Green
Write-Host 'Run mobile app with: cd mobile; cmd /c \"npm run start\"' -ForegroundColor Yellow
