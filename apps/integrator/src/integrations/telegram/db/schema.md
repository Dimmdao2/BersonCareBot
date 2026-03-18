# Telegram DB schema

Интеграция Telegram владеет только telegram-специфичным storage.

Текущие таблицы интеграции:

- `telegram_state` — Telegram-only runtime state (state, update dedup, notification flags, profile snapshot, is_active).
- `telegram_users` — legacy/deprecated storage, не канонический источник identity и не используется активным runtime.
- `subscriptions` — справочник подписок.
- `user_subscriptions` — связи пользователей и подписок.
- `mailing_topics` — темы рассылок.
- `mailings` — задания рассылок.
- `mailing_logs` — результаты отправок рассылок.

`telegram_users` больше не является FK-владельцем для `user_subscriptions` и `mailing_logs` и используется только как legacy storage.

Связь с канонической user-моделью:

- каноническая identity: `identities(resource, external_id, user_id)`.
- канонический контактный слой: `contacts(user_id, type, value_normalized, ...)`.
- Telegram runtime state хранится отдельно в `telegram_state`.
- `user_subscriptions.user_id` и `mailing_logs.user_id` указывают на `users.id`.
