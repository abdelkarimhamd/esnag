# Web (React + Vite + MUI) - Phase 4

## Local Run
```powershell
copy .env.example .env
cmd /c "npm install"
cmd /c "npm run dev"
```

## Build
```powershell
cmd /c "npm run build"
```

## Configuration
`.env.example`

```env
VITE_API_TARGET=http://127.0.0.1:8000
VITE_WS_BROADCASTER=pusher
VITE_WS_APP_KEY=esnagging-key
VITE_WS_HOST=127.0.0.1
VITE_WS_PORT=6001
VITE_WS_SCHEME=http
VITE_WS_APP_CLUSTER=mt1
```

Vite proxies:
- `/api`
- `/sanctum`
- `/broadcasting`
- `/storage`

## Implemented Screens
- Login
- Projects list
- Project dashboard
- Drawing viewer with pin plotting and snag drawer
- Closeout tab in snag drawer (template, checklist, evidence, review)
- Kanban board
- KPI dashboard
- Export center
- Notifications menu
- Onboarding tours (`core`, `snags_board`, `closeout`, `exports`)
- Inspection template builder (schema + approval workflow)
- Inspection submissions list
- Inspection submission detail (dynamic form, approvals timeline/actions, signature capture)
- MIR/WIR/IR requests page (create, assign, schedule, status tracking)
- Inspection reports page with inspection export request flow
- Onboarding tours (`inspections`, `approvals`, `requests`)
- Equipment inventory + maintenance logs page (`/equipment`)
- Notification preferences page (digest + immediate channels) (`/preferences/notifications`)
- Access Control page (`/access-control`) with:
  - project role overrides
  - stakeholder companies/teams
  - delegation rules
  - permission preset diff view
