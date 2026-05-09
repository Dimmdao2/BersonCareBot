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
2. схему **`public`** (webapp-канон; legacy SQL-миграции в `apps/webapp/migrations`, новые таблицы инициативы программ лечения — в `apps/webapp/db/drizzle-migrations` и `apps/webapp/db/schema`).

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
- `webapp_schema_migrations` — учёт **legacy** SQL-миграций webapp (`apps/webapp/migrations/*.sql`). Записи появляются только при ручном прогоне **`pnpm --dir apps/webapp run migrate:legacy`** (`apps/webapp/scripts/run-migrations.mjs`). Это **не** шаг регулярного production deploy: `deploy/host/deploy-prod.sh` и `deploy/host/deploy-webapp-prod.sh` вызывают только Drizzle (`pnpm migrate` / `pnpm --dir apps/webapp run migrate`) и post-migrate guardrail. Раннер legacy используют для bootstrap пустой БД, восстановления после сбоя или применения SQL вне Drizzle-журнала (**emergency / historical**). Отдельное имя от `integrator.schema_migrations` (`version`) и от исторической `public.schema_migrations (filename)`. Канонический прогон схемы webapp в нормальной разработке — Drizzle (`pnpm --dir apps/webapp run migrate`).

### 2.4 Support / communication (проекция из integrator)

Таблицы (миграции 009, backfill-communication-history):

- `support_conversations`
- `support_conversation_messages`
- `support_questions`
- `support_question_messages`
- `support_delivery_events`

Источник в integrator: `conversations`, `conversation_messages`, `user_questions`, `question_messages`, `delivery_attempt_logs` (по контракту проекции).

### 2.5 Reminders / content access (проекция из integrator)

Таблицы (миграции 010, backfill-reminders-domain; webapp **`084_reminder_rehab_slots_mute.sql`** — `schedule_data`, `reminder_intent`, rehab/mute; integrator **`20260509_0001_reminder_rules_multi_and_enrichment.sql`** — multi-rule / enrichment):

- `reminder_rules` — **канонические продуктовые правила** (webapp SoT); integrator хранит зеркало для dispatch после M2M upsert.
- `reminder_occurrence_history`
- `reminder_delivery_events`
- `content_access_grants_webapp`

Колонка **`platform_users.reminder_muted_until`** — user-level mute для цепочки dispatch (см. [`PATIENT_REMINDER_UX_INITIATIVE/README.md`](../PATIENT_REMINDER_UX_INITIATIVE/README.md)).

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

### 2.9 TREATMENT_PROGRAM_INITIATIVE / программы лечения

Новые таблицы инициативы заведены через **Drizzle ORM** (`apps/webapp/db/schema/*.ts`, миграции `apps/webapp/db/drizzle-migrations/0001` ... `0007`), а не через legacy SQL-папку `apps/webapp/migrations/`.

#### Библиотека блоков (фаза 2)

- `tests`
- `test_sets`
- `test_set_items`
- `recommendations`

Связи:

- `tests.created_by` → `platform_users.id` (SET NULL)
- `test_sets.created_by` → `platform_users.id` (SET NULL)
- `test_set_items.test_set_id` → `test_sets.id` (CASCADE)
- `test_set_items.test_id` → `tests.id` (RESTRICT)
- `recommendations.created_by` → `platform_users.id` (SET NULL)

#### Шаблоны программ (фаза 3)

- `treatment_program_templates`
- `treatment_program_template_stages` — **уникальная пара** `(template_id, sort_order)` (инвариант порядка этапов, включая этап 0 «Общие рекомендации»).
- `treatment_program_template_stage_groups` — системные блоки `system_kind` ∈ (`recommendations`, `tests`); partial unique: одна строка «Рекомендации» и одна «Тестирование» на этап.
- `treatment_program_template_stage_items`

Связи и инварианты:

- `treatment_program_templates.created_by` → `platform_users.id` (SET NULL)
- `treatment_program_template_stages.template_id` → `treatment_program_templates.id` (CASCADE)
- `treatment_program_template_stage_items.stage_id` → `treatment_program_template_stages.id` (CASCADE)
- `treatment_program_template_stage_items.item_ref_id` — **без FK**, полиморфная ссылка; валидируется сервисным слоем (в т.ч. соответствие типа элемента системной группе и правила этапа 0).

#### Экземпляры программ / назначение (фаза 4)

- `treatment_program_instances`
- `treatment_program_instance_stages`
- `treatment_program_instance_stage_items`

