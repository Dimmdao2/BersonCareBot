---
name: Miniapp entrypoint split
overview: 'Закрыто: явные `/app/tg` и `/app/max`, integrator без `ctx`, legacy `?ctx` на `/app`; `classifyEntryHintFromRequest` остаётся эталоном в unit-тестах (без заголовка в proxy); резерв `?t=` после cap; документация и execution-логи выровнены с кодом.'
status: completed
todos:
  - id: route-entry-split
    content: 'Добавить `/app/tg` и `/app/max` с общим RSC `AppEntryRsc` и жёстким messenger surface (тонкие `page.tsx`)'
    status: completed
  - id: auth-bootstrap-surface-priority
    content: 'Surface-first: для `/app/max` MAX bridge/initData; не понижать до browser до cap; не трактовать как Telegram при legacy cookie/ctx на пути `/app/max`'
    status: completed
  - id: integrator-links-update
    content: 'Генерация ссылок integrator на `/app/tg` и `/app/max` через `buildWebappEntryUrlFromSource`; убрать `ctx` из новых ссылок'
    status: completed
  - id: fallback-policy
    content: 'Порядок miniapp-entry: initData → при отсутствии/таймауте при наличии `?t=` — exchange; иначе miniapp-ошибка/ретрай'
    status: completed
  - id: legacy-ctx-middleware
    content: '`handlePlatformContextRequest`: `ctx=max` на `/app` → редирект на `/app/max` с сохранением query; `ctx=bot` — same-path редирект без `ctx`, cookie как раньше'
    status: completed
  - id: tests-and-docs
    content: 'Тесты platformContext/AuthBootstrap/appEntryClassification/integrator links; auth.md, INTEGRATOR_CONTRACT, PLATFORM_IDENTITY map, MAX_SETUP, smoke inprocess'
    status: completed
  - id: docs-architecture-and-logs
    content: 'Синхронизация SERVER CONVENTIONS, MINIAPP_AUTH_FIX_EXECUTION_LOG, PATIENT_UX_AUTH_MENU_LOG, CONTENT_CMS_REPORT, docs/README, apps/webapp README, platform.md, MINIAPP_AUTH_AUDIT; канон плана — этот файл в archive (mv из `~/.cursor/plans/`)'
    status: completed
isProject: false
---

# План: разделение miniapp entrypoint на `/app/tg` и `/app/max`

Исходный черновик жил в `~/.cursor/plans/miniapp_entrypoint_split_be613c6d.plan.md`; **канон после закрытия** — только этот файл: [`.cursor/plans/archive/miniapp_entrypoint_split_be613c6d.plan.md`](./miniapp_entrypoint_split_be613c6d.plan.md). Журнал исполнения и ops: [`docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md`](../../docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md).

## Scope (разрешено / вне scope)

**Разрешено трогать**

- `apps/webapp/src/app/app/` — [`AppEntryRsc.tsx`](../../apps/webapp/src/app/app/AppEntryRsc.tsx), тонкие [`tg/page.tsx`](../../apps/webapp/src/app/app/tg/page.tsx) / [`max/page.tsx`](../../apps/webapp/src/app/app/max/page.tsx), при необходимости [`page.tsx`](../../apps/webapp/src/app/app/page.tsx) / [`AppEntryLoginContent.tsx`](../../apps/webapp/src/app/app/AppEntryLoginContent.tsx).
- `apps/webapp/src/modules/auth/appEntryClassification.ts`, `apps/webapp/src/shared/ui/AuthBootstrap.tsx`, `apps/webapp/src/shared/lib/messengerMiniApp.ts`, `apps/webapp/src/modules/auth/messengerAuthStrategy.ts`.
- `apps/webapp/src/middleware/platformContext.ts`, `apps/webapp/src/proxy.ts` — политика `ctx` / редиректы; для **`/app/patient/*`** при необходимости **`x-bc-pathname`** / **`x-bc-search`**. Функция **`classifyEntryHintFromRequest`** (тот же модуль) документирует порядок эвристик и покрыта тестами, **без** проброса в заголовок запроса (канон — `AppEntryRsc` + `classifyUnauthenticatedAppEntry`).
- `apps/integrator/...` — генераторы webapp URL (webhook, reminders, morning ping, broadcast menu и т.д.).
- Существующие тесты перечисленные ниже + точечные новые кейсы в тех же файлах по правилу lean tests.

**Вне scope (без согласования не менять)**

- Nginx/CDN/host matcher — **не требуется** для `/app/tg` и `/app/max`: в Next matcher уже есть `"/app", "/app/:path*"`, подпути попадают под [`proxy.ts`](../../apps/webapp/src/proxy.ts) (`/app/:path*` покрывает `/app/tg`, `/app/max`).
- Контракт тел `POST` `max-init` / `telegram-init` — без изменения, только потребление с клиента.
- Админские `system_settings` ключи и env — новых ключей под URL не вводить; канонические базовые URL статичны (`/app/max`, `/app/tg`).

