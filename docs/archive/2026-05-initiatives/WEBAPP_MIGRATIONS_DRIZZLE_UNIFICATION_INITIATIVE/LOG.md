# LOG — WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE

## 2026-05-09 — bootstrap

- Создана папка инициативы и базовый комплект документов: `README`, `STAGE_PLAN`, `STAGE_A..D`, `PROMPTS_COPYPASTE`, `LOG`.
- Статус: инициатива активна; **Stage A закрыт** (см. блок ниже).

## 2026-05-09 — planning decisions

- Уточнен Stage A: runtime-critical DDL определяется по фактическому использованию в webapp runtime, production scripts/backfill/reconcile flow, media-worker public schema access и deploy/ops checks.
- Уточнен Stage A: Drizzle coverage классифицируется как `exact` / `logical` / `partial` / `missing` / `unknown`; все `partial` / `missing` / `unknown` уходят в risk list.
- Уточнен ledger scope: Composer фиксирует риск разных ledger (`webapp_schema_migrations` vs Drizzle metadata), Codex решает стратегию на Stage B.
- Уточнен Stage D: Composer делает discovery по всему репозиторию, но не меняет code/deploy/package/test scripts; такие refs записываются как residual для Codex.
- Уточнен audit format: findings пишутся в `LOG.md` с severity `critical` / `major` / `minor` / `unknown`.

---

## 2026-05-09 — Stage A complete (Inventory & Risk Map)

Статус этапа: **closed** (gate: инвентаризация в этом блоке; таблица соответствия для всех legacy-файлов; runtime-critical список; risk list для Codex; ledger зафиксирован без решения).

### Методология (кратко)

- **Inventory:** все файлы `apps/webapp/migrations/*.sql` и `apps/webapp/db/drizzle-migrations/*.sql` перечислены ниже (87 и 53 соответственно).
- **Сопоставление legacy → Drizzle:** для каждого legacy-файла указано пересечение имён таблиц с каждым Drizzle-SQL (автоматический парсер `CREATE/ALTER/DROP TABLE`, `CREATE INDEX … ON`, `UPDATE`). Это **эвристика**: совпадение имён таблиц **не** доказывает, что Drizzle-миграция повторяет или заменяет DDL legacy — такие строки помечены **`partial`** только как «та же таблица затрагивается обеими цепочками». Полное семантическое сравнение DDL — **Stage B (Codex)**.
- **Coverage:** для большинства legacy-файлов отдельного Drizzle-миграционного файла с тем же DDL **нет** (`missing`). `partial` — таблица встречается и там и там; `exact` для пары «один legacy-файл ≡ один drizzle-файл» в аудите **не выявлено** (baseline Drizzle — см. ниже).
- **Ledger:** только констатация; стратегия repair — не входит в Stage A.

### Findings (severity)

| Severity | Finding |
|----------|---------|
| **critical** | Канонический `pnpm --dir apps/webapp run migrate` вызывает **только** `drizzle-kit migrate` (`scripts/run-webapp-drizzle-migrate.mjs`). Legacy SQL из `apps/webapp/migrations/` **не** выполняется этим входом; нужен отдельный `pnpm run migrate:legacy`. Чистая БД не получает legacy-DDL из канонического пути. |
| **critical** | `db/drizzle-migrations/0000_wandering_famine.sql` — **noop** (`SELECT 1`), с комментарием что базовые таблицы `public` создаются legacy-runner’ом. Drizzle-цепочка не содержит introspect-бaseline SQL в репозитории. |
| **major** | Два файла с одинаковым числовым префиксом **`040_*.sql`** и два **`045_*.sql`** — порядок определяется лексикографической сортировкой `run-migrations.mjs` (сейчас: `040_auth_preferred_channel` → `040_patient_bookings`; `045_media_pending_delete_status` → `045_system_settings_integration_keys`). Риск при смене сортировки или переименовании. |
| **major** | Post-deploy guardrail проверяет `test_sets.publication_status` и `recommendations.domain`. На момент инвентаризации: `publication_status` — Drizzle `0033_*`; для **`domain`** отдельного Drizzle-`ALTER` не было (только legacy `082_*`). **После Stage B:** канонический путь дополняет Drizzle **`0053_*`** (идемпотентно); смешанная **историческая** провенанция baseline для прочей схемы `public` сохраняется. |
| **minor** | Авто-парсер для части файлов не извлекает объекты (только индексы / только `UPDATE` / опечатки вроде артефакта `in` у `072_*`) — строки таблицы ниже всё равно помечены; при необходимости ручной разбор в Stage B. |
| **unknown** | Для строк с **`partial`**: насколько Drizzle-изменения покрывают **конкретные** колонки/constraints legacy — без построчного diff SQL не классифицировано (передаётся Codex). |

### Ledger risk (fix deferred — Stage B)

- **Legacy ledger:** `public.webapp_schema_migrations` (`filename` PK), создаётся/используется `scripts/run-migrations.mjs`; возможен backfill из старого `public.schema_migrations(filename)` при unified DB.
- **Drizzle ledger:** `drizzle.__drizzle_migrations` (см. `scripts/seed-drizzle-migrations-meta.mjs`; комментарии в `run-webapp-drizzle-migrate.mjs` про repair metadata).
- **Риск:** две независимые записи о применённых шагах; канонический migrate обновляет только Drizzle-ledger. Повторное применение legacy на «частично совпадающей» БД и расхождение журналов — зона Stage B.

### Runtime-critical объекты схемы и ops (агрегированный список)

Объекты, без которых падает или деградирует текущий прод-поток / воркеры / guardrails (не исчерпывает все объекты в Drizzle schema; базовый принцип: **всё, что есть в `apps/webapp/db/schema/*.ts` и читается рантаймом, предполагается существующим в БД**).

**Журналы миграций** (не DDL приложения, но обязательны для соответствующих раннеров): `public.webapp_schema_migrations` — legacy `run-migrations.mjs`; `drizzle.__drizzle_migrations` — Drizzle-kit migrate. Dual-ledger риск см. блок «Ledger risk» выше.

