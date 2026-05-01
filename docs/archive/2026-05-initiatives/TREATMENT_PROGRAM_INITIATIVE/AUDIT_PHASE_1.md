# AUDIT — Фаза 1 (Drizzle ORM setup)

**Дата:** 2026-04-18.  
**Scope:** `apps/webapp/package.json`, `drizzle.config.ts`, `DATABASE_URL`, агрегат `db/schema/*`, `drizzle.smoke.test.ts`, регрессия `pnpm test:webapp`, сверка с `SYSTEM_LOGIC_SCHEMA.md` § 12.

---

## Краткий вердикт

| # | Проверка | Статус |
|---|-----------|--------|
| 1 | `drizzle-orm` / `drizzle-kit` в зависимостях webapp | **PASS** |
| 2 | `drizzle.config.ts` и источник `DATABASE_URL` | **PASS** |
| 3 | Схема Drizzle ↔ таблицы `public` в БД | **PASS** — `db:verify-public-table-count` **OK** при 108 таблицах; миграции Drizzle применимы через `db:migrate:drizzle` (см. §3) |
| 4 | Smoke-тест | **PASS** (с `USE_REAL_DATABASE=1` + `DATABASE_URL`) |
| 5 | Существующие тесты | **PASS** |
| 6 | Сверка с `SYSTEM_LOGIC_SCHEMA.md` § 12 | **PASS** (§ 12 уточнён в ходе аудита) |

---

## 1) `drizzle-orm` и `drizzle-kit` в `apps/webapp/package.json`

### Verdict: **PASS**

| Пакет | Раздел | Версия в манифесте |
|--------|--------|---------------------|
| `drizzle-orm` | `dependencies` | `^0.44.7` |
| `drizzle-kit` | `devDependencies` | `^0.31.10` |

---

## 2) `drizzle.config.ts`: корректность и `DATABASE_URL`

### Verdict: **PASS**

| Критерий | Результат |
|----------|-----------|
| Файл | `apps/webapp/drizzle.config.ts` |
| Диалект | `postgresql` |
| `DATABASE_URL` | Через `dotenv`: сначала `apps/webapp/.env.dev`, затем `.env` — **тот же порядок**, что комментируется для согласования с `src/config/loadEnv.ts` (в dev; без `ENV_FILE` приложение использует ту же пару файлов). |
| `schema` | Массив файлов: `schema.ts`, `clinicalTests.ts`, `recommendations.ts`, `treatmentProgramTemplates.ts`, `treatmentProgramInstances.ts`, `entityComments.ts` — **согласовано** с `db/schema/index.ts`. |
| `out` | `./db/drizzle-migrations` (отдельно от legacy SQL `apps/webapp/migrations/`). |
| Без `DATABASE_URL` | При запуске `drizzle-kit` конфиг **бросает** понятную ошибку — ожидаемо для CLI. |

**Замечание:** рантайм-валидация env — Zod в `src/config/env.ts` после `loadEnv`; kit читает только `dotenv`. Источник строки подключения при локальной разработке совпадает по файлам; расхождение возможно только при экспорте `DATABASE_URL` только в shell.

---

## 3) Schema files vs таблицы БД (`public`)

### Verdict: **PASS по полноте описания в коде; verify — после FIX**

| Источник | Значение |
|----------|----------|
| `pgTable` в `db/schema/schema.ts` | **97** |
| Доп. файлы (`clinicalTests`, `recommendations`, `treatmentProgramTemplates`, `treatmentProgramInstances`, `entityComments`) | **11** |
| **Всего** `export const … = pgTable(` в наборах из `drizzle.config.ts` | **108** |
| `db/schema/relations.ts` | Только `relations()`, в подсчёт таблиц **не** входит |

**Оговорки (как в прошлых аудитах):**

- Introspection / контракт webapp ориентирован на схему **`public`**. Другие схемы PostgreSQL при появлении требований нужно явно включать в конфиг kit.
- **Views / matviews** в классическом table-introspect — отдельная тема при использовании в коде.

