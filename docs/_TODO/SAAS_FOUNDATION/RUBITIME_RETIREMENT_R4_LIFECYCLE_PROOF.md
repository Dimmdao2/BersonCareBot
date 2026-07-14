# Rubitime retirement R4 lifecycle proof

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This proof covers the first R4 cut: the canonical booking lifecycle M2M endpoint is no longer primarily named as a Rubitime endpoint.

It does not claim Rubitime runtime deletion is complete. Raw webhook shutdown, `booking_calendar_map` rekey/migration, final durable event-version idempotency proof, and route removal remain R5/R6/R7 gated work.

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
  - webapp sends lifecycle events to the neutral route, not the Rubitime-named route;
  - existing Rubitime-named route tests continue to cover compatibility behavior and current side-effect parity.

## Current side-effect inventory

Existing tests around the lifecycle handler cover:

- invalid payload/signature rejection;
- idempotency for repeated booking events;
- canonical GCal update for package link and cancellation;
- cancellation with suppressed patient notification while keeping GCal update;
- reschedule GCal update using current map key;
- booking-created reminder scheduling through delivery-target topic `appointment_reminders`;
- no app Web Push on immediate booking-created confirmation;
- reschedule reminder cancellation/re-scheduling;
- doctor Telegram notification path when configured.

## Raw Rubitime Runtime Inventory

Raw Rubitime webhook/post-create paths still exist and must not be removed until R6 gates are satisfied:

- `apps/integrator/src/integrations/rubitime/webhook.ts`
  - `POST /webhook/rubitime/:token` validates Rubitime payloads.
  - `GET /api/rubitime?record_success=...` fetches the Rubitime record by id and re-enters the same raw webhook processing path.
  - Both paths call `prepareRubitimeWebhookIngress`, then `syncRubitimeWebhookBodyToGoogleCalendar`, then `rubitimeIncomingToEvent`, then `eventGateway.handleIncomingEvent`.
  - Both paths may emit `user.email.autobind` for `event-create-record`.

- `apps/integrator/src/integrations/rubitime/postCreateProjection.ts`
  - After Rubitime `create-record`, `runPostCreateProjection(recordId)` fetches the full Rubitime record.
  - It builds synthetic `event-create-record` input, normalizes ingress, runs `syncRubitimeWebhookBodyToGoogleCalendar`, then writes `booking.upsert` into the legacy projection path.
  - This is still Rubitime API-dependent and cannot survive provider removal as-is.

- `apps/integrator/src/integrations/rubitime/connector.ts`
  - `syncRubitimeWebhookBodyToGoogleCalendar` maps raw Rubitime incoming actions to `syncAppointmentToCalendar` keyed by Rubitime record id.
  - `event-delete-record` / `event-remove-record` map to GCal cancellation/deletion behavior.

- `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts`
  - Rubitime `remove-record` still attempts GCal cleanup through `syncAppointmentToCalendar` before calling Rubitime remove.
  - Rubitime `create-record` still runs `runPostCreateProjection` after successful Rubitime create in both v2 and legacy v1 paths.

Reminder inventory:

- No direct reminder scheduling was found in `webhook.ts`, `postCreateProjection.ts`, or `connector.ts`.
- Booking reminders are currently scheduled/cancelled from canonical booking lifecycle handling in `recordM2mRoute.ts` via `scheduleBookingReminders` and `cancelPendingBookingReminders`.
- Therefore R4 reminder replacement is primarily a proof/removal task: keep lifecycle route, then remove raw Rubitime runtime without reintroducing reminder behavior there.

## Still Open

- Raw Rubitime webhook and post-create projection are still present and must be drained/disabled before runtime route removal.
- GCal map remains `booking_calendar_map`; it must be explicitly kept or migrated before any drop.
- Durable idempotency still needs final canonical appointment event/version proof.
- R6 must remove Rubitime routes only after provider cutoff, drains, and final CSV reconciliation.

## Validation

- `pnpm --dir apps/integrator exec vitest run src/integrations/rubitime/recordM2mRoute.test.ts` - passed, 45 tests.
- `pnpm -C apps/webapp exec vitest run src/modules/integrator/bookingM2mApi.test.ts` - passed, 17 tests.
- `pnpm --dir apps/integrator typecheck` - passed.
- `pnpm -C apps/webapp run typecheck` - passed.
- `pnpm -C apps/webapp run lint` - passed.
- `pnpm run check:rubitime-retirement-r0` - passed.
- `git diff --check` - passed.