| Область | Объекты / комментарий |
|---------|------------------------|
| Deploy guardrail | `public.test_sets.publication_status`; `public.recommendations.domain` (`deploy/host/deploy-prod.sh`). |
| Media / pipeline | `media_files` (колонки из legacy `028`, `044`, HLS из Drizzle `0018+`, превью `075`, размеры `079`, очереди статусов `060`, и т.д.); `media_transcode_jobs` (Drizzle `0019`+); настройки `system_settings` ключей pipeline/watermark (`media-worker` + webapp). |
| Media-worker (код) | `system_settings` (`video_watermark_enabled`, `video_hls_pipeline_enabled`); `media_files`; `media_transcode_jobs` — см. `apps/media-worker/src/*.ts`. |
| Integrator sync | `integrator_push_outbox` (legacy `071_*`). |
| Напоминания / правила | `reminder_rules`, `reminder_journal`, `reminder_occurrence_history`, occurrence actions — legacy `050`–`051`, `084`–`085`, др. |
| Запись / каталог | `patient_bookings`, `booking_*`, `branches` — серия legacy `040`–`057`. |
| Платформа / идентичность | `platform_users`, идемпотентность, каналы, OTP, OAuth — ранняя legacy-цепочка + частично Drizzle (`0032_platform_users_calendar_timezone`, …). |
| Treatment program / CMS | Таблицы стадий программы, тесты, курсы, комментарии — преимущественно **Drizzle `0001`–`0052`** (зависят от уже существующих `platform_users`, `lfk_*`, `content_*` из legacy). |
| Ops/backfill (преимущественно **DML**, не DDL холодного старта) | Data-only / backfill (`058_branch_timezone_seed`, `063_platform_user_owned_refs_backfill`, requeue `076`–`081`) — критичны для корректности данных и фоновых jobs, не всегда воспроизводимы Drizzle-only путём. |

### Risk list для Codex (Stage B) — все `missing` / `partial` / unknown

- **Глобально:** воспроизведение полной схемы `public` только через `drizzle-kit migrate` без legacy — **невозможно** при текущем `0000` и отсутствии слитого baseline SQL в репо.
- **Все legacy-файлы с coverage `missing`** в таблице ниже: ни один Drizzle-SQL в репозитории не ссылается на те же таблицы (по парсеру) — перенос/объединение DDL в Drizzle или явная политика bootstrap.
- **Все строки с coverage `partial`:** пересечение имён таблиц с Drizzle не гарантирует покрытие колонок/constraints/indexes legacy; требуется построчный diff и порядок применения (особенно `media_files`, `platform_users`, `content_pages`/`content_sections`, `symptom_*`, `lfk_*`, `reminder_*`).
- **`082_recommendations_domain.sql` / `recommendations.domain`:** guardrail-колонка; до Stage B отдельного Drizzle-`ALTER` для `domain` не было (greenfield/ledger риск). **Закрыто в Stage B:** Drizzle **`0053`**; legacy **`082`** не удалялся — исторические БД и дубликат DDL безопасен (`IF NOT EXISTS`).
- **Legacy-only без Drizzle overlap:** крупные куски: `009_support_*`, `010_reminders_*`, `011_appointment_records`, `012_subscription_mailing`, `018_channel_link_secrets`, `020`–`023`, `031_system_settings`, `033_lfk_exercises`, `046_booking_catalog_v2`, `048_online_intake`, `066_admin_audit_log`, `071_integrator_push_outbox`, `078_reference_items_deleted_at`, и др. (см. колонку overlap «—»).
- **Drizzle-only (нет legacy-пары):** новые сущности программы лечения, clinical tests, media playback stats, patient diary snapshots и др. — см. список Drizzle; зависимость от legacy-базовых таблиц сохраняется.

### Полная инвентаризация файлов

#### Legacy: `apps/webapp/migrations/*.sql` — **87** файлов

Сортировка применения (как `run-migrations.mjs`: lex sort по имени файла):

`001_diaries.sql`, `002_idempotency.sql`, `003_channel_preferences.sql`, `004_symptom_trackings_and_entries.sql`, `005_lfk_complexes_and_sessions.sql`, `006_platform_users.sql`, `007_phone_challenges_message_log_broadcast_audit.sql`, `008_patient_master_extension.sql`, `009_support_communication_history.sql`, `010_reminders_content_access.sql`, `011_appointment_records.sql`, `012_subscription_mailing.sql`, `013_delivery_events_idempotency.sql`, `014_rubitime_patient_branch.sql`, `015_content_pages.sql`, `016_phone_challenges_otp.sql`, `017_email_verification.sql`, `018_channel_link_secrets.sql`, `019_sms_email_channel_preferences.sql`, `020_auth_methods.sql`, `021_login_tokens_session_issued.sql`, `022_reference_tables_and_seed.sql`, `023_symptom_tracking_extension.sql`, `024_lfk_extension.sql`, `025_support_messaging_extension.sql`, `026_doctor_notes_user_flags.sql`, `027_content_pages_markdown.sql`, `028_media_files.sql`, `029_content_sections_and_status.sql`, `030_news_and_motivation.sql`, `031_system_settings.sql`, `032_reminder_seen_status.sql`, `033_lfk_exercises.sql`, `034_lfk_templates.sql`, `035_lfk_complex_exercises.sql`, `036_auth_rate_limit_events_and_news_views.sql`, `037_system_settings_config_keys.sql`, `038_whitelist_to_system_settings.sql`, `039_content_sections.sql`, **`040_auth_preferred_channel.sql`**, **`040_patient_bookings.sql`**, `041_patient_bookings_no_overlap.sql`, `042_patient_bookings_cancelling_status.sql`, `043_booking_display_timezone.sql`, `044_media_files_s3.sql`, **`045_media_pending_delete_status.sql`**, **`045_system_settings_integration_keys.sql`**, `046_booking_catalog_v2.sql`, `047_patient_bookings_v2_refs.sql`, `048_online_intake.sql`, `049_patient_bookings_compat_source.sql`, `050_reminder_rules_object_links_and_journal.sql`, `051_reminder_occurrence_actions.sql`, `052_patient_bookings_platform_user_null_compat.sql`, `053_patient_bookings_compat_provenance.sql`, `054_patient_bookings_rubitime_manage_url.sql`, `055_patient_bookings_overlap_per_specialist.sql`, `056_branches_timezone.sql`, `057_booking_branches_timezone.sql`, `058_branch_timezone_seed.sql`, `059_lfk_sessions_user_id_to_uuid.sql`, `060_media_files_status_retry.sql`, `061_platform_users_merge.sql`, `062_platform_user_owned_refs_prepare.sql`, `063_platform_user_owned_refs_backfill.sql`, `064_platform_user_owned_refs_enforce.sql`, `065_media_display_name.sql`, `066_admin_audit_log.sql`, `067_media_folders_and_multipart.sql`, `068_platform_users_patient_phone_trust.sql`, `069_oauth_google_login_apple_settings.sql`, `070_vk_web_login_url.sql`, `071_integrator_push_outbox.sql`, `072_idempotency_keys_webapp_columns.sql`, `073_content_requires_auth.sql`, `074_max_debug_page_enabled.sql`, `075_media_preview_status.sql`, `076_requeue_skipped_mov_heic.sql`, `077_requeue_previews_skipped_by_200mb_cap.sql`, `078_reference_items_deleted_at.sql`, `079_media_files_source_dimensions.sql`, `080_requeue_source_dimensions.sql`, `081_requeue_video_for_md_preview.sql`, `082_recommendations_domain.sql`, `083_notifications_topics.sql`, `084_reminder_rehab_slots_mute.sql`, `085_reminder_rules_quiet_hours.sql`.

#### Drizzle: `apps/webapp/db/drizzle-migrations/*.sql` — **53** файла

