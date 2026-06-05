# Booking mirror integrity — контракт поведения (2026-06)

## Источник истины

- **Канон:** `be_appointments` — primary source of truth для lifecycle и политик.
- **Legacy UI:** `appointment_records`, `patient_bookings` — проекции; не обязаны быть транзакционно едины с каноном, но не должны противоречить отменённому/перенесённому канону.

## Outbound (кабинет → Rubitime)

| Сценарий | Порядок | При ошибке Rubitime после canonical |
|----------|--------|-----------------------------------|
| Staff reschedule | Rubitime → канон | Rollback Rubitime; канон не меняется |
| Staff/admin cancel | канон → Rubitime | API `ok` + флаги partial failure; канон уже отменён |
| Patient cancel/reschedule | канон → best-effort Rubitime | API `ok` + `rubitimeMirrorFailed` при сбое mirror |
| Patient create (rubitime-first) | Rubitime → канон | Rollback Rubitime при ошибке канона |
| Admin manual create | как doctor при mapping | Rubitime create+mapping или skip |

## Bridge flag

- `booking_rubitime_bridge_enabled` (admin): staff outbound mirror только если bridge включён **и** есть `rubitimeId`/mapping.
- Исключение: patient create при `booking_slots_read_source=rubitime` (Rubitime-first create) — отдельная политика.

## Partial outcomes (обязательно в API)

После успешного canonical commit при сбое внешнего шага:

- HTTP **не** маскировать операцию как полный провал (не 502 «операция не выполнена»).
- Возвращать явные флаги: `rubitimeMirrorFailed`, `paymentOutcomeFailed`, `membershipOutcomeFailed`, `productOutcomeFailed` и т.д.
- Логировать в audit/history.

## Inbound (Rubitime → webapp)

- Dedup fingerprint включает hash payload (не только top-level поля).
- Pipeline failure не блокирует retry на весь TTL idempotency key.
- При `skipped_echo_guard`: **не** обновлять `appointment_records` / `patient_bookings` как обычный inbound (или отдельная ветка `skipped_echo_guard`).
- First insert: advisory lock / upsert по external id.
- Stale mapping: отдельный outcome, не `skipped_echo_guard`.

## Cancel semantics

- Единый путь отмены: `update-record` с `status: 4` (не `remove-record` для обычной отмены записи в кабинете).

## M2M timezone

- `update-record` использует branch timezone при наличии branch context (как create), иначе app display timezone.
