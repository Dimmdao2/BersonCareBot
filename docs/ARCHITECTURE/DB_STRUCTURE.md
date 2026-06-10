# Текущая структура БД

Документ описывает объекты PostgreSQL по **схемам** в **unified** Postgres: одна база, `DATABASE_URL` общий для api и webapp — см. [`DATABASE_UNIFIED_POSTGRES.md`](./DATABASE_UNIFIED_POSTGRES.md), [`SERVER CONVENTIONS.md`](./SERVER%20CONVENTIONS.md).

## Верификация (источник правды)

| Параметр | Значение |
|----------|----------|
| Сверка | **2026-06-10** после `pnpm run migrate` на dev |
| База | `bcb_webapp_dev` (`apps/webapp/.env.dev`) |
| Таблиц `integrator` | **33** |
| Таблиц `public` | **199** |
| Последняя Drizzle-миграция webapp | **`0114_client_media_folders_fixup`** |
| DDL-снимки | [`DB_DUMPS/`](./DB_DUMPS/README.md) (`integrator_*`, `public_*`) |

Полный машиночитаемый реестр — [§ Приложение A](#приложение-a-полный-реестр-таблиц). При расхождении с текстом ниже приоритет у **живой БД** и дампов.

Миграции в репозитории: `apps/integrator/src/infra/db/migrations/` (журнал `integrator.schema_migrations`), `apps/webapp/db/drizzle-migrations/` + `apps/webapp/db/schema/` (журнал `drizzle.__drizzle_migrations`). Legacy SQL webapp — `apps/webapp/migrations/` (журнал `public.webapp_schema_migrations`, не шаг обычного deploy).

## Scope

1. Схема **`integrator`** — ingress, runtime integrator, зеркала настроек.
2. Схема **`public`** — канон webapp, проекции, booking engine, CMS, программы лечения.

В **`public`** часть таблиц с теми же именами, что в `integrator`, — **legacy shadow / backfill-копии** (см. [§ 2.0](#20-legacy-shadow-таблицы-в-public)). Product owner для person, support, reminders, appointments — webapp-таблицы с префиксами `support_*`, `reminder_*`, `platform_users` и т.д.; статусы — [`STAGE13_OWNERSHIP_MAP.md`](./STAGE13_OWNERSHIP_MAP.md).

---

## 1. Схема `integrator` (33 таблицы)

### 1.1 User / identity / contacts

- `users` — `merged_into_user_id` → канон после merge (CHECK без self-reference)
- `identities`
- `contacts`

### 1.2 Telegram

- `telegram_state`
- `telegram_users`

### 1.3 Booking / RubiTime

- `rubitime_records` — канон записей ingress; см. [`RUBITIME_BOOKING_PIPELINE.md`](./RUBITIME_BOOKING_PIPELINE.md)
- `rubitime_branches`, `rubitime_cooperators`, `rubitime_services`, `rubitime_events`
- `rubitime_booking_profiles`, `rubitime_create_retry_jobs`, `rubitime_api_throttle`
- `booking_calendar_map`

### 1.4 Messaging / support

- `conversations`, `conversation_messages`
- `user_questions`, `question_messages`
- `message_drafts`

### 1.5 Reminders / content access

- `user_reminder_rules`, `user_reminder_occurrences`, `user_reminder_delivery_logs`
- `content_access_grants`

### 1.6 Mailings / subscriptions

- `mailing_topics`, `mailings`, `mailing_logs`
- `user_subscriptions` — **frozen legacy** (триггер запрета записи; reconcile/read)

### 1.7 Configuration

- `system_settings` — зеркало `public.system_settings` (`key`, `scope`, `value_json`); webapp пишет канон и синхронизирует в integrator — см. [`CONFIGURATION_ENV_VS_DATABASE.md`](./CONFIGURATION_ENV_VS_DATABASE.md)

### 1.8 Data quality / incidents

- `integration_data_quality_incidents`

### 1.9 Runtime / technical

- `idempotency_keys` — дедуп входящих вебхуков и исходящих операций
- `delivery_attempt_logs`
- `projection_outbox` — очередь проекции в webapp (fallback; целевой путь — прямой SQL)
- `schema_migrations` — журнал SQL-миграций integrator (`version`, например `core:…`, `telegram:…`)

---

## 2. Схема `public` (199 таблиц)

### 2.0 Legacy shadow-таблицы в `public`

Те же **имена**, что в `integrator`, остаются в `public` для backfill, reconcile и исторического кода. **Не** считать их product owner для UI/API webapp:

`users`, `identities`, `contacts`, `telegram_state`, `telegram_users`, `conversations`, `conversation_messages`, `user_questions`, `question_messages`, `message_drafts`, `user_reminder_rules`, `user_reminder_occurrences`, `user_reminder_delivery_logs`, `content_access_grants`, `mailing_topics`, `mailings`, `mailing_logs`, `user_subscriptions`, `rubitime_records`, `rubitime_branches`, `rubitime_cooperators`, `rubitime_services`, `rubitime_events`, `rubitime_booking_profiles`, `rubitime_create_retry_jobs`, `rubitime_api_throttle`, `booking_calendar_map`, `delivery_attempt_logs`, `projection_outbox`, `idempotency_keys`, `integration_data_quality_incidents`, `schema_migrations`.

Канонические webapp-аналоги — § 2.1–2.7, `platform_users`, `support_*`, `reminder_*`, `appointment_records`, `be_*` и т.д.

### 2.1 Users / bindings / preferences / auth

- `platform_users` — канон платформы; `merged_into_id`, `merged_at` (миграция `0067`)
- `platform_user_contacts` — supplementary phone/email для UI врача (`0097`)
- `user_channel_bindings`, `user_channel_preferences`, `user_notification_topics`, `user_notification_topic_channels` (`0055`, `0108`–`0109`)
- `user_web_push_subscriptions` (`0071`)
- `user_oauth_bindings`, `user_password_credentials`, `user_email_setup_tokens` (`0070`, `0076`)
- `user_phone_history`, `user_pins`
- `phone_challenges`, `phone_otp_locks`, `phone_messenger_bind_secrets` (`0078`)
- `email_challenges`, `email_send_cooldowns`
- `login_tokens`, `channel_link_secrets`
- `auth_rate_limit_events`

### 2.2 Diaries / LFK / patient practice

- `symptom_trackings`, `symptom_entries`
- `lfk_complexes`, `lfk_sessions`
- `lfk_exercises`, `lfk_exercise_media`, `lfk_exercise_regions`
- `lfk_complex_templates`, `lfk_complex_template_exercises`, `lfk_complex_exercises`
- `patient_lfk_assignments`
- `patient_diary_day_snapshots` (`0052`)
- `patient_practice_completions`
- `patient_daily_warmup_presentations`, `patient_daily_warmup_video_views` (`0084`–`0085`, `0110`)
- `patient_content_rating_feedback` (`0079`)

### 2.3 Auth / audit / logs / runtime

- `message_log`
- `broadcast_audit`, `broadcast_audit_recipients` (`0080`)
- `admin_audit_log` — журнал админки; UI `/app/doctor/audit-log`
- `idempotency_keys` — идемпотентность HTTP webapp
- `webapp_schema_migrations` — журнал legacy SQL (`migrate:legacy`)
- `integrator_push_outbox` — исходящая синхронизация настроек в integrator
- `outgoing_delivery_queue` (`0060`)
- `notification_delivery_attempts` (`0073`)

### 2.4 Support / communication (проекция)

- `support_conversations`, `support_conversation_messages`
- `support_questions`, `support_question_messages`
- `support_delivery_events`
- `doctor_patient_support` (`0101`)
- `doctor_notes`

### 2.5 Reminders / content access (проекция + канон)

- `reminder_rules` — **канон** продуктовых правил (webapp SoT)
- `reminder_occurrence_history`, `reminder_delivery_events`
- `reminder_journal`
- `webapp_reminder_occurrences` (`0075`)
- `content_access_grants_webapp`
- `platform_users.reminder_muted_until` — user-level mute

### 2.6 Appointments / booking

**Проекция Rubitime:**

- `appointment_records` ← `integrator.rubitime_records`

**Legacy каталог (не удалён):**

- `booking_cities`, `booking_branches`, `booking_branch_services`, `booking_services`, `booking_specialists`, `booking_calendar_map`
- `branches`, `patient_bookings`

**Booking engine (`be_*`, Drizzle `0086`–`0096`, `0100`):**

Организация и каталог: `be_organizations`, `be_branches`, `be_rooms`, `be_specialists`, `be_specialist_locations`, `be_specialist_rooms`, `be_clinic_services`, `be_specialist_service_availability`, `be_service_location_availability`.

Записи и расписание: `be_appointments`, `be_appointment_events`, `be_appointment_history_events`, `be_appointment_staff_comments`, `be_appointment_reschedules`, `be_appointment_cancellations`, `be_working_hours`, `be_availability_rules`, `be_schedule_blocks`, `be_booking_form_fields`, `be_booking_form_submissions`, `be_patient_timeline_events`, `be_external_entity_mappings`, `patient_merge_candidates`.

Политики: `be_cancellation_policies`, `be_reschedule_policies`, `be_prepayment_policies`.

Платежи (этап 5): `be_payment_intents`, `be_payments`, `be_refunds`, `be_payment_provider_events`, `be_payment_history_events`.

Абонементы (этап 6, `0094`, `0105`): `be_subscription_packages`, `be_package_items`, `be_patient_packages`, `be_patient_package_items`, `be_package_usages`, `be_package_history_events`, `be_patient_booking_profiles`.

Продукты / pay-links (этап 7, `0095`): `be_products`, `be_product_pay_links`, `be_product_purchases`, `be_product_history_events`.

`patient_bookings.status` включает `awaiting_payment`. См. [`CANONICAL_MODEL.md`](../OWN_BOOKING_ENGINE_INITIATIVE/CANONICAL_MODEL.md).

### 2.7 Subscription / mailing (проекция)

- `mailing_topics_webapp`, `user_subscriptions_webapp`, `mailing_logs_webapp`

### 2.8 CMS: контент и медиа

**Страницы и разделы:**

- `content_sections`, `content_pages`, `content_section_slug_history`

**Медиа-библиотека:**

- `media_files`, `media_folders` (`0113`–`0114`: `kind`, `patient_user_id`, корень «Файлы клиентов»)
- `media_upload_sessions`
- `media_transcode_jobs`, `media_hls_proxy_error_events` (`0061`)
- `media_playback_client_events`, `media_playback_resolution_events` (`0059`, `0106`)
- `media_playback_stats_hourly`, `media_playback_user_video_first_resolve`

**Справочники каталога:**

- `reference_categories`, `reference_items`
- `recommendations`, `recommendation_regions` (`0063`)
- `motivational_quotes`

### 2.9 LFK / clinical tests (каталог для программ)

- `tests`, `test_sets`, `test_set_items` — библиотека блоков программ лечения
- `clinical_test_measure_kinds`, `clinical_test_regions` — M2M регионов для клинических тестов

### 2.10 Treatment program initiative

Шаблоны: `treatment_program_templates`, `treatment_program_template_stages`, `treatment_program_template_stage_groups`, `treatment_program_template_stage_items`.

Экземпляры: `treatment_program_instances`, `treatment_program_instance_stages`, `treatment_program_instance_stage_groups`, `treatment_program_instance_stage_items`.

Прохождение: `test_attempts`, `test_results` (FK `test_id` → **`tests.id`**), `comments`, `treatment_program_events`, `courses`, `material_ratings`.

Обсуждения пунктов (`0098`): `program_item_discussion_messages`, `program_item_discussion_reads`, `program_action_log`.

См. Drizzle `apps/webapp/db/schema/`, логику — [`SYSTEM_LOGIC_SCHEMA`](../archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md).

### 2.11 Patient home / online intake

- `patient_home_blocks`, `patient_home_block_items`
- `online_intake_requests`, `online_intake_answers`, `online_intake_attachments`, `online_intake_status_history`

### 2.12 Operator health / jobs / webhooks

- `operator_incidents`, `operator_job_status`, `operator_health_failure_archive` (`0057`–`0058`, `0068`)
- `operator_health_alert_sent` (`0111`)
- `integration_webhook_last_status`, `integration_webhook_error_events` (`0112`)

### 2.13 Analytics / product notifications

- `product_analytics_events_recent`, `product_analytics_hourly`, `product_analytics_user_hourly` (`0083`)
- `product_push_notifications`

### 2.14 Configuration

- `system_settings` — канон runtime-конфигурации webapp (`scope` `admin` | `doctor` | `global`); синхронизация в `integrator.system_settings` через `updateSetting` — см. [`CONFIGURATION_ENV_VS_DATABASE.md`](./CONFIGURATION_ENV_VS_DATABASE.md)

### 2.15 Staff tasks

- `specialist_tasks` (`0102`)

---

## 3. Наблюдаемые особенности схемы

### 3.1 Дубли имён между схемами

В unified БД одноимённые таблицы в `integrator` и `public` — **разные объекты** (разные `search_path`). Product read/write для пациента и врача — `public` (канон); integrator — ingress и runtime.

### 3.2 `idempotency_keys`

- `integrator.idempotency_keys` — входящие события integrator
- `public.idempotency_keys` — исходящие/входящие HTTP webapp

Колонки согласованы: `key`, `request_hash`, `status`, `response_body`, `expires_at`.

### 3.3 `system_settings`

Пара `(key, scope)` в обеих схемах; webapp — writer, integrator — mirror до полного перехода на прямой SQL.

### 3.4 Журналы миграций

| Журнал | Назначение |
|--------|------------|
| `integrator.schema_migrations` | SQL integrator |
| `drizzle.__drizzle_migrations` | Drizzle webapp |
| `public.webapp_schema_migrations` | Legacy SQL webapp |
| `public.schema_migrations` | Исторический webapp (legacy) |

---

## 4. DDL-дампы

См. [`DB_DUMPS/README.md`](./DB_DUMPS/README.md):

- [`integrator_bcb_webapp_dev_schema.sql`](./DB_DUMPS/integrator_bcb_webapp_dev_schema.sql)
- [`public_bcb_webapp_dev_schema.sql`](./DB_DUMPS/public_bcb_webapp_dev_schema.sql)

Переснимать после значимых миграций или перед крупными doc-аудитами.

## 5. Перенос данных (backfill / reconcile)

- **Окружение:** один `DATABASE_URL`; скрипты: `integrator` → `public`.
- **Скрипты:** [`DATA_MIGRATION_CHECKLIST.md`](../../deploy/DATA_MIGRATION_CHECKLIST.md).
- **Владение:** [`STAGE13_OWNERSHIP_MAP.md`](./STAGE13_OWNERSHIP_MAP.md).

---

## Приложение A. Полный реестр таблиц

Сверено с `pg_tables` на `bcb_webapp_dev`, 2026-06-10.

### `integrator` (33)

`booking_calendar_map`, `contacts`, `content_access_grants`, `conversation_messages`, `conversations`, `delivery_attempt_logs`, `idempotency_keys`, `identities`, `integration_data_quality_incidents`, `mailing_logs`, `mailing_topics`, `mailings`, `message_drafts`, `projection_outbox`, `question_messages`, `rubitime_api_throttle`, `rubitime_booking_profiles`, `rubitime_branches`, `rubitime_cooperators`, `rubitime_create_retry_jobs`, `rubitime_events`, `rubitime_records`, `rubitime_services`, `schema_migrations`, `system_settings`, `telegram_state`, `telegram_users`, `user_questions`, `user_reminder_delivery_logs`, `user_reminder_occurrences`, `user_reminder_rules`, `user_subscriptions`, `users`.

### `public` (199)

`admin_audit_log`, `appointment_records`, `auth_rate_limit_events`, `be_appointment_cancellations`, `be_appointment_events`, `be_appointment_history_events`, `be_appointment_reschedules`, `be_appointment_staff_comments`, `be_appointments`, `be_availability_rules`, `be_booking_form_fields`, `be_booking_form_submissions`, `be_branches`, `be_cancellation_policies`, `be_clinic_services`, `be_external_entity_mappings`, `be_organizations`, `be_package_history_events`, `be_package_items`, `be_package_usages`, `be_patient_booking_profiles`, `be_patient_package_items`, `be_patient_packages`, `be_patient_timeline_events`, `be_payment_history_events`, `be_payment_intents`, `be_payment_provider_events`, `be_payments`, `be_prepayment_policies`, `be_product_history_events`, `be_product_pay_links`, `be_product_purchases`, `be_products`, `be_refunds`, `be_reschedule_policies`, `be_rooms`, `be_schedule_blocks`, `be_service_location_availability`, `be_specialist_locations`, `be_specialist_rooms`, `be_specialist_service_availability`, `be_specialists`, `be_subscription_packages`, `be_working_hours`, `booking_branch_services`, `booking_branches`, `booking_calendar_map`, `booking_cities`, `booking_services`, `booking_specialists`, `branches`, `broadcast_audit`, `broadcast_audit_recipients`, `channel_link_secrets`, `clinical_test_measure_kinds`, `clinical_test_regions`, `comments`, `contacts`, `content_access_grants`, `content_access_grants_webapp`, `content_pages`, `content_section_slug_history`, `content_sections`, `conversation_messages`, `conversations`, `courses`, `delivery_attempt_logs`, `doctor_notes`, `doctor_patient_support`, `email_challenges`, `email_send_cooldowns`, `idempotency_keys`, `identities`, `integration_data_quality_incidents`, `integration_webhook_error_events`, `integration_webhook_last_status`, `integrator_push_outbox`, `lfk_complex_exercises`, `lfk_complex_template_exercises`, `lfk_complex_templates`, `lfk_complexes`, `lfk_exercise_media`, `lfk_exercise_regions`, `lfk_exercises`, `lfk_sessions`, `login_tokens`, `mailing_logs`, `mailing_logs_webapp`, `mailing_topics`, `mailing_topics_webapp`, `mailings`, `material_ratings`, `media_files`, `media_folders`, `media_hls_proxy_error_events`, `media_playback_client_events`, `media_playback_resolution_events`, `media_playback_stats_hourly`, `media_playback_user_video_first_resolve`, `media_transcode_jobs`, `media_upload_sessions`, `message_drafts`, `message_log`, `motivational_quotes`, `notification_delivery_attempts`, `online_intake_answers`, `online_intake_attachments`, `online_intake_requests`, `online_intake_status_history`, `operator_health_alert_sent`, `operator_health_failure_archive`, `operator_incidents`, `operator_job_status`, `outgoing_delivery_queue`, `patient_bookings`, `patient_content_rating_feedback`, `patient_daily_warmup_presentations`, `patient_daily_warmup_video_views`, `patient_diary_day_snapshots`, `patient_home_block_items`, `patient_home_blocks`, `patient_lfk_assignments`, `patient_merge_candidates`, `patient_practice_completions`, `phone_challenges`, `phone_messenger_bind_secrets`, `phone_otp_locks`, `platform_user_contacts`, `platform_users`, `product_analytics_events_recent`, `product_analytics_hourly`, `product_analytics_user_hourly`, `product_push_notifications`, `program_action_log`, `program_item_discussion_messages`, `program_item_discussion_reads`, `projection_outbox`, `question_messages`, `recommendation_regions`, `recommendations`, `reference_categories`, `reference_items`, `reminder_delivery_events`, `reminder_journal`, `reminder_occurrence_history`, `reminder_rules`, `rubitime_api_throttle`, `rubitime_booking_profiles`, `rubitime_branches`, `rubitime_cooperators`, `rubitime_create_retry_jobs`, `rubitime_events`, `rubitime_records`, `rubitime_services`, `schema_migrations`, `specialist_tasks`, `support_conversation_messages`, `support_conversations`, `support_delivery_events`, `support_question_messages`, `support_questions`, `symptom_entries`, `symptom_trackings`, `system_settings`, `telegram_state`, `telegram_users`, `test_attempts`, `test_results`, `test_set_items`, `test_sets`, `tests`, `treatment_program_events`, `treatment_program_instance_stage_groups`, `treatment_program_instance_stage_items`, `treatment_program_instance_stages`, `treatment_program_instances`, `treatment_program_template_stage_groups`, `treatment_program_template_stage_items`, `treatment_program_template_stages`, `treatment_program_templates`, `user_channel_bindings`, `user_channel_preferences`, `user_email_setup_tokens`, `user_notification_topic_channels`, `user_notification_topics`, `user_oauth_bindings`, `user_password_credentials`, `user_phone_history`, `user_pins`, `user_questions`, `user_reminder_delivery_logs`, `user_reminder_occurrences`, `user_reminder_rules`, `user_subscriptions`, `user_subscriptions_webapp`, `user_web_push_subscriptions`, `users`, `webapp_reminder_occurrences`, `webapp_schema_migrations`.

---

## Связанные документы

- [DB ownership contract](../../apps/integrator/src/infra/db/schema.md)
- [Stage 13 ownership map](./STAGE13_OWNERSHIP_MAP.md)
- [Configuration env vs database](./CONFIGURATION_ENV_VS_DATABASE.md)
- [Data migration checklist](../../deploy/DATA_MIGRATION_CHECKLIST.md)
- [Treatment program system logic](../archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md)
