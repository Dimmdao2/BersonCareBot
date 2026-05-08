# Документация проекта

- **Backlog (security, rate limit, observability, URL/UUID в адресах):** [`TODO.md`](TODO.md)
- **Архив (завершённые инициативы и разовые журналы):** [`archive/README.md`](archive/README.md)
- **Операционные отчёты / runbook:** [`REPORTS/README.md`](REPORTS/README.md)
- **Шаблон программы: развёртывание комплекса ЛФК в упражнения** — журнал исполнения [`TREATMENT_PROGRAM_LFK_TEMPLATE_EXPAND/LOG.md`](TREATMENT_PROGRAM_LFK_TEMPLATE_EXPAND/LOG.md); post-prod legacy [`TREATMENT_PROGRAM_LFK_TEMPLATE_LEGACY_TODO.md`](TREATMENT_PROGRAM_LFK_TEMPLATE_LEGACY_TODO.md).

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
- [`ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`](ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md) — стандарт patient UI: shared primitives, shadcn base, запрет лишнего custom chrome.
- [`ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md`](ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md) — программа лечения (пациент): видимость пунктов этапа, composition modal vs основные поверхности, `test_set`, модалка пункта; тело этапа на `/app/patient/treatment/[instanceId]` (вкладка «Программа», без отдельного маршрута этапа у пациента); страница пункта `/item/[itemId]` и query `nav` / `planTab` / `testId`.
- [`ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md`](ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md) — пациентское файловое видео: единый плеер `PatientMediaPlaybackVideo`, playback JSON, HLS vs MP4 без выбора пользователем.
- [`ARCHITECTURE/MEDIA_HTTP_ACCESS_AUTHORIZATION.md`](ARCHITECTURE/MEDIA_HTTP_ACCESS_AUTHORIZATION.md) — кто может дергать `/api/media/*` и playback: сессия и строка в БД; отсутствие per-patient ACL; связь с экранами контента и программы лечения.
- [`ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md`](ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md) — CMS врача, `MediaPickerShell`, мягкая деградация UI.
- [`ARCHITECTURE/EXERCISES_CATALOG_PERFORMANCE_PRIMITIVES.md`](ARCHITECTURE/EXERCISES_CATALOG_PERFORMANCE_PRIMITIVES.md) — переиспользуемые примитивы каталогов (`CatalogSplitLayout`, `VirtualizedItemGrid`).
- [`ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`](ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md) — вебхук, `rubitime_events`, статусы 0–7, throttle 5500ms; Google Calendar: описание события (комментарии клиента/админа).
- [`MEDIA_PREVIEW_PIPELINE.md`](MEDIA_PREVIEW_PIPELINE.md) · [`ARCHITECTURE/MEDIA_PREVIEW_FRONTEND.md`](ARCHITECTURE/MEDIA_PREVIEW_FRONTEND.md) — превью медиатеки S3, воркер, UI-инварианты.
- [`ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md`](ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md) — composition roots, DI, **API route import-policy** (актуальное состояние allowlist).
- [`ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md`](ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md) · [`ARCHITECTURE/MINIAPP_AUTH_AUDIT_2026-04-19.md`](ARCHITECTURE/MINIAPP_AUTH_AUDIT_2026-04-19.md) — журнал исполнения и итоговый аудит server-first входа.
- **Скрипты webapp / ops:** [`apps/webapp/scripts/README.md`](../apps/webapp/scripts/README.md) · [`apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md`](../apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md).

## Активные инициативы

- **App Restructure (global IA/CMS roadmap):** [`APP_RESTRUCTURE_INITIATIVE/README.md`](APP_RESTRUCTURE_INITIATIVE/README.md) · [`APP_RESTRUCTURE_INITIATIVE/STRUCTURE_AUDIT.md`](APP_RESTRUCTURE_INITIATIVE/STRUCTURE_AUDIT.md) · [`APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md`](APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md) · [`APP_RESTRUCTURE_INITIATIVE/CONTENT_PLAN.md`](APP_RESTRUCTURE_INITIATIVE/CONTENT_PLAN.md) (материалы главной пациента) · [`APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) (актуальный статус: блок «Назначения» врача — практически закрыт; **§1.2 дневник** — тех. хвост в коде 2026-05-04, UX «сегодня» в backlog; курсы — отложены; см. шапку roadmap и [`APP_RESTRUCTURE_INITIATIVE/LOG.md`](APP_RESTRUCTURE_INITIATIVE/LOG.md)) · закрывающие аудиты: [`APP_RESTRUCTURE_INITIATIVE/done/MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md`](APP_RESTRUCTURE_INITIATIVE/done/MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md), [`APP_RESTRUCTURE_INITIATIVE/done/PATIENT_MAINTENANCE_MODE_EXECUTION_AUDIT.md`](APP_RESTRUCTURE_INITIATIVE/done/PATIENT_MAINTENANCE_MODE_EXECUTION_AUDIT.md); план-зеркало batch: [`APP_RESTRUCTURE_INITIATIVE/done/MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md`](APP_RESTRUCTURE_INITIATIVE/done/MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md).
- **Operator Health & Alerting (мониторинг интеграций, алерты админу, UI):** [`OPERATOR_HEALTH_ALERTING_INITIATIVE/README.md`](OPERATOR_HEALTH_ALERTING_INITIATIVE/README.md) · [`OPERATOR_HEALTH_ALERTING_INITIATIVE/MASTER_PLAN.md`](OPERATOR_HEALTH_ALERTING_INITIATIVE/MASTER_PLAN.md).
- **Операционный backlog хвостов:** [`BACKLOG_TAILS.md`](BACKLOG_TAILS.md).
- **Ревизия Cursor-планов:** [`CURSOR_PLANS_REVIEW_2026-05-01.md`](CURSOR_PLANS_REVIEW_2026-05-01.md).

## Архив

- [`archive/2026-04-docs-cleanup/README.md`](archive/2026-04-docs-cleanup/README.md) — разовые agent-журналы, UX-снимки, пакет аудита TEST_AND_API_DI.
- [`archive/2026-04-initiatives/`](archive/2026-04-initiatives/) — завершённые инициативы (AUTH, WEBAPP_FIRST_PHONE_BIND, PLATFORM_IDENTITY_ACCESS, PLATFORM_USER_MERGE_V2, TIMEZONE, SETTINGS_ADMIN, BRANCH_UX_CMS_BOOKING, …).
- [`archive/2026-05-initiatives/`](archive/2026-05-initiatives/) — завершённые patient/doctor инициативы, перенесённые из активных (home redesign, visual redesign, style transfer, treatment program, patient home CMS workflow, пустой черновой pages-visual), плюс **VIDEO_HLS_DELIVERY** (фазы 01–10, см. [`archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/README.md`](archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/README.md)); execution-пакеты **PROGRAM_PATIENT_SHAPE** (A1–A5) и **ASSIGNMENT_CATALOGS_REWORK** (B1–B7, defer D1–D6) — см. [`archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md`](archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md), [`archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/README.md`](archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/README.md) (продуктовые ТЗ остаются в [`APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md), [`APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md)); **PATIENT_APP_SHADCN_ALIGNMENT** (Phases 0–6, архив 2026-05-05) — [`archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/README.md`](archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/README.md) · [`LOG.md`](archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/LOG.md); **PATIENT_TREATMENT_PROGRAMS_POLISH** (A/B/C, архив 2026-05-05) — [`archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/README.md`](archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/README.md); новые переработки страниц — [`APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §1 п.4.
- [`archive/README.md`](archive/README.md) — старые аудиты 2026-03 и ранее.
