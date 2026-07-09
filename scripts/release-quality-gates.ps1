$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Label,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Script,
        [scriptblock]$FallbackScript = $null
    )

    Write-Host $Label -ForegroundColor Yellow
    & $Script

    $failed = (-not $?) -or ($LASTEXITCODE -ne 0)
    if ($failed) {
        if ($FallbackScript -and -not $env:CI) {
            Write-Warning "$Label failed with exit code $LASTEXITCODE. Trying local fallback command."
            & $FallbackScript

            if ((-not $?) -or ($LASTEXITCODE -ne 0)) {
                throw "Step failed after fallback ($LASTEXITCODE): $Label"
            }

            return
        }

        if (-not $?) {
            throw "Step failed: $Label"
        }

        throw "Step failed ($LASTEXITCODE): $Label"
    }
}

Write-Host 'Running release stabilization quality gates...' -ForegroundColor Cyan

Push-Location (Join-Path $PSScriptRoot '..\backend')
try {
    Invoke-Step '[backend] composer validate --strict' { composer validate --strict }
    Invoke-Step '[backend] php artisan test (contract + RBAC fast checks)' {
        php artisan test --filter "(ApiObservabilityTest|RbacAccessTest|SnagTransitionTest|MobileSyncTest)"
    }
    Invoke-Step '[backend] php artisan test (full suite)' { php artisan test }
}
finally {
    Pop-Location
}

Push-Location (Join-Path $PSScriptRoot '..\web')
try {
    Invoke-Step '[web] npm.cmd ci' { npm.cmd ci } { npm.cmd install }
    Invoke-Step '[web] npm.cmd run lint' { npm.cmd run lint }
    Invoke-Step '[web] npm.cmd run test -- --run (fast checks)' {
        npm.cmd run test -- --run src/layout/AppLayout.test.jsx src/components/PermissionRoute.test.jsx src/utils/apiError.test.js
    }
    Invoke-Step '[web] npm.cmd run test -- --run (full suite)' { npm.cmd run test -- --run }
    Invoke-Step '[web] npm.cmd run build' { npm.cmd run build }
}
finally {
    Pop-Location
}

Push-Location (Join-Path $PSScriptRoot '..\mobile')
try {
    Invoke-Step '[mobile] npm.cmd ci' { npm.cmd ci } { npm.cmd install }
    Invoke-Step '[mobile] npm.cmd run typecheck' { npm.cmd run typecheck }
}
finally {
    Pop-Location
}

Write-Host 'Release stabilization quality gates passed.' -ForegroundColor Green
