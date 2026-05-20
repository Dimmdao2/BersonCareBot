# auth

Авторизация и сессии веб-приложения (BersonCare webapp).

## Сессия

- Cookie с подписью HMAC; sliding TTL **90 суток** от последней активности (`sessionCookie.ts`, `renewSessionCookieFromRequest`, `proxy.ts` на `/app/*`, `/api/patient/*`, `/api/me`).
- Продление cookie: не чаще чем раз в 24 ч **или** когда до `expiresAt` осталось меньше половины TTL. RSC/`getCurrentSession` сам cookie не пишет — только route handlers и proxy.
- **getCurrentSession** — чтение и валидация сессии из cookie.
- **clearSession** — выход.
- **setSessionFromUser** — установка сессии после успешного входа (SMS/OTP, Telegram, exchange token, OAuth и т.д.).

## Публичный вход в вебе (приоритет)

1. **OAuth (Яндекс / Google / Apple)** — при настроенных провайдерах (`buildPrefetchedPublicAuthConfig`) стартовый шаг браузера — **`oauth_first`**, вторичное действие — **«Войти по email»**. **Apple не показывается** рядом с Яндексом или Google — только когда оба они выключены.

2. **Email + пароль** — когда OAuth всё выключено, браузер сразу открывает шаг **`email_password`**: вход, регистрация, код из письма, **восстановление пароля**. Состояние «ожидается код»/`reset` сохраняется в **`sessionStorage`** (`authFlowPendingStorage.ts`), чтобы пережить обновление и возврат с **`/app/contact-support?from=`**.

3. **Телефон в публичном браузере / PWA** — с **`oauth_first`**: ссылка **«Войти по номеру телефона»** → `PhoneMessengerAuthFlow` (`purpose: login`): `check-phone` → при привязанном TG/Max — `phone/start` + `phone/confirm`; иначе **`POST /api/auth/phone/messenger-bind/start`** → deep link `auth_*` в боте → контакт → **`POST /api/integrator/phone-messenger-bind/complete`** → poll **`messenger-bind/status`** → `phone/confirm`. **Email в этом потоке не участвует.** SMS для `channel: web` недоступен. В Telegram/MAX Mini App по-прежнему шаг **`phone`** в `AuthFlowV2`. Привязка/смена номера в профиле — redirect из `PatientProfileHero` на **`/app/patient/bind-phone?next=/app/patient/profile`**, далее `PhoneMessengerAuthFlow` (`purpose: profile_bind`) в браузере без inline «Назад» над полем номера; **`bind-phone`** не редиректит только из‑за `tier === patient` без **`phoneTrustedForPatient`**.

**PIN** на плоскости входа **не показывается**; re-auth для чувствительных действий — отдельные API (`pin/verify` и т.д.).

### Публичный UI (`/app`, `AppEntryRsc` → `AppEntryLoginContent` → `AuthBootstrap` → `AuthFlowV2`)

- **Оболочка:** `AppShell` с `variant="patient"` (как у кабинета пациента). RSC `AppEntryRsc` (`/app`, `/app/tg`, `/app/max`): при отсутствии сессии — `AppEntryLoginContent` + `AuthBootstrap`.
- **`AppEntryLoginContent`:** при `ALLOW_DEV_AUTH_BYPASS` — блок dev-входа; иначе только `Suspense` + `AuthBootstrap`. **Отдельной плашки** «войдите или зарегистрируйтесь» нет.
- **`AuthFlowV2`:** компактные шаги без дублирующих заголовков «Вход» и без лишних вводных. В браузере: **`oauth_first`** или сразу **`email_password`**; **`phone`** / `choose_channel` / `code` — для Mini App или редких чужеземных кейсов после `check-phone`; `new_user_foreign` / `foreign_no_otp_channel` при необходимости.
- **Patient-оформление:** контент шага в **`patientCardClass` + `patientInnerPageStackClass`** (`max-w-sm`, центрирование для OAuth / email форм и Mini App-потока). Кнопки OAuth и формы — **`shared/ui/auth/loginChrome.ts`**. **`InternationalPhoneInput`** и submit в **`OtpCodeForm`** — основная CTA по ширине карточки на шагах **`phone`/`code`**.
- **`ChannelPicker`:** без вводной строки над кнопкой — сразу основной канал и при необходимости «Другие способы».
- **Профиль:** смена/привязка номера — redirect из hero на **`bind-phone`** (`?next=profile`); в браузере — `PhoneMessengerAuthFlow` с `hideBackOnPhoneStep`, назад через AppShell. Mini App на **`bind-phone`** — `PatientBindPhoneClient`. Привязка Telegram/MAX — секция «Мессенджеры» с **`ConnectMessengersBlock`** (`grid-cols-2`). На **`bind-phone`** без мессенджеров — **`PatientBrowserMessengerBindPanel`**.

