# AUDIT — Фаза 1 (Drizzle ORM setup)

**Дата:** 2026-04-18.  
**Scope:** зависимости `apps/webapp`, `drizzle.config.ts`, `apps/webapp/db/schema/*`, smoke-тест, регрессия тестов, сверка с `SYSTEM_LOGIC_SCHEMA.md` § 12.

---

## 1) `drizzle-orm` и `drizzle-kit` в `apps/webapp/package.json`

### Verdict: **PASS**

| Пакет | Где | Версия (зафиксировано в lock) |
|--------|-----|--------------------------------|
| `drizzle-orm` | `dependencies` | `^0.44.7` |
| `drizzle-kit` | `devDependencies` | `^0.31.10` |

---

## 2) `drizzle.config.ts`: корректность и `DATABASE_URL`

### Verdict: **PASS (с замечаниями)**

| Критерий | Результат |
|----------|-----------|
| Файл | `apps/webapp/drizzle.config.ts` |
| Диалект | `postgresql` |
| URL | `dbCredentials.url` = `process.env.DATABASE_URL` после `dotenv`: сначала `apps/webapp/.env.dev`, затем `.env` (переопределение) — **согласовано по порядку** с `src/config/loadEnv.ts` |
| Схема Drizzle | `schema: "./db/schema"` |
| Вывод артефактов kit | `out: "./db/drizzle-migrations"` (**отдельно** от legacy SQL `apps/webapp/migrations/`) |
| Загрузка без `DATABASE_URL` | При `import` конфига выбрасывается ошибка — **ожидаемо** для `drizzle-kit`; `tsc` не исполняет конфиг при проверке типов |

**Замечание:** приложение в рантайме валидирует env через Zod (`src/config/env.ts`), а конфиг Drizzle Kit читает только `dotenv`. Источник строки подключения тот же набор файлов — расхождение возможно только при ручном задании `DATABASE_URL` в shell без файлов env.

---

## 3) Schema files vs «все таблицы БД»

### Verdict: **PASS для схемы `public` (типичный контракт webapp)**

| Факт | Значение |
|------|-----------|
| `export const … = pgTable(` в `db/schema/schema.ts` | **97** определений |
| Лог `drizzle-kit introspect` (фаза 1) | `Pulling from ['public']` — **97 tables fetched** |
| `relations.ts` | Сгенерирован, импортирует таблицы из `./schema` |

**Оговорки:**

- Introspection охватывает схему **`public`** (как в логе kit). Таблицы в **других схемах** PostgreSQL (если появятся для webapp) в этом снимке **не** отражены — нужен явный scope в `drizzle.config.ts` при появлении такого требования.
- **Представления (views), materialized views** обычно не попадают в классический table-introspect так же, как базовые таблицы — при использовании views в новом коде потребуется отдельное решение.

**Известный дефект генератора (фиксирован вручную на фазе 1):** для некоторых колонок с default `''` в SQL `drizzle-kit introspect` сформировал **невалидный TypeScript** (литерал `.default(')` вместо `.default('')`). После каждого повторного introspect нужна **повторная** проверка / постобработка (см. MANDATORY FIX).

---

## 4) Smoke-тест

### Verdict: **PASS по дизайну; в default CI не исполняется**

| Элемент | Описание |
|---------|----------|
| Реализация | `src/app-layer/db/drizzle.smoke.test.ts` — `getDrizzle()` + `db.execute(sql\`select 1 as n\`)` |
| Поведение в CI | `vitest.setup` обнуляет `DATABASE_URL`, если нет `USE_REAL_DATABASE=1` → тест **`it.skipIf(!hasRealDb)`** |
| Локальная проверка | `USE_REAL_DATABASE=1 pnpm --dir apps/webapp exec vitest run src/app-layer/db/drizzle.smoke.test.ts` — выполняется при наличии `DATABASE_URL` |

Smoke **корректно** проверяет путь Drizzle + pool, но **не** является обязательным шагом в обычном `pnpm test:webapp` без флага — это следует явно держать в процессе release/аудита.

---

## 5) Существующие тесты

### Verdict: **PASS**

Проверка на дату аудита:

```bash
pnpm test:webapp
```

Итог: **355** test files passed, **5** skipped; **1803** tests passed, **8** skipped — без регрессий, связанных с Drizzle.

---

## Сверка с `SYSTEM_LOGIC_SCHEMA.md` § 12 (архитектурные слои)

### Verdict: **PASS / соответствует целевой модели фазы 1**

§ 12 задаёт цепочку: `route.ts` → `modules/*/service|ports|types` → **`db/schema/`** (Drizzle) → data access в `infra`/сервисах.

| Требование § 12 | Статус после фазы 1 |
|-------------------|---------------------|
| Каталог **`db/schema/`** как слой описания таблиц | Выполнено: `apps/webapp/db/schema/` (`schema.ts`, `relations.ts`, `index.ts`) |
| Новый код через Drizzle (не raw SQL для новых сущностей) — подготовка слоя | Фаза 1 создаёт основу; **новые** таблицы инициативы появятся в фазах 2+ |
| `modules/*` не тянет `@/infra/db/client` / `@/infra/repos/*` | Не нарушено добавлением Drizzle: **`getDrizzle()`** размещён в **`src/app-layer/db/drizzle.ts`** (composition / app-layer), не в `modules/*` |
| Типы портов в `modules/*/ports.ts` | Не затронуто фазой 1 — ок |

