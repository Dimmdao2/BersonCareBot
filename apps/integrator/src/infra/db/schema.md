# DB ownership contract

## Core tables

Core-слой хранит универсальную модель пользователя и контактов, не привязанную к конкретной интеграции.

- `users`
  - `id` PK
  - `created_at`, `updated_at`
  - `merged_into_user_id` optional FK → `users.id` (NULL = canonical user; non-NULL = alias merged into that canonical id)
  - check: `merged_into_user_id IS NULL OR merged_into_user_id <> id`
  - partial index on `merged_into_user_id` where non-null (for resolving aliases)
- `identities`
  - `id` PK
  - `user_id` FK -> `users.id`
  - `resource` (telegram/max/email/...)
  - `external_id`
  - `created_at`, `updated_at`
  - уникальность: `UNIQUE(resource, external_id)`
  - это единственная каноническая cross-channel таблица identity
- `public.platform_users.phone_normalized` — канонический подтверждённый телефон
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
Таблица `telegram_users` сохраняется только как legacy/deprecated storage, активный runtime в нее не пишет и не использует ее как канонический источник identity.

Mailing/subscription tables were retired by Track D8 after the producer/consumer census proved the domain had no live producer.
Активное разрешение пользователя и телефона идёт через `public.platform_users` / `public.user_channel_bindings`; legacy integrator identity/contact relations существуют только в migration history.

## Invariants

- Добавление новой интеграции с таблицами не требует правок `src/infra/db/migrate.ts`.
- Линковка user ↔ channel выполняется через `identities`.
- Контакты множественные, `is_primary` необязателен.
- Добавление Telegram-state полей не меняет каноническую identity-модель в `public`.
