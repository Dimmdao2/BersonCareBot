# auth

Авторизация и сесии веб-приложения (Therapysto у персонала, TherapyGo у пациентов — см.
`config/productSurfaces.ts`).

## Сессия

- Cookie с подписью HMAC; sliding TTL **90 суток** от последней активности (`sessionCookie.ts`, `renewSessionCookieFromRequest`, `proxy.ts` на `/app/*`, `/api/patient/*`, `/api/me`).
- Продление cookie: не чаще чем раз в 24 ч **или** когда до `expiresAt` осталось меньше половины TTL. RSC/`getCurrentSession` сам cookie не пишет — только route handlers и proxy.
- **getCurrentSession** — чтение и валидация сессии из cookie.
- **clearSession** — выход.
- **setSessionFromUser** — установка сессии после успешного входа (SMS/OTP, Telegram, exchange token, OAuth и т.д.).

## Публичный вход в вебе (приоритет)

1. **OAuth (Яндекс / Google)** — при настроенных провайдерах (`buildPrefetchedPublicAuthConfig`) стартовый шаг браузера — **`oauth_first`**, вторичное действие — **«Войти по email»**. Apple решением владельца не предлагается независимо от сохранённых legacy credentials.

2. **Email + пароль** — когда OAuth всё выключено, браузер сразу открывает шаг **`email_password`**: вход, регистрация, код из письма, **восстановление пароля** и ссылка **«Войти по номеру телефона»**. Состояние «ожидается код»/`reset` сохраняется в **`sessionStorage`** (`authFlowPendingStorage.ts`), чтобы пережить обновление и возврат с **`/app/contact-support?from=`**.

3. **Телефон в публичном браузере / PWA / Mini App** — ссылка **«Войти по номеру телефона»** доступна и с **`oauth_first`**, и с **`email_password`** только на пациентской поверхности с методом `phone_bot`. Все поверхности используют один `PhoneMessengerAuthFlow` (`purpose: login`): человек выбирает Telegram/MAX и проходит подтверждение контакта `phone/messenger-bind/{start,status,finish}`. Автоматического подбора канала, SMS-bootstrap, подбора email по номеру, direct OTP и отдельной формы кода нет. Привязка/смена номера в профиле — redirect из `PatientProfileHero` на **`/app/patient/bind-phone?next=/app/patient/profile`**, далее тот же `PhoneMessengerAuthFlow` (`purpose: profile_bind`) в браузере без inline «Назад» над полем номера. Если подтверждённый номер принадлежит другому пациентскому аккаунту, браузер показывает его ФИО и дату создания, спрашивает владельца и только после ответа объединяет его **в текущий профиль**, не переключая сессию. **`bind-phone`** не редиректит только из‑за `tier === patient` без **`phoneTrustedForPatient`**.

**PIN** на плоскости входа **не показывается**; re-auth для чувствительных действий — отдельные API (`pin/verify` и т.д.).

### Публичный UI (`/app`, `AppEntryRsc` → `AppEntryLoginContent` → `AuthBootstrap` → `AuthFlowV2`)

- **Оболочка:** `AppShell` с `variant="patient"` (как у кабинета пациента). RSC `AppEntryRsc` (`/app`, `/app/tg`, `/app/max`): при отсутствии сессии — `AppEntryLoginContent` + `AuthBootstrap`.
- **`AppEntryLoginContent`:** только `Suspense` + `AuthBootstrap`; synthetic dev-login panel отсутствует. **Отдельной плашки** «войдите или зарегистрируйтесь» нет.
- **`AuthFlowV2`:** компактные шаги без дублирующих заголовков «Вход» и без лишних вводных. В браузере: **`oauth_first`** или сразу **`email_password`**, из обоих доступен **`phone_login`**; Mini App открывает тот же `phone_login`, без собственного выбора OTP-канала и формы кода.
- **Patient-оформление:** контент шага в **`patientCardClass` + `patientInnerPageStackClass`** (`max-w-sm`, центрирование для OAuth / email форм и Mini App-потока). Кнопки OAuth и формы — **`shared/ui/auth/loginChrome.ts`**. Ввод номера и выбор мессенджера принадлежат `PhoneMessengerAuthFlow`.
- **Профиль:** смена/привязка номера — redirect из hero на **`bind-phone`** (`?next=profile`); в браузере — `PhoneMessengerAuthFlow` с `hideBackOnPhoneStep`, назад через AppShell. Mini App на **`bind-phone`** — `PatientBindPhoneClient`. Привязка Telegram/MAX — секция «Мессенджеры» с **`ConnectMessengersBlock`** (`grid-cols-2`). На **`bind-phone`** без мессенджеров — **`PatientBrowserMessengerBindPanel`**.

- **Поддержка до входа:** **`/app/contact-support`** принимает **`?from=verify|login|reset`** и читает **`authFlowPendingStorage`**, чтобы подписать кнопку «назад» и ссылку внизу формы («Вернуться к коду» и т.д.).

