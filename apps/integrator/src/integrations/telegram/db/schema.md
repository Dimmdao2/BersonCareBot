# Telegram DB schema

Интеграция Telegram владеет только telegram-специфичным storage.

Текущие таблицы интеграции:

- `telegram_state` — Telegram-only runtime state (state, update dedup, notification flags, profile snapshot, is_active).
- `telegram_users` — legacy/deprecated storage, не канонический источник identity и не используется активным runtime.

Legacy mailing/subscription tables were retired by Track D8 after the exact callgraph proved there was no live producer.

Связь с канонической user-моделью:

- каноническая identity: `identities(resource, external_id, user_id)`.
- канонический контактный слой: `contacts(user_id, type, value_normalized, ...)`.
- Telegram runtime state хранится отдельно в `telegram_state`.
