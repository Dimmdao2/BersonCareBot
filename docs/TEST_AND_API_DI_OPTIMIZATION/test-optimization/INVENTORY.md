# INVENTORY — test optimization track

## Webapp `e2e/*.test.ts` (18 файлов, **confirmed**; было 19 до удаления `api-integrator-subscriptions-inprocess.test.ts` **2026-04-17**, см. `LOG.md`)

Сверка содержимого с colocated `**/app/api/**/route.test.ts` (2026-04-17): смотрели исходники e2e и соответствующих route-тестов там, где маршруты те же; для файлов без вызова API handlers — overlap с route-тестами **нет по определению** (другой слой: RSC, server actions, сервисы).

| Файл | Классификация | Роль после сверки | Overlap с colocated `route.test.ts` | Первая волна |
|------|---------------|-------------------|-------------------------------------|--------------|
| `api-routes-inprocess.test.ts` | In-process API | Фактически **только** `GET /api/health` (имя файла историческое; не sweep по API). Colocated `health/route.test.ts` **нет** — это единственный автоматический HTTP-smoke для health в default vitest. | **Нет** (нет парного route.test) | Нет |
| `api-health.test.ts` | Health (server) | `fetch` к живому серверу при `WEBAPP_E2E_BASE_URL`; без переменной — **skip**, в основной CI не даёт сигнала. | При включённом сервере **дублирует** те же проверки JSON, что in-process health в `api-routes-inprocess.test.ts`; с `route.test.ts` **нет** пересечения | Нет |
| `api-auth-exchange.test.ts` | Auth (server) | Аналогично skip без BASE; `dev:client` + 400 на пустое тело. | **Частичное** с `auth/exchange/route.test.ts` (пустое тело → 400). В route-тестах покрыты 403, 200+role, cookie platform — в e2e **нет** | Нет |
| `messaging-inprocess.test.ts` | Wiring smoke | Импорт `ChatView`, проверка что у route **есть** `GET`/`POST`, `buildAppDeps.messaging` — без HTTP-запросов. | **Нет** (не дублирует assertion’ы route tests) | Нет |
| `cms-media-inprocess.test.ts` | Wiring smoke | Экспорт `POST` media/upload + импорт страницы news. | **Нет** | Нет |
| `cms-content.test.ts` | CMS workflow | Цепочка **POST upload** (JPEG) → **saveContentPage** / полная цепочка в одном файле; моки как в route tests. | **Частичное** на шаге успешного upload (сходно с `media/upload/route.test.ts` happy-path; формат файла JPEG vs PNG в route — разный, смысл тот же). **Уникально:** server action + markdown, full chain | Нет |
| `doctor-pages-inprocess.test.ts` | RSC + deps | Async pages doctor/*, реальные вызовы `buildAppDeps` (dashboard metrics, listAllMessages), клиентские формы. | **Нет** | Нет |
| `doctor-clients-inprocess.test.ts` | RSC + deps | Страницы clients/subscribers, `listClients` / `getClientProfile`, UI модули. | **Нет** | Нет |
| `doctor-clients-scope-redirects.test.ts` | Routing | Редиректы `/subscribers` → `/clients` с query; только RSC + `redirect` mock. | **Нет** | Нет |
| `doctor-actions-inprocess.test.ts` | Actions smoke | Экспорт server actions (`sendMessageAction`, `getMessageDraftAction`). | **Нет** | Нет |
| `diaries-inprocess.test.ts` | Patient diary | Actions, страницы, **roundtrip** через `buildAppDeps.diaries` / references (в т.ч. БД при `DATABASE_URL`). | **Нет** (не colocated API HTTP suite) | Нет |
| `charts-inprocess.test.ts` | UI modules | Импорт графиков/aggregation. | **Нет** | Нет |
| `lfk-assign-inprocess.test.ts` | LFK domain | Сервис дневника ЛФК + in-memory port (`assigned_by_specialist`). | **Нет** | Нет |
| `lfk-templates-inprocess.test.ts` | LFK domain | Страница + CRUD шаблонов in-memory. | **Нет** | Нет |
| `lfk-exercises-inprocess.test.ts` | LFK domain | Страница + CRUD упражнений in-memory. | **Нет** | Нет |
| `auth-stage5-inprocess.test.ts` | Auth HTTP + flow | Реальные `POST` handlers: check-phone, oauth/start, messenger **start → confirm token → poll** (два poll для `resumed`). | По отдельным маршрутам — **частичное** пересечение с colocated tests возможно; **уникально:** сквозная цепочка messenger с in-memory confirm | Нет |
| `stage13-legacy-cleanup.test.ts` | Legacy / Stage13 | Те же GET subscriptions topics/for-user 200 + вызов моков projection. | **Высокое** с `…/topics/route.test.ts`, `…/for-user/route.test.ts` (happy-path дубли; e2e-дубль `api-integrator-subscriptions-inprocess` **удалён** 2026-04-17). Смысл файла — регрессия «product read через webapp», не новые assertion’ы | **Нельзя** (см. PLAN) |
| `live-dev.test.ts` | Live E2E | Внешняя среда / флаги. | **N/A** | **Нельзя** (внешняя среда) |

**Итог по overlap:** доля **unknown / likely** снята там, где прочитаны файлы: после reduction **2026-04-17** кандидат на review слияния по subscriptions — в основном **`stage13-legacy-cleanup`** vs route tests (смысл legacy); опционально **api-health** vs **api-routes-inprocess** для health (разные раннеры: server vs in-process).

## Правила трека A перед удалением или отключением тестов (closure AUDIT_TRACK_A)

Закрепляет **Major** / **Critical** из `AUDIT_TRACK_A.md` → MANDATORY FIX (процесс, не предполагают нарушения на текущем шаге):

1. **Удаление или постоянное отключение** любого e2e / `route.test.ts`: обязательны mapping `old path → replacement path(s)` и краткое обоснование в **`test-optimization/LOG.md`** (см. `../EXECUTION_RULES.md`). Без mapping — результат трека A **REWORK_REQUIRED**.
2. **Снятие покрытия** с семейств из `PLAN.md` § «Обязательные контракты» и со списка «Критичные тесты» ниже **без замены** и без явного решения команды — **запрещено**; при ошибке в документах или suite — править доки/откатить тесты.
3. **Не смешивать в одном PR** трек A (оптимизация webapp-тестов) и **трек B** (DI / import-boundary в `apps/webapp/src/app/api/**/route.ts`): см. checkpoint в `MASTER_PLAN.md`; иначе review и откат усложняются (**closure** post-audit TA-PE-2).

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