- **`OTP_PUBLIC_OTHER_CHANNELS_ORDER`** (**max** → **email** → **telegram**) и отсутствие **sms** для публичного веба относятся к входу через **Mini App / phone** или к редким веткам после `check-phone`, не к основному браузерному `/app`.

- **Поддержка до входа:** **`/app/contact-support`** принимает **`?from=verify|login|reset`** и читает **`authFlowPendingStorage`**, чтобы подписать кнопку «назад» и ссылку внизу формы («Вернуться к коду» и т.д.).

### Email + пароль (пациент)

- **`POST /api/auth/email-password/register`** — создание канона с паролем в `user_password_credentials`, отправка кода на почту (`startEmailChallenge`). Если email уже на **contact-only** карточке (врач/Rubitime, нет `user_password_credentials` или нет полноценного login) — **200** `{ ok: true, error: "existing_account_needs_email_setup", setupLinkSent: true }` и письмо со ссылкой `/app/auth/email-setup` (не `duplicate_email`).
- **`POST /api/auth/email-password/lookup`** — `{ ok: true, state }` для ветвления UI (`free` | `pending_registration` | `verified_with_password` | `needs_email_setup` | `email_conflict`).
- **`POST /api/auth/email-password/setup-access`** — повторная отправка setup-link для `needs_email_setup`.
- **`POST /api/auth/email-password/login`** — при верном пароле и **`email_verified_at`** возвращает сессию и `redirectTo`. Если пароль верный, но email ещё не подтверждён — **409** `email_not_verified` (UI запускает повторную регистрацию/код).
- **`POST /api/auth/email-password/forgot`** — сброс: код на почту только для **verified + password**; для **contact-only** (`needs_email_setup`) — setup-link в фоне, HTTP **всегда** **`{ ok: true, retryAfterSeconds }`** (без `challengeId`, uniform при отсутствии учётки / rate limit / сбое отправки).
- **`POST /api/auth/email-password/reset`** — проверка кода через `consumeEmailChallengeCode` (если передан `challengeId`) или `consumeLatestEmailChallengeCodeForUser`, обновление хэша пароля; ошибки верификации кода (включая случай отсутствия пользователя) нормализуются в нейтральный `invalid_code`.

## Мессенджеры и обмен токенами

