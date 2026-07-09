#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Running release stabilization quality gates..."

pushd "${ROOT_DIR}/backend" >/dev/null
composer validate --strict
php artisan test --filter "(ApiObservabilityTest|RbacAccessTest|SnagTransitionTest|MobileSyncTest)"
php artisan test
popd >/dev/null

pushd "${ROOT_DIR}/web" >/dev/null
npm ci
npm run lint
npm run test -- --run src/layout/AppLayout.test.jsx src/components/PermissionRoute.test.jsx src/utils/apiError.test.js
npm run test -- --run
npm run build
popd >/dev/null

pushd "${ROOT_DIR}/mobile" >/dev/null
npm ci
npm run typecheck
popd >/dev/null

echo "Release stabilization quality gates passed."
