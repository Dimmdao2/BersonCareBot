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
  - это единственная каноническая cross-channel таблица identity
- `contacts`
  - `id` PK
  - `user_id` FK -> `users.id`
  - `type` (phone/email/...)
  - `value_normalized`
  - `label` optional
  - `is_primary` optional
  - `created_at`, `updated_at`
  - уникальность: `UNIQUE(type, value_normalized)`
  - это канонический shared слой контактов (phone/email/...) 

## Integration tables

Любые таблицы внутреннего устройства интеграции хранятся только в:

- `src/integrations/<name>/db/migrations/*.sql`

Примеры интеграционных таблиц: сырые вебхуки, статусы внешних сущностей, integration-specific state.

Для Telegram runtime-state используется integration-таблица `telegram_state`.
Таблица `telegram_users` сохраняется только как transitional/deprecated storage и не является каноническим источником identity.

## Invariants

- Добавление новой интеграции с таблицами не требует правок `src/infra/db/migrate.ts`.
- Линковка user ↔ channel выполняется через `identities`.
- Контакты множественные, `is_primary` необязателен.
- Добавление Telegram-state полей не меняет каноническую identity-модель: `identities` + `contacts`.
