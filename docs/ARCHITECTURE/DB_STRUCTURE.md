# Текущая структура БД

Документ описывает фактическую текущую структуру БД по локальному schema dump.

Источник:

- `docs/ARCHITECTURE/DB_DUMPS/integrator_bersoncarebot_dev_schema.sql`
- `docs/ARCHITECTURE/DB_DUMPS/webapp_bcb_webapp_dev_schema.sql`
- текущие migrations и db-порты в репозитории

## Scope

Документ покрывает:

1. текущую структуру БД `apps/integrator`;
2. текущую структуру БД `apps/webapp`.

---

## 1. БД `integrator`

### 1.1 User / identity / contacts

Таблицы:

- `users`
- `identities`
- `contacts`

Связи:

- `identities.user_id -> users.id`
- `contacts.user_id -> users.id`

### 1.2 Telegram

Таблицы:

- `telegram_state`
- `telegram_users`

### 1.3 Booking / RubiTime

Таблицы:

- `rubitime_records`

### 1.4 Messaging / support

Таблицы:

- `conversations`
- `conversation_messages`
- `user_questions`
- `question_messages`
- `message_drafts`

### 1.5 Reminders / content access

Таблицы:

- `user_reminder_rules`
- `user_reminder_occurrences`
- `user_reminder_delivery_logs`
- `content_access_grants`

### 1.6 Mailings / subscriptions

Таблицы:

- `mailing_topics`
- `mailings`
- `mailing_logs`
- `user_subscriptions`

### 1.7 Runtime / technical

Таблицы:

- `idempotency_keys`
- `delivery_attempt_logs`

---

## 2. БД `webapp`

### 2.1 Users / bindings / preferences

Таблицы:

- `platform_users`
- `user_channel_bindings`
- `user_channel_preferences`
- `user_notification_topics`

### 2.2 Diaries

Таблицы:

- `symptom_trackings`
- `symptom_entries`
- `lfk_complexes`
- `lfk_sessions`

### 2.3 Auth / audit / logs

Таблицы:

- `phone_challenges`
- `message_log`
- `broadcast_audit`
- `idempotency_keys`
- `schema_migrations`

---

## 3. Наблюдаемые особенности схемы

### 3.1 `integrator`

- `users` / `identities` / `contacts` уже существуют как отдельный слой.
- В схеме одновременно присутствуют `telegram_state` и `telegram_users`.
- Booking хранится в `rubitime_records`.
- В `integrator` уже есть отдельные домены для messaging, reminders, mailings и runtime tables.

### 3.2 `webapp`

- `webapp` уже имеет собственную user model.
- `webapp` уже имеет собственные diary tables.
- `webapp` уже имеет собственные auth/audit/runtime tables.

### 3.3 Общие имена таблиц

В обеих БД есть таблица `idempotency_keys`, но это разные схемы:

- `integrator.idempotency_keys`
- `webapp.idempotency_keys`

---

## 4. Dumps

- [Integrator schema dump](./DB_DUMPS/integrator_bersoncarebot_dev_schema.sql)
- [Webapp schema dump](./DB_DUMPS/webapp_bcb_webapp_dev_schema.sql)

---

## Связанные документы

- [DB ownership contract](../../apps/integrator/src/infra/db/schema.md)
- [Telegram DB schema](../../apps/integrator/src/integrations/telegram/db/schema.md)
