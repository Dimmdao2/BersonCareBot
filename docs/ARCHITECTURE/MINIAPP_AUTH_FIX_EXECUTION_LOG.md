# Miniapp auth fix — execution log

**Scope (история 2026-04):** стабильный вход из miniapp при legacy `?ctx=bot|max` на `/app`, подавление query-JWT в контексте мессенджера, error+retry вместо авто-fallback в телефон, platform-cookie после `telegram-init`, согласованность ссылок integrator. **Продолжение 2026-05:** канонические entry **`/app/tg`** и **`/app/max`**, без `ctx` в ссылках integrator — см. раздел *2026-05-15* ниже и `apps/webapp/INTEGRATOR_CONTRACT.md`.

## Ход выполнения

### Шаблон записи шага

| Поле | Значение |
|------|----------|
| Дата/время | |
| Шаг | |
| Изменённые файлы | |
| Rationale | |
| Тесты | |
| CI | |
| Риски / заметки | |

---

### 2026-04-15 — Старт

- **Rationale:** закрыть регрессию «долгое ожидание → телефон», выровнять `ctx=bot` для MAX/TG, cookie после `telegram-init`.
- **План:** `miniapp_auth_regression_fix` (Cursor plan, без правки файла плана).

---

### 2026-04-15 — Шаг 0–1 (execution log + authEntryFlow)

- **Файлы:** этот лог; `apps/webapp/src/modules/auth/authEntryFlow.ts`; `apps/webapp/src/modules/auth/authEntryFlow.test.ts`.
- **Изменения:** `shouldSuppressQueryJwtForMessengerMiniApp` — `true` при `ctx=bot` или `ctx=max` (legacy); `shouldSuppressQueryJwtForMaxCtx` делегирует новой функции.
- **Тесты:** `authEntryFlow.test.ts` обновлён под `ctx=bot`.

---

### 2026-04-15 — Шаг 2 (AuthBootstrap error+retry)

- **Файлы:** `apps/webapp/src/shared/ui/AuthBootstrap.tsx`; `apps/webapp/src/modules/auth/messengerAuthStrategy.ts`; `apps/webapp/src/shared/lib/messengerMiniApp.ts` (export `readPlatformCookieBot`); `apps/webapp/src/shared/ui/AuthBootstrap.test.tsx`.
- **Изменения:** в контексте miniapp (`ctx=bot` / `ctx=max` / cookie `bersoncare_platform=bot`) не показывать `AuthFlowV2` при timeout/отсутствии initData; ошибка + «Повторить», сброс refs и `retryKey` для повторного опроса; таймаут POLL для messenger — общая ветка (MAX vs TG текст).
- **Тесты:** `AuthBootstrap.test.tsx` — таймаут `ctx=bot`, 403+retry; сценарий «браузер → телефон» помечен **`it.skip`** (jsdom); standalone без `ctx` — `authEntryFlow.test.ts`.

---

### 2026-04-15 — Шаг 3 (telegram-init cookie)

- **Файлы:** `apps/webapp/src/app/api/auth/telegram-init/route.ts`; `telegram-init/route.test.ts`.
- **Изменения:** после успешного ответа — `Set-Cookie` platform `bot` как в `max-init`; структурные логи ok/denied с `miniappAuthOutcome`.

---

### 2026-04-15 — Шаг 4–5 (middleware / integrator)

- **Файлы:** `apps/webapp/src/middleware/platformContext.ts` — `ctx=max` legacy → тот же redirect+cookie, что и `ctx=bot`; `apps/webapp/src/platformContextRedirects.test.ts`; `apps/webapp/src/app/api/auth/max-init/route.ts` — поле `miniappAuthOutcome: "session_ok"` в success-log.
- **Integrator (2026-04):** ссылки с `ctx=bot` в `integrations/max/webhook.ts` и `integrations/telegram/webhook.ts`; тесты контракта URL: `integrations/max/webhook.links.test.ts`, `integrations/telegram/webhook.links.test.ts` (экспорт `buildMaxLinks` для MAX). **Актуализация 2026-05:** `ctx` убран; URL строятся через `buildWebappEntryUrlFromSource` → `/app/tg` / `/app/max` — см. раздел *2026-05-15*.

