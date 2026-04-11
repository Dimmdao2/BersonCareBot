# auth

Авторизация и сессии веб-приложения (BersonCare webapp).

## Сессия

- Cookie с подписью HMAC; TTL задаётся в `service.ts` (разные TTL для client/doctor при необходимости).
- **getCurrentSession** — чтение и валидация сессии из cookie.
- **clearSession** — выход.
- **setSessionFromUser** — установка сессии после успешного входа (SMS/OTP, Telegram, exchange token, OAuth и т.д.).

## Публичный вход в вебе (приоритет)

1. **OAuth (Яндекс / Google / Apple)** — если хотя бы один провайдер настроен (`/api/auth/oauth/providers`), стартовый экран `AuthFlowV2` — **OAuth-first** (`oauth_first`), затем «Войти по номеру телефона».
2. **Telegram Login Widget** — когда OAuth выключены и задан `telegram_login_bot_username`: экран `landing` с виджетом и переходом на телефон.
3. **Международный номер телефона** — `InternationalPhoneInput` + `check-phone` → OTP **только в Telegram или Max** (при привязке номера к мессенджеру). **SMS для `channel: web` отключён:** `POST /api/auth/phone/start` отвечает `sms_disabled_web`, если `deliveryChannel` — `sms` или не указан (раньше подразумевался SMS).

**PIN** в публичном потоке входа **не показывается** (Stage 5); при необходимости re-auth для чувствительных действий — отдельные API (`pin/verify` и т.д.).

## Мессенджеры и обмен токенами

- **exchangeTelegramInitData** — вход из Telegram Mini App по подписанному `initData`.
- Пока в мессенджерном Mini App в `/api/me` нет tier **patient** (после `contact.linked` и проекции), пациентский layout показывает **`MiniAppShareContactGate`** — **страховка** поверх основного гейта в боте (см. `docs/AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md`). Контракт `contact.linked` синхронизирует `platform_users.phone_normalized` и `user_channel_bindings` через projection path.
- **Клиент Mini App (Telegram / MAX):** при 401 на `/api/me` до показа гейта — **`miniAppSessionRecovery.ensureMessengerMiniAppWebappSession`** (`telegram-init` или `exchange` по `?t=`/`?token=`). Разбор `/api/me` и ссылки на ботов — **`patientMessengerContactGate`** (`getPatientMessengerContactGateDetail`, `resolveMessengerContactGateBotHref`, `resolveBotHrefAfterMessengerSessionLoss`).
- **exchangeIntegratorToken** — обмен JWT «войти в приложение» из бота на сессию вебаппа (payload: sub, role, displayName, phone, bindings, exp).

## OAuth (Яндекс, Google и Apple — веб-вход)

Конфигурация — только **`system_settings`** (scope `admin`), не env. Зеркалирование ключей в БД integrator — по общим правилам (`updateSetting` / миграции); **компромисс:** в integrator копируется и `apple_oauth_private_key`, хотя код integrator его может не читать (расширенная поверхность хранения секрета).

### Маршруты

| Метод | Путь | Назначение |
|--------|------|------------|
| POST | `/api/auth/oauth/start` | Старт OAuth; body `{ "provider": "yandex" \| "google" \| "apple" }`; ответ `{ ok, authUrl }` или ошибка. **Rate limit:** до 60 стартов в час на ключ клиента (таблица `auth_rate_limit_events`, scope `auth.oauth_start`). Ключ — **только `X-Real-IP`** (nginx должен передать `$remote_addr`); **`X-Forwarded-For` не используется** — иначе при `$proxy_add_x_forwarded_for` клиент мог бы подставить левый первый hop и обойти лимит. **Production (`NODE_ENV=production`):** без непустого `X-Real-IP` маршрут отвечает **503** с `error: proxy_configuration` (нарушение инфраструктурного инварианта), лог `oauth_start_x_real_ip_required`. **Development / test:** без `X-Real-IP` — лог `oauth_start_missing_x_real_ip` (debug) и общий fallback-ключ `oauth_start:missing_x_real_ip` для локальной работы. |
| GET | `/api/auth/oauth/callback/yandex` | Яндекс OAuth; подписанный `state` с purpose `yandex`. Канонический redirect URI. |
| GET | `/api/auth/oauth/callback` | Legacy: тот же обработчик, что `/callback/yandex` (совместимость со старыми redirect URI в кабинете Яндекса). |
| GET | `/api/auth/oauth/callback/google` | Веб-логин Google; `state` — purpose `google_login`. |
| POST | `/api/auth/oauth/callback/apple` | Sign in with Apple (`form_post`); `state` — purpose `apple`, `nonce` внутри подписанного payload и в `id_token`. |
| GET | `/api/auth/oauth/providers` | Флаги `yandex` / `google` / `apple` (настроен ли провайдер), **без** секретов; `Cache-Control: private, no-store`. |

### Подписанный `state` (CSRF)

Модуль `oauthSignedState.ts`: HMAC-SHA256 от `SESSION_COOKIE_SECRET`, payload `{ p, exp, n, nonce? }`, отдельный **purpose** на поток (`yandex` | `gcal` | `google_login` | `apple`). Cookie для state не используется. Срок ~10 мин; **повторное использование** того же `state` до истечения `exp` теоретически возможно (как и у типичного signed-state); при ротации `SESSION_COOKIE_SECRET` незавершённые переходы сбрасываются. **Осознанный компромисс:** server-side store «used state» не ведётся; повтор callback с тем же `code` обычно падает на обмене у провайдера (authorization `code` одноразовый).

