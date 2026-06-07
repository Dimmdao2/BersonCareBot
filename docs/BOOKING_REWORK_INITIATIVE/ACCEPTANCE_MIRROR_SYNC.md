# ACCEPTANCE — двустороннее зеркалирование Rubitime ↔ канон

Дата: 2026-06-05 (mirror sync); closeout gaps + desync fix — 2026-06-06. Код: `AppointmentMirrorSync`, `booking-appointment-sync/`, `rubitimeCreateRollback.ts`, `@bersoncare/booking-rubitime-sync`.  
Планы (архив): [bidirectional sync](../../.cursor/plans/archive/bidirectional_appointment_sync_14c1fa2c.plan.md), [integrity hardening](../../.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md), [gaps closeout](../../.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md), [sync desync fix](../../.cursor/plans/archive/booking_sync_desync_fix_4709fb07.plan.md) (`completed`).

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
| Revive guard (cancelled native / terminal canonical) | `pgPatientBookings.test.ts`, `shouldSkipNativeReviveUpdate.test.ts` |
| **Desync fix:** cancel mirror URL null + stale sweep | `pgPatientBookings.test.ts`, `bookingMirrorDesyncMatrix.test.ts` |
| **Desync fix:** staff cancel closes `patient_bookings` | `staffManualCancelAfterCanonical.test.ts`, `bookingMirrorDesyncMatrix.test.ts` |
| **Desync fix:** inbound cancel / projection DELETE | `upsertPatientBookingFromRubitime.test.ts`, `events.test.ts`, `bookingMirrorDesyncMatrix.test.ts` |
| **Desync fix:** duplicate rows same `rubitime_id` (E) | `closeActivePatientBookingsByRubitimeId.test.ts`, `pgPatientBookings.test.ts` |
| **Desync fix:** legacy `branches.id` in projection | `resolveLegacyBranchIdForProjection.test.ts`, `projectCanonicalAppointment.test.ts` |
| **Desync fix:** GCal 410 + Rubitime idempotent delete/update | `client.nock.test.ts`, `sync.test.ts`, `connector.test.ts`, `client.test.ts`, `recordM2mRoute.test.ts` |
| **Desync fix:** patient UI hide dead manage | `CabinetActiveBookings.test.tsx`, `BookingUpcomingSection.test.tsx` |
| Lifecycle `state_conflict` + idempotent cancel | `pgBookingAppointmentLifecycle.test.ts` |
| Dedup payload hash + pipeline retry | `rubitimePayloadHash.test.ts`, `eventGateway/index.test.ts` |
| M2M empty patch / string status / branch TZ | `normalizeUpdateRecordPatch.test.ts`, `recordM2mRoute.test.ts` |
| Online concurrent slot (no extra DDL) | `service.test.ts` (`concurrent same slot`) |

**Закрыто (gaps closeout 2026-06-06):** legacy `POST /api/doctor/appointments/rubitime/cancel` → M2M `update-record` **status 4** (не `remove-record`); см. [`INTEGRATOR_CONTRACT.md`](../../apps/webapp/INTEGRATOR_CONTRACT.md).

**Закрыто (sync desync fix 2026-06-06):** cancel mirror (URL null, staff→patient_bookings, stale sweep, scenario E), legacy branch FK, GCal/Rubitime idempotent cleanup; план [`booking_sync_desync_fix_4709fb07`](../../.cursor/plans/archive/booking_sync_desync_fix_4709fb07.plan.md) `completed`.

## Верификация gaps closeout (2026-06-06)

| Проверка | Результат |
|----------|-----------|
| Targeted closeout vitest (10 files) | 86 tests — passed (agent-сессия closeout) |
| `pnpm install --frozen-lockfile && pnpm run ci` | **passed** (2026-06-06; полный барьер — в **отдельной agent-сессии** реализации closeout, не повторяли в docs-сессии) |

План: [`.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md`](../../.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md) (`status: completed`). Журнал: [`LOG.md`](LOG.md) §2026-06-06 gaps closeout.

## Верификация sync desync fix (2026-06-06)

| Проверка | Результат |
|----------|-----------|
| Targeted desync vitest (webapp) | 9 files, 176 tests — passed |
| `@bersoncare/booking-rubitime-sync` | 5 files, 31 tests — passed |
| Targeted desync vitest (integrator) | 4 files, 50 tests — passed |
| Desync matrix P2 | 7/7 in `bookingMirrorDesyncMatrix.test.ts` |
| `pnpm install --frozen-lockfile && pnpm run ci` | **passed** (2026-06-06) |

План: [`.cursor/plans/archive/booking_sync_desync_fix_4709fb07.plan.md`](../../.cursor/plans/archive/booking_sync_desync_fix_4709fb07.plan.md) (`status: completed`). Журнал: [`LOG.md`](LOG.md) §2026-06-06 desync fix. Post-deploy ops gate — § ниже (не блокирует закрытие плана).

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/patient-booking/bookingMirrorDesyncMatrix.test.ts \
  src/modules/patient-booking/service.test.ts \
  src/modules/patient-booking/projectCanonicalAppointment.test.ts \
  src/modules/patient-booking/resolveLegacyBranchIdForProjection.test.ts \
  src/infra/repos/pgPatientBookings.test.ts \
  src/app-layer/booking/staffManualCancelAfterCanonical.test.ts \
  src/modules/integrator/events.test.ts \
  src/app/app/patient/cabinet/CabinetActiveBookings.test.tsx \
  src/app/app/patient/booking/new/BookingUpcomingSection.test.tsx \
  --project fast

