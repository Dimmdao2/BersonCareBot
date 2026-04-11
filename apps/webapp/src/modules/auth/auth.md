# auth

Авторизация и сессии веб-приложения (BersonCare webapp).

## Сессия

- Cookie с подписью HMAC; TTL задаётся в `service.ts` (разные TTL для client/doctor при необходимости).
- **getCurrentSession** — чтение и валидация сессии из cookie.
- **clearSession** — выход.
- **setSessionFromUser** — установка сессии после успешного входа (SMS/OTP, Telegram, exchange token, OAuth и т.д.).

## Публичный вход в вебе (приоритет)

1. **Telegram Login Widget** — основной бесплатный вход с веб-страницы (`TelegramLoginButton`, конфиг бота в `system_settings`: `telegram_login_bot_username`).
2. **Международный номер телефона** — `InternationalPhoneInput` + `check-phone` → OTP по выбранному каналу (SMS только для РФ-мобильных; см. `phoneValidation`, `checkPhoneMethods`).
3. **SMS OTP** — fallback для +7, когда Telegram недоступен; доставка через интегратор (`SmsPort` / `integratorSmsAdapter`). Ошибки доставки не маскируются под «неверный формат» (`delivery_failed`).

**PIN** в публичном потоке входа **не показывается** (Stage 5); при необходимости re-auth для чувствительных действий — отдельные API (`pin/verify` и т.д.).

## Мессенджеры и обмен токенами

- **exchangeTelegramInitData** — вход из Telegram Mini App по подписанному `initData`.
- Пока в мессенджерном Mini App в `/api/me` нет tier **patient** (после `contact.linked` и проекции), пациентский layout показывает **`MiniAppShareContactGate`** — **страховка** поверх основного гейта в боте (см. `docs/AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md`). Контракт `contact.linked` синхронизирует `platform_users.phone_normalized` и `user_channel_bindings` через projection path.
- **Клиент Mini App (Telegram / MAX):** при 401 на `/api/me` до показа гейта — **`miniAppSessionRecovery.ensureMessengerMiniAppWebappSession`** (`telegram-init` или `exchange` по `?t=`/`?token=`). Разбор `/api/me` и ссылки на ботов — **`patientMessengerContactGate`** (`getPatientMessengerContactGateDetail`, `resolveMessengerContactGateBotHref`, `resolveBotHrefAfterMessengerSessionLoss`).
- **exchangeIntegratorToken** — обмен JWT «войти в приложение» из бота на сессию вебаппа (payload: sub, role, displayName, phone, bindings, exp).

## OAuth (Yandex)

- Backend flow реализован: `POST /api/auth/oauth/start` (provider `yandex`), `GET /api/auth/oauth/callback`.
- Клиентские ID/secret и redirect URI хранятся в **`system_settings`** (admin): `yandex_oauth_client_id`, `yandex_oauth_client_secret`, `yandex_oauth_redirect_uri` — **не** в env webapp.
- **Публичная кнопка «Войти через Яндекс» в AuthFlowV2 отсутствует**; метод служебный / прямой вызов API.
- **Операции / `email_ambiguous`:** если в БД несколько строк `platform_users` с одним подтверждённым email, merge по email в `resolveUserIdForYandexOAuth` не выполняется — callback редиректит с `oauth=error&reason=email_ambiguous`. Оператору нужно устранить дубликаты (оставить одну запись с корректной связкой) и повторить вход через OAuth либо использовать уже существующую привязку `user_oauth_bindings`.

## Email

- Подтверждённый email используется как канал OTP и в профиле; **не** как единственный обязательный публичный метод входа на первом экране (см. продуктовые правила AUTH_RESTRUCTURE).

## Телефон и OTP

- **startPhoneAuth** / **confirmPhoneAuth** (`phoneAuth.ts`) — челленджи, лимиты (`phoneOtpLimits`), верификация кода.
- Порты: **SmsPort**, **PhoneChallengeStore**, **UserByPhonePort**.

## Роль пользователя

- **resolveRoleAsync** — приоритет whitelist из `system_settings` (admin), fallback на env для совместимости.
- **resolveRoleFromEnv** — синхронный fallback по env (Telegram/Max/телефоны).

## API-маршруты (часто используемые)

`/api/auth/exchange`, `/api/auth/telegram-init`, `/api/auth/telegram-login/config`, `/api/auth/check-phone`, `/api/auth/phone/start`, `/api/auth/phone/confirm`, `/api/auth/oauth/start`, `/api/auth/oauth/callback`, `/api/auth/logout` (POST/GET).

## Операционные логи OTP

При отправке кода через `createIntegratorSmsAdapter` пишется структурированная строка `phone_otp_delivery` (JSON в stdout) с маской номера и каналом — для мониторинга объёма SMS без утечки секретов и полного номера.
