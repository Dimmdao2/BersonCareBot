# Документация проекта

- **Backlog (security, rate limit, observability):** [`TODO.md`](TODO.md)
- **Архив (завершённые инициативы и разовые журналы):** [`archive/README.md`](archive/README.md)
- **Операционные отчёты / runbook:** [`REPORTS/README.md`](REPORTS/README.md)

## Архитектура и эксплуатация

- [`ARCHITECTURE/SERVER CONVENTIONS.md`](ARCHITECTURE/SERVER%20CONVENTIONS.md) — среда выполнения, пути, сервисы (источник фактов для деплоя).
- [`ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`](ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md) — единая PostgreSQL (`public` / `integrator`), прямой SQL vs очередь.
- [`ARCHITECTURE/DB_STRUCTURE.md`](ARCHITECTURE/DB_STRUCTURE.md) — карта таблиц.
- [`ARCHITECTURE/PRODUCTION_DB_INVENTORY_2026-04-13.md`](ARCHITECTURE/PRODUCTION_DB_INVENTORY_2026-04-13.md) — снимок production.
- [`ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md) — env vs `system_settings`.
- [`ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md`](ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md) — tier guest/onboarding/patient, канон, trusted phone: нормативная спецификация.
- [`ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`](ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md) — сценарии и привязка к коду (trusted paths, ops-скрипты §8).
- [`ARCHITECTURE/PLATFORM_USER_MERGE.md`](ARCHITECTURE/PLATFORM_USER_MERGE.md) — canonical user, logical merge, миграции 061-064.
- [`ARCHITECTURE/SPECIALIST_CABINET_STRUCTURE.md`](ARCHITECTURE/SPECIALIST_CABINET_STRUCTURE.md) — кабинет специалиста (header, layout, карточка клиента, вкладки settings).
- [`ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md`](ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md) — CMS врача, `MediaPickerShell`, мягкая деградация UI.
- [`ARCHITECTURE/EXERCISES_CATALOG_PERFORMANCE_PRIMITIVES.md`](ARCHITECTURE/EXERCISES_CATALOG_PERFORMANCE_PRIMITIVES.md) — переиспользуемые примитивы каталогов (`CatalogSplitLayout`, `VirtualizedItemGrid`).
- [`ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`](ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md) — вебхук, `rubitime_events`, статусы 0–7, throttle 5500ms.
- [`MEDIA_PREVIEW_PIPELINE.md`](MEDIA_PREVIEW_PIPELINE.md) · [`ARCHITECTURE/MEDIA_PREVIEW_FRONTEND.md`](ARCHITECTURE/MEDIA_PREVIEW_FRONTEND.md) — превью медиатеки S3, воркер, UI-инварианты.
- [`ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md`](ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md) — composition roots, DI, **API route import-policy** (актуальное состояние allowlist).
- [`ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md`](ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md) · [`ARCHITECTURE/MINIAPP_AUTH_AUDIT_2026-04-19.md`](ARCHITECTURE/MINIAPP_AUTH_AUDIT_2026-04-19.md) — журнал исполнения и итоговый аудит server-first входа.
- **Скрипты webapp / ops:** [`apps/webapp/scripts/README.md`](../apps/webapp/scripts/README.md) · [`apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md`](../apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md).

## Активные инициативы

- **App Restructure (global IA/CMS roadmap):** [`APP_RESTRUCTURE_INITIATIVE/README.md`](APP_RESTRUCTURE_INITIATIVE/README.md) · [`APP_RESTRUCTURE_INITIATIVE/STRUCTURE_AUDIT.md`](APP_RESTRUCTURE_INITIATIVE/STRUCTURE_AUDIT.md) · [`APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md`](APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md).
- **Patient App Shadcn Alignment:** [`PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/README.md`](PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/README.md) · [`PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/MASTER_PLAN.md`](PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/MASTER_PLAN.md) · [`PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/AUDIT_RESULTS.md`](PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/AUDIT_RESULTS.md) · [`PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/TASKS.md`](PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/TASKS.md) · [`PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/LOG.md`](PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/LOG.md).
- **Video: переход на HLS:** [`VIDEO_HLS_DELIVERY/README.md`](VIDEO_HLS_DELIVERY/README.md) · [`VIDEO_HLS_DELIVERY/00-master-plan.md`](VIDEO_HLS_DELIVERY/00-master-plan.md).
- **Операционный backlog хвостов:** [`BACKLOG_TAILS.md`](BACKLOG_TAILS.md).
- **Ревизия Cursor-планов:** [`CURSOR_PLANS_REVIEW_2026-05-01.md`](CURSOR_PLANS_REVIEW_2026-05-01.md).

## Архив

- [`archive/2026-04-docs-cleanup/README.md`](archive/2026-04-docs-cleanup/README.md) — разовые agent-журналы, UX-снимки, пакет аудита TEST_AND_API_DI.
- [`archive/2026-04-initiatives/`](archive/2026-04-initiatives/) — завершённые инициативы (AUTH, WEBAPP_FIRST_PHONE_BIND, PLATFORM_IDENTITY_ACCESS, PLATFORM_USER_MERGE_V2, TIMEZONE, SETTINGS_ADMIN, BRANCH_UX_CMS_BOOKING, …).
- [`archive/2026-05-initiatives/`](archive/2026-05-initiatives/) — завершённые patient/doctor инициативы, перенесённые из активных (home redesign, visual redesign, style transfer, treatment program, patient home CMS workflow, пустой черновой pages-visual).
- [`archive/README.md`](archive/README.md) — старые аудиты 2026-03 и ранее.
