# DISCOVERY_REPORT — фактическое состояние репозитория

**Дата среза:** 2026-04-16. **Метод:** чтение файлов, `find`, `rg`, один прогон `pnpm test` / `pnpm test:webapp` для baseline.

## 1. Структура relevant areas

| Зона | Путь |
|------|------|
| Монорепо root | [`package.json`](../../package.json) |
| Webapp (Next.js) | `apps/webapp/` |
| API route handlers | `apps/webapp/src/app/api/**/route.ts` |
| Colocated route tests | `apps/webapp/src/app/api/**/route.test.ts` |
| Webapp e2e / in-process suite | `apps/webapp/e2e/*.test.ts` |
| App-layer / DI | `apps/webapp/src/app-layer/di/buildAppDeps.ts`, `apps/webapp/src/app-layer/di/di.md` |
| Integrator | `apps/integrator/` |
| Документация | **`docs/`** (lowercase; не `Docs/`) — `docs/README.md`, `docs/ARCHITECTURE/`, `docs/REPORTS/` |

## 2. Ключевые конфигурационные файлы (confirmed)

| Артефакт | Путь |
|----------|------|
| Root scripts / `ci` | [`package.json`](../../package.json) — `ci`: `lint` → `typecheck` → `test` → `test:webapp` → `build` → `build:webapp` → `audit` (**нет** отдельного шага `webapp:typecheck` в этом скрипте; при этом в workspace rules упоминается `webapp:typecheck` — **расхождение rule ↔ package.json**, см. §8). |
| Webapp package | [`apps/webapp/package.json`](../../apps/webapp/package.json) |
| Integrator package | [`apps/integrator/package.json`](../../apps/integrator/package.json) |
| Vitest webapp | [`apps/webapp/vitest.config.ts`](../../apps/webapp/vitest.config.ts) — `include`: `src/**/*.test.ts`, `src/**/*.test.tsx`, `e2e/**/*.test.ts`; `globalSetup` + `setupFiles` |
| Vitest integrator | [`apps/integrator/vitest.config.ts`](../../apps/integrator/vitest.config.ts) — `include`: `src/**/*.test.ts`, `e2e/**/*.test.ts` |
| CI workflow | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — jobs: lint, typecheck, test-integrator (`pnpm test`), test-webapp (`pnpm test:webapp`), build integrator/webapp, audit, deploy |

## 3. Тесты: директории и объёмы (confirmed)

### Webapp

- **Файлов `route.test.ts`:** **105** (под `apps/webapp/src/app/api`).
- **Файлов тестов по vitest include:** **309** × `*.test.ts` в `src/` + **`e2e/`** и **36** × `*.test.tsx` в `src/` → **345** test files в одном прогоне (совпадает с summary Vitest).
- **`e2e/` (корень webapp):** **19** файлов `*.test.ts` (in-process / сценарные; не отдельный Playwright в этом списке).

### Integrator

- **`src/**/*.test.ts`:** **109** файлов.
- **`e2e/*.test.ts`:** **2** файла (`webhook-scenarios.test.ts`, `rubitime-webhook-scenarios.test.ts` — по glob; `pnpm test` не включает e2e без `RUN_E2E_TESTS` / скрипта `test:e2e`).

### Baseline runtime (одна машина, 2026-04-16)

См. детали в `test-optimization/BASELINE.md`. Кратко:

- `pnpm test` (integrator): Vitest **111** files, **~6.4s** CPU duration, **~7.6s** wall.
- `pnpm test:webapp`: Vitest **345** files (**341 passed, 4 skipped**), **1727** tests (**1720 passed, 7 skipped**), **~35s** Vitest duration, **~37s** wall.

## 4. Route handlers (confirmed)

- **Всего `apps/webapp/src/app/api/**/route.ts`:** **140** файлов.

### Импорты `@/infra/*` из `route.ts`

- **Файлов с хотя бы одним `@/infra/` в `route.ts`:** **58** (поиск по содержимому файла).
- **Файлов с `buildAppDeps`:** **73** (часть роутов использует только `buildAppDeps` без прямого `@/infra` в том же файле — **confirmed** пересечение: **31** файл с **обоими**, **42** только `buildAppDeps` без `@/infra` в теле импортов).

Полный перечень infra-роутов и классификация — `api-di-boundary-normalization/INVENTORY.md` и `BASELINE.md`.

### Типовые кластеры по импортам (для трека B)

- **Только `verifyIntegratorGetSignature` / `verifyIntegratorGetSignature` (GET-read integrator API):** большая группа под `integrator/**` (низкая локальная сложность рефактора, но много файлов).
- **Тяжёлые:** `integrator/events`, `integrator/messenger-phone/bind`, `integrator/reminders/dispatch`, media multipart / presign / confirm, doctor merge/purge, OAuth callbacks (pg OAuth bindings), internal cron-подобные роуты.

## 5. DI / composition roots (confirmed + notes)

