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

- `rubitime_records` (см. также поток и журнал: `RUBITIME_BOOKING_PIPELINE.md`)

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
- `projection_outbox` (очередь событий для проекции в webapp; мониторинг через projection health)
- `schema_migrations`

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
- `admin_audit_log` — персистентный журнал операций админки (опасные действия, смена настроек, конфликты auto-merge и т.д.); UI «Лог операций» в `/app/settings`, API `GET /api/admin/audit-log`. Миграция `066_admin_audit_log.sql`. Подробности и политика записи: `docs/REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md`, план strict purge §0.
- `idempotency_keys`
- `schema_migrations`

### 2.4 Support / communication (проекция из integrator)

Таблицы (миграции 009, backfill-communication-history):

- `support_conversations`
- `support_conversation_messages`
- `support_questions`
- `support_question_messages`
- `support_delivery_events`

Источник в integrator: `conversations`, `conversation_messages`, `user_questions`, `question_messages`, `delivery_attempt_logs` (по контракту проекции).

### 2.5 Reminders / content access (проекция из integrator)

Таблицы (миграции 010, backfill-reminders-domain):

- `reminder_rules`
- `reminder_occurrence_history`
- `reminder_delivery_events`
- `content_access_grants_webapp`

Источник в integrator: `user_reminder_rules`, `user_reminder_occurrences`, `user_reminder_delivery_logs`, `content_access_grants`.

### 2.6 Appointments (проекция из integrator)

Таблицы (миграции 011, backfill-appointments-domain):

- `appointment_records`

Источник в integrator: `rubitime_records`. Связь по `integrator_record_id`.

### 2.7 Subscription / mailing (проекция из integrator)

Таблицы (миграции 012, backfill-subscription-mailing-domain):

- `mailing_topics_webapp`
- `user_subscriptions_webapp`
- `mailing_logs_webapp`

Источник в integrator: `mailing_topics`, `user_subscriptions`, `mailing_logs`.

---

## 3. Наблюдаемые особенности схемы

### 3.1 `integrator`

- `users` / `identities` / `contacts` уже существуют как отдельный слой.
- В схеме одновременно присутствуют `telegram_state` и `telegram_users`.
- Booking хранится в `rubitime_records`.
- В `integrator` уже есть отдельные домены для messaging, reminders, mailings и runtime tables.

### 3.2 `webapp`

- `webapp` уже имеет собственную user model (`platform_users`, `user_channel_bindings`, `user_notification_topics`).
- `webapp` уже имеет собственные diary tables (symptom, LFK).
- `webapp` уже имеет собственные auth/audit/runtime tables.
- Таблицы 2.4–2.7 — проекция данных из integrator; первичный перенос через backfill, дальнейшая синхронизация через projection worker (см. [Stage 13 ownership map](./STAGE13_OWNERSHIP_MAP.md)).

### 3.3 Общие имена таблиц

В обеих БД есть таблица `idempotency_keys`, но это разные схемы:

- `integrator.idempotency_keys`
- `webapp.idempotency_keys`

---

## 4. Dumps

- [Integrator schema dump](./DB_DUMPS/integrator_bersoncarebot_dev_schema.sql)
- [Webapp schema dump](./DB_DUMPS/webapp_bcb_webapp_dev_schema.sql)

Актуальный список таблиц в коде: миграции `apps/integrator` (integrator), `apps/webapp/migrations/` (webapp). Дампы в DB_DUMPS могут отставать от последних миграций; для полной схемы после миграций смотреть `\dt` в psql или вывод миграций.

## 5. Перенос данных (backfill / reconcile)

- **Источник:** БД integrator (`DATABASE_URL` из api.prod).
- **Цель:** БД webapp (`DATABASE_URL` из webapp.prod).
- **Скрипты backfill и reconcile:** см. [DATA_MIGRATION_CHECKLIST.md](../../deploy/DATA_MIGRATION_CHECKLIST.md).
- **Владелец данных и статусы таблиц:** [STAGE13_OWNERSHIP_MAP.md](./STAGE13_OWNERSHIP_MAP.md).

---

## Связанные документы

- [DB ownership contract](../../apps/integrator/src/infra/db/schema.md)
- [Telegram DB schema](../../apps/integrator/src/integrations/telegram/db/schema.md)
- [Stage 13 ownership map](./STAGE13_OWNERSHIP_MAP.md)
- [Data migration checklist](../../deploy/DATA_MIGRATION_CHECKLIST.md)
