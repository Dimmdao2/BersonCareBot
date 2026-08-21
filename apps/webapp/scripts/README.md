# Скрипты webapp (`apps/webapp/scripts`)

Утилиты для миграций данных, сверок, разовых правок и админ-операций. Запуск — обычно через `pnpm --dir apps/webapp exec tsx scripts/<file> …` с корректным `DATABASE_URL` (см. шапки файлов и [`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../../../docs/ARCHITECTURE/SERVER%20CONVENTIONS.md)).

**Схема БД webapp:** канонический прогон — `pnpm --dir apps/webapp run migrate` (Drizzle через `run-webapp-drizzle-migrate.mjs`). Legacy SQL из каталога `apps/webapp/migrations/` — только emergency/bootstrap путь через `pnpm --dir apps/webapp run migrate:legacy` (`run-migrations.mjs`) с явным режимом `WEBAPP_LEGACY_MIGRATIONS_MODE=bootstrap|emergency`.

CI guardrail: `check-legacy-migrations-frozen.sh` блокирует добавление новых legacy-файлов с префиксом выше текущего baseline (`086_*`). Для штатных изменений схемы используйте только `apps/webapp/db/drizzle-migrations/*.sql`.

**Напоминания и админ-настройки (`reminder_*`, `system_settings`, projection):** канон DDL только Drizzle и согласование с integrator — см. [`docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/README.md`](../../../docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/README.md) и [`STAGE_PLAN.md`](../../../docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/STAGE_PLAN.md).

**Процесс `pnpm worker:start` (integrator)** эти файлы **не запускает**. Он гоняет job queue и projection outbox → события уходят в webapp по HTTP и обрабатываются продуктовым кодом (tier/trust там же, что при webhook). Подробнее: [`PLATFORM_IDENTITY_OPS.md`](PLATFORM_IDENTITY_OPS.md) §3.

## Идентичность, телефон и tier patient (обход UI)

Любой SQL или скрипт, меняющий `platform_users` и телефон, может рассинхронизировать продуктовую модель **guest / onboarding / patient**, если не учесть колонку **`patient_phone_trust_at`**.

- **[PLATFORM_IDENTITY_OPS.md](PLATFORM_IDENTITY_OPS.md)** — обязательный чек-лист: когда выставлять доверие, предпочтение продуктовых путей merge/purge, что делать с backfill-скриптами.
- Карта trusted writers в коде и контекст: [`docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`](../../../docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md) §8.
- Управление пользователем по номеру (очистка, перенос, integrator): **[user-phone-admin.ts](user-phone-admin.ts)** (в шапке — команды и переменные окружения).

Все disposable/private-PostgreSQL proofs (quota/payment/invite/settings и общий postgres-integration harness)
удалены вместе с A0. Реальное DB-поведение нельзя объявлять заменённым unit/static gate: для именованного DEV есть
один fail-closed product-path runner `pnpm --dir apps/webapp run test:db-behavior:named-dev`. Он не принимает URL
или target, читает только канонические `/home/dev/dev-projects/BersonCareBot/.env` и
`/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev`, требует все четыре port-context URL к exact
`bcb_webapp_dev` и обращается к БД только через штатные HTTP/application/Drizzle ports общего сервера `:5200`.
Runner сериализован, использует парные DEV-роли для tenant-negative checks, откатывает обратимые настройки и
завершает созданные сущности только штатными cancel/delete; retained audit/history/message rows получают
unique run tag. Self-test проверяет реальные канонические env-файлы и отказ от подмены target, но не подключается
к БД, не обращается к webapp и ничего не меняет:
`pnpm --dir apps/webapp run test:db-behavior:named-dev:self-test`. Точный coverage/blocker census ведётся в
[`B0_NAMED_DEV_DB_BEHAVIOR_MATRIX_2026-08-17.md`](../../../docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_MATRIX_2026-08-17.md).

## Прочие файлы

Live DEV/TEST fixture machinery removed 21.08.2026. Do not create, seed, reconcile or require persistent fixture
clinics, users or datasets; use the already registered owner accounts and clinics under `AGENTS.md` §1b.

Остальные скрипты (`backfill-*`, `reconcile-*`, `*.sql`, …) — назначение и параметры в комментариях в начале каждого файла.

**Rubitime выведено 2026-07-27.** Старые mapping/CSV one-shot удалены из `apps/webapp/scripts` и не являются
доступными operator-командами. Исторические планы и результаты собраны только для чтения в
[`docs/archive/2026-07-rubitime-retirement/`](../../../docs/archive/2026-07-rubitime-retirement/README.md);
восстанавливать или запускать удалённые инструменты по архивным инструкциям нельзя.

**Фон CMS-медиа (превью):** [`media-preview-process-tick.ts`](media-preview-process-tick.ts) — батч `processMediaPreviewBatch` вне Next; запуск `pnpm run media-preview:tick` (см. `deploy/HOST_DEPLOY_README.md`, `docs/MEDIA_PREVIEW_PIPELINE.md`).

**Программы лечения — битые снимки после editor-batch:** [`backfill-treatment-program-editor-draft-snapshots.ts`](backfill-treatment-program-editor-draft-snapshots.ts) — пересборка `treatment_program_instance_stage_items.snapshot` из каталога (`buildSnapshot`); runbook: [`docs/OPERATIONS/TREATMENT_PROGRAM_EDITOR_DRAFT_SNAPSHOT_BACKFILL.md`](../../../docs/OPERATIONS/TREATMENT_PROGRAM_EDITOR_DRAFT_SNAPSHOT_BACKFILL.md). Команда: `pnpm run backfill-treatment-program-editor-draft-snapshots` (dry-run, `--commit` для записи; `--all` — все кандидаты батчами).

## SaaS isolation diagnostics

`report-saas-isolation-diagnostics.ts` accepts only closed, redacted classes and normalized route/job-family keys.
Event writes use the ambient EXECUTE-only writer role; `read` and `coverage` require the separate infrastructure
login in `SAAS_ISOLATION_OPERATOR_DATABASE_URL`. Ambient app/bootstrap roles cannot read, record coverage or resolve.
Run `pnpm --dir apps/webapp exec tsx scripts/report-saas-isolation-diagnostics.ts read`; coverage also requires a
caller-generated UUID `--id`. SQL, payloads and identity fields are never accepted.

The shared TEST deploy closure invokes the generic `post-runtime-gate` command only after locked services, health,
nginx and product smoke have passed. It reads diagnostics before recording coverage, records all six required process
families, and rereads the exact fresh run. Active unexplained events fail before or after the write; output contains
only status/counts and never the coverage UUID, event identifiers, database URL, SQL or identity data.
