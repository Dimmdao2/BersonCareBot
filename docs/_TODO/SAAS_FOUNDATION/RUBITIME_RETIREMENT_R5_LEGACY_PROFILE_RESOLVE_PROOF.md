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

## Validation

- `pnpm --dir apps/integrator exec vitest run src/integrations/rubitime/recordM2mRoute.test.ts` - passed, 54 tests.
- `pnpm --dir apps/integrator exec eslint src/integrations/rubitime/recordM2mRoute.test.ts` - passed.
