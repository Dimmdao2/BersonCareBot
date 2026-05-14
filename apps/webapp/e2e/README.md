# In-process e2e (`apps/webapp/e2e`)

Тесты здесь **не** поднимают браузер и **не** ходят на сеть как e2e в классическом смысле: это smoke и контрактные проверки в том же процессе, что и Vitest.

## Политика по `import("@/app/.../page")`

Тяжёлые импорты App Router `page.tsx` собраны в одном файле:

- [`smoke-app-router-rsc-pages-inprocess.test.ts`](./smoke-app-router-rsc-pages-inprocess.test.ts) — один `beforeAll` прогружает граф страниц; остальные `*inprocess*.test.ts` не дублируют эти импорты.

Остальные сценарии в `*inprocess*.test.ts` — маршруты `route.ts`, `buildAppDeps`, клиентские модули, in-memory сервисы.

## Файлы `e2e/*.test.ts` вне `*inprocess*`

Проект Vitest **`fast`** включает все `e2e/**/*.test.ts`, кроме `*inprocess*.test.ts`. Если сценарию нужен реальный `import(".../page")`, **не дублируйте** холодный граф в каждом `it`: используйте один `beforeAll` с `import()` (см. [`doctor-clients-scope-redirects.test.ts`](./doctor-clients-scope-redirects.test.ts)).

## Baseline / метрики CI

Шаблон замеров и таблица «до/после»: [`CI_BASELINE.md`](./CI_BASELINE.md). Правило агентов — не раздувать тесты: [`.cursor/rules/webapp-tests-lean-no-bloat.mdc`](../../../.cursor/rules/webapp-tests-lean-no-bloat.mdc).

## RTL и `React.lazy`

Если тест рендерит компонент с динамическими табами/чанками под `React.lazy` + `Suspense`, прогревайте чанки в `beforeAll` через `import()` (параллельно `Promise.all`), иначе первый таймаут поймает холодный transform, а не логику UI.

Эталон в репозитории: [`src/app/app/patient/treatment/PatientTreatmentProgramDetailClient.test.tsx`](../src/app/app/patient/treatment/PatientTreatmentProgramDetailClient.test.tsx) (`beforeAll` + `import` табов).

## Скрипты (корень монорепо)

- `pnpm test:webapp:fast` — проект Vitest `fast` (без `*inprocess*.test.ts`), в CI по шардам `VITEST_SHARD`.
- `pnpm test:webapp:inprocess` — проект `inprocess`; в GitHub Actions только на **push в `main`**, тоже по шардам.
- `pnpm test:webapp` / `pnpm run ci` — полный прогон обоих проектов (барьер перед пушем).
