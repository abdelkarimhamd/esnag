# Mobile (Expo React Native) - Phase 4

## Local Run
```powershell
copy .env.example .env
cmd /c "npm install"
cmd /c "npm run start"
```

## Environment
`.env.example`

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
```

Use:
- `http://10.0.2.2:8000` for Android emulator
- `http://<LAN_IP>:8000` for physical device

## Core Mobile Features
- Offline-first local SQLite database.
- Queue-based operations (`snag.create`, `snag.update`, `snag.transition`, `snag.comment.create`).
- Sync loop with retries and reconnect triggers.
- Conflict policy:
  - last-write-wins for updates (server copy returned on stale client updates)
  - status transitions always validated by backend workflow rules
- Chunked attachment uploads for photos/videos/PDF.
- Push notification registration and deep-link handling.
- Equipment module with barcode scanning and maintenance log creation.
- Notification preferences UI (digest + immediate channels).

## Notes
- Local queue and local attachments are persisted in `esnagging_mobile.db`.
- Use `Settings -> Run Sync Now` to force a manual sync.
- Deep links supported:
  - `esnagging://snags/:id`
  - `esnagging://inspections/submissions/:id`