| Артефакт | Назначение |
|----------|------------|
| `apps/webapp/src/app-layer/di/buildAppDeps.ts` | Основной composition surface для webapp (кэш через `react` `cache`, см. начало файла). |
| `apps/integrator/src/app/di.ts` | Composition integrator (упоминается в `LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md`). |

**Сверка с `LOW_LEVEL_*`:** документ утверждает, что `webapp/src/modules/integrator/events.ts` вызывает `buildAppDeps` изнутри модуля. **Факт на 2026-04-16:** в `events.ts` есть комментарий, что модуль **не должен** импортировать `buildAppDeps`, deps передаёт route — **документ частично устарел** (needs verification: другие модули под `modules/*` всё ещё могут тянуть DI — отдельный grep при исполнении трека B).

## 6. Существующая документация по теме

| Документ | Отношение к инициативе |
|----------|------------------------|
| `docs/ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md` | Про composition roots и обходы DI — **база для трека B**, но требует точечного обновления примеров. |
| `docs/ARCHITECTURE/ARCHITECTURE_GUARDRAILS.md` | Runtime guardrails integrator/content — **не** substitute для import-policy webapp. |
| `apps/webapp/src/app/api/api.md` | Обзор API и контрактов — **цель синхронизации** после трека B. |
| `apps/webapp/src/app-layer/di/di.md` | Краткое описание `buildAppDeps` — расширить после нормализации. |
| `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/04-test-strategy.md` | Изолированная test strategy фичи HLS — **не конкурирует** с этой инициативой. |
| `docs/PLATFORM_IDENTITY_ACCESS/*` | Ссылается на `buildAppDeps` и integrator routes — контекст идентичности. |
| `.cursor/plans/tests_di_optimization_e9845870.plan.md` | Внешний план Composer; **не** часть `docs/` — новая инициатива в `docs/TEST_AND_API_DI_OPTIMIZATION/` его не заменяет автоматически, а **детализирует для репо** с разделением треков. |

## 7. Hotspot-файлы (confirmed пути)

- `apps/webapp/src/app/api/integrator/events/route.ts` — idempotency, audit, pool, signature.
- `apps/webapp/src/app/api/integrator/messenger-phone/bind/route.ts` — idempotency + signature.
- `apps/webapp/src/app/api/auth/oauth/callback/{google,apple}/route.ts` — прямой выбор pg vs in-memory OAuth bindings.
- `apps/webapp/src/app/api/media/**` и `internal/media-*` — S3, locks, repos.
- `apps/webapp/src/app/api/doctor/clients/**` — merge, integrator M2M, purge.

## 8. Расхождения: исходный замысел (внешний план) ↔ репозиторий

| Ожидание | Факт |
|----------|------|
| Корень `Docs/UPPER_SNAKE` | Репозиторий использует **`docs/`** lowercase; инициатива создана в `docs/TEST_AND_API_DI_OPTIMIZATION/`. |
| Отчёт только в `docs/REPORTS/` | Дублирование: полный комплект в папке инициативы + **индекс** в `docs/REPORTS/TEST_AND_API_DI_OPTIMIZATION_INDEX_2026-04-16.md`. |
| `events.ts` вызывает `buildAppDeps` | **Устарело** в документе архитектуры; код ориентируется на инъекцию из route. |
| CI vs `webapp:typecheck` | Скрипт `ci` в root `package.json` **не** вызывает `pnpm webapp:typecheck` (есть отдельный script — **likely** полезен локально; **discrepancy** с текстом workspace rule о составе `ci`). |
| Правка GitHub workflow в инициативе | **Вне scope:** `.github/workflows/ci.yml` и deploy job не менять — см. `MASTER_PLAN.md` / `EXECUTION_RULES.md`. |
| Количество `route.test.ts` | Внешний план предлагал «посчитать» — **105** (confirmed). |

## 9. Похожие инициативы

- **Отдельной** папки «test + API DI optimization» в `docs/` **не было** — эта инициатива новая.
- Тематические пересечения: `VIDEO_HLS_DELIVERY/04-test-strategy.md` (узкая), `PLATFORM_IDENTITY_ACCESS` (фаза E про тесты — другой scope), `WEBAPP_FIRST_PHONE_BIND/STAGE_05_OBSERVABILITY_TESTS_DOCS.md` (узкая). **Не сливать:** другие инициативы имеют продуктовый фокус; данная — **инженерный платформенный** рефакторинг тестов и границ API.

## 10. Предварительный вывод

- **Применимость:** высокая для webapp (большой Vitest suite + явные infra-imports в роутах). Integrator suite относительно лёгкий (~7s wall) — **трек A** может дать основной выигрыш на webapp.
- **Риски:** ложные дубликаты между `e2e/*-inprocess.test.ts` и `route.test.ts`; тяжёлый **трек B** на media и integrator POST.
- **Uncertain:** полный `pnpm run ci` wall time на той же машине (не измерялся в discovery из-за длительности); полный grep `buildAppDeps` из `modules/*` (см. трек B).
