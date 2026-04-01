# Rubitime DB schema

Интеграция Rubitime владеет только rubitime-специфичным storage.

## Таблицы интеграции

### Входящие события и записи (webhook-сторона)

- `rubitime_records` — проекция записей из Rubitime.
- `rubitime_events` — входящие события Rubitime.
- `rubitime_create_retry_jobs` — очередь delivery/retry-задач с полным `message.deliver` payload.
- `booking_calendar_map` — связка rubitime_record_id с gcal_event_id для Google Calendar.

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
    → createRubitimeRecord({ branch_id, cooperator_id, service_id, record, name, phone, email })
    → return recordId
```
