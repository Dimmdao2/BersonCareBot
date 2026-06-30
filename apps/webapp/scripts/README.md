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

## Прочие файлы

Остальные скрипты (`backfill-*`, `reconcile-*`, `*.sql`, …) — назначение и параметры в комментариях в начале каждого файла.

**Rubitime ↔ канон (переход):** [`rubitime-appointment-mapping-audit.sql`](rubitime-appointment-mapping-audit.sql) (dry-run метрики), [`backfill-rubitime-appointment-mappings.sql`](backfill-rubitime-appointment-mappings.sql) (восстановление `be_external_entity_mappings` для orphan `rubitime_projection`). См. [`docs/OWN_BOOKING_ENGINE_INITIATIVE/LOG.md`](../../../docs/OWN_BOOKING_ENGINE_INITIATIVE/LOG.md) §2026-05-30 transitional read. Перед изменением данных в `platform_users` сверяйтесь с **PLATFORM_IDENTITY_OPS.md**.

**Rubitime CSV → канон (записи + клиенты):** [`backfill-rubitime-records-and-clients.ts`](backfill-rubitime-records-and-clients.ts) — разовый перенос исторической выгрузки Rubitime (`records.csv` + `clients-2.csv`) в `appointment_records` + `platform_users`: вставка отсутствующих записей, создание клиентов по телефону, relink осиротевших записей. Dry-run по умолчанию, `--commit` для записи; идемпотентно. Команда `pnpm --dir apps/webapp run backfill-rubitime-records-and-clients`. Полный runbook, параметры и история прогонов: [`docs/OPERATIONS/RUBITIME_CSV_BACKFILL.md`](../../../docs/OPERATIONS/RUBITIME_CSV_BACKFILL.md).

**Фон CMS-медиа (превью):** [`media-preview-process-tick.ts`](media-preview-process-tick.ts) — батч `processMediaPreviewBatch` вне Next; запуск `pnpm run media-preview:tick` (см. `deploy/HOST_DEPLOY_README.md`, `docs/MEDIA_PREVIEW_PIPELINE.md`).

**Программы лечения — битые снимки после editor-batch:** [`backfill-treatment-program-editor-draft-snapshots.ts`](backfill-treatment-program-editor-draft-snapshots.ts) — пересборка `treatment_program_instance_stage_items.snapshot` из каталога (`buildSnapshot`); runbook: [`docs/OPERATIONS/TREATMENT_PROGRAM_EDITOR_DRAFT_SNAPSHOT_BACKFILL.md`](../../../docs/OPERATIONS/TREATMENT_PROGRAM_EDITOR_DRAFT_SNAPSHOT_BACKFILL.md). Команда: `pnpm run backfill-treatment-program-editor-draft-snapshots` (dry-run, `--commit` для записи; `--all` — все кандидаты батчами).
