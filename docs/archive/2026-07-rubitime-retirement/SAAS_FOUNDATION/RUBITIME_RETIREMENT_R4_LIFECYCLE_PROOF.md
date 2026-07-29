# Rubitime retirement R4 lifecycle proof

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This proof covers R4 provider-neutral lifecycle side effects: the canonical booking lifecycle M2M endpoint is no
longer primarily named as a Rubitime endpoint, and Google Calendar writes are driven by canonical lifecycle events.

It does not claim Rubitime runtime deletion is complete. Raw webhook shutdown, final provider cutoff/drain, and route
removal remain R6/R7 gated work.

## Owner source-of-truth rule

Fresh Rubitime export CSV is the canon for appointment history. `integrator.rubitime_records` is only audit material when a fresh CSV exists. Rows present only in integrator raw tables and absent from the CSV are not canonical import targets.

The CSV is matched against canonical/public history by the approved city/specialist export context. Do not invent extra history from integrator raw state.

## Changes

- Added provider-neutral integrator route:
  - `/api/bersoncare/booking/lifecycle-event`
- Kept bounded compatibility alias:
  - `/api/bersoncare/rubitime/booking-event`
- Switched webapp booking lifecycle emission to the provider-neutral route.
- Added tests proving:
  - the provider-neutral route reaches canonical GCal lifecycle side effects;
  - `booking.created` uses canonical GCal sync even when a Rubitime id is present, with the Rubitime id only as
    fallback/adoption input;
  - webapp sends lifecycle events to the neutral route, not the Rubitime-named route;
  - raw Rubitime webhook, post-create projection and remove-record no longer call raw GCal sync;
  - existing Rubitime-named route tests continue to cover compatibility behavior and current side-effect parity.

## Current side-effect inventory

Existing tests around the lifecycle handler cover:

- invalid payload/signature rejection;
- idempotency for repeated booking events;
- canonical GCal update for package link and cancellation;
- cancellation with suppressed patient notification while keeping GCal update;
- reschedule GCal update using current map key;
- reschedule request GCal update with pending marker and no channel notifications;
- booking delete GCal cleanup by current map key;
- booking-created reminder scheduling through delivery-target topic `appointment_reminders`;
- payment-captured channel notifications, reminder scheduling, and GCal update;
- no app Web Push on immediate booking-created confirmation;
- cancellation and reschedule app Web Push with `appointment_lifecycle` intent and `/app/patient/messages` openUrl;
- reschedule reminder cancellation/re-scheduling;
- package link/unlink GCal update without patient notifications;
- doctor Telegram notification path when configured.

Provider-neutral calendar map:

- `booking_calendar_map` is kept for active Google Calendar sync, but canonical lifecycle now uses `be:<canonicalAppointmentId>` as the primary map key.
- When a legacy Rubitime map row already exists, canonical sync adopts the old Google event id as fallback, upserts the `be:*` row, and removes only the stale Rubitime map row.
- This preserves existing GCal events without duplicate recreation while moving lifecycle updates/deletes to canonical appointment keys.
- The table/column names still contain legacy wording; destructive schema rename/drop is deferred to R7 because GCal remains active.

Durable lifecycle idempotency:

- Lifecycle route now uses the existing integrator `IdempotencyPort` / `idempotency_keys` table when registered through app DI.
- Storage key format: `booking-lifecycle:<eventType>:<canonicalAppointmentId|bookingId>:<webapp lifecycle idempotencyKey>`.
- TTL remains 24h, matching the previous in-memory dedup window.
- Test coverage includes two separate Fastify app instances sharing one `IdempotencyPort`, proving a repeated event after process recreation does not repeat side effects.
- The storage key is now anchored to canonical appointment identity when available and keeps the webapp lifecycle idempotency key as the event id component.

## Raw Rubitime Runtime Inventory

Historical note: this proof was written before R6 source cleanup. As of 2026-07-14, the Rubitime runtime source files
listed below were removed or unmounted; keep this section as pre-R6 evidence, not current runtime inventory.

Raw Rubitime webhook/post-create paths still exist and must not be removed until R6 gates are satisfied:

- `apps/integrator/src/integrations/rubitime/webhook.ts`
  - `POST /webhook/rubitime/:token` validates Rubitime payloads.
  - `GET /api/rubitime?record_success=...` fetches the Rubitime record by id and re-enters the same raw webhook processing path.
  - Both paths call `prepareRubitimeWebhookIngress`, then `rubitimeIncomingToEvent`, then `eventGateway.handleIncomingEvent`.
  - They no longer call `syncRubitimeWebhookBodyToGoogleCalendar`; raw Rubitime ingress is not a GCal writer.
  - Both paths may emit `user.email.autobind` for `event-create-record`.