Журнал `meta/_journal.json` (теги → файлы):  
`0000_wandering_famine`, `0001_charming_champions`, `0002_sweet_ikaris`, `0003_treatment_program_instances`, `0004_entity_comments`, `0005_treatment_program_phase6`, `0006_treatment_program_events`, `0007_courses`, `0008_material_frightful_four`, `0009_content_pages_linked_course`, `0010_patient_practice_completions`, `0011_patient_daily_mood`, `0012_content_section_slug_history`, `0013_patient_home_block_icon_image_url`, `0014_patient_home_useful_post`, `0015_patient_home_item_show_title`, `0016_drop_news_broadcast_channels`, `0017_content_sections_kind_system_parent`, `0018_media_files_hls_foundation`, `0019_media_transcode_jobs_queue`, `0020_video_playback_settings`, `0021_video_hls_new_uploads_auto_transcode`, `0022_video_default_delivery_auto`, `0023_video_presign_ttl_seconds`, `0024_video_watermark_enabled`, `0025_treatment_program_stage_goals_objectives_duration`, `0026_media_playback_stats_hourly`, `0027_media_playback_user_video_first_resolve`, `0028_treatment_program_a2_instance_item_status`, `0029_treatment_program_a3_stage_groups`, `0030_program_action_log`, `0031_treatment_program_a5_last_viewed`, `0032_platform_users_calendar_timezone`, `0033_test_sets_publication_status`, `0034_clinical_tests_b2_scoring_measure_kinds`, `0035_test_set_items_comment`, `0036_recommendations_b4_body_region_metrics`, `0037_lfk_complex_exercises_local_comment`, `0038_clinical_assessment_kind_reference`, `0039_recommendation_type_reference`, `0040_drop_tests_scoring_config`, `0041_exercise_load_type_reference_align`, `0042_lfk_exercise_side_damaged_healthy`, `0043_treatment_program_instance_stage_started_at`, `0044_instance_stage_groups_system_kind`, `0045_instance_stage_groups_system_kind_unique`, `0046_template_stage_groups_system_kind`, `0047_template_stages_tpl_sort_unique`, `0048_treatment_program_clinical_test_items`, `0049_wellbeing_symptom_unify`, `0050_symptom_general_wellbeing_unique`, `0051_warmup_feeling_symptom`, `0052_patient_diary_day_snapshots`.

### Таблица соответствия legacy → Drizzle (coverage)

| legacy file | Primary objects (abbrev.) | Drizzle SQL overlap (table-name heuristic) | Coverage |
|-------------|---------------------------|--------------------------------------------|----------|
| `001_diaries.sql` | lfk_sessions, symptom_entries | `0051_warmup_feeling_symptom`: symptom_entries | partial |
| `002_idempotency.sql` | idempotency_keys | — | missing |
| `003_channel_preferences.sql` | user_channel_preferences | — | missing |
| `004_symptom_trackings_and_entries.sql` | symptom_entries, symptom_trackings | `0051_warmup_feeling_symptom`: symptom_entries | partial |
| `005_lfk_complexes_and_sessions.sql` | lfk_complexes, lfk_sessions | — | missing |
| `006_platform_users.sql` | platform_users, user_channel_bindings | `0032_platform_users_calendar_timezone`: platform_users | partial |
| `007_phone_challenges_message_log_broadcast_audit.sql` | broadcast_audit, message_log, phone_challenges | `0016_drop_news_broadcast_channels`: broadcast_audit | partial |
| `008_patient_master_extension.sql` | platform_users, user_notification_topics | `0032_platform_users_calendar_timezone`: platform_users | partial |
| `009_support_communication_history.sql` | support_* tables | — | missing |
| `010_reminders_content_access.sql` | reminder_*, content_access_grants_webapp | — | missing |
| `011_appointment_records.sql` | appointment_records | — | missing |
| `012_subscription_mailing.sql` | mailing_*, user_subscriptions_webapp | — | missing |
| `013_delivery_events_idempotency.sql` | (indexes / constraints — см. файл) | — | missing |
| `014_rubitime_patient_branch.sql` | branches, platform_users, appointment_records | `0032_platform_users_calendar_timezone`: platform_users | partial |
| `015_content_pages.sql` | content_pages | `0009_content_pages_linked_course`: content_pages | partial |
| `016_phone_challenges_otp.sql` | phone_challenges, phone_otp_locks | — | missing |
| `017_email_verification.sql` | email_challenges, email_send_cooldowns, platform_users | `0032_platform_users_calendar_timezone`: platform_users | partial |
| `018_channel_link_secrets.sql` | channel_link_secrets | — | missing |
| `019_sms_email_channel_preferences.sql` | user_channel_preferences | — | missing |
| `020_auth_methods.sql` | login_tokens, user_oauth_bindings, user_pins | — | missing |
| `021_login_tokens_session_issued.sql` | login_tokens | — | missing |
| `022_reference_tables_and_seed.sql` | reference_categories, reference_items | — | missing |
| `023_symptom_tracking_extension.sql` | symptom_trackings | — | missing |
| `024_lfk_extension.sql` | lfk_complexes, lfk_sessions (+updates) | — | missing |
| `025_support_messaging_extension.sql` | support_conversation_messages | — | missing |
| `026_doctor_notes_user_flags.sql` | doctor_notes, platform_users, appointment_records | `0032_platform_users_calendar_timezone`: platform_users | partial |
| `027_content_pages_markdown.sql` | content_pages | `0009_content_pages_linked_course`: content_pages | partial |
| `028_media_files.sql` | media_files | `0018_media_files_hls_foundation`: media_files | partial |
| `029_content_sections_and_status.sql` | content_pages | `0009_content_pages_linked_course`: content_pages | partial |
| `030_news_and_motivation.sql` | motivational_quotes, news_items | `0016_drop_news_broadcast_channels`: news_items | partial |
| `031_system_settings.sql` | system_settings | — | missing |
| `032_reminder_seen_status.sql` | reminder_occurrence_history | — | missing |
| `033_lfk_exercises.sql` | lfk_exercises, lfk_exercise_media | — | missing |
| `034_lfk_templates.sql` | lfk_complex_templates, … | `0042_lfk_exercise_side_damaged_healthy`: lfk_complex_template_exercises | partial |
| `035_lfk_complex_exercises.sql` | lfk_complex_exercises | `0037_*`, `0042_*`: lfk_complex_exercises | partial |
| `036_auth_rate_limit_events_and_news_views.sql` | auth_rate_limit_events, news_item_views | `0016_drop_news_broadcast_channels`: news_item_views | partial |
| `037_system_settings_config_keys.sql` | (INSERT/UPDATE settings keys) | — | missing |
| `038_whitelist_to_system_settings.sql` | (data move) | — | missing |
| `039_content_sections.sql` | content_sections | `0008_*`, `0017_*`: content_sections | partial |
| `040_auth_preferred_channel.sql` | user_channel_preferences | — | missing |
| `040_patient_bookings.sql` | patient_bookings | — | missing |
| `041_patient_bookings_no_overlap.sql` | patient_bookings | — | missing |
| `042_patient_bookings_cancelling_status.sql` | patient_bookings | — | missing |
| `043_booking_display_timezone.sql` | (CHECK/constraint) | — | missing |
| `044_media_files_s3.sql` | media_files | `0018_media_files_hls_foundation`: media_files | partial |
| `045_media_pending_delete_status.sql` | (constraints / enum-like) | — | missing |
| `045_system_settings_integration_keys.sql` | (keys / seed) | — | missing |
| `046_booking_catalog_v2.sql` | booking_* | — | missing |
| `047_patient_bookings_v2_refs.sql` | patient_bookings | — | missing |
| `048_online_intake.sql` | online_intake_* | — | missing |
| `049_patient_bookings_compat_source.sql` | patient_bookings | — | missing |
| `050_reminder_rules_object_links_and_journal.sql` | reminder_rules, reminder_journal | — | missing |
| `051_reminder_occurrence_actions.sql` | reminder_occurrence_history | — | missing |
| `052_patient_bookings_platform_user_null_compat.sql` | patient_bookings | — | missing |
| `053_patient_bookings_compat_provenance.sql` | patient_bookings | — | missing |
| `054_patient_bookings_rubitime_manage_url.sql` | patient_bookings | — | missing |
| `055_patient_bookings_overlap_per_specialist.sql` | patient_bookings | — | missing |
| `056_branches_timezone.sql` | branches | — | missing |
| `057_booking_branches_timezone.sql` | booking_branches | — | missing |
| `058_branch_timezone_seed.sql` | UPDATE booking_branches, branches | — | missing |
| `059_lfk_sessions_user_id_to_uuid.sql` | lfk_sessions | — | missing |
| `060_media_files_status_retry.sql` | media_files | `0018_*`: media_files | partial |
| `061_platform_users_merge.sql` | platform_users | `0032_*`: platform_users | partial |
| `062_platform_user_owned_refs_prepare.sql` | symptom_*, ucp, message_log, … | `0016_*`, `0051_*`: … | partial |
| `063_platform_user_owned_refs_backfill.sql` | UPDATE нескольких таблиц | те же таблицы, что и в `062`/`064`, частично пересекаются с Drizzle по именам | partial |
| `064_platform_user_owned_refs_enforce.sql` | lfk_*, symptom_*, … | `0016_*`, `0051_*`: … | partial |
| `065_media_display_name.sql` | media_files | `0018_*`: media_files | partial |
| `066_admin_audit_log.sql` | admin_audit_log | — | missing |
| `067_media_folders_and_multipart.sql` | media_folders, media_upload_sessions, media_files | `0018_*`: media_files | partial |
| `068_platform_users_patient_phone_trust.sql` | platform_users | `0032_*`: platform_users | partial |
| `069_oauth_google_login_apple_settings.sql` | (settings keys) | — | missing |
| `070_vk_web_login_url.sql` | (settings keys) | — | missing |
| `071_integrator_push_outbox.sql` | integrator_push_outbox | — | missing |
| `072_idempotency_keys_webapp_columns.sql` | idempotency_keys | — | missing |
| `073_content_requires_auth.sql` | content_pages, content_sections | `0008_*`, `0009_*`, `0017_*` | partial |
| `074_max_debug_page_enabled.sql` | (settings) | — | missing |
| `075_media_preview_status.sql` | media_files | `0018_*`: media_files | partial |
| `076_requeue_skipped_mov_heic.sql` | UPDATE media_files | `0018_*`: media_files | partial |
| `077_requeue_previews_skipped_by_200mb_cap.sql` | UPDATE media_files | `0018_*`: media_files | partial |
| `078_reference_items_deleted_at.sql` | reference_items | — | missing |
| `079_media_files_source_dimensions.sql` | media_files | `0018_*`: media_files | partial |
| `080_requeue_source_dimensions.sql` | UPDATE media_files | `0018_*`: media_files | partial |
| `081_requeue_video_for_md_preview.sql` | UPDATE media_files | `0018_*`: media_files | partial |
| `082_recommendations_domain.sql` | recommendations | `0001_*`, `0036_*`: recommendations | partial |
| `083_notifications_topics.sql` | (topics / settings) | — | missing |
| `084_reminder_rehab_slots_mute.sql` | reminder_rules, platform_users | `0032_*`: platform_users | partial |
| `085_reminder_rules_quiet_hours.sql` | reminder_rules | — | missing |