### Почта: код пациенту, пароль сотруднику

- **`POST /api/auth/email-otp/register`** — каноническая passwordless-регистрация пациента: required `lastName` + `firstName`, optional `patronymic`; отправляет код на почту. Подтверждение идёт через `POST /api/auth/email-otp/confirm` с email и кодом.
- ~~`POST /api/auth/email-password/lookup`~~ — **дверь удалена 13.09.2026 по решению владельца.** Неаутентифицированная, без ограничения частоты, отдавала состояние любой учётной записи по email (проверка чужих адресов). В приложении не вызывалась ниоткуда. Сам модуль `emailPasswordLookup` жив и используется маршрутами `forgot`, `setup-code/complete`.
- **`POST /api/auth/email-password/login`** — при верном пароле и **`email_verified_at`** возвращает сессию и `redirectTo`. Если пароль верный, но email ещё не подтверждён — **409** `email_not_verified` — экран показывает ошибку и на этом останавливается (`AuthFlowV2.tsx:918-921`); повторную отправку кода он отсюда НЕ запускает.
  Вход использует общий per-IP чокпоинт `auth.confirm` (30 запросов / 10 минут) и атомарный протокол
  `password_login_acquire` → одна Argon2-проверка вне транзакции → `password_login_complete`. До Argon2
  сериализуются account + псевдонимный identifier (для неизвестного email — только identifier), выдаётся
  30-секундный UUID lease; завершение с устаревшим/перехваченным lease не может открыть сессию. С 5-й неудачи
  следующий допуск откладывается на 30/60/120/240/480 секунд без удержания HTTP-запроса, на 10-й действует
  временная блокировка 15 минут. Верный пароль во время lock также отклоняется.
  Начиная с 5-й неудачи требуется видимая self-hosted ALTCHA (`altcha@3.2.1`,
  `altcha-lib@2.3.1`): `POST /api/auth/email-password/login/challenge` выдаёт подписанный challenge, связанный
  с `purpose=password_login`, identifier и expiry; криптографически проверенный proof потребляется атомарно
  вместе с admission и только один раз. CDN/Sentinel/внешней телеметрии нет. Реальный и неизвестный email
  проходят один и тот же внешний failure contract и real/dummy Argon2 после допуска.
- **`POST /api/auth/email-password/forgot`** — единый старт восстановления: для **verified + password** запускает reset-код, для **contact-only** (`needs_email_setup`) — setup-код; status/body и время ответа не сообщают найденное состояние, `challengeId` и признак setup/reset наружу не уходят.
- **`POST /api/auth/email-password/setup-code/complete`** — contact-only setup по коду: до успешной проверки OTP неизвестный адрес, contact-only и существующий login получают один `invalid_code`; после проверки создаёт/обновляет пароль и ставит сессию.
- **`POST /api/auth/email-password/reset`** — единый completion после нейтрального `forgot`: проверяет reset- либо setup-код и только после успешного OTP выбирает обновление существующего пароля или первичную установку; ошибки верификации кода (включая случай отсутствия пользователя) нормализуются в нейтральный `invalid_code`.
- **`POST /api/account/security/password/change`** — смена пароля из авторизованного staff-аккаунта с той же
  атомарной защитой текущего пароля и ALTCHA после 5-й неудачи
  (`POST /api/account/security/password/change/challenge`); старые сессии отзываются через `session_epoch`,
  текущая перевыпускается с новым epoch. Успешная смена и восстановление атомарно сбрасывают account +
  identifier state, но не общий per-IP бюджет.