- `apps/integrator/src/integrations/rubitime/postCreateProjection.ts`
  - After Rubitime `create-record`, `runPostCreateProjection(recordId)` fetches the full Rubitime record.
  - It builds synthetic `event-create-record` input, normalizes ingress, then writes `booking.upsert` into the legacy projection path with no GCal event id.
  - This is still Rubitime API-dependent and cannot survive provider removal as-is.

- `apps/integrator/src/integrations/rubitime/connector.ts`
  - `syncRubitimeWebhookBodyToGoogleCalendar` maps raw Rubitime incoming actions to `syncAppointmentToCalendar` keyed by Rubitime record id.
  - `event-delete-record` / `event-remove-record` map to GCal cancellation/deletion behavior.
  - This helper is retained only as legacy dead code until R6 removal; runtime raw webhook/post-create/remove no longer call it.

- `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts`
  - Rubitime `remove-record` no longer attempts GCal cleanup. Canonical `booking.deleted` with `canonicalAppointmentId`
    is the GCal delete path.
  - Rubitime `create-record` still runs `runPostCreateProjection` after successful Rubitime create in both v2 and legacy v1 paths.

Reminder inventory:

- No direct reminder scheduling was found in `webhook.ts`, `postCreateProjection.ts`, or `connector.ts`.
- Booking reminders are currently scheduled/cancelled from canonical booking lifecycle handling in `recordM2mRoute.ts` via `scheduleBookingReminders` and `cancelPendingBookingReminders`.
- Therefore R4 reminder replacement is primarily a proof/removal task: keep lifecycle route, then remove raw Rubitime runtime without reintroducing reminder behavior there.

## Still Open

- Raw Rubitime webhook and post-create projection are still present and must be drained/disabled before runtime route removal.
- GCal map remains `booking_calendar_map`; it must be explicitly kept or migrated before any drop.
- Raw Rubitime webhook idempotency remains eventGateway-based until R6 removal; canonical lifecycle idempotency is persisted.
- R6 must remove Rubitime routes only after provider cutoff, drains, and final CSV reconciliation.

## Validation

- `pnpm --dir apps/integrator exec vitest run src/integrations/rubitime/recordM2mRoute.test.ts` - passed, 50 tests.
- `pnpm --dir apps/integrator exec vitest run src/integrations/rubitime/recordM2mRoute.test.ts src/app/routes.projectionHealth.test.ts` - passed, 54 tests.
- `pnpm --dir apps/integrator exec vitest run src/integrations/google-calendar/sync.test.ts src/infra/db/repos/bookingCalendarMap.test.ts src/integrations/rubitime/recordM2mRoute.test.ts` - passed, 69 tests.
- `pnpm --dir apps/integrator exec vitest run src/integrations/rubitime/recordM2mRoute.test.ts src/integrations/rubitime/webhook.test.ts src/integrations/rubitime/webhook.operatorIncident.test.ts src/integrations/rubitime/postCreateProjection.test.ts src/integrations/rubitime/connector.test.ts` - passed, 88 tests.
- `rg -n "syncRubitimeWebhookBodyToGoogleCalendar\\(|syncAppointmentToCalendar\\(" apps/integrator/src/integrations/rubitime apps/webapp/src --glob '!**/*.test.ts'` - only the retained legacy helper definition in `connector.ts` remains; no raw runtime call sites.
- `pnpm -C apps/webapp exec vitest run src/modules/integrator/bookingM2mApi.test.ts` - passed, 17 tests.
- `pnpm --dir apps/integrator typecheck` - passed.
- `pnpm -C apps/webapp run typecheck` - passed.
- `pnpm -C apps/webapp run lint` - passed.
- `pnpm run check:rubitime-retirement-r0` - passed.
- `git diff --check` - passed.
- `pnpm --dir apps/integrator exec eslint src/integrations/rubitime/recordM2mRoute.ts src/integrations/rubitime/recordM2mRoute.test.ts src/app/di.ts src/app/routes.ts src/app/routes.projectionHealth.test.ts` - passed.
- `pnpm --dir apps/integrator exec eslint src/integrations/google-calendar/sync.ts src/integrations/google-calendar/sync.test.ts src/infra/db/repos/bookingCalendarMap.ts src/infra/db/repos/bookingCalendarMap.test.ts src/integrations/rubitime/recordM2mRoute.ts src/integrations/rubitime/recordM2mRoute.test.ts` - passed.
- `pnpm --dir apps/integrator lint` - failed on pre-existing `no-secrets/no-secrets` findings in `src/infra/runtime/scheduler/main.ts`, `src/infra/runtime/worker/main.ts`, and `src/infra/runtime/worker/outgoingDeliveryWorker.ts`; not introduced by this R4 lifecycle change.