**Скрипт `db:verify-public-table-count` (MANDATORY FIX #1):** суммирует `pgTable` по тем же путям, что массив `schema` в `drizzle.config.ts` (и дублирующий список в скрипте — **синхронизировать** при добавлении файла).

**Миграции `drizzle-kit migrate` (MANDATORY FIX — закрыт в AUDIT_PHASE_1 FIX):**

- Файл **`0000_wandering_famine.sql`** ранее содержал только закомментированный introspect-снимок; внутри комментария встречались строки `--> statement-breakpoint`, из-за чего migrator нарезал **невыполнимые** чанки и `drizzle-kit migrate` завершался с **кодом 1** без явной ошибки.
- **Исправление:** `0000` заменён на исполняемый no-op (`SELECT 1`) + комментарий; полный архив старого содержимого — в истории git.
- **`pnpm --dir apps/webapp run db:migrate:drizzle`** — обёртка над `drizzle-kit migrate`.
- Если SQL из `0001`–`0004` уже применён вручную, а `drizzle.__drizzle_migrations` пуста — **`pnpm --dir apps/webapp run db:seed-drizzle-meta`** вставляет метаданные (hash + `created_at` из `meta/_journal.json`) **без** повторного выполнения SQL; затем `db:migrate:drizzle` идемпотентен.

**Порядок на пустой БД:** сначала legacy `pnpm --dir apps/webapp run migrate:legacy` (SQL в `apps/webapp/migrations/`), затем Drizzle **`pnpm --dir apps/webapp run migrate`** (`0000`… и далее по журналу).

---

## 4) Smoke-тест

### Verdict: **PASS**

| Элемент | Описание |
|---------|----------|
| Файл | `apps/webapp/src/app-layer/db/drizzle.smoke.test.ts` |
| Действие | `getDrizzle()` + `db.execute(sql\`select 1 as n\`)` |
| Обычный `pnpm test` | `it.skipIf(!hasRealDb)` — **пропуск** без `USE_REAL_DATABASE=1` и `DATABASE_URL` (как в `EXECUTION_RULES.md`). |
| Прогон с реальной БД | `USE_REAL_DATABASE=1 pnpm --dir apps/webapp exec vitest run src/app-layer/db/drizzle.smoke.test.ts` — **PASS** (на момент аудита). |

`getDrizzle()` в `app-layer/db/drizzle.ts` использует **тот же** `pg.Pool`, что `getPool()` — дубля подключений нет.

---

## 5) Существующие тесты

### Verdict: **PASS**

```bash
pnpm test:webapp
```

На момент аудита: **363** test files passed (**5** skipped), **1845** tests passed (**8** skipped) — регрессий, связанных с Drizzle setup, не выявлено.

---

## 6) Сверка с `SYSTEM_LOGIC_SCHEMA.md` § 12

Эталон (сокращённо):

```
app/api/**/route.ts  →  modules/<domain>/ (service, ports, types)
  →  db/schema/  →  infra/repos/pg*.ts
```

**Соответствие:**

| Ожидание § 12 | Факт в репозитории |
|---------------|-------------------|
| `db/schema/` как слой описания таблиц | Да: `apps/webapp/db/schema/*`, реэкспорт через `index.ts`, подключение в `getDrizzle({ schema })`. |
| Маршруты тонкие, логика в modules | Ограничивается фазой 0 + `EXECUTION_RULES` / cursor rules; к Drizzle относится косвенно — **OK**. |
| Data access в infra | Репозитории `infra/repos/pg*.ts` используют Drizzle / pool по принятой архитектуре. |

**Уточнение:** после правки § 12 эталон явно фиксирует **реализацию портов в `infra/repos`** и Drizzle из `db/schema/`; запреты согласованы с `EXECUTION_RULES` и legacy allowlist в `modules/*`.

---

## Gate фазы 1 (из `MASTER_PLAN.md`)

| Критерий | Статус |
|----------|--------|
| Drizzle установлен, schema отражает БД (`public`) | **OK** — verify + применённые миграции Drizzle |
| Smoke / тесты | **OK** |

---

## MANDATORY FIX INSTRUCTIONS

1. **Скрипт `verify-drizzle-public-table-count` vs split-schema (critical):**  
   **Закрыто (2026-04-18):** скрипт суммирует `pgTable` по всем файлам из массива `schema` в `drizzle.config.ts`. При добавлении нового файла схемы — **добавить путь и в `drizzle.config.ts`, и в `SCHEMA_FILES` внутри скрипта** (или вынести общий список в один модуль — опциональное улучшение).

2. **Документация § 12 vs EXECUTION_RULES (minor):**  
   **Закрыто (2026-04-18):** в `SYSTEM_LOGIC_SCHEMA.md` § 12 диаграмма и пояснение приведены к канону `infra/repos` + порты; убрана двусмысленность «inline в service» без отмены `EXECUTION_RULES`.

3. **Операционный контур:**  
   При MISMATCH: при необходимости `migrate:legacy` на новой БД — затем **`pnpm --dir apps/webapp run migrate`** или `db:migrate:drizzle`. Если SQL уже вручную — `db:seed-drizzle-meta`, затем снова `migrate` / `db:migrate:drizzle`. В CI без `DATABASE_URL` verify — **SKIP** (exit 0).

4. **`drizzle-kit migrate` падает на 0000 (major):**  
   **Закрыто (AUDIT_PHASE_1 FIX):** см. §3 — новый `0000`, скрипты `db:migrate:drizzle`, `db:seed-drizzle-meta`.

5. **Единый список путей schema для verify vs `drizzle.config` (minor):**  
   **Defer:** дублирование `SCHEMA_FILES` / массива `schema` остаётся; при добавлении файла править оба места (или вынести JSON — отдельный рефакторинг).

---

## Команды для повторной проверки

```bash
# Зависимости
cat apps/webapp/package.json | rg 'drizzle'

# Lint / typecheck / тесты webapp
pnpm --dir apps/webapp run lint
pnpm --dir apps/webapp run typecheck
pnpm test:webapp

# Smoke с БД
USE_REAL_DATABASE=1 pnpm --dir apps/webapp exec vitest run src/app-layer/db/drizzle.smoke.test.ts

# Сверка числа таблиц (нужен DATABASE_URL)
pnpm --dir apps/webapp run db:verify-public-table-count

# Миграции Drizzle (после migrate:legacy на свежей БД, если нужен legacy SQL)
pnpm --dir apps/webapp run migrate

# Только метаданные журнала (если SQL уже применён вручную)
pnpm --dir apps/webapp run db:seed-drizzle-meta
```

---

## FIX verification — 2026-04-18

| # | Инструкция | Статус |
|---|----------------|--------|
| 1 | Verify по всем schema-файлам | **Закрыт** — `scripts/verify-drizzle-public-table-count.mjs` |
| 2 | Уточнить § 12 | **Закрыт** — `SYSTEM_LOGIC_SCHEMA.md` § 12 |
| 3 | Миграции / операционный контур | **Закрыт** — `0000` no-op, `db:migrate:drizzle`, `db:seed-drizzle-meta`, verify **OK** на БД с 108 таблицами |
| 4 | Единый manifest путей schema | **Defer** — см. MANDATORY FIX #5 |

---

## Статус закрытия AUDIT_PHASE_1 FIX (повторный прогон)

**Дата:** 2026-04-18.

- Critical/major из MANDATORY: **закрыты** (verify split-schema — ранее; migrate/0000/seed — в этом FIX).
- Minor #5: **defer** (см. выше).
- `drizzle.config.ts` и `db/schema/*`: без изменений в этом FIX; согласованы с БД после миграций + verify.
- Smoke-read: **PASS** с `USE_REAL_DATABASE=1`.
- Step/phase: `typecheck`, `lint`, `test:webapp` — **PASS** (зафиксировано в `LOG.md`).
