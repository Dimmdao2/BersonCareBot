# Текущая структура БД

Документ описывает объекты PostgreSQL по **схемам** и по приложениям в репозитории.

**Целевой production (2026-04):** webapp и integrator подключаются к **одной** базе одной и той же **строкой `DATABASE_URL`** и **одной ролью** PostgreSQL; разделение данных — схемы **`integrator`** и **`public`**, не отдельные базы и не два URL в runtime — см. [`DATABASE_UNIFIED_POSTGRES.md`](./DATABASE_UNIFIED_POSTGRES.md), [`SERVER CONVENTIONS.md`](./SERVER%20CONVENTIONS.md).

Ниже разделы названы по **схемам** (как в SQL). Дампы в `DB_DUMPS/` могли сниматься с отдельных dev-баз; логическая карта та же.

Источник:

- `docs/ARCHITECTURE/DB_DUMPS/integrator_bersoncarebot_dev_schema.sql`
- `docs/ARCHITECTURE/DB_DUMPS/webapp_bcb_webapp_dev_schema.sql`
- текущие migrations и db-порты в репозитории

## Scope

Документ покрывает:

1. схему **`integrator`** (код и миграции в `apps/integrator`);
2. схему **`public`** (webapp-канон; миграции в `apps/webapp/migrations`).

---

## 1. Схема `integrator`

### 1.1 User / identity / contacts

Таблицы:

- `users` (в т.ч. `merged_into_user_id` → `users.id`, nullable: каноническая строка = NULL; alias после merge указывает на канонический `id`; CHECK запрещает self-reference)
- `identities`
- `contacts`

Связи:

- `identities.user_id -> users.id`
- `contacts.user_id -> users.id`
- `users.merged_into_user_id -> users.id` (опционально)

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
- `schema_migrations` — журнал SQL-миграций integrator (`version`, например `core:…`, `telegram:…`)

---

## 2. Схема `public` (webapp)

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
- `webapp_schema_migrations` — учёт SQL-миграций webapp (`apps/webapp/migrations/*.sql`); отдельное имя от `integrator.schema_migrations` (`version`) и от исторической `public.schema_migrations (filename)`, см. `apps/webapp/scripts/run-migrations.mjs`

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

### 2.8 CMS media / библиотека

Таблицы (миграции `028`, `044`, `060`, `065`, **`067_media_folders_and_multipart.sql`** и др.):

- `media_files` — объекты библиотеки (в т.ч. `s3_key`, `status`, `uploaded_by`, `folder_id` → `media_folders`, лимит `size_bytes` до 3 GiB).
- `media_folders` — иерархия папок (`parent_id`, нормализованное имя, триггеры против циклов и ограничение глубины).
- `media_upload_sessions` — multipart-загрузки в S3 (`upload_id`, `expires_at`, статусы `initiated` … `completed`/`expired`/`aborted`/`failed`).

Связи: `media_files.folder_id` → `media_folders.id` (ON DELETE RESTRICT). Канонический URL в приложении: `/api/media/{uuid}`.

---

## 3. Наблюдаемые особенности схемы

### 3.1 `integrator`

- `users` / `identities` / `contacts` уже существуют как отдельный слой.
- В схеме одновременно присутствуют `telegram_state` и `telegram_users`.
- Booking хранится в `rubitime_records`.
- В `integrator` уже есть отдельные домены для messaging, reminders, mailings и runtime tables.

### 3.2 Схема `public`

- Канон платформы: `platform_users`, `user_channel_bindings`, `user_notification_topics`.
- Дневники: symptom, LFK и связанные таблицы.
- Auth / audit / runtime в `public` (в т.ч. idempotency для webapp).
- Таблицы 2.4–2.7 — проекция данных из integrator; первичный перенос через backfill. **Актуально (2026-04):** одна БД, схемы `integrator` + `public`; целевой путь — **прямой SQL** из integrator в `public`, HTTP projection и worker — **legacy / fallback** (см. [`DATABASE_UNIFIED_POSTGRES.md`](./DATABASE_UNIFIED_POSTGRES.md), [Stage 13 ownership map](./STAGE13_OWNERSHIP_MAP.md)).

### 3.3 Общие имена таблиц

В одной БД (unified) таблица `idempotency_keys` может существовать в обеих схемах:

- `integrator.idempotency_keys`
- `public.idempotency_keys` (исторически «webapp»)

---

## 4. Dumps

- [Дамп схемы integrator](./DB_DUMPS/integrator_bersoncarebot_dev_schema.sql) (исторически снят с отдельной dev-базы)
- [Дамп схемы public](./DB_DUMPS/webapp_bcb_webapp_dev_schema.sql) (webapp; unified — обе схемы в одной БД)

Актуальный список таблиц в коде: миграции `apps/integrator` (integrator), `apps/webapp/migrations/` (webapp). Дампы в DB_DUMPS могут отставать от последних миграций; для полной схемы после миграций смотреть `\dt` в psql или вывод миграций.

## 5. Перенос данных (backfill / reconcile)

- **Окружение:** при **unified** Postgres один и тот же `DATABASE_URL` (и та же роль БД) для api и webapp; скрипты читают схему **`integrator`** как источник и **`public`** как цель (в `cutover.*` второй URL часто **дублирует** первый).
- **Legacy:** при двух отдельных базах — разные URL в `cutover.prod`; порядок скриптов тот же.
- **Скрипты backfill и reconcile:** см. [DATA_MIGRATION_CHECKLIST.md](../../deploy/DATA_MIGRATION_CHECKLIST.md).
- **Владелец данных и статусы таблиц:** [STAGE13_OWNERSHIP_MAP.md](./STAGE13_OWNERSHIP_MAP.md).

---

## Связанные документы

- [DB ownership contract](../../apps/integrator/src/infra/db/schema.md)
- [Telegram DB schema](../../apps/integrator/src/integrations/telegram/db/schema.md)
- [Stage 13 ownership map](./STAGE13_OWNERSHIP_MAP.md)
- [Data migration checklist](../../deploy/DATA_MIGRATION_CHECKLIST.md)