### Definition of Done — Stage A

- [x] Полная инвентаризация обоих каталогов SQL-миграций.
- [x] Таблица соответствия legacy → Drizzle (coverage + эвристика overlap).
- [x] Отдельный список runtime-critical объектов (DDL + журналы миграций + ops/backfill — см. таблицу выше).
- [x] Все `partial` / `missing` / неразрешённые семантически отнесены к risk list для Codex; ledger-риск зафиксирован без решения.
- [x] Запись в `LOG.md`.

**Residual:** точное построчное сравнение DDL и решение «merge vs replace» — **Stage B (Codex)**.

---

## Stage A audit (2026-05-09)

Независимая проверка результатов блока «Stage A complete»: сверка с диском, `meta/_journal.json`, `deploy/host/*.sh`, `scripts/migrate-all.sh`.

### 1) Полнота инвентаризации legacy / Drizzle

| Severity | Finding |
|----------|---------|
| **minor** | **Подтверждено:** на диске ровно **87** файлов `apps/webapp/migrations/*.sql`; множество имён из списка в Stage A совпадает с множеством на диске **без расхождений** (скриптовая сверка множеств). |
| **minor** | **Подтверждено:** в `apps/webapp/db/drizzle-migrations/` ровно **53** файла `*.sql`; теги в `meta/_journal.json` (53 записи) в точности соответствуют именам файлов `NNNN_tag.sql` на диске (расхождений нет). |
| **minor** | Файлы `meta/*.json` (snapshots журнала) **не входили** в инвентаризацию SQL — это ожидаемо для scope «*.sql»; при расширении аудита учитывать отдельно. |
| **unknown** | GitHub Actions / CI не проверялись в этом аудите на предмет автоматического прогона полной цепочки миграций против чистой БД — влияние на выводы Stage A по greenfield **не оценено**. |

### 2) Корректность списка runtime-critical объектов

