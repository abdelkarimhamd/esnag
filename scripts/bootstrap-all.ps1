$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot 'bootstrap-backend.ps1')
& (Join-Path $PSScriptRoot 'bootstrap-web.ps1')
& (Join-Path $PSScriptRoot 'bootstrap-mobile.ps1')

Write-Host 'All services bootstrapped.' -ForegroundColor Green
Write-Host 'Start web dev server with: cd web; cmd /c "npm run dev"' -ForegroundColor Yellow
Write-Host 'Start mobile app with: cd mobile; cmd /c "npm run start"' -ForegroundColor Yellow
