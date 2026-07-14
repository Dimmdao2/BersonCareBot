# Rubitime retirement R5 legacy profile resolve proof

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This proof covers the legacy v1 profile resolver switch:

- `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=false`
- v1 `/api/bersoncare/rubitime/slots`
- v1 `/api/bersoncare/rubitime/create-record`
- v2 explicit Rubitime ID requests for slots/create

No production or host env was changed in this proof.

## Findings

- Existing cutover switch lives in `apps/integrator/src/integrations/rubitime/legacyResolveFlag.ts`.
- When disabled, v1 requests that rely on `rubitime_booking_profiles` must fail fast with `legacy_resolve_disabled`.
- v2 M2M bodies with explicit Rubitime ids ignore the legacy profile flag.
- Patient/public slots runtime no longer calls `syncPort.fetchSlots`; `createPatientBookingService.getSlots` uses canonical `bookingScheduling`.
- Patient/public create runtime keeps legacy Rubitime-first/mirror functions in `canonicalCreate.ts`, but both switches currently return `false`; normal create writes canonical first and emits provider-neutral lifecycle events.
- Online `rehab_lfk` / `nutrition` categories are enum/UI inputs into the same canonical online booking path; no separate webapp Rubitime profile path was found.

## Test Coverage

- v1 slots return `400 legacy_resolve_disabled` and do not call `resolveBookingProfile`.
- v1 create-record returns `400 legacy_resolve_disabled` and does not call `resolveBookingProfile`.
- v2 slots still work with the flag disabled.
- v2 create-record still works with the flag disabled and does not call `resolveBookingProfile`.

## Runtime Inventory Commands

- `rg -n "fetchSlots\\(|createRecord\\(|version: \"v2\"|type: .*online|category:" apps/webapp/src/modules/patient-booking apps/webapp/src/app/api/booking apps/webapp/src/app/api/booking/public apps/webapp/src/app/app/patient/booking apps/webapp/src/app/book -g '*.ts' -g '*.tsx'`
- `rg -n "rehab_lfk|nutrition" apps/webapp/src/modules/patient-booking apps/webapp/src/app/api/booking apps/webapp/src/app/api/booking/public apps/webapp/src/app/app/patient/booking apps/webapp/src/app/book -g '*.ts' -g '*.tsx'`

## Still Open

- Do not change production env until R6 cutoff/drain/final-delta gates are done and owner approves.
- Monitoring window for v1 requests is not run here.
- Full Rubitime route removal remains R6, not R5.

## Pending Production Monitoring / Approval Proof

Save the completed production proof as:

`docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.md`

Required contents:

- owner-approved production flag-change timestamp;
- monitoring window start/end;
- aggregate count of v1 `/api/bersoncare/rubitime/slots` requests during the window;
- aggregate count of v1 `/api/bersoncare/rubitime/create-record` requests during the window;
- confirmation that no user-facing booking path required v1 profile resolution;
- command/log source used for the aggregate counts, without secrets or PII;
- owner approval note;
- rollback boundary and service restart notes if rollback was tested or needed.

Do not mark the R5 production checklist items complete until that file exists with real production evidence.
Do not create a placeholder proof file just to satisfy `check-rubitime-final-gate --require-complete`.

## Production Rollback Instruction

Use only after an owner-approved production flag change has already disabled legacy v1 profile resolve.
This section is a rollback boundary, not permission to change production now.

Canonical host facts from `deploy/HOST_DEPLOY_README.md`:

- Integrator env: `/opt/env/bersoncarebot/api.prod`
- Integrator services:
  - `bersoncarebot-api-prod.service`
  - `bersoncarebot-worker-prod.service`
  - `bersoncarebot-scheduler-prod.service`

Rollback if production v1 traffic must be temporarily restored:

1. On the production host, through the approved root/operator env-edit path, set
   `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=true` in `/opt/env/bersoncarebot/api.prod`, or remove the line so the
   code falls back to the historical enabled behavior. Do not print env values to chat or logs.
2. Restart only the integrator services that read `api.prod`:

   ```bash
   sudo systemctl restart bersoncarebot-api-prod.service bersoncarebot-worker-prod.service bersoncarebot-scheduler-prod.service
   sudo systemctl is-active bersoncarebot-api-prod.service bersoncarebot-worker-prod.service bersoncarebot-scheduler-prod.service
   ```

3. Confirm the incident symptom is resolved in the approved monitoring/log window.
4. After the rollback window, re-disable the legacy resolver by setting
   `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=false` in `/opt/env/bersoncarebot/api.prod`, restart the same three
   services, and confirm v1 requests again fail with `legacy_resolve_disabled`.

Database rollback is not part of R5. If a database change is involved, stop and use the R6/R7 backup/restore runbooks.

## Validation

- `pnpm --dir apps/integrator exec vitest run src/integrations/rubitime/recordM2mRoute.test.ts` - passed, 54 tests.
- `pnpm --dir apps/integrator exec eslint src/integrations/rubitime/recordM2mRoute.test.ts` - passed.