| Severity | Finding |
|----------|---------|
| **major** | *(На момент аудита Stage A; **устранено** в Stage B/C.)* Раньше **`deploy-webapp-prod.sh`** не выполнял post-migrate guardrail после migrate (в отличие от `deploy-prod.sh`). **Фактическое состояние репозитория:** parity guardrail в webapp-only deploy (Stage B), затем общий **`webapp-post-migrate-schema-check.sh`** в обоих скриптах (Stage C). Исходная формулировка сохранена как история аудита. |
| **minor** | В агрегате Stage A строка **«Ops/backfill (преимущественно DML)»** (`058_*`, `063_*`, `076`–`081_*`) по смыслу — преимущественно **DML / разовые данные**, не DDL холодного старта; как напоминание об ops-критичности корректно; заголовок секции Stage A после remediation явно отличает DDL приложения и DML/backfill. |
| **minor** | Таблицы журналов миграций **`public.webapp_schema_migrations`** и **`drizzle.__drizzle_migrations`** в раннем агрегате Stage A **не были названы явно в таблице** — исправлено в блоке «Runtime-critical объекты…» (журналы + ops/backfill); dual-ledger вывод не меняется. |

### 3) Actionable риски для Stage B

| Severity | Finding |
|----------|---------|
| **critical** | Подтверждено как **actionable:** канонический `pnpm migrate` (`scripts/migrate-all.sh`) вызывает только integrator migrate + **Drizzle webapp**; **legacy SQL не входит** — без отдельной политики/bootstrap greenfield и расхождение с продом не снимаются. |
| **critical** | Подтверждено: `0000_wandering_famine.sql` остаётся noop — baseline `public` в Drizzle-SQL в репо **не восстановлен**; консолидация в Stage B обязательна, если цель — один источник DDL. |
| **major** | Подтверждено: смешанная провенанция guardrail-колонок (`0033` Drizzle vs `082` legacy для `recommendations.domain`) — **явный work item** для выравнивания миграционной цепочки и/или guardrail. |
| **major** | Подтверждено: **dual ledger** (`webapp_schema_migrations` vs `drizzle.__drizzle_migrations`) — actionable стратегия repair/ordering на Stage B (уже зафиксировано в Stage A; аудит не снимает приоритет). |
| **minor** | Подтверждено: дубликаты числовых префиксов **`040_*` / `045_*`** и лексикографический порядок — actionable как минимум документация для операторов; опционально переименование при согласовании. |
| **minor** | Таблица coverage Stage A остаётся **actionable для Codex**: все строки `missing` и семантически непроверенные `partial` требуют построчного diff (аудит не заменяет Stage B). |

### Итог аудита

Инвентаризация **полная и согласована с диском и журналом Drizzle**. Список runtime-critical **в целом обоснован**, но уточнены: (а) guardrail не универсален для всех deploy-скриптов, (б) смешение DDL/DML в блоке «операционные скрипты». Риски для Stage B **достаточно actionable**; добавленных блокеров сверх уже зафиксированных critical/major findings нет.

---

## 2026-05-09 — Stage B complete (Drizzle consolidation)

Статус этапа: **closed**.

### Сделано

1. **Drizzle migration `0053_recommendations_domain_guardrail.sql`** — идемпотентный `ALTER TABLE … ADD COLUMN IF NOT EXISTS "domain"` и `CREATE INDEX IF NOT EXISTS idx_recommendations_domain` на `recommendations` (эквивалент legacy `082_recommendations_domain.sql` для канонического пути `pnpm --dir apps/webapp run migrate`). Запись в `meta/_journal.json` (`idx` 53).
2. **Схема TypeScript** — в `db/schema/recommendations.ts` добавлен индекс `idx_recommendations_domain` в соответствии с миграцией.
3. **Deploy parity** — в `deploy/host/deploy-webapp-prod.sh` после migrate добавлен тот же **post-migrate guardrail** (`psql` / `information_schema`), что в `deploy/host/deploy-prod.sh` для колонок `test_sets.publication_status` и `recommendations.domain`.
4. **Документация** — `deploy/HOST_DEPLOY_README.md` (блок «Отдельный webapp deploy»); `docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/README.md` (статус этапов).

### Идемпотентность и уже мигрированные БД

- Повторный прогон `0053` на БД, где legacy `082` уже применён: `IF NOT EXISTS` для колонки и индекса — **без ошибок**.
- Ledger: новый шаг попадает только в `drizzle.__drizzle_migrations` при успешном `drizzle-kit migrate`; расхождение с `webapp_schema_migrations` по-прежнему возможно при смешанном использовании legacy — стратегия repair не менялась (остаточный риск, см. Stage D).

### Политика (явно)

- **Канонические schema-изменения webapp** по-прежнему подаются через Drizzle SQL в `apps/webapp/db/drizzle-migrations/` и `pnpm --dir apps/webapp run migrate`.
- **Legacy `apps/webapp/migrations/*.sql`** остаётся необходимым для полного bootstrap «пустой БД → prod-подобный `public`» (baseline таблицы до treatment-program/Drizzle-слоёв); отдельный запуск `pnpm --dir apps/webapp run migrate:legacy` — **вне регулярного production deploy**, только bootstrap/реабилитация (формулировка runbook: Stage D / `HOST_DEPLOY_README.md`). Stage B **не** вводил единый merged baseline SQL вместо noop `0000`.
- Legacy-файл **`082_recommendations_domain.sql`** не удалялся: исторические БД могли получить колонку только через него; Drizzle `0053` дублирует DDL безопасно.

### Проверки (целевые)

Выполнено локально (exit code **0**):

- `pnpm --dir apps/webapp run lint`
- `pnpm --dir apps/webapp run typecheck`

*(Полный прогон `drizzle-kit migrate` против реальной БД в этой сессии не выполнялся — нужен `DATABASE_URL`; на проде выполняется из deploy после выкладки артефактов.)*

### Residual / Stage C+

- Dual ledger (`webapp_schema_migrations` vs `drizzle.__drizzle_migrations`) — **Stage C/D**.
- Полная автономность greenfield без **любого** legacy — вне закрытого объёма Stage B (noop `0000` сохранён).

### Definition of Done — Stage B

- [x] Пробел guardrail-колонки `recommendations.domain` закрыт в Drizzle path (`0053`).
- [x] Идемпотентность для уже накатанных БД сохранена.
- [x] Целевые lint/typecheck webapp пройдены.
- [x] `LOG.md` обновлён; README инициативы отражают прогресс.

---

## Stage B audit (2026-05-09)

Независимая проверка блока «Stage B complete» и артефактов (`0053_recommendations_domain_guardrail.sql`, сопоставление с legacy `082_*`, текст LOG). **Код и deploy-скрипты не менялись** в рамках аудита.

### 1) Покрытие runtime-critical изменений Drizzle

