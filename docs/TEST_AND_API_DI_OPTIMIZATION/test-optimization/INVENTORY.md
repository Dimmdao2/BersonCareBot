# INVENTORY — test optimization track

## Webapp `e2e/*.test.ts` (19 файлов, **confirmed**)

| Файл | Классификация | Предполагаемая ценность | Overlap candidate | Первая волна |
|------|---------------|-------------------------|-------------------|--------------|
| `api-routes-inprocess.test.ts` | In-process API sweep | High **если** ловит cross-route | **likely** vs многие `route.test.ts` | Нет |
| `api-health.test.ts` | Health | Medium | **likely** vs `health/route.test.ts` | Нет |
| `api-auth-exchange.test.ts` | Auth | High | **likely** vs `auth/exchange/route.test.ts` | Нет |
| `api-integrator-subscriptions-inprocess.test.ts` | Integrator | Medium–High | **likely** vs `integrator/subscriptions/*/route.test.ts` | Нет |
| `messaging-inprocess.test.ts` | Workflow | High | **likely** partial overlap | Нет |
| `cms-media-inprocess.test.ts` | CMS + media | High | **likely** partial overlap | Нет |
| `cms-content.test.ts` | CMS | Medium | unknown | Нет |
| `doctor-pages-inprocess.test.ts` | RSC/pages | Medium | unknown | Нет |
| `doctor-clients-inprocess.test.ts` | Doctor clients | High | unknown | Нет |
| `doctor-clients-scope-redirects.test.ts` | Routing | Medium | unknown | Нет |
| `doctor-actions-inprocess.test.ts` | Actions | Medium | unknown | Нет |
| `diaries-inprocess.test.ts` | Patient diary | High | unknown | Нет |
| `charts-inprocess.test.ts` | Charts | Medium | unknown | Нет |
| `lfk-assign-inprocess.test.ts` | LFK | Medium | unknown | Нет |
| `lfk-templates-inprocess.test.ts` | LFK | Medium | unknown | Нет |
| `lfk-exercises-inprocess.test.ts` | LFK | Medium | unknown | Нет |
| `auth-stage5-inprocess.test.ts` | Auth stage | High | unknown | Нет |
| `stage13-legacy-cleanup.test.ts` | Legacy | High (регрессии) | unknown | **Нельзя** |
| `live-dev.test.ts` | Live E2E | Special | N/A | **Нельзя** (внешняя среда) |

**Overlap candidate** = требуется сравнение содержимого; статус **likely** — гипотеза discovery, не решение.

## Colocated route tests

- **105** файлов `route.test.ts` под `apps/webapp/src/app/api` — основной «якорь» контрактов; **не трогать в первой волне** кроме случая слияния дублирующих *it* внутри одного файла (редко).

## Unit / component tests (выборочно)

- **309** `*.test.ts` в `src/` + **36** `*.test.tsx` — полный перечень не дублировать здесь; при оптимизации искать **явные** дубли (одинаковые snapshot’ы модулей) через поиск по имени или истории git.
- Hotspots по размеру/времени — **unknown** (не профилировалось); при необходимости: `vitest --reporter=verbose` / `--poolOptions` профилирование.

## Integrator

- **109** unit test файлов в `src/` + **2** e2e (отдельный запуск `test:e2e`).
- На baseline **~7.6s** wall — приоритет низкий, инвентарь для трека A **optional**.

## Критичные тесты (не первая волна удалений)

Все файлы, покрывающие: `integrator/events`, `integrator/messenger-phone/bind`, `integrator/reminders/dispatch`, `auth/exchange`, OAuth callbacks, `media/multipart/*`, `doctor/clients/merge`, `integrator-merge`, `permanent-delete`, `internal/media-*`.