pnpm --dir packages/booking-rubitime-sync exec vitest run src/

pnpm --dir apps/integrator exec vitest run \
  src/integrations/google-calendar/client.nock.test.ts \
  src/integrations/google-calendar/sync.test.ts \
  src/integrations/rubitime/client.test.ts \
  src/integrations/rubitime/connector.test.ts \
  src/integrations/rubitime/recordM2mRoute.test.ts
```

## Smoke-матрица (10 + post-deploy ops)

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
| 9 | Rebook после cancel (prod #4) | тот же слот не `slot_overlap`; `patient_bookings` cancelled + URL null; staff cancel закрывает mirror | `bookingMirrorDesyncMatrix.test.ts`, `pgPatientBookings.test.ts`, `upsertPatientBookingFromRubitime.test.ts`, `closeActivePatientBookingsByRubitimeId.test.ts`, `service.test.ts`, `staffManualCancelAfterCanonical.test.ts`, `events.test.ts`, integrator GCal/Rubitime idempotent tests |
| 10 | Staff delete после cancel | local purge (`deleted_at` + DELETE `patient_bookings`); только `booking.deleted`; `409 not_cancelled` на active; idempotent 200 (tombstone) | `staffPurgeCancelledAppointment.test.ts`, doctor/admin delete `route.test.ts`, `doctorAppointmentPurgeFilter.test.ts`, `pgBookingCalendar.test.ts`, `pgDoctorCanonicalAppointments.test.ts`, `bookingMirrorDesyncMatrix.test.ts` #10, `appointmentStatusLabels.test.ts`, `events.test.ts` `skipped_purged`, `pgDoctorAnalyticsMetricAccounts.test.ts` |

\* при `booking_doctor_appointments_read_source=canonical` календарь читает `be_appointments`; purged projection скрыта из calendar/list.

Post-deploy smoke (ручной): CR-A, CR-A-fail, CN-P, RS-P, partial, **rebook после cancel (#9)** — [`LOG.md`](LOG.md) §2026-06-06 desync fix.

### Post-deploy ops gate — staff delete (SD-1..SD-6)

После деплоя staff delete (см. [`LOG.md`](LOG.md) §2026-06-07):

| ID | Шаг | Ожидание |
|----|-----|----------|
| SD-1 | Календарь: активная запись | нет кнопки «Удалить» |
| SD-2 | Отменить (free) | одно уведомление пациенту; статус cancelled в panel |
| SD-3 | Удалить | запись пропала из календаря и списка; **второго** уведомления нет |
| SD-4 | Кабинет пациента → прошлые записи | записи нет |
| SD-5 | Повторный delete (API) | 200 idempotent |
| SD-6 | Rubitime journal | `remove-record`, если bridge on |

### Post-deploy ops gate — sync desync fix (2026-06-06)

После деплоя коммита с desync fix (см. [`LOG.md`](LOG.md) §2026-06-06):

1. **Ops backfill** (review `SELECT` counts перед `UPDATE`):
   - `cancelled_at IS NOT NULL AND status <> 'cancelled'` → `cancelled` + `rubitime_manage_url = NULL`
   - `status = 'cancelling' AND updated_at < now() - interval '15 minutes'` → `cancelled` + URL null
2. **Smoke #4:** rebook на тот же слот после patient cancel — без `slot_overlap`.
3. **Smoke #5:** `journalctl` integrator — нет ERROR на GCal DELETE **410** / Rubitime gone на remove webhook.
4. **Smoke #6:** в patient cabinet нет «Управлять» на dead Rubitime rows.
5. **FK:** patient cancel projection — нет `appointment_records_branch_id_fkey` в webapp logs.

SQL preamble: [`SERVER CONVENTIONS.md`](../ARCHITECTURE/SERVER%20CONVENTIONS.md) (`webapp.prod`).

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
- [x] Gaps closeout CI barrier (2026-06-06): targeted 86 tests + `pnpm run ci` green — см. § «Верификация gaps closeout» (барьер в agent-сессии closeout)
- [x] Sync desync fix code DoD (2026-06-06): cancel mirror, overlap sweep, FK branch, idempotent delete, matrix 7/7, `pnpm run ci` green — § «Верификация sync desync fix», [`LOG.md`](LOG.md) §2026-06-06 desync fix, plan [`booking_sync_desync_fix_4709fb07`](../../.cursor/plans/archive/booking_sync_desync_fix_4709fb07.plan.md) `completed`
- [ ] Post-deploy desync fix ops gate: backfill + prod smoke #4–6 + FK log check — § «Post-deploy ops gate — sync desync fix» (todo плана `post-deploy-ops-gate`: `cancelled`)
