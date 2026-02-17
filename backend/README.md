# Backend (Laravel 12 API) - Phase 4

## Local Run
```powershell
composer install
copy .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan storage:link
php artisan serve --port=8000
php artisan queue:work
```

Optional local websocket (Pusher protocol):
```powershell
npx soketi start --host=127.0.0.1 --port=6001 --app-id=esnagging-local --app-key=esnagging-key --app-secret=esnagging-secret
```

## Key Features
- Sanctum SPA auth
- Mobile token auth (`/api/auth/mobile-login`, `/api/auth/mobile-logout`)
- Org-context middleware (`X-Organization-Id`)
- Team-scoped RBAC and policies
- Project-level role overrides (`project_user_roles`) with effective permission context endpoint
- Permission presets + diff API (`/api/rbac/permission-presets`, `/api/rbac/permission-diff`)
- Delegation rules (`delegation_rules`) for temporary assignment/approval continuity
- Stakeholder company/team directory and assignment endpoints (`/api/stakeholders/*`, `/api/delegations/*`)
- Projects, drawings/revisions, snags, comments, attachments
- Closeout templates and snag closeout instances (checklist + evidence)
- Transition guard: cannot close unless closeout is complete, unless `snags.close.override`
- Kanban and dashboard endpoints
- Export pipeline (`export_jobs`) via queue jobs for PDF/CSV/XLSX
- Realtime broadcasting events (`snag.realtime`, `dashboard.realtime`, `export.realtime`)
- Notifications: assignment, status change, comment, export ready/failed
- Onboarding tour persistence (`core`, `snags_board`, `closeout`, `exports`)
- Inspection templates with schema JSON + workflow definitions
- Inspection submissions lifecycle + approval engine + audit trail
- Digital signatures upload/download and signature-gated approvals
- MIR/WIR/IR request lifecycle endpoints
- Inspection reports endpoint and inspection-aware export generation
- Realtime inspection channel events (`inspection.realtime`)
- Notifications: approval required, decision, signature requested
- Onboarding tour persistence (`inspections`, `approvals`, `requests`)
- Mobile sync endpoints (`/api/mobile/sync/pull`, `/api/mobile/sync/apply`)
- Conflict policy: LWW for updates + server-guarded status transitions
- Chunked attachment upload pipeline (`/api/mobile/attachments/chunked/*`)
- Equipment + maintenance module with snag linkage
- Notification preferences + scheduled digest dispatch command (`digests:send`)
- Push token endpoints (`/api/mobile/push-tokens`)
- Upload hardening (`UploadSecurityService`) + upload throttles
- Performance hardening: additional indexes + dashboard/report caching
- Slow API monitoring middleware (`LogSlowApiRequests`)

## Tests
```powershell
php artisan test
```

Additional Phase 4 feature coverage includes:
- mobile sync conflict + transition guard
- chunked mobile uploads
- equipment + maintenance linkage
- digest frequency enforcement
- expanded API E2E smoke flow
