# Mobile App (Expo React Native)

## What Changed (UI/UX Redesign)
- New design system: centralized tokens for color, spacing, typography, radius, elevation.
- Light/dark support via `AppThemeProvider`.
- New navigation architecture:
  - Role-aware bottom tabs for primary destinations.
  - Center `More` action opens a bottom sheet with full menu tree + search + badges.
  - Tablet drawer navigation mirrors the same menu model.
  - Unified app header with back/hamburger, notifications, and profile entry.
- Refreshed screens using shared components and consistent loading/empty/error states.
- Existing business logic, APIs, deep links, params, sync behavior, and route names are preserved.

## Dependencies Added
- `@gorhom/bottom-sheet`
  - Used for the center `More` navigation bottom sheet.
- `@react-navigation/drawer`
  - Used for optional tablet/power-user drawer navigation.

## Project Structure (Key Files)
- `src/navigation/AppNavigator.tsx`
- `src/navigation/TabNavigator.tsx`
- `src/navigation/BottomMoreSheet.tsx`
- `src/navigation/DrawerNavigator.tsx`
- `src/navigation/AppHeader.tsx`
- `src/navigation/navConfig.ts`
- `src/theme/tokens.ts`
- `src/theme/ThemeProvider.tsx`
- `src/ui/*` (reusable design components)

## How to Run

### 1) Environment
Create `.env` from `.env.example`:

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
```

Use:
- `http://10.0.2.2:8000` for Android emulator
- `http://<LAN_IP>:8000` for physical device

### 2) Install
```powershell
copy .env.example .env
cmd /c "npm install"
```

### 3) Start
```powershell
cmd /c "npm run start"
```

### 4) iOS notes
- This Expo project uses managed workflow. If you run prebuild/native workflow, install pods in generated `ios/`:
```bash
cd ios && pod install
```

## Navigation Information Architecture

### Primary Tabs (role-aware)
- `Snags`
- `Equipment` (role-dependent)
- `Conflicts` (role-dependent)
- `Notifications`
- Center `More` action (opens bottom sheet, not a content route)

### More Sheet / Drawer Menu
- Work:
  - Snags
  - Create Snag
  - Floor Map
  - Equipment
- Collaboration:
  - Sync Conflicts
  - Notifications
  - Inspection Link (deep-link destination)
- Account:
  - Settings
  - Logout

## Deep Links (Preserved)
- `esnagging://snags`
- `esnagging://snags/create`
- `esnagging://snags/:serverId`
- `esnagging://snags/floors`
- `esnagging://snags/annotate`
- `esnagging://inspections/submissions/:inspectionId`
- `esnagging://equipment`
- `esnagging://conflicts`
- `esnagging://notifications`
- `esnagging://settings`

## Manual QA Checklist (Sanity Suite)

### Auth + Session
1. Login with valid credentials.
2. Login with MFA-required account and OTP flow.
3. Logout from Settings and More menu.

### Navigation + Roles
1. Verify tab layout and center More action.
2. Verify role-based tab visibility for different org roles.
3. Verify More sheet search, grouped sections, and navigation targets.
4. On tablet width, verify drawer opens and mirrors same menu tree.

### Core Flows
1. Snags list loads from local DB.
2. Create snag queues operation and returns to Snags.
3. Open snag detail, queue comment, queue transition.
4. Add attachment and annotation queue entries.
5. Floor map barcode lookup opens filtered snag flow.
6. Equipment list loads, scan/search works, maintenance log submit works.
7. Conflicts screen supports Use Server / Keep Mine / Review Fields.

### Badges + Header
1. Queue/conflict badges update in tabs.
2. Notifications badge updates from sync/queue/conflict state.
3. Header notifications button opens Notifications screen.
4. Header profile button opens Settings.

### Sync + Network
1. Force sync from Settings.
2. Confirm skip reason/error feedback surfaces.
3. Offline action queue processes on reconnect.

### Deep Links
1. Open each deep-link path and verify route target.
2. Push notification deep links still route correctly.

## Existing Mobile Functional Features
- Offline-first SQLite local storage.
- Queue operations (`snag.create`, `snag.update`, `snag.transition`, `snag.comment.create`).
- Sync retries and reconnect triggers.
- Conflict policy:
  - last-write-wins for updates
  - status transitions validated server-side
- Chunked attachment uploads.
- Push notification registration and deep-link handling.
- Equipment and maintenance logs.
- Notification preferences and digest settings.