## 1) Выделить явные точки входа miniapp

- Реализовано: тонкие страницы
  - [`tg/page.tsx`](../../apps/webapp/src/app/app/tg/page.tsx)
  - [`max/page.tsx`](../../apps/webapp/src/app/app/max/page.tsx)
- Общий RSC: [`AppEntryRsc.tsx`](../../apps/webapp/src/app/app/AppEntryRsc.tsx) с пропом `routeBoundMessengerSurface`; корневой [`page.tsx`](../../apps/webapp/src/app/app/page.tsx) / [`AppEntryLoginContent.tsx`](../../apps/webapp/src/app/app/AppEntryLoginContent.tsx) без дублирования толстой логики.
- Существующий `/app` оставить как **browser entry** и общий fallback для SEO/закладок, без регрессии «обычного» логина в браузере.

**Проверка шага:** ручной smoke — открытие `/app`, `/app/tg`, `/app/max` вне miniapp: `/app` ведёт себя как сейчас; новые пути не ломают 404.

## 2) Упростить классификацию входа и убрать конкуренцию Telegram/MAX в MAX-пути

- В [`apps/webapp/src/modules/auth/appEntryClassification.ts`](../../apps/webapp/src/modules/auth/appEntryClassification.ts): режим **route-bound surface** — для pathname `/app/max` и `/app/tg` surface задаётся роутом и имеет приоритет над cookie/`ctx` в URL (после редиректа `ctx` может отсутствовать — ок).
- В [`apps/webapp/src/shared/ui/AuthBootstrap.tsx`](../../apps/webapp/src/shared/ui/AuthBootstrap.tsx):
  - для `/app/max` принудительно MAX bridge (`window.WebApp`), ожидание initData до cap;
  - не понижать режим до browser раньше таймаута miniapp;
  - не трактовать путь как Telegram при legacy `ctx=bot` / cookie, если pathname = `/app/max`.
- В [`apps/webapp/src/shared/lib/messengerMiniApp.ts`](../../apps/webapp/src/shared/lib/messengerMiniApp.ts) и [`apps/webapp/src/modules/auth/messengerAuthStrategy.ts`](../../apps/webapp/src/modules/auth/messengerAuthStrategy.ts) выровнять сигналы **surface-first** с классификацией.

**Клиент vs сервер:** `initData` и `#WebAppData` доступны только на клиенте — серверная сессия по-прежнему через `POST` init или обмен по `?t=`; это не меняет архитектуру, но в доке явно: без клиентского шага сервер «не угадывает» initData.

**Проверка шага:** unit `AuthBootstrap` — сценарии pathname `/app/max` vs `/app` vs `/app/tg`.

## 3) Обновить источники ссылок в integrator

- Перевести генерацию ссылок на новые entrypoints:
  - [`apps/integrator/src/integrations/max/webhook.ts`](../../apps/integrator/src/integrations/max/webhook.ts)
  - [`apps/integrator/src/integrations/telegram/webhook.ts`](../../apps/integrator/src/integrations/telegram/webhook.ts)
  - [`apps/integrator/src/kernel/domain/reminders/reminderMessengerWebAppUrls.ts`](../../apps/integrator/src/kernel/domain/reminders/reminderMessengerWebAppUrls.ts)
  - [`apps/integrator/src/kernel/domain/executor/handlers/patientHomeMorningPing.ts`](../../apps/integrator/src/kernel/domain/executor/handlers/patientHomeMorningPing.ts)
  - [`apps/integrator/src/infra/runtime/worker/doctorBroadcastIntentMenu.ts`](../../apps/integrator/src/infra/runtime/worker/doctorBroadcastIntentMenu.ts) — обновить, если `rg` показывает сборку webapp URL для MAX/TG в этом файле
- Цель URL:
  - TG: `.../app/tg?...` (доп. query по продукту)
  - MAX: `.../app/max?...`
- **`?t=`** по-прежнему выдаётся integrator (`buildWebappEntryUrl*` в [`apps/integrator/src/integrations/webappEntryToken.ts`](../../apps/integrator/src/integrations/webappEntryToken.ts)) как резерв после таймаута initData — не смешивать с «URL из MAX консоли».

**Проверка шага:** `webhook.links.test.ts` (max/telegram), grep по репо на устаревшие `ctx=bot` в MAX-ветках.

## 4) Политика авторизации, fallback и безопасность

- Единый порядок для **miniapp-entry** (`/app/tg`, `/app/max`):
  1. попытка init по surface: `POST /api/auth/telegram-init` или `POST /api/auth/max-init`;
  2. при отсутствии initData в пределах cap — fallback на `?t=` / `token` **если валиден**;
  3. если нет ни initData, ни валидного `t` — **miniapp** сообщение / ретрай, не редирект в «полный» интерактивный web-login как будто это обычный сайт.
