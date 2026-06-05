# Архив Cursor-планов (`status: completed`)

Закрытые планы хранятся здесь, чтобы в **`.cursor/plans/*.plan.md`** (корень) оставались в основном **открытые** треки. Исключения см. ниже.

## Черновики / не сейчас (`status: draft`)

Спека есть, исполнение отложено — карточка в [`docs/TODO_NOT_NOW/`](../../docs/TODO_NOT_NOW/README.md):

- **`public_landing_metadata_system_settings.plan.md`** — title и meta description лендинга `/` из `system_settings`; карточка [`docs/TODO_NOT_NOW/public_landing_metadata.md`](../../docs/TODO_NOT_NOW/public_landing_metadata.md).

## Корень `.cursor/plans/` (файлы вне этого каталога `archive/`)

_(В корне `.cursor/plans/` закрытых `*.plan.md` нет — только `archive/` и черновики вроде `public_landing_metadata` в архиве со `status: draft`.)_

## Содержимое этого каталога

Все файлы `*.plan.md` здесь имеют в frontmatter **`status: completed`** (и/или все `todos: completed`). Ссылки из документации обновляйте на путь **`.cursor/plans/archive/<имя-файла>`**.

- **`integrator_drizzle_migration_master.plan.md`** + **`integrator_drizzle_phase_1_simple_repos.plan.md`** … **`integrator_drizzle_phase_4_complex_sql.plan.md`** — Integrator P1–P4: перевод целевых repos с сырого SQL на Drizzle (**закрыто 2026-05-15**, перенос в архив **2026-06-04**); журнал [`docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md`](../../docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md); Wave 2 — [`docs/INTEGRATOR_DRIZZLE_MIGRATION/DRIZZLE_TRANSITION_PLAN.md`](../../docs/INTEGRATOR_DRIZZLE_MIGRATION/DRIZZLE_TRANSITION_PLAN.md).
- **`doctor_ui_visual_style_pass.plan.md`** — визуальный style pass кабинета врача (§A–§C гайда); журнал [`docs/DOCTOR_UI_VISUAL_STYLE_PASS_INITIATIVE/LOG.md`](../../docs/DOCTOR_UI_VISUAL_STYLE_PASS_INITIATIVE/LOG.md); перенос **2026-06-04**.
- **`phone_messenger_bind_pwa_autologin.plan.md`** (A) + **`phone_messenger_bind_bot_ux.plan.md`** (B) — phone auth через мессенджер; канон [`docs/LOGIN_REGISTER_NEW_LOGIC/`](../../docs/LOGIN_REGISTER_NEW_LOGIC/README.md); перенос **2026-06-04**.
- **`phase1_support_model_7c745931.plan.md`** — фаза 1: `doctor_patient_support`, гейты comment/media, «Сегодня» / фильтры клиентов; LOG [`docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md`](../../docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md); очередь [`docs/ACTIVE_WORKQUEUE.md`](../../docs/ACTIVE_WORKQUEUE.md).
- **`active_workqueue_plan_30236040.plan.md`** — мастер-очередь workqueue: **фазы 0–7 закрыты** (2026-06-02); зеркало [`docs/ACTIVE_WORKQUEUE.md`](../../docs/ACTIVE_WORKQUEUE.md). Копия IDE `active_workqueue_plan_24dee701` — снята, канон только этот файл.
- **`max_tg_pre-prod_automation.plan.md`** — MAX webhook / игнорируемые `update_type` в `fromMax`, Telegram `reminders.skip.applyPreset` + `postOccurrenceSkip`, CI; журнал: [`docs/ARCHITECTURE/MAX_PREPROD_AUTOMATION_LOG.md`](../../docs/ARCHITECTURE/MAX_PREPROD_AUTOMATION_LOG.md).
- **`telegram_menu_reply_admin.plan.md`** — Telegram: админское меню slash-команд (`setupMenuButton`), reply/inline главное меню (две кнопки), неотвеченные + «пометить все»; см. [`docs/ARCHITECTURE/SCENARIO_LOGIC_SUMMARY.md`](../../docs/ARCHITECTURE/SCENARIO_LOGIC_SUMMARY.md) и [`docs/ARCHITECTURE/CONTENT_AND_SCRIPTS_FLOW.md`](../../docs/ARCHITECTURE/CONTENT_AND_SCRIPTS_FLOW.md).
- **`admin_incident_alerts.plan.md`** — relay TG/Max для инцидентов идентичности (`admin_incident_alert_config`); см. [`docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](../../docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md), [`docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/PHASE_D_EVENT_HOOKS.md`](../../docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/PHASE_D_EVENT_HOOKS.md).
- **`admin_db_guard_monitoring.plan.md`** — единственный канон: system-health снимок `integrator_push_outbox`, аудит, tick `system-health-guard`; журнал [`docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md`](../../docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md) § 2026-05-15.
- **`material_ratings_stars.plan.md`** — оценки материалов 1–5 (`material_ratings`, patient/doctor API, UI); канон: [`docs/ARCHITECTURE/MATERIAL_RATINGS.md`](../../docs/ARCHITECTURE/MATERIAL_RATINGS.md).
- **`doctor_material_statistics_d9985311.plan.md`** — кабинет врача «Статистика материалов»: KPI и графики из существующих агрегатов (`loadContentEngagementStats`), `GET /api/doctor/content-stats`, паритет с admin `reminder-stats`; канон: [`docs/ARCHITECTURE/MATERIAL_RATINGS.md`](../../docs/ARCHITECTURE/MATERIAL_RATINGS.md).
- **`rubitime_catalog_ux_fix.plan.md`** — UX редактирования услуг в `RubitimeSection` (`/app/doctor/admin/booking/integrations`): один PATCH-редактор, «К услуге», RU-ошибки, предупреждение о branch-service; LOG [`docs/OWN_BOOKING_ENGINE_INITIATIVE/LOG.md`](../../docs/OWN_BOOKING_ENGINE_INITIATIVE/LOG.md) §2026-06-02.
- **`bidirectional_appointment_sync_14c1fa2c.plan.md`** — `AppointmentMirrorSync`: live inbound/outbound Rubitime ↔ `be_appointments` + `appointment_records` для mapped appointments (2026-06-05); приёмка [`docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_MIRROR_SYNC.md`](../../docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_MIRROR_SYNC.md); LOG [`docs/BOOKING_REWORK_INITIATIVE/LOG.md`](../../docs/BOOKING_REWORK_INITIATIVE/LOG.md) §2026-06-05.
- **`booking_mirror_integrity_hardening_8f043ac3.plan.md`** — hardening create/cancel/reschedule/inbound dedup/lifecycle races + audit closeout (`closeoutCommits`: `377f3d51`…`9e2ef6c3`; phase ledger, partial flags by surface, cleanup `.tmp/db-sync/*.dump`); контракт [`docs/BOOKING_REWORK_INITIATIVE/BOOKING_MIRROR_INTEGRITY_CONTRACT.md`](../../docs/BOOKING_REWORK_INITIATIVE/BOOKING_MIRROR_INTEGRITY_CONTRACT.md), приёмка [`docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_MIRROR_SYNC.md`](../../docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_MIRROR_SYNC.md), LOG [`docs/BOOKING_REWORK_INITIATIVE/LOG.md`](../../docs/BOOKING_REWORK_INITIATIVE/LOG.md) §2026-06-05.
- **`production_log_findings_2026-05-14.plan.md`** — закрыт **2026-06**: journalctl webapp/api (14–15.05.2026) — HLS double-close, Rubitime/онлайн реаб (cancelled → BOOKING_REWORK / запрос без автозаписи), ops (кэш HTML, `status=143` при деплое, Server Actions, Node 22); runbook — [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md); онлайн-запись — [`docs/ONLINE_CONSULT_REHAB_NUTRITION_BOOKING_INITIATIVE/LOG.md`](../../docs/ONLINE_CONSULT_REHAB_NUTRITION_BOOKING_INITIATIVE/LOG.md).

При закрытии нового плана: обновить frontmatter по [`.cursor/rules/plan-authoring-execution-standard.mdc`](../../.cursor/rules/plan-authoring-execution-standard.mdc), затем **`git mv`** исходный `*.plan.md` **в этот каталог** (или **`mv`** + `git add`, если файл ещё не в git). **Не** заменять исходник stub-ом во `~/.cursor/plans/` и **не** копировать текст плана в репо вместо физического переноса файла — см. п. **9** того же правила.
