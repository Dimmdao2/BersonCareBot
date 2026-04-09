# Документация проекта

Краткое оглавление; детали — в перечисленных файлах.

## Архитектура и эксплуатация

- `ARCHITECTURE/SERVER CONVENTIONS.md` — среда выполнения, пути, сервисы (источник фактов для деплоя).
- `ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` — что в env, что в `system_settings`.
- `ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md` — CMS врача (`/app/doctor/content`), фильтр `?section=`, логирование сбоев БД и мягкая деградация UI.
- `ARCHITECTURE/PLATFORM_USER_MERGE.md` — canonical user, logical merge (`merged_into_id`), миграции 061-064 и правила read/write.
- `REPORTS/CMS_DOCTOR_HUB_EXECUTION_LOG.md` — журнал выполнения по CMS-хабу врача (UI, runtime-логи).
- `REPORTS/USER_MERGE_EXECUTION_LOG.md` — журнал выполнения инициативы Platform User Merge & Dedup.

## Инициативы (активные / недавние)

- **Админка `/app/settings` (вкладки, OAuth-доки):** журнал `SETTINGS_ADMIN_UI_TABS/EXECUTION_LOG.md`
- **AUTH / вход (реструктуризация, см. также Mini App до контакта):** `AUTH_RESTRUCTURE/MASTER_PLAN.md` · журнал: `AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md` · гейт Mini App: `AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md` · **Telegram `/start`, онбординг, deep link:** `AUTH_RESTRUCTURE/INTEGRATOR_TELEGRAM_START_SCRIPTS.md`
- **UTC и timezone (Rubitime, филиалы, отображение):** `TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md`  
  Журнал: `TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md` · Глобальный аудит: `TIMEZONE_UTC_NORMALIZATION/AUDIT_GLOBAL.md`
- **Rubitime: вебхук, журнал `rubitime_events`, ФИО, статусы 0–7, проекция:** `ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`
- **Platform User Merge & Dedup:** архитектура `ARCHITECTURE/PLATFORM_USER_MERGE.md` · журнал `REPORTS/USER_MERGE_EXECUTION_LOG.md`
- **Platform User Merge v2 (integrator canonical merge, снятие blocker двух `integrator_user_id`):** `PLATFORM_USER_MERGE_V2/MASTER_PLAN.md` · журнал `PLATFORM_USER_MERGE_V2/AGENT_EXECUTION_LOG.md` · runbook `PLATFORM_USER_MERGE_V2/CUTOVER_RUNBOOK.md`

## Архив

- `archive/README.md`
