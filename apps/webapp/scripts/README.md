# Скрипты webapp (`apps/webapp/scripts`)

Утилиты для миграций данных, сверок, разовых правок и админ-операций. Запуск — обычно через `pnpm --dir apps/webapp exec tsx scripts/<file> …` с корректным `DATABASE_URL` (см. шапки файлов и [`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../../../docs/ARCHITECTURE/SERVER%20CONVENTIONS.md)).

**Схема БД webapp:** канонический прогон — `pnpm --dir apps/webapp run migrate` (Drizzle через `run-webapp-drizzle-migrate.mjs`). Legacy SQL из каталога `apps/webapp/migrations/` — только через `pnpm --dir apps/webapp run migrate:legacy` (`run-migrations.mjs`).

CI guardrail: `check-legacy-migrations-frozen.sh` блокирует добавление новых legacy-файлов с префиксом выше текущего baseline (`086_*`). Для штатных изменений схемы используйте только `apps/webapp/db/drizzle-migrations/*.sql`.

**Напоминания и админ-настройки (`reminder_*`, `system_settings`, projection):** канон DDL только Drizzle и согласование с integrator — см. [`docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/README.md`](../../../docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/README.md) и [`STAGE_PLAN.md`](../../../docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/STAGE_PLAN.md).

**Процесс `pnpm worker:start` (integrator)** эти файлы **не запускает**. Он гоняет job queue и projection outbox → события уходят в webapp по HTTP и обрабатываются продуктовым кодом (tier/trust там же, что при webhook). Подробнее: [`PLATFORM_IDENTITY_OPS.md`](PLATFORM_IDENTITY_OPS.md) §3.

## Идентичность, телефон и tier patient (обход UI)

Любой SQL или скрипт, меняющий `platform_users` и телефон, может рассинхронизировать продуктовую модель **guest / onboarding / patient**, если не учесть колонку **`patient_phone_trust_at`**.

- **[PLATFORM_IDENTITY_OPS.md](PLATFORM_IDENTITY_OPS.md)** — обязательный чек-лист: когда выставлять доверие, предпочтение продуктовых путей merge/purge, что делать с backfill-скриптами.
- Карта trusted writers в коде и контекст: [`docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`](../../../docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md) §8.
- Управление пользователем по номеру (очистка, перенос, integrator): **[user-phone-admin.ts](user-phone-admin.ts)** (в шапке — команды и переменные окружения).

## Прочие файлы

Остальные скрипты (`backfill-*`, `reconcile-*`, `*.sql`, …) — назначение и параметры в комментариях в начале каждого файла. Перед изменением данных в `platform_users` сверяйтесь с **PLATFORM_IDENTITY_OPS.md**.

**Фон CMS-медиа (превью):** [`media-preview-process-tick.ts`](media-preview-process-tick.ts) — батч `processMediaPreviewBatch` вне Next; запуск `pnpm run media-preview:tick` (см. `deploy/HOST_DEPLOY_README.md`, `docs/MEDIA_PREVIEW_PIPELINE.md`).
