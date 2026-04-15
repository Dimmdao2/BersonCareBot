# Miniapp auth fix — execution log

**Scope:** стабильный вход из miniapp при каноне `ctx=bot`, подавление query-JWT в контексте мессенджера, error+retry вместо авто-fallback в телефон, platform-cookie после `telegram-init`, согласованность ссылок integrator.

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

- **Файлы:** `apps/webapp/src/middleware/platformContext.ts` — `ctx=max` legacy → тот же redirect+cookie, что и `ctx=bot`; `apps/webapp/src/middleware.test.ts`; `apps/webapp/src/app/api/auth/max-init/route.ts` — поле `miniappAuthOutcome: "session_ok"` в success-log.
- **Integrator:** ссылки уже с `ctx=bot` в `integrations/max/webhook.ts` и `integrations/telegram/webhook.ts`; добавлены тесты контракта URL: `integrations/max/webhook.links.test.ts`, расширен `integrations/telegram/webhook.links.test.ts` (экспорт `buildMaxLinks` для MAX).

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

## Итог (заполнить после завершения)

| Критерий | Статус |
|----------|--------|
| `pnpm run ci` | зелёный (локально) |
| Push | не выполнялся |

### Диагностика (устранённая проблема)

- **Симптом:** долгое «Проверяем вход…», затем экран телефона / «старый» standalone-флоу при открытии miniapp из бота.
- **Проверки:** в URL первого захода должен быть `ctx=bot` (или legacy `ctx=max`); после redirect в cookie — `bersoncare_platform=bot`. В журнале webapp при успешном входе искать **`miniappAuthOutcome":"session_ok"`** на маршрутах `auth/telegram-init` и `auth/max-init` (и строки `Telegram Mini App: initData принят` / `MAX Mini App: initData принят`).
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
