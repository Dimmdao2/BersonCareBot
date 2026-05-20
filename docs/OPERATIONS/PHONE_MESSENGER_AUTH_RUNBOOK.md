# Phone messenger auth (вход / привязка через бота)

Операционный runbook для потока **`auth_*`** (phone messenger bind): браузер/PWA и профиль пациента, без SMS.

## Схема

1. Webapp: `POST /api/auth/phone/messenger-bind/start` → deep link `/start auth_<token>`.
2. Пользователь открывает бота (Telegram / Max), state `await_phoneauth:<token>`.
3. Пользователь отправляет контакт → integrator `webapp.phoneMessengerBind.complete` → `POST /api/integrator/phone-messenger-bind/complete`.
4. Webapp создаёт OTP-challenge, статус secret → `otp_ready`; бот шлёт шаблон `*:phoneAuthAccountCreated` с кодом.
5. Клиент poll `POST /api/auth/phone/messenger-bind/status` до `otp_ready`, затем `POST /api/auth/phone/confirm`.
6. После confirm secret → `consumed` (`markPhoneMessengerBindConsumedByChallenge`).

## Integrator

| Элемент | Значение |
|--------|----------|
| Deep link payload | `auth_<base64url>` (префикс `auth_`) |
| State | `await_phoneauth:{{input.authSecret}}` |
| Script TG | `telegram.start.phoneauth` (priority **56**) |
| Script Max | `max.start.phoneauth` (priority **56**) |
| Contact | `telegram.contact.phoneauth` / `max.contact.phoneauth` (priority **54**, action `webapp.phoneMessengerBind.complete`) |
| `start.onboarding` | `excludeActions` включает `start.phoneauth` |
| Шаблоны | `phoneAuthAccountCreated`, `phoneAuthMismatch`, … |

Парсинг `/start auth_*`: `apps/integrator/src/integrations/common/messengerStartParse.ts`.

## Admin settings (не env)

- `telegram_login_bot_username` — username бота для `t.me/…?start=auth_…`
- `max_login_bot_nickname` — ник для `https://max.ru/<nick>?start=auth_…`

См. `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`.

## База

Миграция: `apps/webapp/db/drizzle-migrations/0078_phone_messenger_bind_secrets.sql` (таблица `phone_messenger_bind_secrets`; запись в `meta/_journal.json`, применяется через `pnpm migrate` / `pnpm --dir apps/webapp run migrate`).

## Типичные ошибки

| Код / статус | Причина | UX (PWA) |
|--------------|---------|----------|
| `phone_mismatch` | Контакт в боте ≠ номер, введённый в webapp | Toast, «Начать снова» |
| `expired` | TTL secret (15 мин) | Toast, сброс на выбор мессенджера |
| `failed` | Конфликт привязки / лимит OTP | Toast + повтор |
| `already_used` (integrator replay) | Secret `consumed` | Бот без кода |
| Replay `otp_ready` | Повторный контакт до confirm | **200** с тем же `otpCode` (`replay: true`) |

## Логи (без OTP)

- Webapp: `phone_messenger_bind_start`, `phone_messenger_bind_complete_ok|fail` (поля `purpose`, `channelCode`, `failure_code`, `phoneSuffix`; **не** `otpCode`).
- Integrator: `phone_messenger_bind_complete_ok`, `phone_messenger_bind_complete_failed`.

## Rate limit (webapp)

`POST /api/auth/phone/messenger-bind/start` — scope `auth.phone_messenger_bind_start`, до **30** запросов на ключ за скользящий час (сессия `profile_bind` / иначе телефон или anon).

## Deploy checklist

1. Применить миграции webapp на хосте (`pnpm migrate` из корня репозитория на production — подхватывает `api.prod` + `webapp.prod`). Убедиться, что в логе Drizzle применилась **`0078_phone_messenger_bind_secrets`** (не путать с legacy `078_reference_items_deleted_at.sql`). Проверка: `SELECT to_regclass('public.phone_messenger_bind_secrets');` → не `NULL`.
2. Задать `telegram_login_bot_username` / `max_login_bot_nickname` в admin Settings.
3. Деплой webapp + integrator (scripts/templates).
4. Smoke: новый номер в браузере `/app` → TG → контакт → код → вход; профиль `profile_bind`; `/bind-phone?next=` в браузере.

Контракт M2M: `apps/webapp/INTEGRATOR_CONTRACT.md`. Модуль: `apps/webapp/src/modules/auth/auth.md` (§ Phone messenger bind).
