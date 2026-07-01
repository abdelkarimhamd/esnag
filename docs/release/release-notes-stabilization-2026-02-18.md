# Release Notes - Stabilization Sprint (2026-02-18)

## Summary
This release focuses on stabilization and production-readiness with no new business modules.

## Highlights
- Added CI quality gates for backend, web, and mobile.
- Added fail-fast test steps for:
  - API contract and RBAC denial behavior
  - web role visibility and API error adapter behavior.
- Hardened role-aware sidebar visibility for admin/setup links.
- Added resiliency tests for core pages (error + retry states).
- Added route-level lazy loading for non-core web pages to reduce initial bundle pressure.
- Fixed select value stability in drawing viewer to prevent runtime out-of-range warnings.
- Added release runbooks and checklists in `docs/release`.

## Non-breaking Contract Notes
- No new business endpoints added.
- Existing error envelope and request correlation behavior preserved.

## Operational Docs
- `docs/release/release-checklist.md`
- `docs/release/rollback-runbook.md`
- `docs/release/role-sidebar-matrix.md`
- `docs/release/baseline-2026-02-18.md`