---

### 2026-04-15 — Шаг 4 (доп. аудит) — PlatformProvider

- **Файлы:** `apps/webapp/src/shared/ui/PlatformProvider.tsx`; `apps/webapp/src/shared/ui/PlatformProvider.botHint.test.tsx`.
- **Изменения:** при `serverHint === "bot"` не понижать cookie/режим до standalone, пока клиент кратковременно не видит miniapp-хост.

---

### 2026-04-15 — Шаг 6–8 (логи, docs, CI)

- **Логи:** единое поле **`miniappAuthOutcome`** (`session_ok` / `denied` / **`invalid_body`** на 400 для `telegram-init`) в success/warn для `telegram-init` и `max-init`.
- **Доки:** `ARCHITECTURE/MAX_SETUP.md` §4; `ARCHITECTURE/SERVER CONVENTIONS.md` (grep/journal miniapp auth); `PATIENT_UX_AUTH_MENU_LOG.md`; `docs/README.md`; этот лог.
- **CI:** `pnpm run ci` — зелёный (без push), в т.ч. после аудита 2026-04-15.

---

## Итог (основная фаза 2026-04)

| Критерий | Статус |
|----------|--------|
| `pnpm run ci` (на момент закрытия фазы) | зелёный (локально) |
| Push | не выполнялся (агентская сессия) |

Продолжение по entry-split, докам и аудитам — **§2026-05-15**, **§2026-05-16** и **«Сводка: план, доки, аудиты»** в конце файла.

### Диагностика (устранённая проблема)

- **Симптом:** долгое «Проверяем вход…», затем экран телефона / «старый» standalone-флоу при открытии miniapp из бота.
- **Проверки (2026-04):** при открытии через legacy `/app?ctx=...` после redirect в cookie — `bersoncare_platform=bot`. **Проверки (2026-05+):** канон первого захода из бота — URL на **`/app/tg`** или **`/app/max`** (опционально `?t=` + `&next=`). В журнале webapp при успешном входе искать **`miniappAuthOutcome":"session_ok"`** на маршрутах `auth/telegram-init` и `auth/max-init` (и строки `Telegram Mini App: initData принят` / `MAX Mini App: initData принят`).
- **Поведение после фикса:** при сбое/таймауте initData — сообщение и **«Повторить»**, без авто-`AuthFlowV2`; `telegram-init` выставляет platform-cookie как `max-init`.

---

## Аудит по чек-листу плана (2026-04-15, повторная проверка)

