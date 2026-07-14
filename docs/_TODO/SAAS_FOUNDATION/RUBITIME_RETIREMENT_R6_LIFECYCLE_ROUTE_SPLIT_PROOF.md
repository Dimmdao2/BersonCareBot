# Rubitime retirement R6 lifecycle route split proof

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This proof covers the first R6 code split before destructive Rubitime route removal:

- `/api/bersoncare/booking/lifecycle-event` is registered through
  `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`.
- `apps/integrator/src/app/routes.ts` wires the provider-neutral booking lifecycle route separately from
  `registerRubitimeRecordM2mRoutes`.
- The legacy compatibility alias `/api/bersoncare/rubitime/booking-event` remains mounted in the Rubitime registrar
  until the R6 cutoff/drain gates allow removal.

No production DB, env, service, webhook, or Rubitime endpoint was changed.

## Important Caveat

The lifecycle handler implementation is still exported from `recordM2mRoute.ts` in this step to keep the change
small and behavior-preserving. This proof does not claim Rubitime code removal is complete. A later R6 step must move
the lifecycle handler body out of `integrations/rubitime` or delete the Rubitime registrar after the cutoff gates pass.

## Validation

- `pnpm --dir apps/integrator exec vitest run src/integrations/rubitime/recordM2mRoute.test.ts` - passed, 54 tests.
- `pnpm --dir apps/integrator typecheck` - passed.

