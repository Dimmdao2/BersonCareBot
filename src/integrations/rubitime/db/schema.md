# Rubitime DB schema

Интеграция Rubitime владеет только rubitime-специфичным storage.

Текущие таблицы интеграции:

- `rubitime_records` — проекция записей Rubitime.
- `rubitime_events` — входящие события Rubitime.
- `rubitime_create_retry_jobs` — отложенные retry-задачи.

Связь с канонической user-моделью:

- каноническая модель user/identity/contact описана в core schema contract.
