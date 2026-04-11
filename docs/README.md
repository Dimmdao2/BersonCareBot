# Документация проекта

Краткое оглавление; детали — в перечисленных файлах.

## Архитектура и эксплуатация

- `ARCHITECTURE/SERVER CONVENTIONS.md` — среда выполнения, пути, сервисы (источник фактов для деплоя).
- **Webapp: ручные скрипты / SQL и tier patient (телефон + `patient_phone_trust_at`):** [`apps/webapp/scripts/README.md`](../apps/webapp/scripts/README.md) · детально: [`apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md`](../apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md) · контекст в карте сценариев: `PLATFORM_IDENTITY_ACCESS/SCENARIOS_AND_CODE_MAP.md` §8.
- `ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` — что в env, что в `system_settings`.
- `ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md` — CMS врача (`/app/doctor/content`), фильтр `?section=`, логирование сбоев БД и мягкая деградация UI.
- `ARCHITECTURE/SPECIALIST_CABINET_STRUCTURE.md` — продуктовая структура кабинета; в том числе **единый каркас webapp** (ширина колонки, `DoctorHeader`, `doctorWorkspaceLayout.ts`).
- `ARCHITECTURE/PLATFORM_USER_MERGE.md` — canonical user, logical merge (`merged_into_id`), миграции 061-064 и правила read/write.
- `REPORTS/CMS_DOCTOR_HUB_EXECUTION_LOG.md` — журнал выполнения по CMS-хабу врача (UI, runtime-логи).
- `REPORTS/USER_MERGE_EXECUTION_LOG.md` — журнал выполнения инициативы Platform User Merge & Dedup.

## Инициативы (активные / недавние)

- **Админка `/app/settings` (вкладки, OAuth-доки):** журнал `SETTINGS_ADMIN_UI_TABS/EXECUTION_LOG.md`
- **AUTH / вход (реструктуризация, см. также Mini App до контакта):** `AUTH_RESTRUCTURE/MASTER_PLAN.md` · журнал: `AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md` · гейт Mini App: `AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md` · **Telegram `/start`, онбординг, deep link:** `AUTH_RESTRUCTURE/INTEGRATOR_TELEGRAM_START_SCRIPTS.md`
- **Platform Identity & Access (tier guest/onboarding/patient, канон, trusted phone, route/API/RSC policy; фаза E — тесты, логи, аудиты DoD):** `PLATFORM_IDENTITY_ACCESS/README.md` · план `PLATFORM_IDENTITY_ACCESS/MASTER_PLAN.md` · спецификация `PLATFORM_IDENTITY_ACCESS/SPECIFICATION.md` · сценарии и карта кода `PLATFORM_IDENTITY_ACCESS/SCENARIOS_AND_CODE_MAP.md` (§8 + ops-скрипты) · журнал `PLATFORM_IDENTITY_ACCESS/AGENT_EXECUTION_LOG.md` · аудит E: `PLATFORM_IDENTITY_ACCESS/PHASE_E_AUDIT_REPORT.md` · повторный аудит E / D-SA-1: `PLATFORM_IDENTITY_ACCESS/PHASE_E_REAUDIT_REPORT.md` · глубокий аудит D: `PLATFORM_IDENTITY_ACCESS/PHASE_D_DEEP_AUDIT_REPORT.md` · промпты: `PLATFORM_IDENTITY_ACCESS/PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md` · **ops вне UI:** `apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md`
- **UTC и timezone (Rubitime, филиалы, отображение):** `TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md`  
  Журнал: `TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md` · Глобальный аудит: `TIMEZONE_UTC_NORMALIZATION/AUDIT_GLOBAL.md`
- **Rubitime: вебхук, журнал `rubitime_events`, ФИО, статусы 0–7, проекция:** `ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`
- **Platform User Merge & Dedup:** архитектура `ARCHITECTURE/PLATFORM_USER_MERGE.md` · журнал `REPORTS/USER_MERGE_EXECUTION_LOG.md`
- **Platform User Merge v2 (integrator canonical merge, снятие blocker двух `integrator_user_id`):** `PLATFORM_USER_MERGE_V2/MASTER_PLAN.md` · журнал `PLATFORM_USER_MERGE_V2/AGENT_EXECUTION_LOG.md` · runbook `PLATFORM_USER_MERGE_V2/CUTOVER_RUNBOOK.md` · закрытие `PLATFORM_USER_MERGE_V2/STAGE_C_CLOSEOUT.md` · аудит `PLATFORM_USER_MERGE_V2/AUDIT_STAGE_C.md`
- **Video: переход на HLS (dual delivery с MP4, без простоя):** `VIDEO_HLS_DELIVERY/00-master-plan.md` · оглавление `VIDEO_HLS_DELIVERY/README.md` · журнал `VIDEO_HLS_DELIVERY/06-execution-log.md`

## Архив

- `archive/README.md`