**Почему rate limit не смотрит на `X-Forwarded-For`:** см. выше; кратко — доверие только к заголовку, который выставляет **доверенный** reverse proxy (`X-Real-IP`), а не к цепочке, в начало которой клиент может дописать свой IP.

### Google: календарь и вход

- Календарь: `google_client_id`, `google_client_secret`, **`google_redirect_uri`** → только admin calendar callback.
- Вход: тот же client id/secret + **`google_oauth_login_redirect_uri`** → callback `/api/auth/oauth/callback/google`.
- **Нельзя** записывать `google_refresh_token` из потока веб-логина: обмен кода даёт только access token для userinfo; `refresh_token` из ответа игнорируется. В authorize задано `access_type=online`, чтобы не запрашивать офлайн-доступ для входа.
- **Email:** merge в существующую учётку по email и выставление `email_verified_at` для новой — только если в userinfo `verified_email === true`. Иначе email не участвует в merge с подтверждёнными записями в БД.

### Apple

- `id_token` проверяется через JWKS Apple (`jose`), audience = Services ID (`apple_oauth_client_id`), issuer Apple, **nonce**.
- Email из токена считается подтверждённым Apple при наличии в claims (merge / `email_verified_at` по тем же правилам, что и для проверенного email).

### Сессия после входа

Общая логика `oauthWebSession.completeOAuthWebLoginRedirectUrls` (и аналог для Яндекса): `setSessionFromUser`, редирект по роли; **без телефона** — редирект на привязку номера (`/app/patient/bind-phone`, `reason=oauth_phone_required`). На странице привязки в браузере — **channel-link** (`POST /api/auth/channel-link/start`, deep link `link_*` в боте) и при уже привязанном чате — `POST /api/patient/messenger/request-contact`; SMS не используется.

### Channel link (старт ссылки из сессии)

- **`POST /api/auth/channel-link/start`** (авторизованный пациент): выдача deep link / команды Max. **Rate limit:** scope `auth.channel_link_start`, ключ — `userId` сессии (до **30** запросов за скользящий час в `auth_rate_limit_events`; без БД — in-memory fallback), аналогично `auth.messenger_start`. Ответ **429** `rate_limited` при превышении.

### Channel link → integrator

После успешного `POST /api/integrator/channel-link/complete` webapp возвращает JSON **`{ ok: true, needsPhone: boolean }`** (или `{ ok: true, status: "already_used", needsPhone }` для одноразового токена). Integrator в `executeAction` для `webapp.channelLink.complete` при `needsPhone` вызывает общую отправку запроса контакта (`dispatchRequestContactToUser`), чтобы пользователь поделился номером в чате.

### UI

`AuthFlowV2`: при включённых OAuth — экран `oauth_first`; иначе прежний порядок (Telegram landing или сразу телефон). На шаге телефона остаются компактные кнопки OAuth и ссылка «Другие способы входа». `ChannelPicker` и альтернативы в `OtpCodeForm` **не предлагают SMS** (`OTP_PUBLIC_OTHER_CHANNELS_ORDER` без `sms`). На экранах «иностранный номер» / «нет OTP-канала» — OAuth и при необходимости Telegram.

**Профиль (`ProfileForm`):** смена номера — тот же сценарий, что на `/app/patient/bind-phone` (`PatientBindPhoneClient`, без SMS и без удалённых `BindPhoneBlock` / `PhoneAuthForm`).

### Ошибки и операции

- **`email_ambiguous`** (и для Яндекса, и для Google/Apple web): несколько `platform_users` с одним подтверждённым email — редирект `/app?oauth=error&reason=email_ambiguous`; нужна ручная дедупликация.
- Ошибки Apple callback после `form_post` по возможности оформляются **редиректом** в приложение (`/app?oauth=error&reason=…`), а не JSON, чтобы пользователь не видел «сырой» ответ API.

## Email

- Подтверждённый email используется как канал OTP и в профиле; **не** как единственный обязательный публичный метод входа на первом экране (см. продуктовые правила AUTH_RESTRUCTURE).

## Телефон и OTP

- **startPhoneAuth** / **confirmPhoneAuth** (`phoneAuth.ts`) — челленджи, лимиты (`phoneOtpLimits`), верификация кода; доставка задаётся `PhoneOtpDelivery` (в т.ч. telegram / max / email).
- HTTP `POST /api/auth/phone/start` для **`channel: web`** не принимает доставку **SMS** (`sms_disabled_web`).
- Порты: **SmsPort**, **PhoneChallengeStore**, **UserByPhonePort**.

## Роль пользователя

- **resolveRoleAsync** — приоритет whitelist из `system_settings` (admin), fallback на env для совместимости.
- **resolveRoleFromEnv** — синхронный fallback по env (Telegram/Max/телефоны).

## API-маршруты (часто используемые)

`/api/auth/exchange`, `/api/auth/telegram-init`, `/api/auth/telegram-login/config`, `/api/auth/check-phone`, `/api/auth/phone/start`, `/api/auth/phone/confirm`, `/api/auth/channel-link/start`, `/api/auth/oauth/start`, `/api/auth/oauth/providers`, `/api/auth/oauth/callback`, `/api/auth/oauth/callback/yandex`, `/api/auth/oauth/callback/google`, `/api/auth/oauth/callback/apple`, `/api/auth/logout` (POST/GET).

## Операционные логи OTP

При отправке кода через `createIntegratorSmsAdapter` пишется структурированная строка `phone_otp_delivery` (JSON в stdout) с маской номера и каналом — для мониторинга объёма SMS без утечки секретов и полного номера.
