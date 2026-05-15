# auth

Авторизация и сессии веб-приложения (BersonCare webapp).

## Сессия

- Cookie с подписью HMAC; TTL задаётся в `service.ts` (разные TTL для client/doctor при необходимости).
- **getCurrentSession** — чтение и валидация сессии из cookie.
- **clearSession** — выход.
- **setSessionFromUser** — установка сессии после успешного входа (SMS/OTP, Telegram, exchange token, OAuth и т.д.).

## Публичный вход в вебе (приоритет)

1. **OAuth (Яндекс / Google / Apple)** — если хотя бы один провайдер настроен (`/api/auth/oauth/providers`), стартовый экран `AuthFlowV2` — **OAuth-first** (`oauth_first`), затем «Войти по номеру телефона». На главном экране **Apple не показывается**, если включены Яндекс или Google (основной набор — Яндекс, Google, Telegram, Max). Кнопка **«Войти через Apple»** доступна только в режиме **только Apple** (оба флага Яндекс и Google выключены в провайдерах).
2. **Telegram Login Widget** — когда OAuth выключены и задан `telegram_login_bot_username`: экран `landing` с виджетом и переходом на телефон.
3. **Международный номер телефона** — `InternationalPhoneInput` + `check-phone` → OTP **только в Telegram или Max** (при привязке номера к мессенджеру). **SMS для `channel: web` отключён:** `POST /api/auth/phone/start` отвечает `sms_disabled_web`, если `deliveryChannel` — `sms` или не указан (раньше подразумевался SMS).

**PIN** в публичном потоке входа **не показывается** (Stage 5); при необходимости re-auth для чувствительных действий — отдельные API (`pin/verify` и т.д.).

## Мессенджеры и обмен токенами

