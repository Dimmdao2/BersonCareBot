# ACCEPTANCE — двустороннее зеркалирование Rubitime ↔ канон

Дата: 2026-06-05 (mirror sync); closeout gaps — 2026-06-06. Код: `AppointmentMirrorSync`, `booking-appointment-sync/`, `rubitimeCreateRollback.ts`.  
Планы (архив): [bidirectional sync](../../.cursor/plans/archive/bidirectional_appointment_sync_14c1fa2c.plan.md), [integrity hardening](../../.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md), [gaps closeout](../../.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md).

## Авто-проверки (локально)

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/booking-appointment-sync \
  src/modules/patient-booking/patientMirrorOutbound.test.ts \
  src/modules/patient-booking/rubitimeCreateRollback.test.ts \
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

Контракт: [`BOOKING_MIRROR_INTEGRITY_CONTRACT.md`](BOOKING_MIRROR_INTEGRITY_CONTRACT.md) (partial flags по поверхности — § Partial outcomes). План (архив, `status: completed`): [`.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md`](../../.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md) — **единственный** source-of-truth; копия в `~/.cursor/plans/` должна совпадать с архивом. Closeout: `f960825b` → `9e2ef6c3` → `13abe6d7`; журнал: [`LOG.md`](LOG.md) §2026-06-05.

## Верификация closeout (post-audit, 2026-06-05)

| Проверка | Результат |
|----------|-----------|
| Targeted mirror matrix (webapp) | 20 files, 199 tests — passed |
| Targeted mirror matrix (integrator) | 4 files, 53 tests — passed |
| `pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json` | OK |
| `pnpm --dir apps/integrator exec tsc --noEmit` | OK |
| `pnpm install --frozen-lockfile && pnpm run ci` | passed (post-audit, 2026-06-05; ~5 min) |

| Кейс | Покрытие |
|------|----------|
| Prepayment сохраняет `rubitime_id` | `canonicalCreate.test.ts` |
| `markConfirmedByCanonicalAppointment` не затирает `rubitime_id` | `pgPatientBookings.test.ts` |
| Admin manual create + Rubitime rollback | `admin/.../manual/route.test.ts` |
| Doctor manual create + Rubitime rollback | `doctor/.../manual/route.test.ts` |
| Rubitime-first package/product rollback | `canonicalCreate.test.ts` |
| Rubitime-first projection wait + create rollback | `rubitimeCreateRollback.test.ts`, `canonicalCreate.test.ts` |
| Patient reschedule skip assert при `slots=rubitime` | `service.test.ts` |
| Patient partial outcome toast (mirror) | `bookingPartialOutcomeToast.test.ts`, `useRescheduleBooking.test.ts`, `CabinetBookingActions.test.tsx`, `ConfirmStepClient.test.tsx` |
| Staff manual create rollback (shared helper) | `staffRubitimeManualBooking.test.ts`, `rubitimeCreateRollback.test.ts` |
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

**Закрыто (gaps closeout 2026-06-06):** legacy `POST /api/doctor/appointments/rubitime/cancel` → M2M `update-record` **status 4** (не `remove-record`); см. [`INTEGRATOR_CONTRACT.md`](../../apps/webapp/INTEGRATOR_CONTRACT.md).

## Smoke-матрица (6 + post-closeout)

| # | Сценарий | Ожидание | Авто |
|---|----------|----------|------|
| 1 | Rubitime cancel → канон | `be_appointments.status` = cancelled*, mapping сохранён | unit inbound cancel |
| 2 | Rubitime reschedule / duration / service | `startAt`/`endAt`/FK обновлены, partial FK не null | unit duration + snapshot |
| 3 | Calendar staff cancel → Rubitime | канон `staffCancel`, затем `cancelRecord` (status 4) | route + mirror |
| 4 | Calendar staff reschedule → Rubitime | `record`/`datetime_end`/scope ids | route + patch test |
| 5 | native/admin + mapping inbound | update для `admin_manual` и любого `source` при mapping | bridge test `admin_manual` |
| 6 | Patient cancel/reschedule + rubitimeId | mirror patch + `stampCanonicalOutbound` | patientMirrorOutbound |
| 7 | CR-A-fail (slow projection) | `rubitime_projection_not_ready`, rollback `deleteRecord`, нет duplicate canon | `canonicalCreate.test.ts`, `rubitimeCreateRollback.test.ts` |
| 8 | Partial cancel (Rubitime down) | HTTP `ok: true` + `rubitimeMirrorFailed`; UI success + warning toast | `bookingPartialOutcomeToast.test.ts`, `CabinetBookingActions.test.tsx` |

\* при `booking_doctor_appointments_read_source=canonical` календарь читает `be_appointments`.

Post-deploy smoke (ручной): CR-A, CR-A-fail, CN-P, RS-P, partial — [`LOG.md`](LOG.md) §2026-06-06.

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
- [x] Docs: `RUBITIME_BOOKING_PIPELINE.md`, `booking-calendar.md`, `patient-booking.md`, `api.md`, `BOOKING_MIRROR_INTEGRITY_CONTRACT.md`, `booking-appointment-sync/README.md`, `LOG.md`, plan archive YAML `completed`
- [x] Gaps closeout docs sync (2026-06-06): pipeline §rubitime-first, ACCEPTANCE smoke #7–8, README/ROADMAP plan links, `booking_scenarios_audit` в archive