- Реализация в [`apps/webapp/src/shared/ui/AuthBootstrap.tsx`](../../apps/webapp/src/shared/ui/AuthBootstrap.tsx); контракты [`apps/webapp/src/app/api/auth/telegram-init/route.ts`](../../apps/webapp/src/app/api/auth/telegram-init/route.ts) и [`apps/webapp/src/app/api/auth/max-init/route.ts`](../../apps/webapp/src/app/api/auth/max-init/route.ts) не менять.
- **Безопасность:** не ослаблять miniapp-only политику для маршрутов без валидного `t` «ради удобства»; `?t=` только как обмен уже выданного токена.

## 5) Legacy `?ctx=` и middleware (факт)

- [`handlePlatformContextRequest`](../../apps/webapp/src/middleware/platformContext.ts) выставляет cookies и снимает `ctx` из query.
- **`ctx=max` на пути `/app`:** редирект на **`/app/max`** с сохранением остальных query — старые ссылки с `ctx=max` на `/app`.
- **`ctx=bot` на `/app`:** редирект **на тот же pathname** `/app` без `ctx` (без принудительного `/app/tg`), чтобы не ломать редкие ошибочные закладки MAX; новые ссылки integrator ведут на `/app/tg` | `/app/max` без `ctx`.

## 6) Ops после выката

- В кабинете MAX Business (статический URL miniapp) указать **`https://bersoncare.ru/app/max`** (или актуальный публичный origin проекта), без обязательного `?t=` в настройках.
- Telegram: аналогично зафиксировать **`.../app/tg`** как канон входа miniapp, если настраивается в BotFather/меню.

## 7) Тесты и документация

- Тесты:
  - [`platformContextRedirects.test.ts`](../../apps/webapp/src/platformContextRedirects.test.ts)
  - [`platformContext.test.ts`](../../apps/webapp/src/middleware/platformContext.test.ts)
  - [`appEntryClassification.test.ts`](../../apps/webapp/src/modules/auth/appEntryClassification.test.ts)
  - [`AuthBootstrap.test.tsx`](../../apps/webapp/src/shared/ui/AuthBootstrap.test.tsx)
  - [`webhook.links.test.ts` (max)](../../apps/integrator/src/integrations/max/webhook.links.test.ts)
  - [`webhook.links.test.ts` (telegram)](../../apps/integrator/src/integrations/telegram/webhook.links.test.ts)
- E2E (lean): без холодного `import("@/app/...")` рядом с кейсом; smoke — [`smoke-app-router-rsc-pages-inprocess.test.ts`](../../apps/webapp/e2e/smoke-app-router-rsc-pages-inprocess.test.ts), канон — [`e2e/README.md`](../../apps/webapp/e2e/README.md).
- Docs / logs (синхронизировано с кодом):
  - [`auth.md`](../../apps/webapp/src/modules/auth/auth.md), [`INTEGRATOR_CONTRACT.md`](../../apps/webapp/INTEGRATOR_CONTRACT.md)
  - [`PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`](../../docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md), [`MAX_SETUP.md`](../../docs/ARCHITECTURE/MAX_SETUP.md)
  - [`MINIAPP_AUTH_FIX_EXECUTION_LOG.md`](../../docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md), [`MINIAPP_AUTH_AUDIT_2026-04-19.md`](../../docs/ARCHITECTURE/MINIAPP_AUTH_AUDIT_2026-04-19.md)
  - [`SERVER CONVENTIONS.md`](../../docs/ARCHITECTURE/SERVER%20CONVENTIONS.md), [`docs/README.md`](../../docs/README.md), [`apps/webapp/README.md`](../../apps/webapp/README.md), [`platform.md`](../../apps/webapp/src/shared/lib/platform.md), [`PATIENT_UX_AUTH_MENU_LOG.md`](../../docs/PATIENT_UX_AUTH_MENU_LOG.md), [`CONTENT_CMS_REPORT.md`](../../docs/CONTENT_CMS_REPORT.md)

**Проверка финала:** целевые тесты + `lint`/`typecheck` по затронутым пакетам; полный `pnpm run ci` — перед merge / по политике команды (не после каждого микрошага).

## Definition of Done

- MAX miniapp стабильно открывается через `/app/max` без ложного web-login при доступном bridge/initData.
- Telegram miniapp стабильно открывается через `/app/tg` без регрессии текущего входа.
- **`/app` в обычном браузере** — поведение логина как до изменений (явный критерий нерегрессии).
- Ссылки integrator для MAX не используют `ctx=bot` как основной способ задать surface; канон — path `/app/max` или `/app/tg`.
- Fallback на `?t=` в miniapp режиме — только резерв после cap/отсутствия initData, не primary.
- Политика legacy `ctx=max` → `/app/max` покрыта тестом редиректа; политика для `ctx=bot` (same-path на `/app`) задокументирована в execution log и архитектурных доках.
- Добавлены/обновлены unit-тесты для `appEntryClassification` + перечисленные зоны; e2e — без новых файлов и без анти-паттерна холодного импорта страниц (см. §7).
