# AUDIT — Stage 3 (Telegram Login Widget: primary web login)

**Scope:** `STAGE_3_TELEGRAM_LOGIN_WIDGET.md`, `MASTER_PLAN.md` → Stage 3.

**Дата аудита:** 2026-04-04

---

## Verdict

**PASS**

---

## Проверки (gate)

### 1) Подпись Telegram Login Widget валидируется корректно

**Статус:** OK

Реализация соответствует [Checking authorization](https://core.telegram.org/widgets/login#checking-authorization):

- `secret_key = SHA256(bot_token)` (`createHash("sha256").update(token).digest()`).
- Поля без `hash` сортируются по ключу, `data_check_string` = `key=value` через `\n`.
- `hash` сверяется с `HMAC-SHA256(secret_key, data_check_string)` в hex, сравнение через `timingSafeEqual`.

Дополнительно:

- TTL: `auth_date` не старше `TELEGRAM_LOGIN_AUTH_MAX_AGE_SEC` (3600 с), не более чем на 60 с в будущем относительно `now` (`telegramLoginVerify.ts`).

**Тесты:** `telegramLoginVerify.test.ts` — валидная подпись (вспомогательная функция `widgetHash` дублирует алгоритм документации), неверный hash → `bad_hash`, просроченный `auth_date` → `expired`.

**API:** `POST /api/auth/telegram-login` при неуспехе обмена различает `expired` и возвращает `auth_expired` (403) с пользовательским текстом (`route.ts` + диагностика через `verifyTelegramLoginWidgetSignature`).

---

### 2) Сессия создаётся после успешного callback

**Статус:** OK (реализация в сервисном слое)

`exchangeTelegramLoginWidget` в `service.ts` после успешной проверки подписи и whitelist:

- резолвит пользователя через `findOrCreateByChannelBinding` (при наличии порта);
- вызывает `buildSession`, затем `cookies().set(SESSION_COOKIE_NAME, encodeSession(session), …)` с теми же атрибутами, что и у других exchange-flow.

`TelegramLoginButton` после успешного `POST /api/auth/telegram-login` выполняет `router.replace` на безопасный `next` или `redirectTo` из ответа.

**Тесты:** `telegram-login/route.test.ts` мокает `exchangeTelegramLoginWidget` и проверяет **200**, `ok`, `redirectTo` при успешном обмене. Прямой assert на заголовок `Set-Cookie` в unit-тесте **не** делается (обмен замокан); установка cookie зафиксирована в коде `exchangeTelegramLoginWidget`.

---

### 3) `AuthFlowV2` показывает Telegram как primary

**Статус:** OK

- При наличии `telegram_login_bot_username` из `/api/auth/telegram-login/config` шаг `landing`: сверху **Telegram Login** (`TelegramLoginButton`), затем разделитель «или», затем outline-кнопка **«Войти по номеру телефона»** (`AuthFlowV2.tsx`).
- `TelegramLoginButton` документирован как primary в компоненте.

**Тест:** `AuthFlowV2.test.tsx` — «shows Telegram landing when not mini app and bot username is configured»: ожидается secondary-кнопка «Войти по номеру телефона» (landing с конфигом бота).

---

### 4) Mini App host корректно исключает widget

**Статус:** OK

- `isMessengerMiniAppHost()` (`messengerMiniApp.ts`): Telegram Mini App — `Telegram.WebApp` и непустой `initData`; MAX — `window.WebApp.ready`.
- В `AuthFlowV2` при `isMessengerMiniAppHost()`: **не** вызывается загрузка `telegram-login/config`, `telegramBotUsername` остаётся `null`, шаг сразу **`phone`** — виджет и landing не показываются.

**Тесты:** по умолчанию в `AuthFlowV2.test.tsx` `isMiniAppHost` = `true` — сценарии идут сразу на ввод телефона без landing/widget. Отдельный тест с `isMiniAppHost.mockReturnValue(false)` проверяет обычный веб с landing.

---

### 5) CI evidence

**Статус:** OK

| Команда | Результат |
|---------|-----------|
| `pnpm install --frozen-lockfile && pnpm run ci` | **exit 0** (2026-04-04) |

---

## Findings by severity

### Critical

Нет.

### Major

Нет.

### Minor / informational

- **Информационно:** unit-тест `POST /api/auth/telegram-login` не проверяет реальный вызов `cookies().set`; успешный путь подтверждается моком `exchangeTelegramLoginWidget`. Установка сессии покрыта статическим анализом `exchangeTelegramLoginWidget` в `service.ts`. При необходимости усиления — интеграционный тест с моком `next/headers` cookies.

---

## MANDATORY FIX INSTRUCTIONS

**Обязательных исправлений по результатам этого аудита нет** (нет `critical` / `major`).

Опционально (не блокирует Stage 3): добавить тест, который при несмоканном `exchangeTelegramLoginWidget` или через spy проверяет вызов `cookieStore.set` для Login Widget — только если команда хочет явное покрытие Set-Cookie.
