# Telegram DB schema

Интеграция Telegram владеет только telegram-специфичным storage.

Текущие таблицы интеграции:

- `telegram_users` — таблица состояния Telegram-канала (state, update dedup, notification flags, phone).
- `subscriptions` — справочник подписок.
- `user_subscriptions` — связи пользователей и подписок.
- `mailing_topics` — темы рассылок.
- `mailings` — задания рассылок.
- `mailing_logs` — результаты отправок рассылок.

Связь с канонической user-моделью:

- каноническая модель user/identity/contact описана в core schema contract.