| Шаг плана | Зазор | Что сделано |
|-----------|-------|-------------|
| 2 | Не было автотеста на **retry** и **ошибку POST**; «timeout/error/retry» в чек-листе | Добавлен тест на 403 + повторный `telegram-init`; таймаут `ctx=bot` сохранён. |
| 2 | Рассинхрон **`useSearchParams` vs `window.location`** в `useLayoutEffect` / tick → ложный miniapp-контекст в тестах и теоретически после навигации | `messengerEntryFromClient` и `messengerEntryFromUrlOrCookie` опираются на **`searchParams` (Next) + cookie**, без чтения `ctx` из `window`. |
| 2 | Интеграционный тест «браузер → телефон» нестабилен в jsdom | Помечен **`it.skip`** с комментарием; standalone без `ctx` покрыт **`authEntryFlow.test.ts`**, E2E — шаг 8 плана. |
| 4 | Чек-лист: **PlatformProvider** не переопределяет `bot` | Если `serverHint === "bot"`, cookie/mode не понижаются до standalone при кратковременном `!isMessengerMiniAppHost()`; тест `PlatformProvider.botHint.test.tsx`. |
| 5 | Явные тесты ссылок MAX webhook | `max/webhook.links.test.ts` + экспорт **`buildMaxLinks`**; Telegram — расширен `webhook.links.test.ts`. |
| 6 | Единый маркер, 400 `telegram-init` | `miniappAuthOutcome` на success/denied/**invalid_body**; строка в **`SERVER CONVENTIONS.md`**. |
| 7–8 | Доки / smoke | Обновлены лог и `SERVER CONVENTIONS`; ручной smoke по плану — оператор. |

---

## Remediation update (2026-04-19)

### Что закрыто в коде дополнительно

- **Server-first orchestration:** добавлен `modules/auth/appEntryClassification.ts`; **`AppEntryRsc`** (страницы `/app`, `/app/tg`, `/app/max`) передаёт ветку входа в `AuthBootstrap` как `entryClassification`; legacy `authEntryFlow.ts` и тест удалены.
- **Одна ветка в `AuthBootstrap`:** bootstrap больше не делает URL-only классификацию и не держит двойной источник истины (`ctx` vs cookie).
- **No pre-success refresh:** удалён `router.refresh()` из ветки stale bot-cookie в `AuthBootstrap` (переключение на `browser_interactive` без server refresh).
- **Prefetch dedup:** убраны client prefetch `Promise.all` из `AuthBootstrap`; `AuthFlowV2` использует только `prefetchedAuthConfig` из RSC (без client fetch публичных auth-config).
- **TG first-open:** `PatientBindPhoneClient` больше не вызывает `ensureMessengerMiniAppWebappSession`; в `MiniAppShareContactGate` recovery оставлен только на старт/retry, без дублирования на каждом poll.

### Тесты после remediation

- Прогнаны целевые тесты:
  - `src/shared/ui/AuthBootstrap.test.tsx`
  - `src/shared/ui/auth/AuthFlowV2.test.tsx`
  - `src/app/app/patient/bind-phone/PatientBindPhoneClient.test.tsx`
  - `src/shared/ui/patient/MiniAppShareContactGate.test.tsx`
  - `src/app/api/auth/max-init/route.test.ts`
- Результат: зелёный локально.

### Статус чек-листа после remediation

| Шаг плана | Статус | Комментарий |
|-----------|--------|-------------|
| MAX bugfix | ✅ code complete | `max_unavailable`/UX/route покрыты кодом и тестами; фактический `max_bot_api_key` в production DB — ops-проверка. |
| TG first-open stabilization | ✅ code complete | Убраны лишние recovery-вызовы в bind-phone; polling race стабилизирован. |
| Server-first entry classification | ✅ complete | Ветка входа вычисляется на сервере и прокидывается в bootstrap. |
| Lazy SDK + prefetch dedup | ✅ complete | SDK lazy, prefetch только в RSC, client-дубли удалены. |
| PlatformProvider quiet | ✅ complete | `router.refresh()` отсутствует; `useEffect`-модель стабильна. |
| Error isolation | ✅ complete | Сегментные `error.tsx` + `SegmentRouteError` (reset/hard reload). |
| Scenario verification | ⚠️ partial (ops) | Автотесты/код закрыты; матрица 10 сценариев на dev/prod и измерения TTI/time-to-session требуют ручного прогонa на окружениях. |

---

## 2026-05-15 — Miniapp entry split (`/app/tg`, `/app/max`)

| Поле | Значение |
|------|----------|
| Дата | 2026-05-15 |
| Цель | Убрать двусмысленность `ctx=bot` для MAX: явный surface по пути URL; синхронизировать integrator, middleware, клиентский fallback `?t=` после cap. |
| Webapp | `AppEntryRsc.tsx`, `app/app/tg/page.tsx`, `app/app/max/page.tsx`, `app/app/page.tsx`; `appEntryClassification.ts` (`routeBoundMessengerSurface`); `AuthBootstrap` (miniapp `?t=` fallback, `routeBoundMiniappEntry`, poll **150ms**); `messengerAuthStrategy.shouldExposeInteractiveLogin`; `platformContext.ts` (`ctx=max` на `/app` → `/app/max`); `classifyEntryHintFromRequest` — только unit-тесты; `miniAppSessionRecovery` (убран блокирующий `exchange` при `ctx=max`); `platformContext.test.ts`, `platformContextRedirects.test.ts`, `AuthBootstrap.test.tsx`. |
| Integrator | `webappEntryToken.ts` (`/app/tg` / `/app/max`); убран `&ctx=bot` из `telegram/webhook.ts`, `max/webhook.ts`, `doctorBroadcastIntentMenu.ts`; `reminderMessengerWebAppUrls.ts`; тесты `webhook.links`, `patientHomeMorningPing`. |
| Доки | `apps/webapp/INTEGRATOR_CONTRACT.md`, `apps/webapp/src/modules/auth/auth.md`, `PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md` §канон URL; smoke `e2e/smoke-app-router-rsc-pages-inprocess.test.ts` — `/app/tg`, `/app/max`. **Доп. синхронизация доков (сессия 2026-05):** `MAX_SETUP.md`, `SERVER CONVENTIONS.md`, `docs/README.md` (ссылка на архивный план), `apps/webapp/README.md` (URL Spaces), `PATIENT_UX_AUTH_MENU_LOG.md`, `CONTENT_CMS_REPORT.md`, `MINIAPP_AUTH_AUDIT_2026-04-19.md`, `apps/webapp/src/shared/lib/platform.md`. |
| Проверки | Целевые vitest + `apps/webapp` typecheck (локально). |

**Ops:** в консоли MAX Business статический URL miniapp задать на **`https://<origin>/app/max`** (без обязательного `?t=` в настройках); Telegram — **`.../app/tg`** при наличии поля для базового URL.

---

## 2026-05-16 — Аудит follow-up (proxy, recovery, poll)

| Поле | Значение |
|------|----------|
| Дата | 2026-05-16 |
| Цель | Убрать неиспользуемый заголовок `x-bc-entry-hint` (риск рассинхрона с RSC); не блокировать `exchange` при legacy `ctx=max` в query; снизить частоту таймера опроса initData в `AuthBootstrap`. |
| Webapp | `proxy.ts` — без `x-bc-entry-hint`; `platformContext.ts` — JSDoc для `classifyEntryHintFromRequest`; `miniAppSessionRecovery.ts`; `AuthBootstrap.tsx` (`TICK_MS` 150); доки `auth.md`, `ui.md`, `platform.md`, архитектура см. выше. |
| Проверки | Целевые vitest по затронутым файлам (локально). Полный корневой **`pnpm run ci`** после этой волны в логе не фиксировался — рекомендуется перед merge. |

---

## Сводка: план entry-split, док-синхронизация, аудиты (2026-05)

Единая точка правды по тому, **что закрыто в репозитории** и **что намеренно не закрыто** (ops / продукт / отдельные инициативы).

### 1. План `.cursor/plans/archive/miniapp_entrypoint_split_be613c6d.plan.md`

| Элемент | Статус |
|---------|--------|
| Перенос канона плана из `~/.cursor/plans/` в репозиторий (`mv`, без дубликата) | ✅ |
| YAML frontmatter (`status: completed`, `overview`, `todos` со `status`) | ✅ |
| **DoD плана:** `/app/max`, `/app/tg`, `/app` в браузере без регрессии; integrator без `ctx` как основного классификатора; fallback `?t=` после cap; legacy `ctx=max`→`/app/max` с тестом; unit/e2e smoke без анти-паттерна холодного `import` страниц в каждом `it` | ✅ по коду и перечисленным тестам |
| Полный **`pnpm run ci`** как барьер merge | ⚠️ не зафиксирован в логе после последних правок; ожидается у команды |

Todos плана (все **`completed`**): `route-entry-split`, `auth-bootstrap-surface-priority`, `integrator-links-update`, `fallback-policy`, `legacy-ctx-middleware`, `tests-and-docs`, `docs-architecture-and-logs`.

---

### 2. Независимый аудит реализации (после split) — исправлено в коде

| Находка | Действие |
|---------|----------|
| Заголовок **`x-bc-entry-hint`** выставлялся в `proxy.ts`, но **нигде не потреблялся** (риск будущего рассинхрона с RSC) | Убран из proxy; **`classifyEntryHintFromRequest`** оставлена с JSDoc и **unit-тестами** как эталон порядка эвристик |
| **`miniAppSessionRecovery`:** при `ctx=max` в query ранний `return` мог **заблокировать** `exchange` при наличии `?t=` | Удалён блокирующий `return` |
| Опрос initData в **`AuthBootstrap`**: шаг **100 ms** до cap (~70 тиков) | **`TICK_MS` = 150 ms** (меньше нагрузка на таймер в WebView при том же cap) |

Связанная документация: `SERVER CONVENTIONS.md`, `PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`, `MINIAPP_AUTH_AUDIT_2026-04-19.md`, `platform.md`, архивный план, **`auth.md`** / **`ui.md`**.

---

### 3. Аудиты и чек-листы — что остаётся открытым

| Источник | Закрыто в коде | Не закрыто / partial |
|----------|----------------|----------------------|
| **`MINIAPP_AUTH_AUDIT_2026-04-19`** (ops) | Code + локальные тесты | Матрица **10 сценариев** dev/prod, метрики **TTI** / **time-to-session**, подтверждение **`max_bot_api_key`** в production `system_settings` |
| Чек-лист **Remediation update (2026-04-19)** в этом логе | Строки MAX bugfix, TG first-open, server-first, prefetch, PlatformProvider, error isolation | Строка **Scenario verification** — ⚠️ **partial (ops)** (без изменений по смыслу) |
| Чек-лист **2026-04-15** (таблица «Аудит по чек-листу плана») | Закрыто по строкам таблицы | Ручной smoke по плану — **оператор** |

---

### 4. Не делалось намеренно (вне этой волны правок / не репозиторий)

| Тема | Почему не в scope правок |
|------|---------------------------|
| Настройки **MAX Business** / **BotFather** (статические URL **`/app/max`**, **`/app/tg`**) | Консоли мессенджеров и prod-конфиг; в коде не проверить |
| **Кэш / облегчение** cold path **`AppEntryRsc`** (`buildPrefetchedPublicAuthConfig`, `buildAppDeps` на каждом анонимном заходе) | Нужны измерения и политика инвалидации при смене admin-настроек |
| **Более агрессивная** оптимизация poll (двухфазный интервал, `rAF` и т.д.) | Отдельная задача с профилированием WebView |
| **`?t=` в URL**, **client-readable** platform/surface **cookies** (не `httpOnly`) | Архитектурные компромиссы входа; менять — отдельная security/UX инициатива |
| Отдельный **продуктовый** UX: «откройте из бота» при **`/app/tg`/`/app/max`** в обычном десктопном браузере | Сейчас по дизайну плана — ошибка / «Повторить», без полноценного web-login как на `/app` |
| **Legacy `ctx=bot` на `/app`** для пользователя MAX | Сознательный tradeoff same-path редиректа (см. план §5); новые ссылки — только `/app/max` |
| Полный **`pnpm run ci`** после последнего коммита агента | Не прогонялся в сессии; барьер перед push — по правилам репозитория |

---

### 5. Кросс-ссылки

- Закрытый план: [`.cursor/plans/archive/miniapp_entrypoint_split_be613c6d.plan.md`](../../.cursor/plans/archive/miniapp_entrypoint_split_be613c6d.plan.md)  
- Итоговый аудит (с актуализацией 2026-05): [`MINIAPP_AUTH_AUDIT_2026-04-19.md`](./MINIAPP_AUTH_AUDIT_2026-04-19.md)  
- Индекс доков (в т.ч. ссылка на план): [`docs/README.md`](../README.md)
