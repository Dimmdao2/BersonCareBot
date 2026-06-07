# Booking mirror integrity — контракт поведения (2026-06)

План (архив, `status: completed`): [`.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md`](../../.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md). Приёмка: [`ACCEPTANCE_MIRROR_SYNC.md`](ACCEPTANCE_MIRROR_SYNC.md). Журнал: [`LOG.md`](LOG.md) §2026-06-05.

## Источник истины

- **Канон:** `be_appointments` — primary source of truth для lifecycle и политик.
- **Legacy UI:** `appointment_records`, `patient_bookings` — проекции; не обязаны быть транзакционно едины с каноном, но не должны противоречить отменённому/перенесённому канону.

## Outbound (кабинет → Rubitime)

| Сценарий | Порядок | При ошибке Rubitime после canonical |
|----------|--------|-----------------------------------|
| Staff reschedule | Rubitime → канон | Rollback Rubitime; канон не меняется |
| Staff/admin cancel | канон → Rubitime | API `ok` + флаги partial failure; канон уже отменён |
| Patient cancel/reschedule | канон → best-effort Rubitime | API `ok` + `rubitimeMirrorFailed` при сбое mirror |
| Patient create (rubitime-first) | Rubitime → канон (adopt projection; **без** native `createAppointment` fallback) | Rollback `deleteRecord` при ошибке канона / `rubitime_projection_not_ready` |
| Admin manual create | как doctor при mapping | Rubitime create+mapping или skip |

## Bridge flag

- `booking_rubitime_bridge_enabled` (admin): staff outbound mirror только если bridge включён **и** есть `rubitimeId`/mapping.
- Исключение: patient create при `booking_slots_read_source=rubitime` (Rubitime-first create) — отдельная политика.

## Partial outcomes (обязательно в API)

После успешного canonical commit при сбое внешнего шага:

- HTTP **не** маскировать операцию как полный провал (не 502 «операция не выполнена»).
- Возвращать явные флаги (по поверхности):
  - **Patient cancel:** `rubitimeMirrorFailed`, `notificationOutcomeFailed`, `paymentOutcomeFailed`, `membershipOutcomeFailed`, `productOutcomeFailed`
  - **Patient reschedule:** `rubitimeMirrorFailed`, `notificationOutcomeFailed`, `paymentOutcomeFailed`
  - **Staff/admin manual-cancel:** `rubitimeMirrorFailed`, `notificationOutcomeFailed`, `paymentOutcomeFailed`, `membershipOutcomeFailed` (без `productOutcomeFailed` — product visit outcome только patient cancel)
- Логировать в audit/history.

## Inbound (Rubitime → webapp)

- Dedup fingerprint включает hash payload (не только top-level поля).
- Pipeline failure не блокирует retry на весь TTL idempotency key.
- При `skipped_echo_guard`: **не** обновлять `appointment_records` / `patient_bookings` как обычный inbound (или отдельная ветка `skipped_echo_guard`).
- First insert: advisory lock / upsert по external id.
- Stale mapping: отдельный outcome, не `skipped_echo_guard`.

## Cancel semantics

- Единый путь отмены в **booking-engine** и patient mirror: `update-record` с `status: 4` / `cancelRecord` M2M (не `remove-record` для обычной отмены записи в кабинете).
- **Create rollback (rubitime-first):** при сбое после `create-record` — `deleteRecord` / `remove-record` (hard delete + GCal delete на integrator) и cancel orphan `be_appointments`; это **не** обычная отмена записи.
- **Legacy doctor API:** `POST /api/doctor/appointments/rubitime/cancel` — `update-record` с `status: 4` (как `cancelRecord` M2M), не `remove-record`.

## Online double-book (defer)

- Отдельная DDL-миграция под online `specialist_id IS NULL` **не** входила в scope hardening.
- Guard: `booking-scheduling.assertSlotAvailable` + PostgreSQL exclusion на каноне; регрессия — `service.test.ts` (`concurrent same slot`).

## M2M timezone

- `update-record` использует branch timezone при наличии branch context (как create), иначе app display timezone.

## Staff delete (отменённая запись)

Продуктовый порядок: **сначала** `manual-cancel` (одно уведомление) → **потом** `POST …/appointments/[id]/delete` (тихо).

| Правило | Деталь |
|---------|--------|
| Whitelist | `cancelled_by_patient`, `cancelled_by_specialist`, `late_cancellation` — **не** `no_show` / active / completed |
| Канон `be_appointments` | **Не** hard-delete; audit в `be_appointment_cancellations` сохраняется |
| Local purge (TX) | `appointment_records.deleted_at`; **DELETE** `patient_bookings` (upcoming + history) |
| Rubitime | Только после local purge; `remove-record` / `deleteRecord` (не `cancelRecord`) при bridge on |
| Events | Только **`booking.deleted`** (`idempotencyKey: booking.deleted:staff:{appointmentId}`); **запрещён** `booking.cancelled` на delete path |
| Partial | `ok: true` + optional **`rubitimeMirrorFailed`** — не 502 после локального purge |
| Inbound | `appointment.record.upserted` на purged row → `skipped_purged` (без revive) |
| Read surfaces | Purged скрыты из canonical calendar/list/stats/KPI (`infra/repos/doctorAppointmentPurgeFilter`) |
