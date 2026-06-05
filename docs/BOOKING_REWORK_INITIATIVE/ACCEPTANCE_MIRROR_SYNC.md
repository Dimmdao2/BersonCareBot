# ACCEPTANCE — двустороннее зеркалирование Rubitime ↔ канон

Дата: 2026-06-05. Код: `AppointmentMirrorSync`, `booking-appointment-sync/`.  
План (архив): [`.cursor/plans/archive/bidirectional_appointment_sync_14c1fa2c.plan.md`](../../.cursor/plans/archive/bidirectional_appointment_sync_14c1fa2c.plan.md).

## Авто-проверки (локально)

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/booking-appointment-sync \
  src/modules/patient-booking/patientMirrorOutbound.test.ts \
  src/modules/patient-booking/canonicalCreate.test.ts \
  src/modules/patient-booking/service.test.ts \
  src/app-layer/booking/staffManualCancelAfterCanonical.test.ts \
  src/infra/repos/pgBookingRubitimeBridge.test.ts \
  src/infra/repos/pgBookingAppointmentLifecycle.test.ts \
  src/infra/repos/pgPatientBookings.test.ts \
  src/modules/integrator/events.test.ts \
  src/modules/booking-rubitime-bridge/legacyProjection.test.ts \
  src/app/api/doctor/booking-engine/appointments/manual/route.test.ts \
  src/app/api/admin/booking-engine/appointments/manual/route.test.ts \
  src/app/api/doctor/booking-engine/appointments/\[id\]/manual-reschedule/route.test.ts \
  src/app/api/doctor/booking-engine/appointments/\[id\]/manual-cancel/route.test.ts \
  src/app/api/admin/booking-engine/appointments/\[id\]/manual-reschedule/route.test.ts \
  src/app/api/admin/booking-engine/appointments/\[id\]/manual-cancel/route.test.ts

pnpm --dir apps/integrator exec vitest run \
  src/integrations/rubitime/rubitimePayloadHash.test.ts \
  src/integrations/rubitime/normalizeUpdateRecordPatch.test.ts \
  src/integrations/rubitime/recordM2mRoute.test.ts \
  src/kernel/eventGateway/index.test.ts
```

## Integrity hardening (2026-06-05)

Контракт: [`BOOKING_MIRROR_INTEGRITY_CONTRACT.md`](BOOKING_MIRROR_INTEGRITY_CONTRACT.md). План: [`.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md`](../../.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md).

| Кейс | Покрытие |
|------|----------|
| Prepayment сохраняет `rubitime_id` | `canonicalCreate.test.ts` |
| `markConfirmedByCanonicalAppointment` не затирает `rubitime_id` | `pgPatientBookings.test.ts` |
| Admin manual create + Rubitime rollback | `admin/.../manual/route.test.ts` |
| Doctor manual create + Rubitime rollback | `doctor/.../manual/route.test.ts` |
| Rubitime-first package/product rollback | `canonicalCreate.test.ts` |
| Staff cancel partial flags (mirror/payment/membership/notify) | `staffManualCancelAfterCanonical.test.ts`, manual-cancel routes |
| Staff reschedule bridge gate + Rubitime conflict | `manual-reschedule/route.test.ts` (doctor) |
| Patient cancel partial flags (mirror/payment/membership/product/notify) | `service.test.ts` |
| Patient reschedule partial flags (mirror/payment/notify) | `service.test.ts` |
| Inbound echo / stale → no legacy fanout | `events.test.ts` |
| Revive guard (cancelled native / terminal canonical) | `pgPatientBookings.test.ts` |
| Lifecycle `state_conflict` + idempotent cancel | `pgBookingAppointmentLifecycle.test.ts` |
| Dedup payload hash + pipeline retry | `rubitimePayloadHash.test.ts`, `eventGateway/index.test.ts` |
| M2M empty patch / string status / branch TZ | `normalizeUpdateRecordPatch.test.ts`, `recordM2mRoute.test.ts` |
| Online concurrent slot (no extra DDL) | `service.test.ts` (`concurrent same slot`) |

**Вне scope / defer:** legacy `POST /api/doctor/appointments/rubitime/cancel` (`remove-record`) — см. контракт § Cancel semantics.

## Smoke-матрица (6 сценариев)

| # | Сценарий | Ожидание | Авто |
|---|----------|----------|------|
| 1 | Rubitime cancel → канон | `be_appointments.status` = cancelled*, mapping сохранён | unit inbound cancel |
| 2 | Rubitime reschedule / duration / service | `startAt`/`endAt`/FK обновлены, partial FK не null | unit duration + snapshot |
| 3 | Calendar staff cancel → Rubitime | канон `staffCancel`, затем `cancelRecord` (status 4) | route + mirror |
| 4 | Calendar staff reschedule → Rubitime | `record`/`datetime_end`/scope ids | route + patch test |
| 5 | native/admin + mapping inbound | update для `admin_manual` и любого `source` при mapping | bridge test `admin_manual` |
| 6 | Patient cancel/reschedule + rubitimeId | mirror patch + `stampCanonicalOutbound` | patientMirrorOutbound |

\* при `booking_doctor_appointments_read_source=canonical` календарь читает `be_appointments`.

## Ops после деплоя

Одноразовый backfill истории (при включённом bridge):

`POST /api/admin/booking-engine/bridge`

Live-path не требует ручного bridge для новых webhook.

## Definition of Done

- [x] Staff/admin manual cancel & reschedule → Rubitime + канон
- [x] Patient cancel/reschedule → Rubitime (mirror patch)
- [x] Inbound для mapped записей любого `source`
- [x] Единый `buildCanonicalInboundSnapshot` для канона и `appointment_records`
- [x] `mirror_last_synced_from`, `mirror_synced_at`, `mirror_sync_version`
- [x] Echo guard 8s
- [x] Integrity hardening: partial API flags, revive guard, lifecycle locks
- [x] Docs: `RUBITIME_BOOKING_PIPELINE.md`, `booking-calendar.md`, `patient-booking.md`, `booking-appointment-sync/README.md`, `LOG.md` (BOOKING_REWORK + OWN_BOOKING cross-refs)