- **Server-first вход на `/app`:** RSC `AppEntryRsc` (используется `/app`, `/app/tg`, `/app/max`) классифицирует неавторизованный вход как `token_exchange | telegram_miniapp | max_miniapp | browser_interactive` (`modules/auth/appEntryClassification.ts`) и передаёт ветку в `AuthBootstrap` через `entryClassification`. Явные роуты **`/app/tg`** и **`/app/max`** задают surface без угадывания по `?ctx=` / cookie. Клиентская URL-only классификация удалена.
- **exchangeTelegramInitData** — вход из Telegram Mini App по подписанному `initData`.
- **exchangeMaxInitData** — вход из MAX Mini App: валидация строки `initData` по подписи MAX Platform API (секрет бота в **`system_settings`**, ключ **`max_bot_api_key`**, scope `admin`; редактирование в `/app/settings` → интеграции; зеркалирование в БД integrator через `updateSetting`). HTTP: **`POST /api/auth/max-init`**, body `{ initData }` — тот же контракт ответа, что у `telegram-init` (`redirectTo`, `role`). Клиент **`AuthBootstrap`** на **`/app`**, **`/app/max`** (и legacy `/app?ctx=max` → редирект на `/app/max`) опрашивает MAX WebApp bridge и при появлении данных шлёт `max-init` (параллельно сценарию Telegram, если оба моста доступны в окружении).
- Пока в мессенджерном Mini App в `/api/me` нет tier **patient** (после `contact.linked` и проекции), пациентский layout показывает **`MiniAppShareContactGate`** — **страховка** поверх основного гейта в боте (см. `docs/archive/2026-04-initiatives/AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md`). Контракт `contact.linked` синхронизирует `platform_users.phone_normalized` и `user_channel_bindings` через projection path.
- **Клиент Mini App (Telegram / MAX):** при 401 на `/api/me` до показа гейта — **`miniAppSessionRecovery.ensureMessengerMiniAppWebappSession`** (`telegram-init`, **`max-init`** или `exchange` по `?t=`/`?token=`). Если в WebView ещё нет строки `initData` в момент запроса, но ранее (во время интерактивного входа на **`/app`** / **`/app/tg`** / **`/app/max`**) она была сохранена как **binding-candidate** в `sessionStorage` (`messengerBindingCandidate.ts`), recovery пробует `telegram-init` / `max-init` с этой копией; при **успехе** очищает кандидат и выходит; при **неуспешном HTTP** кандидат очищается и выполнение **продолжается** к `exchange` по `?t=`/`?token=` (в т.ч. при редком legacy query `ctx=max` до редиректа proxy — ранний `return` убран, чтобы не блокировать обмен). При **сетевой ошибке** запроса по кандидату кандидат **сохраняется**, далее — тот же fallback на `exchange`, если токен в URL есть.
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
| POST | `/api/auth/oauth/start` | Старт OAuth; body `{ "provider": "yandex" \| "google" \| "apple", "browserCalendarIana"?: string }` (`browserCalendarIana` — опционально IANA из `Intl`, до 120 символов; попадает в подписанный `state` как `tz` и при успешном callback выставляет `platform_users.calendar_timezone`, если ещё `null`). Ответ `{ ok, authUrl }` или ошибка. **Rate limit:** до 60 стартов в час на ключ клиента (таблица `auth_rate_limit_events`, scope `auth.oauth_start`). Ключ — **только `X-Real-IP`** (nginx должен передать `$remote_addr`); **`X-Forwarded-For` не используется** — иначе при `$proxy_add_x_forwarded_for` клиент мог бы подставить левый первый hop и обойти лимит. **Production (`NODE_ENV=production`):** без непустого `X-Real-IP` маршрут отвечает **503** с `error: proxy_configuration` (нарушение инфраструктурного инварианта), лог `oauth_start_x_real_ip_required`. **Development / test:** без `X-Real-IP` — лог `oauth_start_missing_x_real_ip` (debug) и общий fallback-ключ `oauth_start:missing_x_real_ip` для локальной работы. |
| GET | `/api/auth/oauth/callback/yandex` | Яндекс OAuth; подписанный `state` с purpose `yandex`. Канонический redirect URI. |
| GET | `/api/auth/oauth/callback` | Legacy: тот же обработчик, что `/callback/yandex` (совместимость со старыми redirect URI в кабинете Яндекса). |
| GET | `/api/auth/oauth/callback/google` | Веб-логин Google; `state` — purpose `google_login`. |
| POST | `/api/auth/oauth/callback/apple` | Sign in with Apple (`form_post`); `state` — purpose `apple`, `nonce` внутри подписанного payload и в `id_token`. |
| GET | `/api/auth/oauth/providers` | Флаги `yandex` / `google` / `apple` (настроен ли провайдер), **без** секретов; `Cache-Control: private, no-store`. |

### Подписанный `state` (CSRF)

Модуль `oauthSignedState.ts`: HMAC-SHA256 от `SESSION_COOKIE_SECRET`, payload `{ p, exp, n, nonce?, tz? }` (`tz` — опциональная IANA с клиента для веб-входа), отдельный **purpose** на поток (`yandex` | `gcal` | `google_login` | `apple`). Cookie для state не используется. Срок ~10 мин; **повторное использование** того же `state` до истечения `exp` теоретически возможно (как и у типичного signed-state); при ротации `SESSION_COOKIE_SECRET` незавершённые переходы сбрасываются. **Осознанный компромисс:** server-side store «used state» не ведётся; повтор callback с тем же `code` обычно падает на обмене у провайдера (authorization `code` одноразовый).

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

