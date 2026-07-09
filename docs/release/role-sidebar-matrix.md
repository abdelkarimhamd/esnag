# Role Sidebar Matrix (Simple-First Navigation)

This matrix documents expected sidebar visibility by role for release stabilization.
It combines permission checks (`web/src/utils/permissions.js`) with role gates in `web/src/layout/AppLayout.jsx`.

## Legend
- `Y` visible in sidebar
- `N` hidden in sidebar
- `*` visible only if feature flag/module is enabled and permission exists

## Primary Workspace

| Sidebar Link | owner | consultant | contractor | project_manager | engineer | inspector | viewer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Projects | Y | Y | Y | Y | Y | Y | Y |
| Drawing Work (Board) | Y | Y | Y | Y | Y | Y | Y |
| Dashboard | Y | Y | Y | Y | Y | Y | Y |
| Alerts (Notification Preferences) | Y | Y | Y | Y | Y | Y | N |

## More Tools

| Sidebar Link | owner | consultant | contractor | project_manager | engineer | inspector | viewer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Inspections | Y | Y | Y | Y | Y | Y | Y |
| Exports | Y | Y | Y | Y | Y | Y | Y |
| Templates Hub | Y | Y | Y | Y | Y | Y | Y |
| Requests (MIR/WIR/IR) | Y | Y | Y | Y | Y | Y | Y |
| Reports | Y | Y | Y | Y | Y | Y | Y |
| Equipment | Y | Y | Y | Y | Y | Y | Y |

## Admin & Setup

| Sidebar Link | owner | consultant | contractor | project_manager | engineer | inspector | viewer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Access Control | Y | N | N | Y | N | N | N |
| Automation | Y | Y | N | Y | N | N | N |
| Ops | Y | N | N | N | N | N | N |

## Notes
- Backend remains source of truth. Hidden sidebar links do **not** replace policy enforcement.
- Route guards (`PermissionRoute`) still enforce permission checks when users navigate directly.
- Project-level permission overrides can change effective visibility by project context.