**Несоответствие текста диаграммы:** в § 12 указано `db/schema/` относительно корня репозитория под инициативу; фактически путь **`apps/webapp/db/schema/`** — это канон для webapp и совпадает с `EXECUTION_RULES.md` (schema в webapp).

---

## Gate (фаза 1)

| Gate | Статус |
|------|--------|
| Зависимости Drizzle в webapp | **OK** |
| Конфиг kit + тот же источник `DATABASE_URL`, что и dev-приложение | **OK** |
| Снимок `public` согласован с количеством `pgTable` (97) | **OK** |
| Smoke (с реальной БД / флагом) | **OK** |
| `pnpm test:webapp` | **OK** |
| Риск повторного introspect без правки багов генератора | **Закрыт** процессом `db:introspect` + fix (см. FIX verification) |

---

## MANDATORY FIX INSTRUCTIONS

1. **Severity: major — постобработка после `drizzle-kit introspect`:**  
   Зафиксировать в репозитории **автоматизируемый** шаг (скрипт `pnpm db:introspect:fix` или pre-commit/check), который после introspect исправляет известный паттерн сломанных пустых string-default (`.default(')` → `.default('')`) **или** падает с понятной ошибкой, если паттерн найден. Цель: повторный introspect не ломает `tsc` и не зависит от ручной замены.

2. **Severity: minor — документация smoke в CI:**  
   В `LOG.md` или `EXECUTION_RULES.md` / промпте фазы 1 явно указать: полная проверка smoke Drizzle — **`USE_REAL_DATABASE=1`** + целевой файл теста **или** `pnpm --dir apps/webapp run test:with-db` при необходимости (без расширения обязательного CI без решения).

3. **Severity: minor — опциональное выравнивание с `env`:**  
   В комментарии к `drizzle.config.ts` добавить одну строку: «канон значения `DATABASE_URL` для приложения — `src/config/env.ts` после `loadEnv`; конфиг kit дублирует только загрузку файлов». При желании — вынести чтение URL в общий маленький модуль без импорта Next-only кода (если это не тянет лишние зависимости).

4. **Severity: minor (отложено до появления требования):**  
   Если появятся таблицы вне `public`, добавить в `drizzle.config.ts` явный список схем / `tablesFilter` по решению архитектуры.

---

## Команды для повторной проверки

```bash
# Зависимости
jq '.dependencies["drizzle-orm"], .devDependencies["drizzle-kit"]' apps/webapp/package.json

# Линт / типы / тесты webapp
pnpm --dir apps/webapp run lint
pnpm --dir apps/webapp run typecheck
pnpm test:webapp

# Smoke с БД (нужен DATABASE_URL в .env.dev и флаг)
USE_REAL_DATABASE=1 pnpm --dir apps/webapp exec vitest run src/app-layer/db/drizzle.smoke.test.ts

# Сверка числа таблиц (после загрузки env для psql — см. SERVER CONVENTIONS)
# SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
```

После закрытия пунктов **major** из MANDATORY FIX — обновить `LOG.md` и при необходимости повторить короткий прогон `lint` + `typecheck` + `pnpm test:webapp`.

---

## FIX verification — 2026-04-18

| MANDATORY # | Статус | Действие |
|-------------|--------|----------|
| 1 major (post-introspect) | **Закрыт** | `apps/webapp/scripts/fix-drizzle-introspect-defaults.mjs`; `package.json`: `db:introspect` = introspect + fix, `db:introspect:fix` отдельно. |
| 2 minor (smoke / CI) | **Закрыт** | Пункты в `EXECUTION_RULES.md` (Drizzle) + ссылка в `PROMPTS_EXEC_AUDIT_FIX.md` (фаза 1 EXEC). |
| 3 minor (env / `drizzle.config`) | **Закрыт** | Комментарий в `drizzle.config.ts`: канон `DATABASE_URL` в `src/config/env.ts`, kit дублирует только загрузку файлов. |
| 4 minor (схемы вне `public`) | **DEFER** | Без изменений до появления таблиц вне `public`; тогда расширить конфиг по решению архитектуры. |

**Проверки после FIX:**

| Проверка | Результат |
|----------|-----------|
| `pnpm --dir apps/webapp run db:introspect:fix` | Нет паттернов или замена корректна |
| `pnpm --dir apps/webapp run db:verify-public-table-count` | При наличии `.env.dev`: счётчик `public` BASE TABLE vs `pgTable` в `schema.ts` |
| `pnpm --dir apps/webapp exec drizzle-kit check` | Консистентность артефактов Drizzle Kit |
| `pnpm --dir apps/webapp run typecheck` | PASS |
| `pnpm --dir apps/webapp run lint` | PASS |
| `pnpm test:webapp` | PASS |
| `USE_REAL_DATABASE=1` + `drizzle.smoke.test.ts` | PASS (локально при БД) |

**Gate (фаза 1 после FIX):** PASS при выполнении проверок выше; перед push — полный `pnpm run ci` по регламенту репозитория.
