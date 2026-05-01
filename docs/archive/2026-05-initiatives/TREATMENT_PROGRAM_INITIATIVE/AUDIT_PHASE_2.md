# AUDIT — Фаза 2 (библиотека блоков: tests, test_sets, test_set_items, recommendations)

**Дата аудита:** 2026-04-18.  
**Вход:** `MASTER_PLAN.md` (фаза 2), `SYSTEM_LOGIC_SCHEMA.md` § 4, `EXECUTION_RULES.md`.  
**Scope:** Drizzle schema `tests` / `test_sets` / `test_set_items` / `recommendations`, `src/modules/tests/`, `src/modules/recommendations/`, `src/app/api/doctor/{clinical-tests,test-sets,recommendations}/**`, `src/app/app/doctor/{clinical-tests,test-sets,recommendations}/**`, snapshot-порт для будущего/текущего назначения программы.

---

## Краткий вердикт

| # | Проверка | Статус |
|---|-----------|--------|
| 1 | Таблицы в Drizzle schema | **PASS** |
| 2 | Модули без `@/infra/*` (production) | **PASS** |
| 3 | Route handlers тонкие | **PASS** |
| 4 | CRUD, тесты | **PASS** (`pnpm test:webapp`) |
| 5 | Doctor UI (список / new / [id], навигация) | **PASS** (инспекция кода + in-process e2e) |
| 6 | Сверка § 4 (типы `test_set`, `recommendation`, snapshot) | **PASS** (данные библиотеки в фазе 2; контракт snapshot в коде назначения — см. § ниже) |

---

## 1) Таблицы `tests`, `test_sets`, `test_set_items`, `recommendations` в Drizzle

### Verdict: **PASS**

| Таблица БД | Экспорт TS | Файл |
|------------|------------|------|
| `tests` | `clinicalTests` = `pgTable("tests", …)` | `apps/webapp/db/schema/clinicalTests.ts` |
| `test_sets` | `testSets` | то же |
| `test_set_items` | `testSetItems` (FK: `test_set_id` → `test_sets` CASCADE, `test_id` → `tests` RESTRICT) | то же |
| `recommendations` | `recommendations` | `apps/webapp/db/schema/recommendations.ts` |

| Критерий | Результат |
|----------|-----------|
| Поля vs MASTER_PLAN фаза 2 | `title`, `description`, `test_type`, `scoring_config`, `media`, `tags`, `is_archived`, `created_by`, timestamps — для тестов; наборы и рекомендации — согласованы с таблицей плана. |
| Реэкспорт | `db/schema/index.ts` — `clinicalTests`, `recommendations` (+ `relations.ts`). |
| Миграция Drizzle | `db/drizzle-migrations/0001_charming_champions.sql`. |

**Замечание:** идентификатор `clinicalTests` в TS — чтобы не конфликтовать с понятием «tests» в Vitest; в PostgreSQL таблица **`tests`**.

---

## 2) Изоляция `modules/tests/` и `modules/recommendations/`

### Verdict: **PASS**

- В **`service.ts` / `ports.ts` / `types.ts`** нет импортов `@/infra/*`.
- Тесты: `service.test.ts` используют **`@/app-layer/testing/clinicalLibraryInMemory`** (не `@/infra/repos/*`).
- Проверка: `rg '@/infra' src/modules/tests src/modules/recommendations` → **пусто**.

ESLint `no-restricted-imports` для `modules/**` не применяется к `*.test.ts` — in-memory дубли **вне** `modules/*` через `app-layer/testing` — предпочтительный паттерн (см. закрытый пункт в «История FIX» ниже).

---

## 3) Route handlers: тонкие

### Verdict: **PASS**

Паттерн для `api/doctor/clinical-tests`, `test-sets` (включая **`PUT …/[id]/items`**), `recommendations`:

- сессия + роль (`getCurrentSession`, `canAccessDoctor`);
- Zod для query/body;
- `buildAppDeps()` → `deps.clinicalTests` / `deps.testSets` / `deps.recommendations`;
- ответы JSON и коды HTTP; **нет** SQL, `getPool`, `getDrizzle` в `route.ts`.

Ошибки домена транслируются в 400/404 — без дублирования бизнес-правил в маршруте.

---

## 4) CRUD и регрессия тестов

### Verdict: **PASS**

| Уровень | Артефакт |
|---------|----------|
| Сервисы | `modules/tests/service.test.ts`, `modules/recommendations/service.test.ts` |
| In-process | `e2e/treatment-program-blocks-inprocess.test.ts` |
| Полный suite | **`pnpm test:webapp`** — на момент аудита: **363** test files passed (**5** skipped), **1845** tests passed (**8** skipped). |

Точечно: `vitest run src/modules/tests/service.test.ts src/modules/recommendations/service.test.ts` — **6** тестов, **PASS**.

---

## 5) Doctor UI

### Verdict: **PASS**

