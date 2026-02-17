$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..')
Set-Location 'backend'

if (-not (Test-Path 'vendor')) {
  composer install
}

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
}

if (-not (Test-Path 'database\database.sqlite')) {
  New-Item -ItemType File -Path 'database\database.sqlite' | Out-Null
}

php artisan key:generate --force
php artisan migrate --seed
php artisan storage:link
php artisan config:clear

Write-Host 'Backend bootstrap complete.' -ForegroundColor Green
Write-Host 'Next: run "php artisan serve --port=8000" and "php artisan queue:work".' -ForegroundColor Yellow
Write-Host 'Realtime: start a websocket server (for example Soketi on port 6001).' -ForegroundColor Yellow
