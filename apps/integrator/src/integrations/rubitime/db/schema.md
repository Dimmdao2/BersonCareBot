# Rubitime DB schema

Интеграция Rubitime владеет только rubitime-специфичным storage.

## Таблицы интеграции

### Входящие события и записи (webhook-сторона)

- `rubitime_records` — проекция записей из Rubitime.
- `rubitime_events` — входящие события Rubitime.
- `rubitime_create_retry_jobs` — очередь delivery/retry-задач с полным `message.deliver` payload.
- `booking_calendar_map` — связка rubitime_record_id с gcal_event_id для Google Calendar.

### Исходящий API2 (pacing между запросами)

- `rubitime_api_throttle` — одна строка `id = 1`, поле `last_completed_at`: глобальный интервал **~5500 ms** между *завершением* одного исходящего вызова `https://rubitime.ru/api2/*` и началом следующего (координация `pg_advisory_lock` + обновление времени в БД). Миграция: `20260413_0001_rubitime_api_throttle.sql`. См. `rubitimeApiThrottle.ts`, отчёт `docs/REPORTS/RUBITIME_API2_PACING_AND_PHASE2_BACKLOG.md`.

### Справочники онлайн-записи (booking-сторона)

Заменяют env-переменную `RUBITIME_SCHEDULE_MAPPING`. Данные управляются через admin UI webapp.

- `rubitime_branches` — список филиалов Rubitime (rubitime_branch_id, city_code, title, address).
- `rubitime_services` — список услуг (rubitime_service_id, title, category_code, duration_minutes).
- `rubitime_cooperators` — список специалистов (rubitime_cooperator_id, title).
- `rubitime_booking_profiles` — профили записи: связывают (booking_type, category_code, city_code)
  с конкретным branch_id + service_id + cooperator_id.
  Уникальный индекс по `(booking_type, category_code, COALESCE(city_code, ''))`.

## Связь с канонической user-моделью

Каноническая модель user/identity/contact описана в core schema contract.

## Booking flow

```
webapp GET /api/booking/slots
  → integrator POST /api/bersoncare/rubitime/slots
    → resolveScheduleParams() → DB: rubitime_booking_profiles JOIN branches/services/cooperators
    → fetchRubitimeSchedule() → Rubitime API
    → normalizeRubitimeSchedule()
    → return slots[]

webapp POST /api/booking/create
  → integrator POST /api/bersoncare/rubitime/create-record
    → resolveScheduleParams() → DB: rubitime_booking_profiles JOIN branches/services/cooperators
    → createRubitimeRecord(...) — через postRubitimeApi2 + withRubitimeApiThrottle (интервал к api2)
    → runPostCreateProjection(recordId): get-record (при ошибке — пауза 5200 ms + повтор) → … → booking.upsert
    → HTTP 200 webapp (пока шаги выше не завершены, запрос webapp к integrator обычно висит — лоадер в UI)
```