- **Server-first вход на `/app`:** RSC `AppEntryPage` классифицирует неавторизованный вход как `token_exchange | telegram_miniapp | max_miniapp | browser_interactive` (`modules/auth/appEntryClassification.ts`) и передаёт ветку в `AuthBootstrap` через `entryClassification`. Клиентская URL-only классификация удалена.
- **exchangeTelegramInitData** — вход из Telegram Mini App по подписанному `initData`.
- **exchangeMaxInitData** — вход из MAX Mini App: валидация строки `initData` по подписи MAX Platform API (секрет бота в **`system_settings`**, ключ **`max_bot_api_key`**, scope `admin`; редактирование в `/app/settings` → интеграции; зеркалирование в БД integrator через `updateSetting`). HTTP: **`POST /api/auth/max-init`**, body `{ initData }` — тот же контракт ответа, что у `telegram-init` (`redirectTo`, `role`). На `/app` без `?t=` клиент **`AuthBootstrap`** опрашивает MAX WebApp bridge и при появлении данных шлёт `max-init` (параллельно сценарию Telegram).
- Пока в мессенджерном Mini App в `/api/me` нет tier **patient** (после `contact.linked` и проекции), пациентский layout показывает **`MiniAppShareContactGate`** — **страховка** поверх основного гейта в боте (см. `docs/archive/2026-04-initiatives/AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md`). Контракт `contact.linked` синхронизирует `platform_users.phone_normalized` и `user_channel_bindings` через projection path.
- **Клиент Mini App (Telegram / MAX):** при 401 на `/api/me` до показа гейта — **`miniAppSessionRecovery.ensureMessengerMiniAppWebappSession`** (`telegram-init`, **`max-init`** или `exchange` по `?t=`/`?token=`). Если в WebView ещё нет строки `initData` в момент запроса, но ранее (во время интерактивного входа на `/app`) она была сохранена как **binding-candidate** в `sessionStorage` (`messengerBindingCandidate.ts`), recovery пробует `telegram-init` / `max-init` с этой копией; при **успехе** очищает кандидат и выходит; при **неуспешном HTTP** кандидат очищается и выполнение **продолжается** к `exchange` по `?t=`/`?token=` (не блокировать запасной путь). При **сетевой ошибке** запроса по кандидату кандидат **сохраняется**, далее — тот же fallback на `exchange`, если токен в URL есть.
- **AuthBootstrap / late initData:** при интерактивном входе persist + событие `late_initData_received` для одной и той же строки initData **дедуплицируются** в пределах эпохи bootstrap (без записи в `sessionStorage` и спама в лог на каждый тик опроса). Сценарий плана «initData **после** успешного login» (§6c) на экранах вне `/app` **отдельно не реализован** — только bootstrap + recovery; при необходимости — отдельный этап.
- Подсказки ссылок на ботов при `access_denied`/`max_unavailable` в `AuthBootstrap` берутся из серверного prefetch-конфига (`initialPublicAuthConfig`) без дополнительных клиентских запросов публичных auth-config.
- **Диагностика:** `console.info` с префиксами `[auth/telegram-init]`, `[auth/max-init]`, `[auth/telegram-login]` для `resolution_hints` пишутся только при **`DEBUG_AUTH=1`** в env (не в `test`).
- **exchangeIntegratorToken** — обмен JWT «войти в приложение» из бота на сессию вебаппа (payload: sub, role, displayName, phone, bindings, exp).
- **`POST /api/auth/channel-link/start`** (привязка TG/Max с `/app/patient/bind-phone` в браузере) и **`POST /api/auth/messenger/start`** (deep link после ввода телефона): для Telegram — **`getTelegramLoginBotUsername()`** (`telegram_login_bot_username` в admin, иначе `TELEGRAM_BOT_USERNAME`). Для Max channel-link — **`getMaxLoginBotNickname()`**: порядок — `max_login_bot_nickname` в admin → **`MAX_LOGIN_BOT_NICKNAME`** в env → ник из **`CHANNEL_LIST`** (`modules/channel-preferences/constants.ts`, поле `openUrl` у MAX). При непустом нике ответ содержит диплинк `https://max.ru/<nick>?start=link_…` ([документация MAX](https://dev.max.ru/docs/chatbots/bots-coding/prepare)). Если ник нигде не задан — только команда `/start link_…` без автоперехода. **Не путать** с `ALLOWED_MAX_IDS` / whitelist (там — user id людей). Подробнее: `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` → «Telegram в webapp env».

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

### Пациент: `need_activation` и навигация

При `patientClientBusinessGate === 'need_activation'` (OAuth без доверенного телефона в БД) пациентский layout редиректит на bind-phone для **всех** путей под `/app/patient`, кроме минимального whitelist **`patientPathsAllowedDuringPhoneActivation`** в `patientRouteApiPolicy.ts`: `/app/patient/bind-phone`, `/app/patient/help`, `/app/patient/support` (и подпути). На редирект пишется `logger` с `scope: patient_layout`, `event: patient_redirect_bind_phone`, `reason: need_activation`. Политика **`patientPathRequiresBoundPhone`** (гость / onboarding без БД) от этого отдельна и не заменяется.

**Mini App + OAuth:** канонический телефон для бизнес-поверхностей пациента — номер, подтверждённый через бота (`request-contact` / channel-link), а не только OAuth userinfo. Решение о `need_activation` и редирект на `/app/patient/bind-phone` принимает **post-login слой** (gate + layout), не `AuthBootstrap`. Клиентская диагностика: событие `post_auth_binding_required` (`scope: auth_flow`) при показе `PatientSharePhoneViaBotPanel` в WebView; в payload при необходимости — `hasDeferredMessengerInitCandidate` (есть ли отложенный initData-кандидат для binding/recovery).

### Auth bootstrap / публичные конфиги (observability)

- Prefetch `GET /api/auth/oauth/providers`, `GET /api/auth/telegram-login/config`, `GET /api/auth/login/alternatives-config` выполняется на сервере (`buildPrefetchedPublicAuthConfig`) и передаётся в `AuthBootstrap`/`AuthFlowV2` как `initialPublicAuthConfig`/`prefetchedAuthConfig` — без дублирующих client fetch.
- Для **`GET /api/auth/login/alternatives-config`** на сервере пишется **`logAuthRouteTiming`** (как для остальных публичных auth-route из жёсткого плана), без логирования секретов.

### Channel link (старт ссылки из сессии)

- **`POST /api/auth/channel-link/start`** (авторизованный пациент): deep link Telegram (`t.me/…`) и при настроенном нике Max — `https://max.ru/<nick>?start=link_…`, иначе URL-заглушка и команда `/start link_…`. **Rate limit:** scope `auth.channel_link_start`, ключ — `userId` сессии (до **30** запросов за скользящий час в `auth_rate_limit_events`; без БД — in-memory fallback), аналогично `auth.messenger_start`. Ответ **429** `rate_limited` при превышении.

### Channel link → integrator

После успешного `POST /api/integrator/channel-link/complete` webapp возвращает JSON **`{ ok: true, needsPhone: boolean, phoneNormalized?: string }`** — `phoneNormalized` передаётся в integrator, когда номер уже есть у платформенного пользователя (чтобы в БД бота проставить контакт с label `telegram` и показать ответ в чате). Для повторной доставки токена: `{ ok: true, status: "already_used", needsPhone }`. Integrator при `needsPhone` шлёт запрос контакта (`dispatchRequestContactToUser`); при наличии `phoneNormalized` синхронизирует телефон и отправляет сообщение с шаблоном `telegram:afterPhoneLinked` и главным меню.

**Конфликт привязки (канал уже у другого `platform_users`, токен выдан другому):** канонический владелец по токену — `channel_link_secrets.user_id`. Владелец строки `user_channel_bindings` классифицируется как **одноразовый stub** (нет телефона, одна привязка канала, нет OAuth и «осмысленных» данных пациента и т.д., см. `channelLinkClaim.ts`) или **реальный аккаунт**. **Stub** → узкая транзакция **claim**: перенос привязки на пользователя токена, финализация stub (`merged_into_id`), без `mergePlatformUsersInTransaction`. **Реальный** → `409 conflict`, `mergeReason: channel_owned_by_real_user`; в `admin_audit_log` — открытая строка `channel_link_ownership_conflict` (дедуп по `conflict_key`); relay в TG/Max по теме **`channel_link`** в **`admin_incident_alert_config`** только при **первом** открытии инцидента (`insertedFirst`), без токена ссылки и без телефона в тексте. При отказе claim (stub перестал быть disposable внутри TX) — `mergeReason: channel_link_claim_rejected`; при прочей ошибке TX — `channel_link_claim_failed` (без audit). Локальный лог `[channel_link:binding_conflict]` остаётся через `setChannelLinkBindingConflictReporter` при записи ownership-конфликта. **Integrator:** `createWebappEventsPort().completeChannelLink` при не-OK HTTP передаёт в `executeAction` **`mergeReason` в приоритете над `error`**, чтобы шаблон в чате соответствовал коду (`channel_link_claim_failed` → `channelLink.completeFailed.generic`, ownership-коды → `channelLink.completeFailed.conflict`).

Операторские уведомления вне админки по конфликтам привязки настраиваются ключом **`admin_incident_alert_config`** (темы и каналы TG/Max, получатели — `admin_telegram_ids` / `admin_max_ids`); дедуп внешнего пинга по политике открытых конфликтов — см. `docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/PHASE_D_EVENT_HOOKS.md`.

**Ошибка complete в integrator:** при `ok: false` от webapp шаг `webapp.channelLink.complete` добавляет исходящее `message.send` с шаблонами `channelLink.completeFailed.*` (Telegram / Max), плюс `warn` с `event: channel_link_complete_failed`.

**Админ в Telegram:** сценарий `telegram.admin.start.link` (приоритет выше catch-all) обрабатывает `/start link_*` так же, как пользовательский `telegram.start.link` — вызов `webapp.channelLink.complete`.

### Открытие ссылки Telegram в браузере (bind-phone / профиль)

Чтобы избежать блокировки всплывающих окон после `await fetch`, используется `shared/lib/telegramChannelLinkOpen.ts`: синхронно `window.open('about:blank', '_blank')` **без** `noopener`/`noreferrer` (иначе часть браузеров возвращает `null`, вкладка остаётся пустой), затем присвоение `location.href`; на мобильных UA при разборе `t.me/...?start=` подставляется `tg://resolve?domain=…&start=…`.

**Max:** если в ответе есть диплинк с `?start=`, тот же паттерн, что у Telegram: синхронно `about:blank`, затем `location.href` на `max.ru/…`. Иначе вкладку не открываем — команда в UI и буфер. **429** (`rate_limited`): toast на bind-phone, текст ошибки в `ConnectMessengersBlock`.

### UI

`AuthFlowV2`: при включённых OAuth — экран `oauth_first` (Яндекс, Google, при необходимости только-Apple, Telegram Login, ссылка на бота **Max** из `GET /api/auth/login/alternatives-config`, «Войти по номеру телефона»); иначе порядок **Telegram `landing`** или сразу телефон. Отдельного экрана «Другие способы входа» нет. Публичный конфиг `alternatives-config` по-прежнему может отдавать `vkWebLoginUrl` — кнопка VK на входе подключается в UI отдельно, когда будет нужна. `ChannelPicker` и альтернативы в `OtpCodeForm` **не предлагают SMS** (`OTP_PUBLIC_OTHER_CHANNELS_ORDER` без `sms`). На экранах «иностранный номер» / «нет OTP-канала» — компактные OAuth / Apple (fallback) / Max и при необходимости Telegram.

**Профиль (`PatientProfileHero`):** смена номера — тот же сценарий, что на `/app/patient/bind-phone` (`PatientBindPhoneClient`, без SMS и без удалённых `BindPhoneBlock` / `PhoneAuthForm`).

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

## Поддержка пациента (форма → Telegram админу)

- **Страница:** `/app/patient/support` (константа `routePaths.patientSupport`). Доступ с `requirePatientAccess`; в layout не требуется tier **patient** (whitelist в `patientRouteApiPolicy`, как у `help` / `bind-phone`).
- **API:** `POST /api/patient/support` — тело `{ email, message, surface?: "mini_app"|"browser", from?: string }`. Поле `from` — опциональный путь UI; в Telegram попадает только если начинается с `/app` (до 200 символов, без переводов строк).
- **Гейт:** `patientClientBusinessGate` — отклоняется только `stale_session` (401); разрешены `allow` и `need_activation` (вопрос из onboarding, в т.ч. привязка телефона).
- **Доставка:** `sendMessage` в Telegram на `env.ADMIN_TELEGRAM_ID` (должен быть **ненулевой** конечный числовой id чата) и токен бота из `getTelegramBotToken()` (env webapp). В текст включаются user id, ФИО, телефон, привязки мессенджеров, User-Agent, поверхность, опционально страница.
- **Rate limit:** in-memory, **после** успешной отправки в Telegram, 60 с на ключ: `userId` → `u:…`, иначе нормализованный телефон → `p:…`, иначе первый hop `X-Forwarded-For` или `X-Real-IP` → `ip:…`, иначе общий ключ `anon:support`.
- **Ссылка «Связаться с поддержкой»:** `system_settings.support_contact_url` (`getSupportContactUrl`), дефолт из `supportContactConstants` — внутренний путь формы; внешние URL допустимы. Рендер: `SupportContactLink`: внутренние пути `/app/…` — **нативный `<a href>`** (полная загрузка документа, чтобы избежать ошибок загрузки чанков Next.js после деплоя при устаревшем клиентском бундле); внешние URL — `<a target="_blank" rel="noopener noreferrer">`. В админке путь поддержки валидируется как `/app/…` или http(s).

## API-маршруты (часто используемые)

`/api/auth/exchange`, `/api/auth/telegram-init`, **`/api/auth/max-init`**, `/api/auth/telegram-login/config`, `/api/auth/check-phone`, `/api/auth/phone/start`, `/api/auth/phone/confirm`, `/api/auth/channel-link/start`, `/api/auth/oauth/start`, `/api/auth/oauth/providers`, `/api/auth/oauth/callback`, `/api/auth/oauth/callback/yandex`, `/api/auth/oauth/callback/google`, `/api/auth/oauth/callback/apple`, `/api/auth/logout` (POST/GET). Пациентский контур: `POST /api/patient/support` (см. выше).

## Integrator → webapp: идемпотентность `POST /api/integrator/events`

Наблюдаемость и поля успеха/отказа для M2M (`ok === true` в JSON при 200/202), а также логи TX-привязки телефона в интеграторе — в `apps/webapp/INTEGRATOR_CONTRACT.md` (раздел Contract Principles → Observability) и `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/STAGE_05_OBSERVABILITY_TESTS_DOCS.md`.

Ключ в таблице **`idempotency_keys`** строится от **семантического** тела события: из JSON убираются поля, не меняющие смысл доставки (в т.ч. верхнеуровневый `occurredAt` и дублирующий `idempotencyKey` внутри body), затем стабильная сериализация и хеш. Повтор с тем же смыслом после успешной обработки отдаёт **кэшированный ответ**; расхождение смысла при том же внешнем ключе — **409**. Если клиент добавляет **новые** верхнеуровневые поля к событию, они участвуют в хеше — возможен ложный конфликт, пока формат не стабилизирован.

## Integrator → webapp: опциональный `POST /api/integrator/messenger-phone/bind`

Только для **внешнего** M2M-клиента (другой сервис, админка): та же транзакция, что **`user.phone.link`** в integrator (`public` binding-first + `integrator.contacts`), подпись **`x-bersoncare-timestamp` / `x-bersoncare-signature`**, обязательный **`x-bersoncare-idempotency-key`**. Семантический хеш для кеша успешного ответа — поля **`channelCode`**, **`externalId`**, **`phoneNormalized`** (`apps/webapp/src/infra/idempotency/messengerPhoneBindRequestHash.ts`). При **одной БД** сценарии бота **не** вызывают этот URL — привязка идёт через `user.phone.link` в процессе integrator. Контракт и коды ответов: `apps/webapp/INTEGRATOR_CONTRACT.md`, этап: `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/STAGE_06_OPTIONAL_HTTP_BIND_ROUTE.md`.

## Операционные логи OTP

При отправке кода через `createIntegratorSmsAdapter` пишется структурированная строка `phone_otp_delivery` (JSON в stdout) с маской номера и каналом — для мониторинга объёма SMS без утечки секретов и полного номера.
