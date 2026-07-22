# Rubitime retirement R5 legacy profile resolve proof

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

**SUPERSEDED ACCEPTANCE — 2026-07-22 Track C.** This file preserves source-level historical evidence only. The
resolver source was removed, so `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED` is not a live TEST flag and no flag
restore is valid. The historical response `legacy_resolve_disabled` is not the current live contract.

Current R5 acceptance is a declared TEST window proving retired v1 slots/create routes are negative/unmounted while
canonical booking paths remain healthy. That evidence remains open; PROD is separate and untouched.

Historical scope covered a legacy v1 profile-resolver switch, now removed and never to be recreated:
- v1 `/api/bersoncare/rubitime/slots`
- v1 `/api/bersoncare/rubitime/create-record`
- v2 explicit Rubitime ID requests for slots/create

No production or host env was changed in this proof.

## Historical Findings (not current TEST acceptance)

- Historical cutover switch lived in `apps/integrator/src/integrations/rubitime/legacyResolveFlag.ts`; the file was
  removed in the 2026-07-14 R6 source-layer cleanup after the legacy profile path was retired.
- When disabled, v1 requests that rely on `rubitime_booking_profiles` must fail fast with `legacy_resolve_disabled`.
- v2 M2M bodies with explicit Rubitime ids ignore the legacy profile flag.
- Patient/public slots runtime no longer calls `syncPort.fetchSlots`; `createPatientBookingService.getSlots` uses canonical `bookingScheduling`.
- Patient/public create runtime keeps legacy Rubitime-first/mirror functions in `canonicalCreate.ts`, but both switches currently return `false`; normal create writes canonical first and emits provider-neutral lifecycle events.
- Online `rehab_lfk` / `nutrition` categories are enum/UI inputs into the same canonical online booking path; no separate webapp Rubitime profile path was found.

## Historical Test Coverage (not current TEST acceptance)

- v1 slots return `400 legacy_resolve_disabled` and do not call `resolveBookingProfile`.
- v1 create-record returns `400 legacy_resolve_disabled` and does not call `resolveBookingProfile`.
- v2 slots still work with the flag disabled.
- v2 create-record still works with the flag disabled and does not call `resolveBookingProfile`.

## Runtime Inventory Commands

- `rg -n "fetchSlots\\(|createRecord\\(|version: \"v2\"|type: .*online|category:" apps/webapp/src/modules/patient-booking apps/webapp/src/app/api/booking apps/webapp/src/app/api/booking/public apps/webapp/src/app/app/patient/booking apps/webapp/src/app/book -g '*.ts' -g '*.tsx'`
- `rg -n "rehab_lfk|nutrition" apps/webapp/src/modules/patient-booking apps/webapp/src/app/api/booking apps/webapp/src/app/api/booking/public apps/webapp/src/app/app/patient/booking apps/webapp/src/app/book -g '*.ts' -g '*.tsx'`

## Current Open TEST Evidence

- Freeze the integrated SHA, establish forward-migration compatibility, and use only the incremental
  `deploy/host/deploy-test.sh` path.
- Record a declared TEST monitoring window with aggregate-only route/error counts.
- Prove retired v1 slots/create routes are negative/unmounted; do not infer `legacy_resolve_disabled` or a response
  code from historical unit tests.
- Smoke canonical slots/create/reschedule/cancel and doctor Today/KPI/calendar/list on TEST.
- Record a code rollback boundary that never re-enables the removed resolver and leaves external Rubitime
  ingress/outbound disabled.

## Superseded Production Flag / Restore Contract

Historical context only: the former flag/PROD rollback model predates removal of the resolver source. It is
**superseded and non-executable**. Do not add, set, restore, or emulate the removed resolver flag in TEST or PROD;
do not edit production environment files or restart services for this retired contract.

The historical proof filename remains for final-gate compatibility:

`docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.md`

It can close R5 only with real current TEST negative/unmounted-route evidence and canonical smoke, never with a
placeholder or a recreated flag change. The compatible rollback boundary is incremental code rollback that leaves
external Rubitime ingress/outbound disabled; if that boundary cannot be proven, stop for the owner/R7 decision.

## Validation

- `pnpm --dir apps/integrator exec vitest run src/integrations/rubitime/recordM2mRoute.test.ts` - passed, 54 tests.
- `pnpm --dir apps/integrator exec eslint src/integrations/rubitime/recordM2mRoute.test.ts` - passed.
