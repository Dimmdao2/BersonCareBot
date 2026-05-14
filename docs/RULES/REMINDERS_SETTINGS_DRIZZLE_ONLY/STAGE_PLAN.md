# STAGE_PLAN — REMINDERS_SETTINGS_DRIZZLE_ONLY

## Порядок исполнения (gates)

**0 → 1 → 2 → 3 → финал.** После каждого этапа — блок в [`LOG.md`](./LOG.md).

| Этап | Содержание |
|------|------------|
| 0 | Папка инициативы, README, STAGE_PLAN, LOG |
| 1 | `docs/README` + политика в README инициативы + `apps/webapp/scripts/README` |
| 2 | Playbook ниже (полный чеклист PR) |
| 3 | Vitest / CI / legacy: документация + backlog в LOG |
| Финал | `pnpm install --frozen-lockfile && pnpm run ci` из корня репозитория |

---

## Playbook: одна фича = webapp Drizzle + integrator SQL

### 0. Имена таблиц и схем (ревью миграций)

Полный перечень объектов **`public`** в зоне напоминаний / проекций / настроек — в [`README.md`](./README.md) §«Политика DDL в `public`» (в т.ч. `reminder_rules`, projection-таблицы вроде `user_reminder_rules`, `system_settings`).

В **`integrator`** для этой зоны типичны **`integrator.user_reminder_rules`** (не путать с одноимённой projection в `public`) и **`integrator.system_settings`** (зеркало ключей, см. §4).

Перед merge полезно прогнать по **новым** файлам миграций:

`rg "user_reminder_rules|reminder_rules|system_settings" apps/webapp/db/drizzle-migrations apps/integrator/src/infra/db/migrations/core`

### 1. Изменения только в `public` (webapp)

1. Правки схемы: [`apps/webapp/db/schema`](../../../apps/webapp/db/schema) (или вынесенные файлы схемы).
2. Из каталога `apps/webapp`: `pnpm exec drizzle-kit generate` — конфиг [`apps/webapp/drizzle.config.ts`](../../../apps/webapp/drizzle.config.ts).
3. Ревью сгенерированного SQL в `apps/webapp/db/drizzle-migrations/` и `meta/_journal.json`.
4. Локально: `pnpm --dir apps/webapp run migrate` ([`run-webapp-drizzle-migrate.mjs`](../../../apps/webapp/scripts/run-webapp-drizzle-migrate.mjs)).

Модули не импортируют `getPool` из infra напрямую — см. `.cursor/rules/clean-architecture-module-isolation.mdc`.

### 2. Параллельные изменения в `integrator`

1. Новый файл: [`apps/integrator/src/infra/db/migrations/core`](../../../apps/integrator/src/infra/db/migrations/core) с именем `YYYYMMDD_000N_description.sql`.
2. В SQL явно квалифицировать **`integrator.`** для таблиц integrator-схемы, где применимо.

**Глобальный порядок применения:** [`apps/integrator/src/infra/db/migrate.ts`](../../../apps/integrator/src/infra/db/migrate.ts) объединяет **core** и все [`src/integrations/*/db/migrations`](../../../apps/integrator/src/integrations) и сортирует миграции по **одному** полю `fileName`. Новое имя файла должно быть уникально среди всех scopes и корректно по лексикографическому порядку относительно существующих файлов (в т.ч. telegram / rubitime). Дублирующиеся префиксы даты в разных папках с одинаковым `fileName` недопустимы.

### 3. Порядок migrate на хосте

[`scripts/migrate-all.sh`](../../../scripts/migrate-all.sh):

1. `pnpm --dir apps/integrator run migrate`
2. `pnpm --dir apps/webapp run migrate`

### 4. `system_settings` и зеркало

Запись ключей в webapp — через сервис `updateSetting` и зеркалирование в integrator (см. `.cursor/rules/system-settings-integrator-mirror.mdc`). Не добавлять обходной ручной SQL в `public` для зеркала без согласованного пути.

### 5. Definition of Done одной фичи

- В одном PR (или в двух явно согласованных соседних PR с ссылками друг на друга): есть Drizzle-миграция webapp **и** при необходимости SQL-миграция integrator.
- В описании PR указаны затронутые схемы (`public` / `integrator`) для таблиц с похожими именами.

---

## Vitest, CI и `migrate:legacy`

### Фактическое поведение

- [`apps/webapp/vitest.globalSetup.ts`](../../../apps/webapp/vitest.globalSetup.ts): при заданном `DATABASE_URL` выполняется `pnpm run migrate:legacy`, затем `pnpm run migrate`.
- GitHub Actions [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml): job `test-webapp-core` (matrix `VITEST_SHARD` 1/3–3/3 + кэш Vitest) на **каждом** PR/push запускает `pnpm test:webapp:fast`; job `test-webapp-inprocess` с тем же шардированием — **только** на `push` в `main` и `pnpm test:webapp:inprocess`. Полный набор как у локального `pnpm test:webapp` — на `main` и при локальном `pnpm run ci`. Все webapp-тесты в CI **без** `DATABASE_URL` → globalSetup **сразу выходит**, миграции в CI не выполняются.

Это **не отменяет** политику «новый DDL только Drizzle»: legacy нужен для **bootstrap / существующей** тестовой БД, а не как канал для новых штатных DDL.

### Backlog (см. `LOG.md`)

- **B1:** CI/job с заранее подготовленной БД — Drizzle-only в globalSetup при наличии дампа.
- **B2:** условный пропуск `migrate:legacy` после дизайна детектора «схема полная» (риск false positives).

Правка `vitest.globalSetup.ts` (например опциональный `VITEST_SKIP_LEGACY_MIGRATE`) — только после явного решения в `LOG` и минимального патча с прогонами; в рамках текущего закрытия инициативы см. `LOG.md`.

---

## Ссылки на правила

- `.cursor/rules/plan-authoring-execution-standard.mdc`
- `.cursor/rules/runtime-config-env-vs-db.mdc`
- `.cursor/rules/system-settings-integrator-mirror.mdc`
- `.cursor/rules/clean-architecture-module-isolation.mdc`
- `.cursor/rules/000-critical-integration-config-in-db.mdc`