`oauthWebSession.completeOAuthWebLoginRedirectUrls` (и Яндекс-обработчик): **`setSessionFromUser`**, редирект по роли через `getRedirectPathForRole`; **нет** принудительного редиректа на **`bind-phone`** только из-за отсутствия телефона (**ветка `oauth_phone_required`** снята). Провайдер с **`emailVerified`** обновляет **`email_verified_at`** у канона. Запись на приём по-прежнему опирается на доверенный телефон (**`requirePatientBookingTrustedPhoneAccess`** и смежные правила).

### Пациент: `need_activation`, tier и layout

Tier **`patient`** (доступ к основному пациентскому функционалу при наличии БД) задаёт **`resolvePlatformAccessContext`/`computeClientTier`**: достаточно **доверенного телефона**, **или** **`email_verified_at`**, **или** наличие **password** (**`user_password_credentials`**), **или** web-OAuth-привязки (Яндекс/Google/Apple).

**`patientClientBusinessGate`** по-прежнему может вернуть **`need_activation`** для редких legacy-учёток без указанной web/webmail-активирующей связки; пациентский **`layout.tsx` не выполняет** массовый редирект на **`bind-phone`** из этого основания. Навигация и onboarding-маршруты — **`patientRouteApiPolicy`**; без БД — отдельно **`patientPathRequiresBoundPhone`**. Логируемый **`patient_redirect_bind_phone`** из layout при типичном OAuth больше не ожидается.

**Mini App + OAuth:** канонический телефон для бизнес-поверхностей пациента — номер, подтверждённый через бота (`request-contact` / channel-link), а не только OAuth userinfo. Решение о `need_activation` и редирект на `/app/patient/bind-phone` принимает **post-login слой** (gate + layout), не `AuthBootstrap`. Клиентская диагностика: событие `post_auth_binding_required` (`scope: auth_flow`) при показе `PatientSharePhoneViaBotPanel` в WebView; в payload при необходимости — `hasDeferredMessengerInitCandidate` (есть ли отложенный initData-кандидат для binding/recovery).

### Auth bootstrap / публичные конфиги (observability)

- Серверный снимок `buildPrefetchedPublicAuthConfig` (фактически те же условия, что у **`/api/auth/oauth/providers`**, и публичные поля альтернатив — имена ботов / Max URL для Mini App-подсказок) пробрасывается в **`AuthBootstrap`/`AuthFlowV2`** как **`prefetchedAuthConfig`** / **`initialPublicAuthConfig`** без дублирующих клиентских GET на `/app`.

- Отдельные публичные auth-route могут дополнительно логировать **`logAuthRouteTiming`** (см. реализации маршрутов); секреты в лог не попадают.

### Phone messenger bind (вход / привязка по `auth_*`)

Поток для **публичного браузера/PWA** и **inline-привязки в профиле**, когда у номера ещё нет привязки TG/Max для OTP: вместо SMS — deep link в бота, контакт, код в чате, затем `phone/confirm`.

- **`POST /api/auth/phone/messenger-bind/start`** — тело `{ phone, channelCode: "telegram"|"max", purpose: "login"|"profile_bind" }`. **`profile_bind`** требует сессию пациента. Ответ: `{ ok, setupToken, url, expiresAtIso, manualCommand? }` (`setupToken` = `auth_*`). **Rate limit:** scope `auth.phone_messenger_bind_start` (ключ — userId для `profile_bind`, иначе IP/anon), до **30**/час в `auth_rate_limit_events`.
- **`POST /api/auth/phone/messenger-bind/status`** — `{ setupToken }` → `pending_contact` \| `otp_ready` (+ `challengeId`, `retryAfterSeconds`) \| `failed` \| `expired` \| `consumed`.
- **`POST /api/integrator/phone-messenger-bind/complete`** (M2M, подпись как channel-link) — контакт из бота; при успехе создаётся OTP-challenge, secret → `otp_ready`. **Replay:** если secret уже `otp_ready` — **200** с тем же `otpCode` и `challengeId` (`replay: true`); если `consumed` — **200** `{ status: "already_used" }` без кода.
- После **`POST /api/auth/phone/confirm`** (через `buildAppDeps.auth.confirmPhoneAuth`): verify + bind → `markPhoneMessengerBindConsumedByChallenge` → при ошибке post-steps **`server_error`** (челлендж и код сохраняются для повтора) → `consumePhoneOtpChallenge` только при полном успехе → secret `consumed`.

