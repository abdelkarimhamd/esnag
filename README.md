# eSnagging Phase 4
Phase 4 is implemented on top of the completed Phase 3 stack.

## What Phase 4 Adds
- Offline-first `/mobile` app (Expo React Native) with SQLite local storage.
- Operations queue + sync engine with retries and conflict handling:
  - Last-write-wins for data updates.
  - Status transitions still validated server-side.
- Chunked attachment upload pipeline from mobile.
- Push notifications + deep links (`esnagging://snags/:id`, `esnagging://inspections/submissions/:id`).
- Equipment module with maintenance logs and snag linkage.
- Optional barcode scanning in mobile equipment view.
- Scheduled digests (daily/weekly/monthly) driven by per-user notification preferences.
- Enterprise hardening:
  - API/mobile/upload rate limits.
  - Upload security checks (MIME/signature/size/executable blocking).
  - Additional DB indexes and short-lived caching for KPI/report endpoints.
  - Slow API request logging middleware.
  - CI workflows + staging deploy template.
- Security hardening extras:
  - Tenant-enforced MFA policies for web/mobile (TOTP).
  - Mobile authorized device inventory and revoke controls.
  - Tenant IP allowlist enforcement (exact IP and CIDR).
  - Attachment antivirus scanning modes (`off`/`log_only`/`enforce`).
  - PII redaction declaration controls (`off`/`warn`/`require`) for image/video/PDF uploads.
- Expanded backend E2E smoke coverage.
- Advanced RBAC and multi-stakeholder controls:
  - Project-level role overrides on top of organization roles.
  - Stakeholder companies/teams with snag assignment to company/team then dispatch to person.
  - Temporary delegation windows for assignment/approval continuity.
  - Permission presets (Owner/Consultant/Contractor) with permission diff view.
- UX/adoption extras:
  - Template libraries (closeout + inspection) with discipline tags and clone-to-project workflow.
  - Training mode projects (`is_training` + `training_locked`) that expose demo data in read-only mode.
  - Bulk snag actions from drawing viewer (bulk assign, due date update, bulk export queue).
  - Arabic/English localization toggle with global RTL/LTR layout support.
  - Bilingual export headings and values (English/Arabic) for CSV/XLSX/PDF report outputs.
- Admin, ops, and reliability controls:
  - Feature flags by organization and project override scope.
  - Usage limits: storage quota, max exports/day, max users.
  - Health dashboard: sync error rate, queue depth, and storage failures.
  - Self-serve support tools: resend invite, reset MFA, reset onboarding, replay tours.

## Repository Layout
- `backend` Laravel 12 API
- `web` React + Vite + MUI SPA
- `mobile` Expo React Native app
- `scripts` bootstrap scripts

## Quick Bootstrap (Windows PowerShell)
```powershell
.\scripts\bootstrap-all.ps1
```

## Manual Setup
### Backend
```powershell
cd backend
composer install
copy .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan storage:link
php artisan serve --port=8000
php artisan queue:work
```

Optional realtime (Soketi):
```powershell
npx soketi start --host=127.0.0.1 --port=6001 --app-id=esnagging-local --app-key=esnagging-key --app-secret=esnagging-secret
```

### Web
```powershell
cd web
copy .env.example .env
cmd /c "npm install"
cmd /c "npm run dev"
```

### Mobile
```powershell
cd mobile
copy .env.example .env
cmd /c "npm install"
cmd /c "npm run start"
```

`EXPO_PUBLIC_API_URL` examples:
- iOS simulator / local web: `http://127.0.0.1:8000`
- Android emulator: `http://10.0.2.2:8000`
- Device on LAN: `http://<your-lan-ip>:8000`

## Offline Sync Notes
- Local SQLite persists snags/comments/attachments/equipment + queue.
- Offline creates/updates are queued and auto-retried when online.
- Conflicts:
  - `snag.update`: older client timestamps return server copy (LWW guard).
  - `snag.transition`: always enforced by backend workflow rules.
- Attachments are uploaded in chunks via `/api/mobile/attachments/chunked/*`.

## Security Hardening Notes
- Auth MFA endpoints:
  - `GET /api/auth/mfa/status`
  - `POST /api/auth/mfa/setup`
  - `POST /api/auth/mfa/enable`
  - `POST /api/auth/mfa/disable`
- Mobile device management endpoints:
  - `GET /api/mobile/devices`
  - `DELETE /api/mobile/devices/{id}`
- Tenant security policy endpoints (Ops):
  - `GET /api/ops/security`
  - `PUT /api/ops/security`
- IP allowlist checks run on organization-scoped API routes when `enforce_ip_allowlist=true`.
- Antivirus default is local EICAR heuristic (`SECURITY_ANTIVIRUS_DRIVER=eicar`). Switch to `clamav` to call `SECURITY_CLAMAV_BINARY`.

## Demo Users
Password for all demo users: `password`

Skyline (`ORG-SKY`):
- `admin@sky.demo`
- `manager@sky.demo`
- `engineer@sky.demo`
- `engineer2@sky.demo`
- `inspector@sky.demo`
- `viewer@sky.demo`

Apex (`ORG-APX`):
- `admin@apx.demo`
- `manager@apx.demo`
- `engineer@apx.demo`
- `engineer2@apx.demo`
- `inspector@apx.demo`
- `viewer@apx.demo`

## Web Pages
- `/projects`
- `/projects/:projectId/drawings/:drawingId`
- `/board`
- `/dashboard`
- `/exports`
- `/equipment`
- `/access-control`
- `/ops`
- `/preferences/notifications`
- `/templates` (inspection + closeout template hub)
- `/inspections/submissions`
- `/inspections/submissions/:submissionId`
- `/inspections/requests`
- `/inspections/reports`

## Test Commands
```powershell
cd backend
php artisan test

cd ..\web
cmd /c "npm run test"
cmd /c "npm run build"

cd ..\mobile
cmd /c "npm run typecheck"
```

## Ops Console Notes
- Required permissions are one or more of:
  - `ops.feature_flags.manage`
  - `ops.usage_limits.manage`
  - `ops.security.manage`
  - `ops.health.view`
  - `ops.support.manage`
- Seed data includes:
  - Organization usage limits and feature-flag overrides.
  - Sample invites (`pending/accepted/expired`).
  - Sample sync operation logs and storage failure events.