- **Подтверждение email из авторизованного профиля** (`/api/auth/email/confirm`, `/api/patient/email-change/confirm`) после верного OTP выполняет транзакционный claim. Если адрес принадлежит другому безопасно сливаемому client-аккаунту, API возвращает его ФИО и дату создания; после подтверждения человека бесконфликтные части ФИО дополняются молча, а конфликтные выбирает человек. Решение привязано к показанному снимку и перепроверяется в merge-транзакции под server-resolved organization principal. После merge уведомление о входе с нового устройства ставится в общую durable-очередь для всех подтверждённых контактов и привязанных каналов старой учётки. Два password-login аккаунта и остальные hard blockers по-прежнему дают `409 email_conflict`.

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
- **`POST /api/auth/channel-link/start`** (привязка TG/Max с `/app/patient/bind-phone` в браузере): для Telegram — DB-backed `telegram_login_bot_username`, для MAX — DB-backed `max_login_bot_nickname`. При непустом нике ответ содержит диплинк `https://max.ru/<nick>?start=link_…` ([документация MAX](https://dev.max.ru/docs/chatbots/bots-coding/prepare)); пустое значение означает только команду `/start link_…` без автоперехода. Ошибка чтения не подменяется env или `CHANNEL_LIST`. **Не путать** с `ALLOWED_MAX_IDS` / whitelist (там — user id людей).

## OAuth (Яндекс и Google — веб-вход; Apple legacy)

Конфигурация — только **`system_settings`** (scope `admin`), не env. Зеркалирование ключей в БД integrator — по общим правилам (`updateSetting` / миграции). Сохранённые Apple credentials — legacy-конфигурация и не включают Apple как способ входа.

### Маршруты

| Метод | Путь                              | Назначение                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST  | `/api/auth/oauth/start`           | Старт Яндекс/Google OAuth; body `{ "provider": "yandex" \| "google" \| "apple", "browserCalendarIana"?: string }`. Legacy-значение `provider=apple` распознаётся, но fail-closed возвращает `501 oauth_disabled`; Apple flow не стартует. `browserCalendarIana` — опционально IANA из `Intl`, до 120 символов; попадает в подписанный `state` как `tz` и при успешном callback выставляет `platform_users.calendar_timezone`, если ещё `null`. Ответ `{ ok, authUrl }` или ошибка. **Rate limit:** до 60 стартов в час на ключ клиента (таблица `auth_rate_limit_events`, scope `auth.oauth_start`). Ключ — **только `X-Real-IP`** (nginx должен передать `$remote_addr`); **`X-Forwarded-For` не используется** — иначе при `$proxy_add_x_forwarded_for` клиент мог бы подставить левый первый hop и обойти лимит. **Production (`NODE_ENV=production`):** без непустого `X-Real-IP` маршрут отвечает **503** с `error: proxy_configuration` (нарушение инфраструктурного инварианта), лог `oauth_start_x_real_ip_required`. **Development / test:** без `X-Real-IP` — лог `oauth_start_missing_x_real_ip` (debug) и общий fallback-ключ `oauth_start:missing_x_real_ip` для локальной работы. |
| GET   | `/api/auth/oauth/callback/yandex` | Яндекс OAuth; подписанный `state` с purpose `yandex`. Канонический redirect URI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| GET   | `/api/auth/oauth/callback`        | Legacy: тот же обработчик, что `/callback/yandex` (совместимость со старыми redirect URI в кабинете Яндекса).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| GET   | `/api/auth/oauth/callback/google` | Веб-логин Google; `state` — purpose `google_login`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| POST  | `/api/auth/oauth/callback/apple`  | Недостижимый из поддерживаемого login flow legacy-route: `/oauth/start` больше не выпускает Apple state. Старый обработчик сохранён, но не является способом входа.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Подписанный `state` (CSRF)

Модуль `oauthSignedState.ts`: HMAC-SHA256 от `SESSION_COOKIE_SECRET`, payload `{ p, exp, n, nonce?, tz? }` (`tz` — опциональная IANA с клиента для веб-входа), отдельный **purpose** на поток (`yandex` | `gcal` | `google_login` | `apple`). Cookie для state не используется. Срок ~10 мин; **повторное использование** того же `state` до истечения `exp` теоретически возможно (как и у типичного signed-state); при ротации `SESSION_COOKIE_SECRET` незавершённые переходы сбрасываются. **Осознанный компромисс:** server-side store «used state» не ведётся; повтор callback с тем же `code` обычно падает на обмене у провайдера (authorization `code` одноразовый).

**Почему rate limit не смотрит на `X-Forwarded-For`:** см. выше; кратко — доверие только к заголовку, который выставляет **доверенный** reverse proxy (`X-Real-IP`), а не к цепочке, в начало которой клиент может дописать свой IP.

### Google: календарь и вход

- Календарь: `google_client_id`, `google_client_secret`, **`google_redirect_uri`** → только admin calendar callback.
- Вход: тот же client id/secret + **`google_oauth_login_redirect_uri`** → callback `/api/auth/oauth/callback/google`.
- **Нельзя** записывать `google_refresh_token` из потока веб-логина: обмен кода даёт только access token для userinfo; `refresh_token` из ответа игнорируется. В authorize задано `access_type=online`, чтобы не запрашивать офлайн-доступ для входа.
- **Email:** merge в существующую учётку по email и выставление `email_verified_at` для новой — только если в userinfo `verified_email === true`. Иначе email не участвует в merge с подтверждёнными записями в БД.

### Apple

- Apple не предлагается клиенту: providers API и SSR snapshot всегда возвращают `apple: false`, а прямой
  `provider=apple` в `/api/auth/oauth/start` получает `oauth_disabled`.
- Callback и проверка `id_token` через JWKS Apple остаются недостижимым legacy-кодом без поддерживаемого start-flow.

### Сессия после входа

`oauthWebSession.completeOAuthWebLoginRedirectUrls` (и Яндекс-обработчик): **`setSessionFromUser`**, редирект по роли через `getRedirectPathForRole`; **нет** принудительного редиректа на **`bind-phone`** только из-за отсутствия телефона (**ветка `oauth_phone_required`** снята). Провайдер с **`emailVerified`** обновляет **`email_verified_at`** у канона. Запись на приём по-прежнему опирается на доверенный телефон (**`requirePatientBookingTrustedPhoneAccess`** и смежные правила).

### Пациент: `need_activation`, tier и layout

Tier **`patient`** (доступ к основному пациентскому функционалу при наличии БД) задаёт **`resolvePlatformAccessContext`/`computeClientTier`**: достаточно **доверенного телефона**, **или** **`email_verified_at`**, **или** наличие **password** (**`user_password_credentials`**), **или** web-OAuth-привязки (Яндекс/Google/Apple).

**`patientClientBusinessGate`** по-прежнему может вернуть **`need_activation`** для редких legacy-учёток без указанной web/webmail-активирующей связки; пациентский **`layout.tsx` не выполняет** массовый редирект на **`bind-phone`** из этого основания. Навигация и onboarding-маршруты — **`patientRouteApiPolicy`**; без БД — отдельно **`patientPathRequiresBoundPhone`**. Логируемый **`patient_redirect_bind_phone`** из layout при типичном OAuth больше не ожидается.

**Mini App + OAuth:** канонический телефон для бизнес-поверхностей пациента — номер, подтверждённый через бота (`request-contact` / channel-link), а не только OAuth userinfo. Решение о `need_activation` и редирект на `/app/patient/bind-phone` принимает **post-login слой** (gate + layout), не `AuthBootstrap`. Клиентская диагностика: событие `post_auth_binding_required` (`scope: auth_flow`) при показе `PatientSharePhoneViaBotPanel` в WebView; в payload при необходимости — `hasDeferredMessengerInitCandidate` (есть ли отложенный initData-кандидат для binding/recovery).

### Auth bootstrap / публичные конфиги (observability)

- Единый серверный снимок `buildPrefetchedPublicAuthConfig` собирает только публичные флаги провайдеров, поля альтернатив входа и rollout-флаг **`specialist_signup_enabled`**. Снимок пробрасывается в **`AuthBootstrap`/`AuthFlowV2`** как **`prefetchedAuthConfig`** / **`initialPublicAuthConfig`** через RSC props; секреты в тип снимка не входят.

- Отдельные публичные auth-route могут дополнительно логировать **`logAuthRouteTiming`** (см. реализации маршрутов); секреты в лог не попадают.

### Unsupported-client boot fallback (Ф0, dormant)

- Единый RSC-чокпоинт `AppEntryRsc` для `/app`, `/app/tg`, `/app/max` при включённом глобальном public runtime-флаге
  `patient_unsupported_client_fallback_enabled` вставляет скрытую SSR-заглушку и classic ES5-safe watchdog.
  Дефолт флага — `false`; TEST/PROD-активация и реальное окно сбора остаются отдельным owner gate.
- Раннее исполнение client-модуля отмечает `module_executed`, mount `AuthBootstrap` — `react_mounted`; здоровый mount
  отменяет watchdog. В `development` временная классификация не вооружается: ожидание DEV-компилятора не имеет
  верхней границы и само по себе не доказывает несовместимость клиента. В `production` сохраняется 10-секундный
  timeout для настоящего no-module/hard-failure. Существующие `MESSENGER_*` таймауты остаются отдельным auth-flow и
  не считаются boot failure.
- `POST /api/patient-app/client-boot-report` принимает только bounded/minimized strict payload, лимитируется по
  доверенному `X-Real-IP` через DB sliding-window port и пишет только structured `info`/`warn` с
  `scope=patient_client_env`, `event=unsupported_client_boot`. Raw UA/stack/body/tokens/account ids не принимаются;
  product analytics, registration failure, audit и operator-health не вызываются.
- Raw `X-Real-IP` не передаётся в repository и не сохраняется: limiter получает purpose-separated HMAC-SHA256
  `patient-client-boot-rate-limit:v1` на существующем `SESSION_COOKIE_SECRET`. Ротация session secret меняет
  псевдоним и может один раз сбросить этот часовой non-security лимит; коллизия полного SHA-256 практически
  пренебрежима. Очистка F0 scope запрашивается не чаще раза в пять минут на процесс, защищена общим DB try-lock и
  удаляет не более 500 старейших строк за проход по индексу `(scope, occurred_at)`; она не зависит от повторного
  запроса того же IP и не делает полный scope-scan на каждом report.
- UA-матрица (`supportedClientMatrix.ts`) используется только для классификации/текста и никогда не понижает bundle
  baseline и не ограничивает доступ.

### Phone messenger bind (вход / привязка по `auth_*`)

Поток для **публичного браузера/PWA** и **inline-привязки в профиле**: вместо direct OTP — deep link в бота, контакт; дальше ветка по **`purpose`**.

- **`POST /api/auth/phone/messenger-bind/start`** — тело `{ phone, channelCode: "telegram"|"max", purpose: "login"|"profile_bind" }`. **`profile_bind`** требует сессию пациента. Ответ: `{ ok, setupToken, url, expiresAtIso, manualCommand? }` (`setupToken` = `auth_*`). **Rate limit:** scope `auth.phone_messenger_bind_start` (ключ — userId для `profile_bind`, иначе IP/anon), до **30**/час в `auth_rate_limit_events`.
- **`POST /api/auth/phone/messenger-bind/status`** — `{ setupToken }` → `pending_contact` \| `otp_ready` (+ `challengeId`) \| `failed` \| `expired` \| `consumed`.
- **`POST /api/auth/phone/messenger-bind/finish`** — server-side finish для обоих purpose: тот же браузер подтверждает сохранённый OTP и при конфликте аккаунтов получает общий account/FIO prompt.
- **`POST /api/integrator/phone-messenger-bind/complete`** (M2M, подпись как channel-link) — контакт из бота. Создаёт OTP challenge для обоих purpose; решение о слиянии остаётся браузерному finish после доказанного канала. Ответ **200** `{ ok: true, purpose, … }`:
  - **`purpose: login`** — OTP-challenge, secret → `otp_ready`; integrator ничего не пишет (`user.phone.link` выведен из рантайма 2026-08-26), а PWA завершает вход server-side через **`phone/messenger-bind/finish`**; **replay** `otp_ready` → меню без повторной выдачи секрета.
  - **`purpose: profile_bind`** — создаётся серверный OTP challenge, secret → `otp_ready`; PWA передаёт его server-side finish после возврата в тот же авторизованный браузер.
  - **`used_token`** / secret уже `consumed` → **200** `{ status: "already_used" }`.
- **`POST /api/auth/phone/start`** и **`POST /api/auth/phone/confirm`** — legacy direct OTP сохранён только для `profile_bind`: start требует действующую пациентскую сессию и сохраняет её `userId`/organization-scope в challenge, confirm отказывает challenge без `profileBindUserId`. Для login оба маршрута отвечают `direct_phone_login_disabled`.

Клиент: `PhoneMessengerAuthFlow` для обоих purpose опрашивает `status` и при `otp_ready`/`consumed` вызывает `finish`, без формы кода. Mini App на bind-phone — по-прежнему `PatientBindPhoneClient` (request-contact). Открытие deep link — `finishChannelLinkNavigation` (как channel-link); при ручном fallback MAX клиент показывает `/start auth_*` на экране ожидания. Логи: `phone_messenger_bind_start`, `phone_messenger_bind_complete_ok|fail` (без `otpCode`). Runbook: `docs/OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md`. Планы A/B: `.cursor/plans/archive/phone_messenger_bind_pwa_autologin.plan.md`, `.cursor/plans/archive/phone_messenger_bind_bot_ux.plan.md` (`status: completed`); ручной smoke — `docs/LOGIN_REGISTER_NEW_LOGIC/LOG.md` §«Приёмка A+B».

### Channel link (старт ссылки из сессии)

- **`POST /api/auth/channel-link/start`** (авторизованный пациент): deep link Telegram (`t.me/…`) и при настроенном нике Max — `https://max.ru/<nick>?start=link_…`, иначе URL-заглушка и команда `/start link_…`. **Rate limit:** scope `auth.channel_link_start`, ключ — `userId` сессии (до **30** запросов за скользящий час в `auth_rate_limit_events`; без БД — in-memory fallback). Ответ **429** `rate_limited` при превышении.

### Channel link → integrator

После успешного `POST /api/integrator/channel-link/complete` webapp возвращает JSON **`{ ok: true, needsPhone: boolean, phoneNormalized?: string }`** — `phoneNormalized` передаётся в integrator, когда номер уже есть у платформенного пользователя (чтобы в БД бота проставить контакт с label `telegram` и показать ответ в чате). Для повторной доставки токена: `{ ok: true, status: "already_used", needsPhone }`. Integrator при `needsPhone` шлёт запрос контакта (`dispatchRequestContactToUser`); при наличии `phoneNormalized` синхронизирует телефон и отправляет сообщение с шаблоном `telegram:afterPhoneLinked` и главным меню.

**Конфликт привязки (канал уже у другого `platform_users`, токен выдан другому):** канонический владелец по токену — `channel_link_secrets.user_id`. Владелец строки `user_channel_bindings` классифицируется как **одноразовый stub** (нет телефона, одна привязка канала, нет OAuth и «осмысленных» данных пациента и т.д., см. `channelLinkClaim.ts`) или **реальный аккаунт**. **Stub** → узкая транзакция **claim**: перенос привязки на пользователя токена, финализация stub (`merged_into_id`), без `mergePlatformUsersInTransaction`. **Реальный** → сначала full auto-merge через `mergePlatformUsersInTransaction(..., "phone_bind")`; при успехе flow продолжается без ручного вмешательства. Если merge-engine возвращает hard blocker — `409 conflict`, `mergeReason: merge_blocked_*` / другой код классификации; в `admin_audit_log` — открытая строка `channel_link_ownership_conflict` (дедуп по `conflict_key`, `candidateIds` в details); relay в TG/Max по теме **`channel_link`** в **`admin_incident_alert_config`** только при **первом** открытии инцидента (`insertedFirst`), без токена ссылки и без телефона в тексте. При отказе claim (stub перестал быть disposable внутри TX) — `mergeReason: channel_link_claim_rejected`; при прочей ошибке TX — `channel_link_claim_failed` (без audit). Локальный лог `[channel_link:binding_conflict]` остаётся через `setChannelLinkBindingConflictReporter` при записи ownership-конфликта. **Integrator:** `createWebappEventsPort().completeChannelLink` при не-OK HTTP передаёт в `executeAction` **`mergeReason` в приоритете над `error`**, чтобы шаблон в чате соответствовал коду (`channel_link_claim_failed` → `channelLink.completeFailed.generic`, ownership-коды → `channelLink.completeFailed.conflict`).

Операторские уведомления вне админки по конфликтам привязки настраиваются ключом **`admin_incident_alert_config`** (темы и каналы TG/Max, получатели — `admin_telegram_ids` / `admin_max_ids`); дедуп внешнего пинга по политике открытых конфликтов — см. `docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/PHASE_D_EVENT_HOOKS.md`.

**Ошибка complete в integrator:** при `ok: false` от webapp шаг `webapp.channelLink.complete` добавляет исходящее `message.send` с шаблонами `channelLink.completeFailed.*` (Telegram / Max), плюс `warn` с `event: channel_link_complete_failed`.

**Ретроспектива (актуально до 2026-08-26):** раньше existовал отдельный сценарий «webapp complete ок, но не применился `user.phone.link` в integrator» — с откатом до `failed` и без сообщения успеха. `user.phone.link` выведен из рантайма: `result.phoneNormalized` уже канонический (прочитан из `platform_users`/`user_contacts` при вычислении `needsPhone`, а не получен от провайдера), integrator'у синхронизировать больше нечего — этот шаг просто шлёт шаблон успеха (см. «Channel link → integrator» выше). Единственный оставшийся failure-путь — `ok: false` от самого webapp complete (см. «Ошибка complete в integrator»).

**Админ в Telegram:** сценарий `telegram.admin.start.link` (приоритет выше catch-all) обрабатывает `/start link_*` так же, как пользовательский `telegram.start.link` — вызов `webapp.channelLink.complete`.

### Открытие ссылки Telegram в браузере (bind-phone / профиль)

После `POST /api/auth/channel-link/start` клиент вызывает `finishChannelLinkNavigation` (`shared/lib/telegramChannelLinkOpen.ts`): Mini App — `Telegram.WebApp` / MAX `WebApp.openMaxLink`; **installed PWA** (`isStandalonePwa`) — Telegram: `location.assign` на `tg://resolve?…` (не `window.open`, иначе t.me в WebView); MAX: `window.open` / `<a target="_blank">` на `https://max.ru/<nick>?start=…` (внешний браузер по возможности; схемы `max://` нет); заглушка `https://max.ru/` без `?start=` в PWA не открывается. Обычный браузер — `window.open`; на мобильном UA — `tg://` для Telegram при возможности. Профиль и bind-phone: при неподключённых каналах `ConnectMessengersBlock` / `PatientBrowserMessengerBindPanel` делают `router.refresh()` раз в 4 с, чтобы после Start в боте подтянуть «Уже подключено».

**Max:** если в ответе есть диплинк с `?start=`, тот же `finishChannelLinkNavigation`; иначе вкладку не открываем — команда в UI и буфер. **429** (`rate_limited`): toast на bind-phone, текст ошибки в `ConnectMessengersBlock`.

### Ошибки и операции

- **`email_ambiguous`** (и для Яндекса, и для Google/Apple web): несколько `platform_users` с одним подтверждённым email — редирект `/app?oauth=error&reason=email_ambiguous`; нужна ручная дедупликация.
- Ошибки Apple callback после `form_post` по возможности оформляются **редиректом** в приложение (`/app?oauth=error&reason=…`), а не JSON, чтобы пользователь не видел «сырой» ответ API.

## Email

- Подтверждённый email в учётке используется backend’ом для **OTP на почту** и для потока **email+password** там, где эти API вызываются.
- **Публичный веб-вход на `/app` по номеру:** пациентская поверхность проходит через подтверждение контакта в
  Telegram/MAX — `phone/messenger-bind/{start,status,finish}`. Email остаётся отдельной дверью и не подбирается
  по номеру; автоматической доставки, SMS-bootstrap и Web Push нет.
- **Предпочтение канала для кода входа** (`user_channel_preferences.is_preferred_for_auth`): задать можно только **`telegram`**, **`max`**, **`email`**, **`sms`** — см. **`assertChannelAllowedForPreferredAuth`** / **`isChannelAllowedForPreferredAuth`** в `modules/channel-preferences/preferredAuthChannelPolicy.ts`. **`web_push`** и **`vk`** для этого флага **недопустимы** (запись — ошибка **`PreferredAuthChannelNotAllowedError`**); устаревшие строки в БД при **чтении** маскируются, чтобы не расходились карточки каналов и OTP-выбор.
- **Экран входа по email+паролю на `/app`:** кнопка «Войти по email» (из **`oauth_first`**) или сразу форма (**без OAuth**): **Вход** / **Регистрация** → при необходимости **`POST …/login`**, регистрация **`POST …/register`**, код → **`POST …/register/confirm`**. Повтор кода через повтор **`register`** с тем же email и паролем.

- **Восстановление пароля:** в том же **`email_password`**-шаге — **`POST /api/auth/email-password/forgot`** (ответ всегда **ok**) и **`POST /api/auth/email-password/reset`**; состояние сброса может храниться в **`authFlowPendingStorage`** до входа после смены пароля.

## Телефон и OTP

- **startPhoneAuth** / **confirmPhoneAuth** (`phoneAuth.ts`) — челленджи, лимиты (`phoneOtpLimits`: **4** неверных ввода → блок 10 мин, resend cooldown **60 с**), верификация кода; успешный verify **не** удаляет челлендж (удаление — `consumePhoneOtpChallenge` после post-steps в DI). Доставка — `PhoneOtpDelivery` (telegram / max / email / sms).
- HTTP `POST /api/auth/phone/start` принимает только direct OTP **`profile_bind`**: требует пациентскую поверхность с методом `phone_bot`, действующую пациентскую сессию и явно выбранный `deliveryChannel`. `userId` и organization-scope берутся только из сессии и текущего principal, сохраняются в challenge и не принимаются телом confirm.
- `POST /api/auth/phone/confirm` принимает только challenge с `profileBindUserId`; challenge входа по номеру отклоняется. Опциональный **`browserCalendarIana`** остаётся совместимым полем direct profile-bind confirm.
- Вход по номеру использует только `phone/messenger-bind/{start,status,finish}`.
- Порты: **SmsPort**, **PhoneChallengeStore**, **UserByPhonePort**.

## Роль пользователя

> ⚠️ **УСТАРЕЛО (26.07.2026).** Выдача роли через whitelist в `system_settings`/env (`admin_emails` и
> смежные `admin_*`/`doctor_*` списки) — устаревшая схема. Канон:
> [ADMIN_ACCESS_MODEL.md](../../../../../docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md).

- **resolveRoleAsync** — приоритет whitelist из `system_settings` (admin), fallback на env для совместимости.
- **resolveRoleFromEnv** — синхронный fallback по env (Telegram/Max/телефоны).
- **`admin_emails`** — отдельное DB-only правило: только подтверждённый email получает `admin` в текущей сессии. Оно читается fresh без env/cache fallback и при удалении адреса или ошибке чтения сразу возвращает базовую роль из БД. Email-derived admin не сохраняется в `platform_users.role`.

## Поддержка пациента (форма → Telegram админу)

- **Страница:** `/app/patient/support` (константа `routePaths.patientSupport`). Доступ с `requirePatientAccess`; в layout не требуется tier **patient** (whitelist в `patientRouteApiPolicy`, как у `help` / `bind-phone`).
- **API:** `POST /api/patient/support` — тело `{ email, message, surface?: "mini_app"|"browser", from?: string }`. Поле `from` — опциональный путь UI; в Telegram попадает только если начинается с `/app` (до 200 символов, без переводов строк).
- **Гейт:** `patientClientBusinessGate` — отклоняется только `stale_session` (401); разрешены `allow` и `need_activation` (вопрос из onboarding, в т.ч. привязка телефона).
- **Доставка:** `sendMessage` в Telegram на `env.ADMIN_TELEGRAM_ID` (должен быть **ненулевой** конечный числовой id чата) и DB-backed токен `telegram_bot_token` из `getTelegramBotToken()`. В текст включаются user id, ФИО, телефон, привязки мессенджеров, User-Agent, поверхность, опционально страница.
- **Rate limit:** in-memory, **после** успешной отправки в Telegram, 60 с на ключ: `userId` → `u:…`, иначе нормализованный телефон → `p:…`, иначе первый hop `X-Forwarded-For` или `X-Real-IP` → `ip:…`, иначе общий ключ `anon:support`.
- **Ссылка «Связаться с поддержкой»:** `system_settings.support_contact_url` (`getSupportContactUrl`), дефолт из `supportContactConstants` — внутренний путь формы; внешние URL допустимы. Рендер: `SupportContactLink`: внутренние пути `/app/…` — **нативный `<a href>`** (полная загрузка документа, чтобы избежать ошибок загрузки чанков Next.js после деплоя при устаревшем клиентском бундле); внешние URL — `<a target="_blank" rel="noopener noreferrer">`. В админке путь поддержки валидируется как `/app/…` или http(s).

## API-маршруты (часто используемые)

`/api/auth/exchange`, `/api/auth/telegram-init`, **`/api/auth/max-init`**, `/api/auth/telegram-login/config`, `/api/auth/check-phone`, `/api/auth/phone/start`, `/api/auth/phone/confirm`, **`/api/auth/phone/messenger-bind/start`**, **`/api/auth/phone/messenger-bind/status`**, **`/api/auth/phone/messenger-bind/finish`**, **`/api/integrator/phone-messenger-bind/complete`**, `/api/auth/channel-link/start`, `/api/auth/oauth/start`, `/api/auth/oauth/callback`, `/api/auth/oauth/callback/yandex`, `/api/auth/oauth/callback/google`, `/api/auth/oauth/callback/apple`, `/api/auth/logout` (POST). Пациентский контур: `POST /api/patient/support` (см. выше).

## Integrator → webapp: опциональный `POST /api/integrator/messenger-phone/bind`

Только для **внешнего** M2M-клиента (другой сервис, админка): каноническая транзакция привязки `public.platform_users` / `public.user_channel_bindings`; параллельный write `user.phone.link` в integrator выведен из рантайма 2026-08-26. При коллизии M2M возвращает `human_account_confirmation_required` и URL общего браузерного входа, где живёт account/FIO prompt. Подпись — **`x-bersoncare-timestamp` / `x-bersoncare-signature`**, обязателен **`x-bersoncare-idempotency-key`**. Семантический хеш для кеша успешного ответа — поля **`channelCode`**, **`externalId`**, **`phoneNormalized`** (`apps/webapp/src/infra/idempotency/messengerPhoneBindRequestHash.ts`). При **одной БД** сценарии бота **не** вызывают этот URL. Контракт и коды ответов: `apps/webapp/INTEGRATOR_CONTRACT.md`, этап: `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/STAGE_06_OPTIONAL_HTTP_BIND_ROUTE.md`.

## Журнал воронки регистрации (product analytics)

Серверная фиксация **attempt → success / failure** для публичных auth-потоков (без уведомлений пользователю). Запись best-effort через `recordAuthRegistration` (`app-layer/product-analytics/recordAuthRegistration.ts`); сбой аналитики не ломает auth.

**Event types** в `product_analytics_events_recent`: `auth_register_attempt`, `auth_register_success`, `auth_register_failure`.

**Metadata (jsonb, без сырого PII):** `attemptId`, `authMethod`, `stage`, `contactType`, `contactHint` (маска email/телефона или имя OAuth-провайдера), опционально `errorCode`, `errorClass` (`user` | `system`), `isNewAccount`, `challengeId`.

**`authMethod`:** `email_password`, `oauth_yandex`, `oauth_google`, `oauth_apple`, `phone_otp`, `messenger_bind`, `telegram_init`, `max_init`, `integrator_exchange`.

**Корреляция `attemptId`:** email register возвращает `{ attemptId }` в JSON; клиент передаёт в `register/confirm`. OAuth — поле `n` подписанного `state`. Messenger bind — `setupToken` (`auth_*`).

**Success только для регистрации:** OAuth/phone/exchange/mini-app — когда создан новый аккаунт (`accountOutcome=created` / `wasCreated`); обычный login не пишет `auth_register_success`.

**System failures** (`errorClass=system`) дублируются в `admin_audit_log` (`action=auth_register_failure`, `status=error`). User-ошибки (`invalid_code`, `duplicate_email`, `access_denied`, отмена OAuth через `?error=`, …) — только product analytics.

**OAuth callbacks:** при redirect с `?error=` (отмена пользователем) пишется `auth_register_failure` до обмена code (Yandex, Google, Apple).

**Просмотр:** `GET /api/admin/auth-registration-events` (admin mode). UI — секция «Ошибки регистрации» на `/app/doctor/audit-log`: таблица (время, метод, stage, contactHint, errorCode, attemptId с copy), фильтры preset (неделя/месяц), eventType, authMethod; по умолчанию `auth_register_failure` + `errorClass=system`; чекбокс «все ошибки».

**Модули:** `recordAuthRegistration.ts`, `registrationOAuthWebCallback.ts`, `maskContactHint.ts`, `registrationErrorClass.ts`; port `listRegistrationEvents` в `product-analytics/ports.ts`.

## Операционные логи OTP

При отправке кода через `createIntegratorSmsAdapter` пишется структурированная строка `phone_otp_delivery` (JSON в stdout) с маской номера и каналом — для мониторинга объёма SMS без утечки секретов и полного номера.
