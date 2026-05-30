# Phone messenger auth (вход / привязка через бота)

Операционный runbook для потока **`auth_*`** (phone messenger bind): браузер/PWA и профиль пациента, без SMS.

## Схема

1. Webapp: `POST /api/auth/phone/messenger-bind/start` → deep link `/start auth_<token>` (`purpose`: `login` \| `profile_bind` в `phone_messenger_bind_secrets`).
2. Пользователь открывает бота (Telegram / Max), state `await_phoneauth:<token>`.
3. Пользователь отправляет контакт → integrator `webapp.phoneMessengerBind.complete` → `POST /api/integrator/phone-messenger-bind/complete`.
4. **После контакта (ветка по `purpose`):**
   - **`login`** (вход по номеру в PWA, без сессии): webapp создаёт OTP-challenge, secret → `otp_ready`; PWA poll до `otp_ready` (интервал 2.5 s + **немедленный** poll при `visibilitychange` на шаге ожидания) → **`POST /api/auth/phone/messenger-bind/finish`** (server-side confirm по challenge, без ввода кода в браузере) → secret `consumed`. Бот после контакта: **`phoneAuthReturnToApp`** + главное меню; при наличии `facts.links.webappHomeUrl` — отдельное сообщение **`phoneAuthOpenAppPrompt`** с inline **browser URL** (`/app/tg?t=…` / `/app/max?t=…`, не `web_app`). OTP в мессенджер **не** шлётся. Путь **`POST /api/auth/phone/confirm`** — для `phone/start` (уже привязанный TG/Max).
   - **`profile_bind`** (привязка к уже залогиненному аккаунту): OTP **не** создаётся, secret сразу → `consumed`; integrator `user.phone.link` выставляет `patient_phone_trust_at`; бот шлёт `*:phoneAuthPhoneLinked` и главное меню (Telegram — reply keyboard «Запись» + «Приложение»); PWA poll до `consumed` → redirect без кода.
5. Integrator complete API возвращает **`purpose`**; код в ответе только для `login`.

## Integrator

| Элемент | Значение |
|--------|----------|
| Deep link payload | `auth_<base64url>` (префикс `auth_`) |
| State | `await_phoneauth:{{input.authSecret}}` |
| Script TG | `telegram.start.phoneauth` (priority **56**) |
| Script Max | `max.start.phoneauth` (priority **56**) |
| Contact | `telegram.contact.phoneauth` / `max.contact.phoneauth` (priority **54**, action `webapp.phoneMessengerBind.complete`) |
| Cancel phoneauth | `telegram.phoneauth.cancel.*` / `max.phoneauth.cancel.*` (priority **57**); Max `mapIn`: «Отмена», «Вернуться в меню» → `phone.request.cancel` |
| Catch-all excludes | `menu.default`, `draft.replace`, `max.default`, `max.draft.replace` — exclude `phone.request.cancel`, `start.phoneauth`, «Отмена», «Вернуться в меню» |
| Max inline menu | Executor `expandContentMenuParam` — `menu: main` → `inlineKeyboard` (как в orchestrator `buildPlan`) |
| `start.onboarding` | `excludeActions` включает `start.phoneauth` |
| Шаблоны | `phoneAuthWelcome`, `phoneAuthReturnToApp`, `phoneAuthOpenAppPrompt`, `phoneAuthOpenAppButton`, `phoneAuthPhoneLinked`, `phoneAuthCancelled`, `phoneAuthMismatch`, … |
| Failure bind UX | После любой ошибки complete — главное меню без `request_contact` (`appendPhoneMessengerBindFailureRecovery`) |
| Max `phone.link` | Script `max.contact.phone.link` priority **10**, не матчит `await_phoneauth:` / `await_contact:` (`$notStartsWith`) |

Парсинг `/start auth_*`: `apps/integrator/src/integrations/common/messengerStartParse.ts`.

## Admin settings (не env)

- `telegram_login_bot_username` — username бота для `t.me/…?start=auth_…`
- `max_login_bot_nickname` — ник для `https://max.ru/<nick>?start=auth_…`

См. `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`.

Связанные фиксы ботов: [`docs/BOT_FIXES/README.md`](../BOT_FIXES/README.md).

## База

Миграция: `apps/webapp/db/drizzle-migrations/0078_phone_messenger_bind_secrets.sql` (таблица `phone_messenger_bind_secrets`; запись в `meta/_journal.json`, применяется через `pnpm migrate` / `pnpm --dir apps/webapp run migrate`).

## Типичные ошибки

| Код / статус | Причина | UX (PWA) |
|--------------|---------|----------|
| `phone_mismatch` | Контакт в боте ≠ номер, введённый в webapp | Toast, «Начать снова» |
| `expired` | TTL secret (15 мин) | Toast, сброс на выбор мессенджера |
| `failed` | Конфликт привязки / лимит OTP | Toast + повтор |
| `already_used` (integrator replay) | Secret `consumed` | Бот без кода |
| Replay `otp_ready` (`login`) | Повторный контакт до confirm | **200** с тем же `otpCode` (`replay: true`, `purpose: login`) |
| `consumed` (`profile_bind`) | Повторный poll в PWA после привязки | **200** `status: consumed` → клиент завершает bind-phone |

## Логи (без OTP)

- Webapp: `phone_messenger_bind_start`, `phone_messenger_bind_complete_ok|fail` (поля `purpose`, `channelCode`, `failure_code`, `phoneSuffix`; **не** `otpCode`).
- Integrator: `phone_messenger_bind_complete_ok` (поле **`purpose`**: `login` \| `profile_bind`), `phone_messenger_bind_complete_failed`.

## Rate limit (webapp)

`POST /api/auth/phone/messenger-bind/start` — scope `auth.phone_messenger_bind_start`, до **30** запросов на ключ за скользящий час (сессия `profile_bind` / иначе телефон или anon).

## Deploy checklist

1. Применить миграции webapp на хосте (`pnpm migrate` из корня репозитория на production — подхватывает `api.prod` + `webapp.prod`). Убедиться, что в логе Drizzle применилась **`0078_phone_messenger_bind_secrets`** (не путать с legacy `078_reference_items_deleted_at.sql`). Проверка: `SELECT to_regclass('public.phone_messenger_bind_secrets');` → не `NULL`.
2. Задать `telegram_login_bot_username` / `max_login_bot_nickname` в admin Settings.
3. Деплой webapp + integrator (scripts/templates).
4. Smoke: см. **`LOG.md` §Приёмка A+B** — PWA login (TG/Max) → контакт → автовход + меню; cancel без `confirmQuestion`; `profile_bind` без OTP.

Контракт M2M: `apps/webapp/INTEGRATOR_CONTRACT.md`. Модуль: `apps/webapp/src/modules/auth/auth.md` (§ Phone messenger bind).
