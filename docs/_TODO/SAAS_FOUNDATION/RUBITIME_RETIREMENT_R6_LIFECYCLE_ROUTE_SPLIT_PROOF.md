# Rubitime retirement R6 lifecycle route split proof

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This proof covers the first R6 code split before destructive integrator Rubitime route removal:

- `/api/bersoncare/booking/lifecycle-event` is registered through
  `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`.
- `apps/integrator/src/app/routes.ts` wires the provider-neutral booking lifecycle route separately from
  `registerRubitimeRecordM2mRoutes`.
- The legacy compatibility alias `/api/bersoncare/rubitime/booking-event` remains mounted in the Rubitime registrar
  until the R6 cutoff/drain gates allow removal.
- The old doctor webapp proxy routes `POST /api/doctor/appointments/rubitime/update` and
  `POST /api/doctor/appointments/rubitime/cancel` were removed. `rg` found no UI callers; canonical booking-engine
  doctor/admin routes remain the supported runtime surface.
- Doctor/admin manual create no longer resolves legacy Rubitime branch-service mapping when
  `booking_rubitime_bridge_enabled=false`. Canonical manual create remains available; Rubitime `create-record` remains
  gated for cutoff-dependent bridge-enabled flows.

No production DB, env, service, webhook, or Rubitime endpoint was changed.

## Important Caveat

The lifecycle handler implementation is still exported from `recordM2mRoute.ts` in this step to keep the change
small and behavior-preserving. This proof does not claim Rubitime code removal is complete. A later R6 step must move
the lifecycle handler body out of `integrations/rubitime` or delete the Rubitime registrar after the cutoff gates pass.

## Validation

- `pnpm --dir apps/integrator exec vitest run src/integrations/rubitime/recordM2mRoute.test.ts` - passed, 54 tests.
- `pnpm --dir apps/integrator typecheck` - passed.
- `pnpm --dir apps/webapp exec vitest run src/app/api/doctor/t03FinalTailPrincipal.audit.test.ts` - passed, 1 test.
- `pnpm --dir apps/webapp exec eslint src/app/api/doctor/t03FinalTailPrincipal.audit.test.ts` - passed.
- `pnpm --dir apps/webapp typecheck` - passed after deleting stale generated Next validator dirs
  `apps/webapp/.next/types` and `apps/webapp/.next/dev/types`; running Next servers were checked first and
  `.next/cache` / standalone output were not touched.
- `pnpm --dir apps/webapp exec vitest run src/app/api/doctor/booking-engine/appointments/manual/route.test.ts src/app/api/admin/booking-engine/appointments/manual/route.test.ts` - passed, 10 tests.
- `pnpm --dir apps/webapp exec eslint src/app/api/doctor/booking-engine/appointments/manual/route.ts src/app/api/admin/booking-engine/appointments/manual/route.ts src/app/api/doctor/booking-engine/appointments/manual/route.test.ts src/app/api/admin/booking-engine/appointments/manual/route.test.ts` - passed.
- `rg -n "api/doctor/appointments/rubitime|appointments/rubitime/(update|cancel)" apps/webapp/src apps/webapp/INTEGRATOR_CONTRACT.md apps/webapp/src/app/api/api.md -g '*.ts' -g '*.tsx' -g '*.md'` - no runtime code hits; only retired-doc note remains.
