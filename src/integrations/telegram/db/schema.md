# Telegram DB schema

Интеграция Telegram владеет только telegram-специфичным storage.

Текущие таблицы интеграции:

- `telegram_state` — Telegram-only runtime state (state, update dedup, notification flags, profile snapshot, is_active).
- `telegram_users` — deprecated/transitional таблица для совместимости, не канонический источник identity.
- `subscriptions` — справочник подписок.
- `user_subscriptions` — связи пользователей и подписок.
- `mailing_topics` — темы рассылок.
- `mailings` — задания рассылок.
- `mailing_logs` — результаты отправок рассылок.

Связь с канонической user-моделью:

- каноническая identity: `identities(resource, external_id, user_id)`.
- канонический контактный слой: `contacts(user_id, type, value_normalized, ...)`.
- Telegram runtime state хранится отдельно в `telegram_state`.