Клиент: `PhoneMessengerAuthFlow` (`purpose: login` в `AuthFlowV2`, `profile_bind` на **`/app/patient/bind-phone` в браузере**). Mini App на bind-phone — по-прежнему `PatientBindPhoneClient` (request-contact). Открытие deep link — `finishChannelLinkNavigation` (как channel-link). Логи: `phone_messenger_bind_start`, `phone_messenger_bind_complete_ok|fail` (без `otpCode`). Runbook: `docs/OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md`.

### Channel link (старт ссылки из сессии)

- **`POST /api/auth/channel-link/start`** (авторизованный пациент): deep link Telegram (`t.me/…`) и при настроенном нике Max — `https://max.ru/<nick>?start=link_…`, иначе URL-заглушка и команда `/start link_…`. **Rate limit:** scope `auth.channel_link_start`, ключ — `userId` сессии (до **30** запросов за скользящий час в `auth_rate_limit_events`; без БД — in-memory fallback), аналогично `auth.messenger_start`. Ответ **429** `rate_limited` при превышении.

### Channel link → integrator

После успешного `POST /api/integrator/channel-link/complete` webapp возвращает JSON **`{ ok: true, needsPhone: boolean, phoneNormalized?: string }`** — `phoneNormalized` передаётся в integrator, когда номер уже есть у платформенного пользователя (чтобы в БД бота проставить контакт с label `telegram` и показать ответ в чате). Для повторной доставки токена: `{ ok: true, status: "already_used", needsPhone }`. Integrator при `needsPhone` шлёт запрос контакта (`dispatchRequestContactToUser`); при наличии `phoneNormalized` синхронизирует телефон и отправляет сообщение с шаблоном `telegram:afterPhoneLinked` и главным меню.

**Конфликт привязки (канал уже у другого `platform_users`, токен выдан другому):** канонический владелец по токену — `channel_link_secrets.user_id`. Владелец строки `user_channel_bindings` классифицируется как **одноразовый stub** (нет телефона, одна привязка канала, нет OAuth и «осмысленных» данных пациента и т.д., см. `channelLinkClaim.ts`) или **реальный аккаунт**. **Stub** → узкая транзакция **claim**: перенос привязки на пользователя токена, финализация stub (`merged_into_id`), без `mergePlatformUsersInTransaction`. **Реальный** → `409 conflict`, `mergeReason: channel_owned_by_real_user`; в `admin_audit_log` — открытая строка `channel_link_ownership_conflict` (дедуп по `conflict_key`); relay в TG/Max по теме **`channel_link`** в **`admin_incident_alert_config`** только при **первом** открытии инцидента (`insertedFirst`), без токена ссылки и без телефона в тексте. При отказе claim (stub перестал быть disposable внутри TX) — `mergeReason: channel_link_claim_rejected`; при прочей ошибке TX — `channel_link_claim_failed` (без audit). Локальный лог `[channel_link:binding_conflict]` остаётся через `setChannelLinkBindingConflictReporter` при записи ownership-конфликта. **Integrator:** `createWebappEventsPort().completeChannelLink` при не-OK HTTP передаёт в `executeAction` **`mergeReason` в приоритете над `error`**, чтобы шаблон в чате соответствовал коду (`channel_link_claim_failed` → `channelLink.completeFailed.generic`, ownership-коды → `channelLink.completeFailed.conflict`).

Операторские уведомления вне админки по конфликтам привязки настраиваются ключом **`admin_incident_alert_config`** (темы и каналы TG/Max, получатели — `admin_telegram_ids` / `admin_max_ids`); дедуп внешнего пинга по политике открытых конфликтов — см. `docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/PHASE_D_EVENT_HOOKS.md`.