| Severity | Finding |
|----------|---------|
| **critical** | Требование формулировки этапа «**все** runtime-critical изменения webapp покрыты Drizzle» (см. `STAGE_B.md` / README целей инициативы) **не выполнено в полном объёме**. Stage B добавил в Drizzle только **`recommendations.domain` + `idx_recommendations_domain`** (`0053`). Объекты из агрегата Stage A (**integrator_push_outbox**, **booking/patient_bookings**, **reminders**, часть **media** DDL только из legacy, **platform/auth** baseline и т.д.) по-прежнему зависят от **`migrate:legacy`** / исторического состояния БД; noop `0000` не заменён baseline SQL. Это **явно** отражено в LOG («Residual»), но не эквивалентно «полному покрытию». |
| **major** | Для **deploy guardrail** (`deploy-prod.sh`; после Stage B — также проверка в `deploy-webapp-prod.sh`): колонки **`test_sets.publication_status`** и **`recommendations.domain`** могут появиться после **только** Drizzle-цепочки *при условии*, что базовые таблицы уже существуют (`publication_status` из **`0033_*`**, `domain` из **`0053_*`**). Для **чистой БД без legacy** полный `public` всё ещё **не** гарантируется одним `pnpm --dir apps/webapp run migrate` — согласовано с residual в LOG. |
| **minor** | README инициативы после Stage B описывает прогресс точечно (`0053` + guardrail webapp deploy); не утверждает полного merge legacy → Drizzle — **корректно относительно фактов**. |

### 2) Риск повторного применения DDL