Связи и инварианты:

- `treatment_program_instances.template_id` → `treatment_program_templates.id` (SET NULL)
- `treatment_program_instances.patient_user_id` → `platform_users.id` (CASCADE)
- `treatment_program_instances.assigned_by` → `platform_users.id` (SET NULL)
- `treatment_program_instance_stages.instance_id` → `treatment_program_instances.id` (CASCADE)
- `treatment_program_instance_stages.source_stage_id` → `treatment_program_template_stages.id` (SET NULL)
- `treatment_program_instance_stage_items.stage_id` → `treatment_program_instance_stages.id` (CASCADE)
- `treatment_program_instance_stage_items.item_ref_id` — **без FK**
- `treatment_program_instance_stage_items.snapshot` — снимок блока на момент назначения

#### Комментарии (фаза 5)

- `comments`

Связи и инварианты:

- `comments.author_id` → `platform_users.id` (RESTRICT)
- `(target_type, target_id)` — полиморфная ссылка **без FK**
- индекс `idx_comments_target_type_target_id`

#### Прохождение и тесты (фаза 6)

- `test_attempts`
- `test_results`

Связи:

- `test_attempts.instance_stage_item_id` → `treatment_program_instance_stage_items.id` (CASCADE)
- `test_attempts.patient_user_id` → `platform_users.id` (CASCADE)
- `test_results.attempt_id` → `test_attempts.id` (CASCADE)
- `test_results.test_id` → `tests.id` (RESTRICT)
- `test_results.decided_by` → `platform_users.id` (SET NULL)

Дополнения к уже существующим таблицам инициативы:

- `treatment_program_instance_stages.skip_reason`
- `treatment_program_instance_stage_items.completed_at`

#### История изменений (фаза 7)

- `treatment_program_events`

Связи и инварианты:

- `treatment_program_events.instance_id` → `treatment_program_instances.id` (CASCADE)
- `treatment_program_events.actor_id` → `platform_users.id` (SET NULL)
- `target_type` = `stage | stage_item | program`
- `reason` обязателен на уровне сервиса для `stage_skipped` и `item_removed`

#### Курсы (фаза 8)

- `courses`

Связи и инварианты:

- `courses.program_template_id` → `treatment_program_templates.id` (RESTRICT)
- `courses.intro_lesson_page_id` → `content_pages.id` (SET NULL)
- курс хранит метаданные и ссылку на шаблон программы; собственных таблиц прохождения не создаёт

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
- Таблицы 2.9 — новый контур **TREATMENT_PROGRAM_INITIATIVE**; для него source of truth по логике — `docs/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md`, по структуре БД — Drizzle schema + `db/drizzle-migrations`.

### 3.3 Общие имена таблиц

В одной БД (unified) таблица `idempotency_keys` может существовать в обеих схемах:

- `integrator.idempotency_keys`
- `public.idempotency_keys` (исторически «webapp»)

Целевой набор колонок в обеих схемах совпадает: `key` (PK), `request_hash`, `status`, `response_body`, `expires_at`. Webapp использует это для идемпотентности HTTP (`apps/webapp/src/infra/idempotency/pgStore.ts`, POST `/api/integrator/events`). Входящие вебхуки integrator (Telegram, Max и др.) дедуплицируются через `createPostgresIdempotencyPort` в `apps/integrator/src/infra/db/repos/idempotencyKeys.ts`: для строк только дедупа шлюза пишется sentinel `request_hash` (`__integrator_incoming_event__`), `status = 200`, `response_body = {}`. Старые установки integrator, где таблица была только с `key` + `expires_at`, подтягиваются миграцией `20260414_0001_integrator_idempotency_keys_webapp_columns.sql`.

---

## 4. Dumps

- [Дамп схемы integrator](./DB_DUMPS/integrator_bersoncarebot_dev_schema.sql) (исторически снят с отдельной dev-базы)
- [Дамп схемы public](./DB_DUMPS/webapp_bcb_webapp_dev_schema.sql) (webapp; unified — обе схемы в одной БД)

Актуальный список таблиц в коде: миграции `apps/integrator` (integrator), `apps/webapp/migrations/` (legacy webapp SQL) и `apps/webapp/db/drizzle-migrations/` + `apps/webapp/db/schema/` (новые таблицы инициативы и последующих Drizzle-изменений). Дампы в DB_DUMPS могут отставать от последних миграций; для полной схемы после миграций смотреть `\dt` в psql или вывод миграций.

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
- [Treatment program system logic](../TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md)
