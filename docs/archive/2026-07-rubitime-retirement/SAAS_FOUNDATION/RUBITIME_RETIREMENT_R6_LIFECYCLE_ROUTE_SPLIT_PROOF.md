# Rubitime retirement R6 lifecycle route split proof

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This proof covers the first R6 code split before destructive integrator Rubitime route removal:

- `/api/bersoncare/booking/lifecycle-event` is registered through
  `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`.
- Booking lifecycle validation, handler implementation and booking notification date formatting now live under
  `apps/integrator/src/integrations/bersoncare/`, outside the Rubitime registrar ownership.
- `apps/integrator/src/app/routes.ts` wires the provider-neutral booking lifecycle route separately from
  `registerRubitimeRecordM2mRoutes`.
- The legacy compatibility alias `/api/bersoncare/rubitime/booking-event` remains mounted in the Rubitime registrar
  and delegates to the provider-neutral handler until the R6 cutoff/drain gates allow removal.
- The old doctor webapp proxy routes `POST /api/doctor/appointments/rubitime/update` and
  `POST /api/doctor/appointments/rubitime/cancel` were removed. `rg` found no UI callers; canonical booking-engine
  doctor/admin routes remain the supported runtime surface.
- Doctor/admin manual create no longer resolves legacy Rubitime branch-service mapping when
  `booking_rubitime_bridge_enabled=false`. Canonical manual create remains available; Rubitime `create-record` remains
  gated for cutoff-dependent bridge-enabled flows.
- Patient/public canonical create no longer contains hard-disabled Rubitime-first or Rubitime-create-mirror branches.
  Normal patient/public create uses canonical scheduling/booking plus provider-neutral lifecycle events.
- Patient cancel/reschedule no longer attempts outbound Rubitime mirror when `booking_rubitime_bridge_enabled=false`;
  canonical lifecycle state changes and provider-neutral lifecycle events still run.

No production DB, env, service, webhook, or Rubitime endpoint was changed.

## Important Caveat

This proof does not claim Rubitime code removal is complete. A later R6 step must delete the Rubitime compatibility
alias, Rubitime M2M/admin/webhook routes and raw runtime after the cutoff/drain gates pass.

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
- `pnpm --dir apps/webapp exec vitest run src/modules/patient-booking/canonicalCreate.test.ts` - passed, 16 tests.
- `pnpm --dir apps/webapp exec eslint src/modules/patient-booking/canonicalCreate.ts src/modules/patient-booking/canonicalCreate.test.ts` - passed.
- `pnpm --dir apps/integrator exec vitest run src/integrations/rubitime/recordM2mRoute.test.ts src/integrations/rubitime/schema.test.ts` - passed, 64 tests.
- `pnpm --dir apps/integrator exec eslint src/integrations/bersoncare/bookingLifecycleRoute.ts src/integrations/bersoncare/bookingLifecycleSchema.ts src/integrations/bersoncare/bookingNotificationFormat.ts src/integrations/rubitime/recordM2mRoute.ts src/integrations/rubitime/schema.ts src/integrations/rubitime/recordM2mRoute.test.ts src/integrations/rubitime/schema.test.ts` - passed.
- `pnpm --dir apps/webapp exec vitest run src/modules/patient-booking/service.test.ts src/modules/patient-booking/bookingMirrorDesyncMatrix.test.ts src/modules/patient-booking/patientMirrorOutbound.test.ts` - passed, 41 tests.
- `rg -n "isRubitimeFirstCreateEnabled|isRubitimeCreateMirrorEnabled|createRubitimeRecord\\(|rollbackFailedRubitimeCreate|waitForRubitimeProjectionMapping|extractRubitimeManageUrl|rubitime_projection_not_ready|rubitimeFirst|bridgeEnabled|syncPort\\.createRecord|syncPort\\.deleteRecord" apps/webapp/src/modules/patient-booking/canonicalCreate.ts` - no matches.
- `rg -n "api/doctor/appointments/rubitime|appointments/rubitime/(update|cancel)" apps/webapp/src apps/webapp/INTEGRATOR_CONTRACT.md apps/webapp/src/app/api/api.md -g '*.ts' -g '*.tsx' -g '*.md'` - no runtime code hits; only retired-doc note remains.
- `rg -n "handleBookingLifecycleEvent|scheduleBookingReminders|sendBookingWebPush|trySyncCanonicalBookingToGoogleCalendar|BookingLifecyclePayloadSchema|parseBookingLifecycleEvent" apps/integrator/src/integrations/rubitime -g '*.ts'` - no lifecycle handler body remains in Rubitime ownership; `schema.ts` keeps compatibility re-exports only.
