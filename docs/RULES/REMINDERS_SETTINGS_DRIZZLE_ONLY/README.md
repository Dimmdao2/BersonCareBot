# REMINDERS_SETTINGS_DRIZZLE_ONLY

Инициатива: **новый DDL** по напоминаниям и админ-настройкам в webapp — только через **Drizzle**; согласованные изменения с **integrator**; честное описание **Vitest / `migrate:legacy`**.

## Статус

**active** — документация и процесс закреплены (2026-05-13); дальнейшие фичи — по [`STAGE_PLAN.md`](./STAGE_PLAN.md) и [`LOG.md`](./LOG.md).

## Связь с каноном миграций webapp

Закрытая инициатива (архив): [`WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE`](../../archive/2026-05-initiatives/WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE/README.md) — production deploy вызывает только `pnpm --dir apps/webapp run migrate` (Drizzle); legacy в `apps/webapp/migrations/` — bootstrap / emergency, не обязательный шаг deploy.

Guard новых legacy-файлов: [`apps/webapp/scripts/check-legacy-migrations-frozen.sh`](../../../apps/webapp/scripts/check-legacy-migrations-frozen.sh) (`MAX_ALLOWED_PREFIX=86`).

Канонический migrate: `pnpm --dir apps/webapp run migrate` (см. [`apps/webapp/scripts/run-webapp-drizzle-migrate.mjs`](../../../apps/webapp/scripts/run-webapp-drizzle-migrate.mjs)).

## Документы

- [`STAGE_PLAN.md`](./STAGE_PLAN.md) — этапы и playbook webapp + integrator.
- [`LOG.md`](./LOG.md) — журнал исполнения по gates.

## Политика DDL в `public` (webapp)

Любые **новые или изменённые** объекты в схеме **`public`**, относящиеся к:

- `reminder_rules`, `reminder_journal`, `reminder_occurrence_history`, `reminder_delivery_events`;
- projection: `user_reminder_rules`, `user_reminder_occurrences`, `user_reminder_delivery_logs`, `projection_outbox`;
- `system_settings`;

— вносятся **только** через Drizzle: правки в [`apps/webapp/db/schema`](../../../apps/webapp/db/schema), затем `pnpm exec drizzle-kit generate` из каталога `apps/webapp`, ревью SQL в [`apps/webapp/db/drizzle-migrations`](../../../apps/webapp/db/drizzle-migrations) и журнал `meta/_journal.json`, применение `pnpm --dir apps/webapp run migrate`.

**Запрещено** добавлять новые файлы в [`apps/webapp/migrations`](../../../apps/webapp/migrations) для штатных фич. Исключение — согласованный emergency и явное повышение `MAX_ALLOWED_PREFIX` в `check-legacy-migrations-frozen.sh` с записью в `LOG.md`.

Интеграционные ключи и URI — не через env: только [`ALLOWED_KEYS`](../../../apps/webapp/src/modules/system-settings/types.ts) и admin Settings (`updateSetting`, зеркало в integrator по правилам репозитория).

## Терминология: `public` vs `integrator`

- **`public`** — webapp, Drizzle-миграции; таблицы выше в Drizzle schema.
- **`integrator`** — отдельные SQL-миграции приложения integrator ([`apps/integrator/src/infra/db/migrations/core`](../../../apps/integrator/src/infra/db/migrations/core)), в SQL по возможности явно **`integrator.`** для таблиц зоны integrator.

**Омоним:** имя `user_reminder_rules` есть в **`public`** (projection) и в **`integrator.user_reminder_rules`** — в PR и миграциях всегда указывать схему.

## Тесты и `migrate:legacy`

См. раздел в [`STAGE_PLAN.md`](./STAGE_PLAN.md) и записи в [`LOG.md`](./LOG.md). По умолчанию Vitest globalSetup **не меняется** без отдельного решения в `LOG` и проверок из плана исполнения.