**Ошибка complete в integrator:** при `ok: false` от webapp шаг `webapp.channelLink.complete` добавляет исходящее `message.send` с шаблонами `channelLink.completeFailed.*` (Telegram / Max), плюс `warn` с `event: channel_link_complete_failed`.

**Webapp complete ок, но не применился `user.phone.link` в integrator** (например откат binding-first TX): тот же шаг возвращает `failed` с шаблоном `channelLink.completeFailed.*` и **без** сообщения успеха (`afterChannelLinked` / welcome-клавиатура не строятся). В `values.channelLink`: `ok: false`, `webappComplete: true`, `phoneLinkSync.ok: false` и причина при наличии.

**Админ в Telegram:** сценарий `telegram.admin.start.link` (приоритет выше catch-all) обрабатывает `/start link_*` так же, как пользовательский `telegram.start.link` — вызов `webapp.channelLink.complete`.

### Открытие ссылки Telegram в браузере (bind-phone / профиль)

После `POST /api/auth/channel-link/start` клиент вызывает `finishChannelLinkNavigation` (`shared/lib/telegramChannelLinkOpen.ts`): Mini App — `Telegram.WebApp` / MAX `WebApp.openMaxLink`; **installed PWA** (`isStandalonePwa`) — Telegram: `location.assign` на `tg://resolve?…` (не `window.open`, иначе t.me в WebView); MAX: `window.open` / `<a target="_blank">` на `https://max.ru/<nick>?start=…` (внешний браузер по возможности; схемы `max://` нет); заглушка `https://max.ru/` без `?start=` в PWA не открывается. Обычный браузер — `window.open`; на мобильном UA — `tg://` для Telegram при возможности. Профиль и bind-phone: при неподключённых каналах `ConnectMessengersBlock` / `PatientBrowserMessengerBindPanel` делают `router.refresh()` раз в 4 с, чтобы после Start в боте подтянуть «Уже подключено».

**Max:** если в ответе есть диплинк с `?start=`, тот же `finishChannelLinkNavigation`; иначе вкладку не открываем — команда в UI и буфер. **429** (`rate_limited`): toast на bind-phone, текст ошибки в `ConnectMessengersBlock`.

### Ошибки и операции

- **`email_ambiguous`** (и для Яндекса, и для Google/Apple web): несколько `platform_users` с одним подтверждённым email — редирект `/app?oauth=error&reason=email_ambiguous`; нужна ручная дедупликация.
- Ошибки Apple callback после `form_post` по возможности оформляются **редиректом** в приложение (`/app?oauth=error&reason=…`), а не JSON, чтобы пользователь не видел «сырой» ответ API.

## Email

- Подтверждённый email в учётке используется backend’ом для **OTP на почту** и для потока **email+password** там, где эти API вызываются.
- **Публичный веб-вход на `/app`:** OTP на **email** доступен, если в `check-phone` пришёл `methods.email` (подтверждённый email в учётке); **`isOtpChannelAvailablePublic`** для **`email`** совпадает с полным набором (для **`sms`** всегда **`false`**). Порядок альтернатив — **`OTP_PUBLIC_OTHER_CHANNELS_ORDER`** (**max** → **email** → **telegram**). **`pickOtpChannelWithPreferencePublic`** учитывает предпочтение **`telegram` / `max` / `email`**, но **никогда** не выберет **`sms`** для публичного веба.
- **Предпочтение канала для кода входа** (`user_channel_preferences.is_preferred_for_auth`): задать можно только **`telegram`**, **`max`**, **`email`**, **`sms`** — см. **`assertChannelAllowedForPreferredAuth`** / **`isChannelAllowedForPreferredAuth`** в `modules/channel-preferences/preferredAuthChannelPolicy.ts`. **`web_push`** и **`vk`** для этого флага **недопустимы** (запись — ошибка **`PreferredAuthChannelNotAllowedError`**); устаревшие строки в БД при **чтении** маскируются, чтобы не расходились карточки каналов и OTP-выбор.
- **Экран входа по email+паролю на `/app`:** кнопка «Войти по email» (из **`oauth_first`**) или сразу форма (**без OAuth**): **Вход** / **Регистрация** → при необходимости **`POST …/login`**, регистрация **`POST …/register`**, код → **`POST …/register/confirm`**. Повтор кода через повтор **`register`** с тем же email и паролем.

