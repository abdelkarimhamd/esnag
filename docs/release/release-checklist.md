# Release Stabilization Checklist

## 1. Branch and Scope Freeze
- Create branch: `release/stabilization-<date>`.
- Freeze feature scope (bug fixes and reliability only).
- Confirm no pending schema migrations for this release.

## 2. Local Quality Gates
- Run:
  - `./scripts/release-quality-gates.sh` (Linux/macOS) or
  - `.\scripts\release-quality-gates.ps1` (Windows).
- Archive command outputs in release notes.

## 3. CI Verification
- Confirm all required checks are green:
  - `Backend Tests / php-tests`
  - `Web Build / build`
  - `Mobile Checks / typecheck`
- Confirm fail-fast targeted suites pass:
  - backend API contract + RBAC tests
  - web role visibility + error adapter tests.

## 4. Role and Permission Parity
- Validate sidebar visibility against `docs/release/role-sidebar-matrix.md`.
- Validate direct API call denial still returns:
  - `code`
  - `request_id`
  - `required_permissions` when available.

## 5. Core Smoke Flow
- Confirm seeded flow:
  - login -> projects -> drawing viewer -> pin -> snag create -> transition -> history.
- Confirm export path:
  - request -> completion -> download.
- Confirm mobile path:
  - offline queue -> reconnect -> sync apply -> conflict handling.

## 6. Observability and Support
- Verify API errors include `X-Request-Id` header and `request_id` body field.
- Verify API logs contain `request_id`, `organization_id`, `project_id`, `user_id`, `route`, `error_code`.
- Verify Ops health endpoint includes:
  - `request_error_rate`
  - `p95_api_latency_ms`
  - `sync_retry_rate`
  - `websocket_delivery_failures_last_24h`.

## 7. Release Notes and Handover
- Publish release notes with:
  - included fixes
  - test evidence
  - known limitations.
- Attach rollback runbook: `docs/release/rollback-runbook.md`.