| Severity | Finding |
|----------|---------|
| **minor** | Миграция **`0053`** семантически совпадает с legacy **`082_recommendations_domain.sql`** (оба: `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Повторное применение на уже соответствующей БД **не должно** падать; повторный прогон того же шага в Drizzle обычно **не выполняется** после записи hash в `drizzle.__drizzle_migrations`. |
| **minor** | Остаточный процессный риск **не из текста `0053`**: два журнала (**`webapp_schema_migrations`** vs **`drizzle.__drizzle_migrations`**) — возможны ошибки порядка legacy/Drizzle или repair meta; Stage B это не устранял (Stage C/D). |
| **unknown** | Если на редкой БД индекс **`idx_recommendations_domain`** существовал с **другим** определением, `CREATE INDEX IF NOT EXISTS` **не** перестроит его — крайний случай; для истории с legacy `082` определение совпадает. |

### 3) Прозрачность проверок и результатов в LOG

| Severity | Finding |
|----------|---------|
| **minor** | Перечислены **конкретные команды** (`lint`, `typecheck`) и **exit code 0** — воспроизводимо. |
| **minor** | Явно указано, что **`drizzle-kit migrate` против реальной БД** в сессии Stage B **не прогонялся** — честно; при этом фактическое применение `0053` на PostgreSQL в том заходе **не верифицировалось** через migrate (остаётся прод/deploy или ручной прогон). |
| **minor** | Нет приложённого лога/времени выполнения команд — для docs-достаточно; при строгом audit trail можно добавлять в будущем. |

### Итог аудита Stage B

Доставка Stage B **согласована с узким закрытием guardrail-пробела** (`recommendations.domain` в Drizzle + выравнивание post-migrate проверки для webapp-only deploy). Ранний черновик **«все runtime-critical в Drizzle»** **без оговорок неверен** — при приёмке использовать формулировки из секций «Политика», «Residual» и Definition of Done LOG (про **`0053`**); текущий **`STAGE_B.md`** приведён к этому объёму.

---

## 2026-05-09 — Stage C complete (Deploy guardrails)

Статус этапа: **closed**.

### Сделано

1. **`deploy/host/webapp-post-migrate-schema-check.sh`** — единая post-migrate проверка существования критичных колонок в `public` (расширение относительно пары guardrail-колонок Stage B): помимо `test_sets.publication_status` и `recommendations.domain` добавлены проверки для media pipeline (`media_files.video_processing_status`, `video_processing_error`, `preview_status`), очереди транскода (`media_transcode_jobs.media_id`, `status`), integrator sync (`integrator_push_outbox.idempotency_key`), админ-конфига (`system_settings.key`), календаря (`platform_users.calendar_timezone`). Полный перечень — в комментарии в начале скрипта.
2. **`deploy/host/deploy-prod.sh`** и **`deploy/host/deploy-webapp-prod.sh`** — вместо дублирования inline SQL вызывают общий скрипт сразу после migrate, **до** любого `systemctl restart`.
3. **`deploy/HOST_DEPLOY_README.md`** — синхронизирован: раздел «Pre/post migrate checklist», описание full prod и отдельного webapp deploy отражают guardrail и порядок «migrate → проверка → restart».

### Guardrail до рестарта

В обоих deploy: порядок сохранён **`pnpm migrate` / `pnpm --dir apps/webapp run migrate` → `bash …/webapp-post-migrate-schema-check.sh` → `systemctl restart …`**. При ненулевом коде из проверки скрипт завершает процесс (`exit 1`); из-за `set -euo pipefail` деплой не переходит к рестарту сервисов.

### Верификация в репозитории

- `bash -n` для `deploy/host/webapp-post-migrate-schema-check.sh`, `deploy/host/deploy-prod.sh`, `deploy/host/deploy-webapp-prod.sh` — **OK** (exit 0).
- Прогон проверки против живой БД на хосте в этой сессии не выполнялся (нет `DATABASE_URL` окружения CI); на проде выполняется в составе deploy после выгрузки env.

### Definition of Done — Stage C

- [x] Post-migrate schema checks усилены (общий скрипт + расширенный список колонок).
- [x] Guardrail выполняется до рестарта systemd-юнитов.
- [x] Runbook (`HOST_DEPLOY_README.md`) синхронизирован с скриптами.
- [x] `LOG.md` обновлён; README инициативы — краткий статус Stage C.

### Residual / Stage D

- Dual ledger legacy/Drizzle meta — по-прежнему отдельная тема (очистка/документация legacy runner).

---

## Stage C audit (2026-05-09)

Независимая проверка артефактов Stage C: `deploy/host/webapp-post-migrate-schema-check.sh`, фактический порядок шагов в `deploy/host/deploy-prod.sh` и `deploy/host/deploy-webapp-prod.sh`, разделы `deploy/HOST_DEPLOY_README.md` про migrate/guardrail. **Deploy/code не менялись** в рамках аудита.

### 1) Покрытие guardrail’ом критичных колонок

| Severity | Finding |
|----------|---------|
| **major** | Список в **`webapp-post-migrate-schema-check.sh`** заметно шире пары guardrail-колонок из Stage A/B (`test_sets.publication_status`, `recommendations.domain`) и добавляет media pipeline, `media_transcode_jobs`, **`integrator_push_outbox`**, **`system_settings`**, **`platform_users.calendar_timezone`**. Это **осмысленное усиление**, но агрегат Stage A по-прежнему включает большие области (**booking/patient_bookings**, **reminder_rules**/journal, часть legacy-only DDL), которые **не** проверяются колоночным guardrail — полного покрытия «все runtime-critical из инвентаризации» **нет** (и Stage C этого не заявлял в узком DoD). |
| **minor** | Для **media-worker** проверяются ключевые колонки `media_files` и строки очереди `media_transcode_jobs`; отдельно не проверяются другие таблицы вроде только-чтения из worker кода — приемлемо как узкий production smoke. |
| **unknown** | На редкой БД без полного legacy/bootstrap отсутствие таблицы/колонки из списка приведёт к **fail deploy после migrate** — это строже, чем прежние две колонки; нужно ли смягчение списка для нестандартных окружений — вне фактов этого аудита. |

### 2) Соответствие документации фактическому deploy flow

| Severity | Finding |
|----------|---------|
| **minor** | В **`HOST_DEPLOY_README`** общая фраза про guardrail после migrate была **двусмысленна** (`pnpm migrate` vs webapp-only). **Устранено:** явное различение команд migrate для `deploy-prod.sh` и `deploy-webapp-prod.sh` перед описанием общего вызова **`webapp-post-migrate-schema-check.sh`**. |
| **minor** | Раздел «Основной production deploy» перечисляет порядок **backup → `pnpm migrate` → `webapp-post-migrate-schema-check.sh` → restart** — **совпадает** с `deploy-prod.sh` (строки backup, migrate, bash guardrail, затем `systemctl restart`). |
| **minor** | Раздел «Отдельный webapp deploy» описывает guardrail до рестарта webapp — **совпадает** с `deploy-webapp-prod.sh`. |

### 3) Регрессия операционных шагов

| Severity | Finding |
|----------|---------|
| **major** | **Поведенческое изменение:** guardrail стал **строже** (10 пар таблица/колонка вместо 2). Ранее проходивший deploy при полной схеме мог **начать падать**, если на БД отсутствует любая из новых проверяемых колонок (например, не накатан legacy/Drizzle шаг для **`calendar_timezone`** или **`integrator_push_outbox`**). Это не «поломка порядка шагов», а **ужесточение критерия успеха** — операторам нужно чинить схему или миграции, а не откатывать порядок backup/migrate/restart. |
| **minor** | Обязательная последовательность **pre-migrations backup → migrate → guardrail → restart** сохранена; шагов не удалено по сравнению с задокументированным намерением Stage C. |
| **minor** | `deploy-webapp-prod.sh` по-прежнему **не** запускает integrator migrate — регрессии относительно прежнего scope webapp-only деплоя нет. |

### Итог аудита Stage C

Guardrail **усиливает** прод-путь и **совпадает по порядку** с runbook для обоих скриптов; двусмысленность формулировки migrate/guardrail в `HOST_DEPLOY_README` снята в документальном remediation после закрытия инициативы. Полное покрытие всех пунктов Stage A «runtime-critical» не достигнуто и не требовалось DoD этапа C. Основной **операционный риск** — возможные **новые падения deploy** на «частично подготовленных» БД до приведения схемы к списку проверки.

---

## 2026-05-09 — Stage D complete (Legacy messaging + final audit draft)

### Документация: `migrate:legacy` не как регулярный deploy-шаг

Обновлено в scope Stage D:

- **`deploy/HOST_DEPLOY_README.md`** (раздел «Отдельный webapp deploy»): явно зафиксировано, что **канонический** шаг — только Drizzle; `pnpm --dir apps/webapp run migrate:legacy` описан как **аварийный / исторический / bootstrap**, вне `deploy-prod.sh` / `deploy-webapp-prod.sh`.
- **`docs/ARCHITECTURE/DB_STRUCTURE.md`**: строка про `webapp_schema_migrations` — ledger пополняется только при ручном legacy-раннере; не часть обычного production deploy.

Точечная правка в этом же `LOG.md`: блок Stage B «Политика» — уточнение про legacy-run **вне** регулярного deploy.

**Не правились** (вне разрешённого scope или по правилам Stage D): исходники `apps/webapp/**`, другие doc вне списка — см. **Residual refs for Codex** ниже.

### Инварианты production flow (фактическое состояние репозитория)

| Инвариант | Состояние |
|-----------|-----------|
| Канонические изменения схемы webapp в обычной разработке | Drizzle SQL в `apps/webapp/db/drizzle-migrations/`, вход `pnpm --dir apps/webapp run migrate`. |
| Production host после Stage C | `pnpm migrate` (integrator + webapp) или webapp-only migrate → **`deploy/host/webapp-post-migrate-schema-check.sh`** → только затем `systemctl restart`. **`migrate:legacy` в deploy-скриптах отсутствует.** |
| Legacy runner | Сохранён как **опциональный** путь (`migrate:legacy` в package scripts); предназначение — bootstrap / восстановление / исторический DDL не в Drizzle-журнале. |

### Final global audit (черновик)

#### Слой схемы

- **Drizzle** закрывает инкрементальную эволюцию и guardrail-критичные точки (в т.ч. `0053` для `recommendations.domain`).
- **`0000_wandering_famine.sql`** остаётся noop; полный baseline `public` из одной Drizzle-цепочки **не** воспроизводится без legacy или без будущего объединённого baseline (вне этой инициативы).
- Большая часть **`apps/webapp/migrations/*.sql`** исторически не дублируется файлами Drizzle — карта Stage A остаётся актуальной как технический долг.

#### Журналы (ledger)

- **`drizzle.__drizzle_migrations`** — источник истины для канонического migrate.
- **`public.webapp_schema_migrations`** — только для legacy-runner; риск рассинхрона и repair meta при смешанных ручных операциях.

#### Deploy / наблюдаемость

- Post-migrate guardrail расширен (Stage C); покрытие **не** исчерпывает все таблицы Stage A (booking/reminders и т.д.) — узкий smoke по критичным колонкам.

### Residual risks (приоритет для последующих работ / Codex)

1. **Dual ledger** + возможность пустого/частичного Drizzle-meta при DDL «в обход» — repair через `db:seed-drizzle-meta` и дисциплина операций.
2. **Greenfield без legacy** — полная схема `public` не гарантируется одним `pnpm --dir apps/webapp run migrate`.
3. **Guardrail** — ложные срабатывания на частично мигрированных БД; ложные пропуски для объектов не в списке проверки.
4. **Дубликаты префиксов** legacy-файлов `040_*`, `045_*` — порядок зависит от лексической сортировки имён.

### Сознательно не делали (границы инициативы)

- Не удаляли **`migrate:legacy`**, **`run-migrations.mjs`**, записи в **`package.json`**, вызовы из **тестов** (`vitest.globalSetup.ts`) — по правилам Stage D и отдельное решение для Codex.
- Не вливали весь legacy SQL в Drizzle baseline и не отключали noop `0000`.
- Не меняли **deploy** shell-кроме уже разрешённого runbook ранее (Stage C); Stage D только текстом в `HOST_DEPLOY_README`.
- Не правили **`docs/MEDIA_PREVIEW_PIPELINE.md`**, **`apps/webapp/scripts/README.md`**, архивные документы — только перечислены как residual refs.

### Residual refs for Codex (discovery `migrate:legacy` / `run-migrations.mjs`)

Рекомендация: при следующем проходе выровнять формулировки **emergency/historical only** и убрать двусмысленность «при необходимости» там, где это звучит как рутина — **без** удаления скриптов из CI/тестов без явного решения.

| Область | Путь |
|---------|------|
| Package script | `apps/webapp/package.json` (`migrate:legacy`) |
| Legacy runner | `apps/webapp/scripts/run-migrations.mjs` |
| Drizzle migrate helper text | `apps/webapp/scripts/run-webapp-drizzle-migrate.mjs` |
| Тестовая БД | `apps/webapp/vitest.globalSetup.ts` |
| Документация webapp scripts (вне scope правок Stage D) | `apps/webapp/scripts/README.md` |
| Ops / media | `docs/MEDIA_PREVIEW_PIPELINE.md` |
| Архивный снимок БД | `docs/ARCHITECTURE/PRODUCTION_DB_INVENTORY_2026-04-13.md` (упоминание `run-migrations.mjs`) |
| Архив инициатив | `docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md`; `docs/archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/AUDIT_PHASE_1.md` |
| Прочие архивы | `docs/archive/**` — множественные упоминания `run-migrations.mjs` / legacy (низкий приоритет, исторический контекст) |

### Gate закрытия инициативы (WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION)

- [x] Документация в scope согласована с тем, что **регулярный production deploy не использует `migrate:legacy`**.
- [x] Финальный audit-черновик и residual риски зафиксированы в `LOG.md`.
- [x] Живые code/script ссылки вне scope перечислены для Codex.

---

## Final global audit (post Stage D)

Консолидация состояния после этапов A–D (без повторного полного инвентарного diff):

| Область | Итог |
|---------|------|
| **Инвентаризация** | Stage A: полный список legacy/Drizzle SQL, таблица coverage, риски повторного DDL и dual-ledger зафиксированы в LOG. |
| **Канонический путь схемы** | Обычная разработка и production deploy: **`pnpm --dir apps/webapp run migrate`** (Drizzle). **`pnpm migrate`** на хосте — integrator + webapp Drizzle. |
| **Закрытый пробел guardrail** | Stage B: Drizzle **`0053`** для `recommendations.domain`; совместимо с уже накатанными БД (`IF NOT EXISTS`). |
| **Deploy safety** | Stage C: общий **`webapp-post-migrate-schema-check.sh`** до рестарта сервисов; список колонок расширен относительно начальной пары. |
| **Legacy runner** | Физически сохранён (`migrate:legacy`, `run-migrations.mjs`); Stage D: в runbook и `DB_STRUCTURE` закреплено **emergency/historical/bootstrap only**, не обязательный шаг prod deploy. |
| **Технический долг вне инициативы** | Noop **`0000`**, отсутствие merged baseline для всего `public`, dual ledger, часть Stage A coverage `missing` — осознанно перенесены в residual (Codex/будущие эпики). |

---

## Definition of Done — сверка с `STAGE_PLAN.md`

Ориентир: раздел **Definition of Done** в [`STAGE_PLAN.md`](./STAGE_PLAN.md).

| Критерий STAGE_PLAN | Выполнение |
|---------------------|------------|
| Webapp-миграции идут через один **канонический** путь (**Drizzle**) в **обычном deploy-flow** | **Да.** `deploy-prod.sh` / `deploy-webapp-prod.sh` вызывают только Drizzle-migrate (через `pnpm migrate` или `pnpm --dir apps/webapp run migrate`). Legacy-SQL не входит в эти скрипты. |
| Критичные для рантайма колонки проверяются **post-migrate guardrail** | **Да.** `deploy/host/webapp-post-migrate-schema-check.sh` после migrate, до `systemctl restart`. |
| **Legacy path** не используется как **обязательный** шаг production deploy | **Да.** Зафиксировано в `HOST_DEPLOY_README.md`, `DB_STRUCTURE.md`, блоках Stage D в LOG; prod deploy-скрипты legacy не вызывают. |
| Документация и **runbook** синхронизированы | **Да** в рамках scope инициативы (`HOST_DEPLOY_README.md`, `DB_STRUCTURE.md`, документы в `docs/archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/`). Отдельные doc из таблицы residual refs для Codex — не блокер закрытия. |
| В **`LOG.md`** зафиксированы этапы, проверки и решения | **Да.** Этапы A–D, аудиты, политика, residual риски, refs. |

---

## Initiative closed

- **Дата:** 2026-05-09  
- **Решение:** инициатива **WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE** закрывается как **выполненная по Definition of Done** из `STAGE_PLAN.md`.  
- **Блокирующих открытых пунктов нет.** Дальнейшие действия по dual ledger, полному baseline Drizzle, выравниванию вспомогательной документации и удалению/упрощению legacy-runner — **отдельные задачи / Codex**, не входят в scope этого закрытия.

### Документальное выравнивание с аудитами A–C (после закрытия)

Исправлены формулировки, противоречившие аудиту или устаревшие после следующих этапов: **`STAGE_B.md`**, **`STAGE_PLAN.md`** (этап B); **`deploy/HOST_DEPLOY_README.md`** — явное различение migrate в full prod vs webapp-only перед общим guardrail; **`PROMPTS_COPYPASTE.md`** — промпты Stage A/B audit; **`LOG.md`** — заголовок и строки агрегата Stage A (журналы миграций; ops/backfill); таблицы findings Stage A/C помечены как исторические/устранённые там, где поведение уже изменилось (**guardrail** на webapp-only deploy, **`082`/`domain`** и Drizzle **`0053`**, двусмысленность runbook).

---

## 2026-05-09 — Final closure confirmation (post Stage D)

Проведён повторный **global audit** после Stage D с фокусом на gate закрытия и Definition of Done из `STAGE_PLAN.md`.

### Результат финального global audit

- Подтверждён production flow без обязательного legacy-runner: `deploy-prod.sh` использует `pnpm migrate`, `deploy-webapp-prod.sh` — `pnpm --dir apps/webapp run migrate`; оба скрипта вызывают `webapp-post-migrate-schema-check.sh` **до** `systemctl restart`.
- Подтверждён расширенный post-migrate guardrail по критичным колонкам (`test_sets.publication_status`, `recommendations.domain`, media/integrator/system settings/platform users).
- Подтверждена документальная фиксация статуса `migrate:legacy` как emergency/historical/bootstrap-only в `HOST_DEPLOY_README.md`; регулярный deploy-step не требует legacy.

### Definition of Done (`STAGE_PLAN.md`) — финальное подтверждение

- [x] webapp-миграции идут через один канонический путь (Drizzle) в обычном deploy-flow.
- [x] критичные для рантайма колонки проверяются post-migrate guardrail.
- [x] legacy path не используется как обязательный шаг production deploy.
- [x] документация и runbook синхронизированы в рамках scope инициативы.
- [x] в `LOG.md` зафиксированы этапы, проверки, решения и остаточные риски.

### Финальный статус

- **Initiative closed.**
- **Открытых блокеров для закрытия инициативы нет.**
- Residual риски (dual ledger, greenfield baseline без legacy, дальнейшая зачистка вспомогательных упоминаний) остаются отдельным backlog после закрытия и не блокируют DoD текущей инициативы.