- **Восстановление пароля:** в том же **`email_password`**-шаге — **`POST /api/auth/email-password/forgot`** (ответ всегда **ok**) и **`POST /api/auth/email-password/reset`**; состояние сброса может храниться в **`authFlowPendingStorage`** до входа после смены пароля.

## Телефон и OTP

- **startPhoneAuth** / **confirmPhoneAuth** (`phoneAuth.ts`) — челленджи, лимиты (`phoneOtpLimits`: **4** неверных ввода → блок 10 мин, resend cooldown **60 с**), верификация кода; успешный verify **не** удаляет челлендж (удаление — `consumePhoneOtpChallenge` после post-steps в DI). Доставка — `PhoneOtpDelivery` (telegram / max / email / sms).
- HTTP `POST /api/auth/phone/start` для **`channel: web`** не принимает доставку **SMS** (`sms_disabled_web`).
- `POST /api/auth/phone/confirm`: опционально **`browserCalendarIana`** (IANA из `Intl`, до 120 символов) — после успешного входа выставляет `platform_users.calendar_timezone`, если поле ещё `null`.
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

`/api/auth/exchange`, `/api/auth/telegram-init`, **`/api/auth/max-init`**, `/api/auth/telegram-login/config`, `/api/auth/check-phone`, `/api/auth/phone/start`, `/api/auth/phone/confirm`, **`/api/auth/phone/messenger-bind/start`**, **`/api/auth/phone/messenger-bind/status`**, **`/api/integrator/phone-messenger-bind/complete`**, `/api/auth/channel-link/start`, `/api/auth/oauth/start`, `/api/auth/oauth/providers`, `/api/auth/oauth/callback`, `/api/auth/oauth/callback/yandex`, `/api/auth/oauth/callback/google`, `/api/auth/oauth/callback/apple`, `/api/auth/logout` (POST/GET). Пациентский контур: `POST /api/patient/support` (см. выше).

## Integrator → webapp: идемпотентность `POST /api/integrator/events`

Наблюдаемость и поля успеха/отказа для M2M (`ok === true` в JSON при 200/202), а также логи TX-привязки телефона в интеграторе — в `apps/webapp/INTEGRATOR_CONTRACT.md` (раздел Contract Principles → Observability) и `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/STAGE_05_OBSERVABILITY_TESTS_DOCS.md`.

Ключ в таблице **`idempotency_keys`** строится от **семантического** тела события: из JSON убираются поля, не меняющие смысл доставки (в т.ч. верхнеуровневый `occurredAt` и дублирующий `idempotencyKey` внутри body), затем стабильная сериализация и хеш. Повтор с тем же смыслом после успешной обработки отдаёт **кэшированный ответ**; расхождение смысла при том же внешнем ключе — **409**. Если клиент добавляет **новые** верхнеуровневые поля к событию, они участвуют в хеше — возможен ложный конфликт, пока формат не стабилизирован.

## Integrator → webapp: опциональный `POST /api/integrator/messenger-phone/bind`

Только для **внешнего** M2M-клиента (другой сервис, админка): та же транзакция, что **`user.phone.link`** в integrator (`public` binding-first + `integrator.contacts`), подпись **`x-bersoncare-timestamp` / `x-bersoncare-signature`**, обязательный **`x-bersoncare-idempotency-key`**. Семантический хеш для кеша успешного ответа — поля **`channelCode`**, **`externalId`**, **`phoneNormalized`** (`apps/webapp/src/infra/idempotency/messengerPhoneBindRequestHash.ts`). При **одной БД** сценарии бота **не** вызывают этот URL — привязка идёт через `user.phone.link` в процессе integrator. Контракт и коды ответов: `apps/webapp/INTEGRATOR_CONTRACT.md`, этап: `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/STAGE_06_OPTIONAL_HTTP_BIND_ROUTE.md`.

## Операционные логи OTP

При отправке кода через `createIntegratorSmsAdapter` пишется структурированная строка `phone_otp_delivery` (JSON в stdout) с маской номера и каналом — для мониторинга объёма SMS без утечки секретов и полного номера.