| Раздел | Пути |
|--------|------|
| Клинические тесты | `app/app/doctor/clinical-tests` — `page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `ClinicalTestForm.tsx` |
| Наборы тестов | `app/app/doctor/test-sets/...` |
| Рекомендации | `app/app/doctor/recommendations/...` |

Навигация: `shared/ui/doctorNavLinks.ts` — пункты `clinical-tests`, `test-sets`, `recommendations`.

---

## Сверка с `SYSTEM_LOGIC_SCHEMA.md` § 4

### Таблица соответствия

| item_type (§ 4) | Ссылается на | Фаза 2 (библиотека) | Snapshot (§ 4 «что хранится») |
|-----------------|-------------|---------------------|------------------------------|
| `test_set` | `test_sets.id` | Таблицы + CRUD + UI + API | При назначении программы: `createPgTreatmentProgramItemSnapshotPort` — **`title`**, **`description`** набора, **`tests[]`** с **`scoringConfig`** (и порядком) из строк `tests` — **согласовано** с § 4 (`infra/repos/pgTreatmentProgramItemSnapshot.ts`, case `"test_set"`). |
| `recommendation` | `recommendations.id` | Таблица + CRUD + UI + API | Snapshot: **`title`**, **`bodyMd`**, **`media`** — **согласовано** с § 4 (тот же файл, case `"recommendation"`). |

**Вне scope фазы 2 как «новые таблицы»:** `exercise`, `lfk_complex`, `lesson` — существующие сущности; полиморфная пара `item_type` + `item_ref_id` в шаблоне — **фаза 3**.

**Полиморфная ссылка:** в § 4 явно — без FK на `item_ref_id` в БД; валидация в сервисном слое — **EXECUTION_RULES** / фаза 3–4.

---

## Gate (`MASTER_PLAN.md`, фаза 2)

| Критерий | Статус |
|----------|--------|
| CRUD + doctor UI для каждой сущности | **OK** |
| Тесты на сервисный слой | **OK** |
| Новые таблицы через Drizzle / миграции | **OK** |

---

## MANDATORY FIX INSTRUCTIONS

**Critical / major:** **нет** — по результатам аудита блокирующих дефектов не выявлено. **Закрытие FIX:** подтверждено повторным прогоном (см. «AUDIT_PHASE_2 FIX — верификация» ниже); правок коду фазы 2 не потребовалось.

| # | Severity | Инструкция | Статус |
|---|----------|------------|--------|
| 1 | informational | На каждом окружении с реальной БД убедиться, что применена миграция **`0001_charming_champions.sql`** (или полный журнал Drizzle до актуальной версии): `pnpm --dir apps/webapp run db:migrate:drizzle`. | **Defer (операционно)** — вне репозитория; ответственность окружения. Команды: см. `EXECUTION_RULES.md` (Drizzle). |
| 2 | optional / hygiene | При добавлении новых doctor-эндпоинтов библиотеки — синхронно обновлять **`apps/webapp/src/app/api/api.md`** и при изменении deps — **`app-layer/di/di.md`**. | **Закрыто для текущего scope** — документы уже содержат clinical-tests / test-sets / recommendations; при новых эндпоинтах — обновлять в том же PR. |
| 3 | defer (политика) | Если когда-либо расширить ESLint на `modules/**/*.test.ts`, перенести фиктивные порты в **`app-layer/testing`** или аналог **вне** `modules/*`. | **Defer (обоснованно)** — текущая политика ESLint исключает `*.test.ts` из `no-restricted-imports` в `modules`; фиктивы уже в `@/app-layer/testing/clinicalLibraryInMemory`. Отдельное решение не требуется, пока правило не ужесточают. |

---

## AUDIT_PHASE_2 FIX — верификация (2026-04-18)

| Проверка | Результат |
|----------|-----------|
| **Critical / major** | Отсутствовали в MANDATORY — **N/A / закрыто** без правок кода. |
| **Module isolation** | `rg '@/infra' apps/webapp/src/modules/tests apps/webapp/src/modules/recommendations` → **нет совпадений** (exit code 1 у ripgrep = ноль строк). |
| **Routes + CRUD + UI** | Паттерн маршрутов без изменений; покрытие: `service.test.ts` (×2), `e2e/treatment-program-blocks-inprocess.test.ts`, полный **`pnpm test:webapp`**. |
| **Step / phase** | Корневой **`pnpm run ci`**: `lint` → `typecheck` → `pnpm test` (integrator) → `test:webapp` → `pnpm build` → `pnpm build:webapp` — **PASS**. |
| **Pre-deploy audit (`pnpm run audit`)** | **FAIL** — `registry-prod-audit`: advisories **`esbuild@0.18.20`** (moderate), **`drizzle-orm@0.44.7`** (high), **тот же класс**, что в отчётах других фаз инициативы; **не** следствие FIX фазы 2. Закрытие — обновление версий зависимостей / политика репозитория, не правки библиотеки блоков. |

**Gate verdict (AUDIT_PHASE_2 FIX):** **PASS** по коду и тестам фазы 2; **условный** барьер полного зелёного `ci` — только шаг `audit`, зафиксированный отдельно.

---

## История FIX (2026-04-18, закрыто ранее)

Закрытые minor из предыдущего цикла AUDIT/FIX (документация и тесты):

- **`api.md`** — секции doctor/clinical-tests, test-sets, recommendations.
- **`di.md`** — `clinicalTests`, `testSets`, `recommendations` + последующие фазы в том же файле.
- **Изоляция тестов** — `@/app-layer/testing/clinicalLibraryInMemory` вместо прямого `@/infra/repos/inMemory*` из `modules/*`.
- **In-process smoke** — `e2e/treatment-program-blocks-inprocess.test.ts`.

---

## Команды для повторной проверки

```bash
rg '@/infra' apps/webapp/src/modules/tests apps/webapp/src/modules/recommendations
pnpm --dir apps/webapp exec vitest run src/modules/tests/service.test.ts src/modules/recommendations/service.test.ts
pnpm --dir apps/webapp exec vitest run e2e/treatment-program-blocks-inprocess.test.ts
pnpm test:webapp
```

---

## Заключение

Фаза 2 **соответствует** `MASTER_PLAN.md`, `EXECUTION_RULES.md` и **`SYSTEM_LOGIC_SCHEMA.md` § 4** для сущностей **`test_set`** и **`recommendation`** (модель данных, API, UI; контракт snapshot при назначении программы реализован в snapshot-порту и **совпадает** с § 4 по перечисленным полям).
