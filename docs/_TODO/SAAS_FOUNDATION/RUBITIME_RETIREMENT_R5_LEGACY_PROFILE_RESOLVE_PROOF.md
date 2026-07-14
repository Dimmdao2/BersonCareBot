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

## Test Coverage

- v1 slots return `400 legacy_resolve_disabled` and do not call `resolveBookingProfile`.
- v1 create-record returns `400 legacy_resolve_disabled` and does not call `resolveBookingProfile`.
- v2 slots still work with the flag disabled.
- v2 create-record still works with the flag disabled and does not call `resolveBookingProfile`.

## Still Open

- Do not change production env until R6 cutoff/drain/final-delta gates are done and owner approves.
- Monitoring window for v1 requests is not run here.
- Full Rubitime route removal remains R6, not R5.

## Validation

- `pnpm --dir apps/integrator exec vitest run src/integrations/rubitime/recordM2mRoute.test.ts` - passed, 54 tests.
- `pnpm --dir apps/integrator exec eslint src/integrations/rubitime/recordM2mRoute.test.ts` - passed.

