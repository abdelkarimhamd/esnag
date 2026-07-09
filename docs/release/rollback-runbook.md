# Rollback Runbook (Stabilization Release)

## Trigger Conditions
- Core flow failure in production (login/project/drawing/snag transition).
- Elevated API error rate or queue failure trend after release.
- Mobile sync failures or unresolved conflict spikes.

## Immediate Actions (First 15 Minutes)
1. Pause deployment rollout.
2. Capture request references from impacted user reports.
3. Inspect:
   - `backend/storage/logs/api-YYYY-MM-DD.log`
   - `backend/storage/logs/laravel.log`
   - Ops health dashboard (`/ops`).

## Feature-Flag Mitigations
Use feature flags to reduce blast radius while diagnosing:
- `ui.simple_first_v1` -> disable if navigation/layout issues appear.
- High-risk module flags in ops console:
  - exports
  - inspections
  - equipment
  - automation.

Apply at organization level first, then project overrides as needed.

## Rollback Procedure
1. Identify last known-good commit/tag.
2. Redeploy backend + web from known-good artifact.
3. Keep database schema unchanged (this release is additive/non-breaking with no required migration rollback).
4. Validate smoke checks:
   - auth and org switch
   - projects list
   - drawing viewer load
   - snag transition
   - export request.

## Mobile Considerations
- Keep sync endpoint compatibility unchanged.
- If server-side issue persists, instruct clients to pause auto sync window and retry later.
- Preserve queued operations; do not clear local queue unless corruption is confirmed.

## Post-Rollback Verification
- Confirm error rate trend returns to baseline.
- Confirm queue depth normalizes.
- Confirm no increase in storage/upload failure events.
- Publish incident summary with affected scope and mitigation timeline.
