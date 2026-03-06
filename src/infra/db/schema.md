# DB ownership contract

## Core tables

Core-слой хранит универсальную модель пользователя и контактов, не привязанную к конкретной интеграции.

- `users`
  - `id` PK
  - `created_at`, `updated_at`
- `identities`
  - `id` PK
  - `user_id` FK -> `users.id`
  - `resource` (telegram/rubitime/max/email/...)
  - `external_id`
  - `created_at`, `updated_at`
  - уникальность: `UNIQUE(resource, external_id)`
- `contacts`
  - `id` PK
  - `user_id` FK -> `users.id`
  - `type` (phone/email/...)
  - `value_normalized`
  - `label` optional
  - `is_primary` optional
  - `created_at`, `updated_at`
  - уникальность: `UNIQUE(type, value_normalized)`

## Integration tables

Любые таблицы внутреннего устройства интеграции хранятся только в:

- `src/integrations/<name>/db/migrations/*.sql`

Примеры интеграционных таблиц: сырые вебхуки, статусы внешних сущностей, integration-specific state.

## Invariants

- Добавление новой интеграции с таблицами не требует правок `src/infra/db/migrate.ts`.
- Линковка user ↔ channel выполняется через `identities`.
- Контакты множественные, `is_primary` необязателен.
