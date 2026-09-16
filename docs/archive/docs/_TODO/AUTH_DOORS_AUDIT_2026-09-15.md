# Аудит дверей входа под `apps/webapp/src/app/api/auth/`

Дата: 2026-09-15. Классификация: **ВЗГЛЯД**, без тестов и без изменения продукта.

## Объём и способ проверки

- Фактический объём — **47** файлов `route.ts`: команда
  `rg --files apps/webapp/src/app/api/auth | rg '/route\.ts$' | wc -l` → `47`.
  Групп **17**: команда
  `rg --files apps/webapp/src/app/api/auth | awk -F/ '/\/route\.ts$/ {print $7}' | sort -u | wc -l` → `17`.
- Authority: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md`, прежде всего модель трёх дверей
  (`:37-53`), снятые deep-link и Mini App способы (`:84-103`), будущий Telegram Login Widget
  (`:105-113`), модель passkey (`:170-210`), запрет пациентского пароля (`:212-237`), control plane
  (`:282-304`), неразличимость ответа (`:779-816`) и запрет CAPTCHA для OTP (`:977-985`).
- Для каждого URL выполнен точный поиск по пути среди runtime-файлов:
  `rg -n -F "$path" apps packages --glob '*.{ts,tsx,mjs,js}' --glob '!apps/webapp/src/app/api/auth/**' --glob '!**/*.test.*' --glob '!**/*.spec.*'`.
  OAuth callback считается вызываемым внешним провайдером, когда его URL используется как redirect URI;
  bot bind — когда webapp запускает flow, а integrator завершает его.
- Проверялись также сервисы, которые фактически ставят cookie: `persistNewAuthSession` ставит cookie и пишет
  login journal в одной точке (`apps/webapp/src/modules/auth/service.ts:238-324`), а публичная обёртка
  `setSessionFromUser` приходит туда через `apps/webapp/src/modules/auth/service.ts:1153-1178`.
- PROD, `.env`, БД и живой DEV не трогались. Поэтому отсутствие внешнего клиента можно доказать только по
  коду, integrator-контурам, активной документации и registry/back-reference; трафик неизвестных внешних
  клиентов без обращения к PROD установить невозможно. Эта граница вынесена в вопросы владельцу.

## Таблица дверей

В колонке «защита / мусор» явно указаны Zod/ручная проверка, rate limit, подпись/state/nonce, TTL и CAPTCHA,
когда они применимы. `Нет CAPTCHA` для одноразового кода само по себе правильно по канону
(`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:977-985`).

**Сразу по `dev-public`:** файл входит в production build, но на production вызов только вернёт 303 на `/app`
до очистки cookies (`apps/webapp/src/app/api/auth/dev-public/route.ts:21-30`), а production-процесс вообще
отказывается стартовать с включённым `ALLOW_DEV_AUTH_BYPASS`
(`apps/webapp/src/modules/auth/devBypassPolicy.ts:18-26`). Сессию маршрут не выдаёт.

| # | Дверь | Назначение | Сессия | Кто зовёт | Защита / валидация / ответ на мусор |
|---:|---|---|---|---|---|
| 1 | `POST /api/auth/channel-link/start` (`apps/webapp/src/app/api/auth/channel-link/start/route.ts:18`) | Выдать вошедшему пользователю deep-link для привязки Telegram/MAX/VK. | Нет. | `ConnectMessengersBlock.tsx:78`; `PatientBrowserMessengerBindPanel.tsx:61`. | Текущая сессия, channel toggle, limit по user id (`route.ts:22-46`); Zod enum → 400 (`:14-30`); случайный hashed secret, TTL 10 мин (`apps/webapp/src/modules/auth/channelLink.ts:9,91-120`). CAPTCHA/счётчика ошибок нет и не требуется для уже вошедшего пользователя. |
| 2 | `POST /api/auth/check-phone` (`apps/webapp/src/app/api/auth/check-phone/route.ts:17`) | Вернуть публичный набор разрешённых способов продолжения после ввода телефона, не искать аккаунт. | Нет. | `AuthFlowV2.tsx:1293`. | Zod + E.164 → 400, limit по телефону → 429, минимум 500 мс (`route.ts:11-49`); возвращает только policy (`:45-55`). Нет CAPTCHA/кода/TTL: дверь ничего не подтверждает. |
| 3 | `GET /api/auth/dev-public` (`apps/webapp/src/app/api/auth/dev-public/route.ts:16`) | DEV-helper: очистить session/context cookies и открыть чистый login/registration. | Нет; существующую сессию очищает только после dev-gate (`:21-40`). | Ручной DEV-вызов документирован в `apps/webapp/README.md:39` и `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md:248-251`. | **В production процесс отказывается стартовать при включённом флаге** (`apps/webapp/src/modules/auth/devBypassPolicy.ts:18-22`); без одновременно `NODE_ENV=development` и флага маршрут только 303 на `/app` (`route.ts:21-28`). Неизвестный `view` попадает на обычный `/app` (`:9-13,31-34`). Rate limit/CAPTCHA не нужны: аутентификацию не выдаёт. |
| 4 | `POST /api/auth/email-otp/confirm` (`apps/webapp/src/app/api/auth/email-otp/confirm/route.ts:43`) | Подтвердить публичный email OTP и войти. | **Да**, `setSessionFromUser` (`:104-142`). | `AuthFlowV2.tsx:2159`; `PublicLeadForm.tsx:134`; `usePublicCreateBooking.ts:181`. | IP confirm limit (`:46-60`), Zod → 400 (`:63-69`), channel/portal gate (`:71-79,132-139`); email OTP TTL 30 мин, лимит попыток и consume (`apps/webapp/src/modules/auth/emailAuth.ts:27,247-298`). Нет CAPTCHA — канонично. Админское исключение небезопасно, finding F1. |
| 5 | `POST /api/auth/email-otp/register` (`apps/webapp/src/app/api/auth/email-otp/register/route.ts:51`) | Начать регистрацию пациента с ФИО и email OTP. | Нет. | `AuthFlowV2.tsx:705,2359`; `usePublicCreateBooking.ts:128`. | Surface/channel gate, IP limit (`route.ts:53-87`), строгая Zod/FIO → 400 (`:19-46,90-101`), per-email cooldown и OTP 30 мин. Нет CAPTCHA — канонично. |
| 6 | `POST /api/auth/email-otp/start` (`apps/webapp/src/app/api/auth/email-otp/start/route.ts:43`) | Запросить OTP для входа по подтверждённой почте. | Нет. | `AuthFlowV2.tsx:647,2318`; `usePublicCreateBooking.ts:141`. | Zod → 400, surface/channel gate и IP limit (`route.ts:45-90`); известный/неизвестный адрес и delivery failure выровнены по форме и времени (`:94-159,216-229`); OTP 30 мин/consume. Нет CAPTCHA — канонично. |
| 7 | `POST /api/auth/email-password/forgot` (`apps/webapp/src/app/api/auth/email-password/forgot/route.ts:30`) | Отправить password-reset либо password-setup email. | Нет. | `AuthFlowV2.tsx:778`. | Zod email → 400 (`:11-13,32-35`), challenge имеет cooldown/TTL/attempt limit; нет route IP limit. Ответ обычного reset нейтрален, но setup-ветка различима (`:15-19,78-94`), findings F4/F7. CAPTCHA нет. |
| 8 | `POST /api/auth/email-password/login/challenge` (`apps/webapp/src/app/api/auth/email-password/login/challenge/route.ts:15`) | Выдать ALTCHA-задачу для password login. | Нет. | `AuthFlowV2.tsx:1673`. | IP limit → 429/503, Zod email → 400 (`route.ts:18-45`); `passwordAltcha.issue` читает общую DB-политику (`:48-57`). TTL подписи задаёт ALTCHA service; nonce/OAuth неприменимы. |
| 9 | `POST /api/auth/email-password/login/factor` (`apps/webapp/src/app/api/auth/email-password/login/factor/route.ts:47`) | Завершить staff login TOTP/recovery/email factor после верного пароля. | **Да**, после фактора (`:97-110,141-159`). | `AuthFlowV2.tsx:965`. | IP confirm limit (`:56-65`), Zod → 400 (`:67-81`), short-lived server continuation и staff-security attempt/lock checks (`:83-147`). CAPTCHA уже пройдена на password step. |
| 10 | `POST /api/auth/email-password/login` (`apps/webapp/src/app/api/auth/email-password/login/route.ts:87`) | Проверить пароль, применить staff 2FA policy или сразу войти. | **Да**, когда второй фактор не нужен (`:303-318`); иначе выдаёт continuation. | `AuthFlowV2.tsx:903`. | Zod → 400 (`:31-35,122-132`); IP limit, DB account backoff/temporary lock и общая CAPTCHA policy (`:90-118,141-193`); password-role и portal gates (`:235-245`); staff factor (`:248-317`). |
| 11 | `POST /api/auth/email-password/register/confirm` (`apps/webapp/src/app/api/auth/email-password/register/confirm/route.ts:39`) | Подтвердить старую patient email+password регистрацию. | **Да**, после OTP (`:125-170`). | Остаточная ветка `AuthFlowV2.tsx:2197`. | Email toggle, Zod → 400 (`:41-53`), OTP purpose/TTL/attempt consume (`:93-122`); route-level IP limit отсутствует. Start этой пары теперь всегда закрыт, см. D4. |
| 12 | `POST /api/auth/email-password/register` (`apps/webapp/src/app/api/auth/email-password/register/route.ts:86`) | Старый старт patient email+password регистрации. | Нет. | Остаточная resend-ветка `AuthFlowV2.tsx:2415`. | После email toggle всегда 403 **до чтения/валидации body**, потому что создаёт только `client`, а пароль пациенту запрещён (`route.ts:88-99`). Поэтому любой мусор при включённой почте тоже 403. Недостижимые ниже Zod/rate/OTP ветки начинаются с `:100`. |
| 13 | `POST /api/auth/email-password/reset` (`apps/webapp/src/app/api/auth/email-password/reset/route.ts:38`) | Проверить reset OTP, сменить пароль и отозвать сессии. | Нет. | `AuthFlowV2.tsx:1174`. | IP confirm limit с нейтральным failure, transactional email gate, Zod → 400 (`route.ts:41-60`), OTP consume и одинаковый `invalid_code` (`:62-93`), role gate и revoke before write (`:95-120`). CAPTCHA нет — это OTP completion. |
| 14 | `POST /api/auth/email-password/setup-access` (`apps/webapp/src/app/api/auth/email-password/setup-access/route.ts:17`) | Повторно отправить password-setup OTP contact-only записи. | Нет. | `AuthFlowV2.tsx:2414`. | Email toggle, Zod → 400 (`:19-25`), per-email challenge cooldown/TTL; нет IP limit. Возвращает `not_eligible` для остальных состояний (`:28-53`), findings F4/F7. |
| 15 | `POST /api/auth/email-password/setup-code/complete` (`apps/webapp/src/app/api/auth/email-password/setup-code/complete/route.ts:38`) | Подтвердить setup OTP, записать пароль допустимой роли и войти. | **Да**, если роль password-eligible (`:106-139`). | `AuthFlowV2.tsx:1173,2196`. | IP confirm limit, email gate, Zod → 400 (`:41-60`), OTP purpose/TTL/attempt consume (`:77-103`), role gate (`:106-117`). До OTP различает account state (`:63-74`), finding F4. |
| 16 | `POST /api/auth/email/start` (`apps/webapp/src/app/api/auth/email/start/route.ts:18`) | Начать привязку/смену email уже вошедшего пользователя. | Нет. | `EmailAccountPanel.tsx:66,365`; `DoctorAccountEmailSection.tsx:68,138`. | Email toggle + текущая сессия, Zod → 400, email challenge cooldown/TTL (`route.ts:20-71`). Route IP limit отсутствует; субъект ограничен сессией. |
| 17 | `POST /api/auth/email/confirm` (`apps/webapp/src/app/api/auth/email/confirm/route.ts:26`) | Подтвердить OTP привязки email, включая merge prompt. | Нет. | `EmailAccountPanel.tsx:329`; `DoctorAccountEmailSection.tsx:93`. | IP confirm limit, email toggle, текущая сессия, Zod → 400 (`route.ts:30-72`), OTP purpose/TTL/attempt consume. Нет CAPTCHA — канонично. |
| 18 | `POST /api/auth/exchange` (`apps/webapp/src/app/api/auth/exchange/route.ts:28`) | Обменять подписанный integrator JWT/deep-link token на web-сессию. | **Да**, внутри `exchangeIntegratorToken` (`apps/webapp/src/modules/auth/service.ts:593-692`). | `miniAppSessionRecovery.ts:140`; `AuthBootstrap.tsx:729`. | Zod token → 400, channel gate (`route.ts:24-59`); HMAC token, `exp`, whitelist/existing binding (`service.ts:593-657`). Нет route rate/CAPTCHA. Канон снимает этот класс, finding F3. |
| 19 | `GET /api/auth/login/alternatives-config` (`apps/webapp/src/app/api/auth/login/alternatives-config/route.ts:10`) | Публичная проекция альтернатив входа и rollout-флага. | Нет. | Runtime caller не найден; `/app` использует server snapshot (`AppEntryRsc.tsx:72-75`). | Body отсутствует; отдаёт только public config, Telegram принудительно null (`route.ts:14-32`). Нет rate/TTL. Дублирует snapshot, D2/Q1. |
| 20 | `POST/GET /api/auth/logout` (`apps/webapp/src/app/api/auth/logout/route.ts:14,22`) | Очистить сессию и перенаправить на `/app`. | Нет; обе операции отзывают/очищают (`:14-26`). | POST: `LogoutForm.tsx:33`; GET caller не найден. | Входа/body нет, CSRF/rate limit нет. GET и POST идентичны, D3/Q3. |
| 21 | `POST /api/auth/max-init` (`apps/webapp/src/app/api/auth/max-init/route.ts:64`) | Проверить MAX Mini App `initData` и войти по binding. | **Да**, `exchangeMaxInitData` (`apps/webapp/src/modules/auth/service.ts:805-850`). | `miniAppSessionRecovery.ts:75,115`; `AuthBootstrap.tsx:501-525,696`. | Zod → 400, channel toggle (`route.ts:68-105`); provider HMAC, `auth_date` TTL 1 час и existing binding (`maxWebAppInitValidate.ts:4,93-123`; `service.ts:805-826`). Нет route rate/CAPTCHA. Канон отключает Mini App, F3. |
| 22 | `POST /api/auth/messenger/poll` (`apps/webapp/src/app/api/auth/messenger/poll/route.ts:18`) | Опросить legacy login token и однажды выдать сессию после bot-confirm. | **Да**, для `confirmed` (`:68-105`). | Runtime caller и integrator confirm-path не найдены; только port-комментарий `loginTokensPort.ts:13`. | Zod token → 400, hashed random token, row TTL/status/channel toggle и `sessionIssuedAt` (`route.ts:14-65,89-105`); нет rate/CAPTCHA. Устаревший flow; D1/U1 и дополнительный дефект в F3. |
| 23 | `POST /api/auth/messenger/start` (`apps/webapp/src/app/api/auth/messenger/start/route.ts:21`) | Создать legacy login token по телефону и Telegram deep-link. | Нет. | Runtime caller не найден. | Zod/E.164 → 400, patient channel gate, per-phone limit, random hashed token TTL 10 мин (`route.ts:14-70`). Возвращает `user_not_found` 404 (`:54-60`), а MAX deepLink всегда null (`:73-77`). Устаревший flow; D1/U1/F3. |
| 24 | `POST /api/auth/oauth/callback/apple` (`apps/webapp/src/app/api/auth/oauth/callback/apple/route.ts:34`) | Apple form-post callback: code/id_token → identity → сессия. | **Да**, через common completion (`:172-179`; `oauthWebSession.ts:54-63`). | Внешний Apple; redirect URI показан/настраивается в `AuthProvidersSection.tsx:475,526`. | Provider toggle, form content-type, signed state TTL 10 мин, code exchange, id_token signature/audience и **nonce** (`route.ts:37-65,76-134`). Мусор → redirect error. Нет route rate/CAPTCHA. |
| 25 | `GET /api/auth/oauth/callback/google` (`apps/webapp/src/app/api/auth/oauth/callback/google/route.ts:31`) | Google callback: code/userinfo → identity → сессия. | **Да**, `:124-140` → `oauthWebSession.ts:54-63`. | Внешний Google; redirect URI в `AuthProvidersSection.tsx:460`. | Signed state TTL 10 мин, toggle+credentials, code exchange и provider userinfo (`route.ts:35-102`); нет OIDC nonce, browser-binding, route rate/CAPTCHA. Плохой state → 403, прочее → redirect. Q2. |
| 26 | `GET /api/auth/oauth/callback` (`apps/webapp/src/app/api/auth/oauth/callback/route.ts:9`) | Legacy alias Yandex callback. | **Да**, общий handler (`yandexOAuthCallbackHandler.ts:189-197`). | Внешний Yandex только если в настройке остался legacy redirect; UI прямо показывает этот вариант (`AuthProvidersSection.tsx:386-388`). | Полностью тот же signed-state/config/code/userinfo handler, что canonical Yandex (`route.ts:9-11`; `yandexOAuthCallbackHandler.ts:60-114`). D6 alias; state без browser-binding/consume, Q2. |
| 27 | `GET /api/auth/oauth/callback/vk` (`apps/webapp/src/app/api/auth/oauth/callback/vk/route.ts:8`) | VK ID callback: code → contacts → identity → сессия. | **Да**, handler (`vkOAuthCallbackHandler.ts:199-207`). | Внешний VK; callback берётся из `vk_id_redirect_uri`; admin UI placeholder показывает другой путь `/vk-id` (`AuthProvidersSection.tsx:325`), finding F6. | Signed state TTL 10 мин + PKCE, provider toggle/config и code exchange (`oauthSignedState.ts:128-174`; `vkOAuthCallbackHandler.ts:75-112`). Мусор → 403/redirect. Нет route rate/CAPTCHA. Q2. |
| 28 | `GET /api/auth/oauth/callback/yandex` (`apps/webapp/src/app/api/auth/oauth/callback/yandex/route.ts:8`) | Canonical Yandex callback: code/userinfo → identity → сессия. | **Да**, handler (`yandexOAuthCallbackHandler.ts:189-197`). | Внешний Yandex; путь — константа redirect URI (`yandexOAuthConfig.ts:6`) и UI (`AuthProvidersSection.tsx:386,398`). | Signed state TTL 10 мин, surface-bound Yandex config, code exchange/userinfo (`yandexOAuthCallbackHandler.ts:64-114`); нет browser one-time binding, nonce, route rate/CAPTCHA. Плохой state → 403. Q2. |
| 29 | `GET /api/auth/oauth/providers` (`apps/webapp/src/app/api/auth/oauth/providers/route.ts:13`) | Публично вернуть effective OAuth provider flags. | Нет. | Runtime caller не найден; `/app` получает их через server snapshot (`publicAuthSnapshot.ts:13-36`). | Body нет; only enabled+configured booleans и `private, no-store` (`route.ts:16-29`). Нет rate/TTL. Дубликат D2/Q1. |
| 30 | `POST /api/auth/oauth/start` (`apps/webapp/src/app/api/auth/oauth/start/route.ts:110`) | Построить authorize URL и подписанный state для Yandex/Google/VK/Apple. | Нет. | `AuthFlowV2.tsx:527`. | IP rate, Zod provider/portal/next → 400 (`route.ts:44-50,114-139`); provider toggle+credentials; state HMAC+TTL 10 мин, Apple nonce, VK PKCE (`:151-258`). Policy берётся по Host surface, а не по переданному portal, finding F5; state stateless/replayable, Q2. |
| 31 | `GET/DELETE /api/auth/passkey/credentials` (`apps/webapp/src/app/api/auth/passkey/credentials/route.ts:28,35`) | Список и удаление собственных passkey. | Нет. | `StaffPasskeySection.tsx:35,103`; patient `PasskeySection.tsx:32,100`. | Identity-self session + passkey toggle (`route.ts:13-32`); DELETE Zod id → 400 и user-scoped delete (`:35-48`). Rate/OTP/CAPTCHA неприменимы. |
| 32 | `POST /api/auth/passkey/login/options` (`apps/webapp/src/app/api/auth/passkey/login/options/route.ts:11`) | Выдать WebAuthn authentication options/challenge. | Нет. | `AuthFlowV2.tsx:824`. | Passkey toggle + trusted-IP start limit (`route.ts:13-25`); body отсутствует; challenge TTL 5 мин, expected RP/origin (`passkeyAuth.ts:118-138`). |
| 33 | `POST /api/auth/passkey/login/verify` (`apps/webapp/src/app/api/auth/passkey/login/verify/route.ts:44`) | Проверить WebAuthn assertion и войти. | **Да**, `:82-105`; staff сразу получает `factor_verified`. | `AuthFlowV2.tsx:852`. | Toggle, IP confirm limit, strict outer Zod → 400 (`route.ts:46-64`); 5-минутный server challenge, expected challenge/origin/RPID, signature and `userVerification: required` (`passkeyAuth.ts:118-150` и далее). Нет CAPTCHA — passkey уже phishing-resistant MFA по канону `:170-200`. |
| 34 | `POST /api/auth/passkey/register/options` (`apps/webapp/src/app/api/auth/passkey/register/options/route.ts:8`) | Начать регистрацию passkey текущему пользователю. | Нет. | `StaffPasskeySection.tsx:55`; patient `PasskeySection.tsx:52`. | Identity-self session + toggle (`route.ts:8-23`); body нет; 5-минутный challenge, resident key + UV required (`passkeyAuth.ts:45-80`). Rate limit отсутствует; действие аутентифицировано. |
| 35 | `POST /api/auth/passkey/register/verify` (`apps/webapp/src/app/api/auth/passkey/register/verify/route.ts:31`) | Проверить attestation и сохранить passkey текущему пользователю. | Нет. | `StaffPasskeySection.tsx:76`; patient `PasskeySection.tsx:73`. | Identity-self session, toggle, Zod → 400 (`route.ts:31-44`); challenge связан с user, 5 мин, expected origin/RPID и UV (`passkeyAuth.ts:83-115`). Route rate отсутствует. |
| 36 | `POST /api/auth/phone/confirm` (`apps/webapp/src/app/api/auth/phone/confirm/route.ts:37`) | Подтвердить phone OTP, разрешить merge/bind и войти. | **Да**, кроме profile-bind/factor continuation (`:162-185`). | `AuthFlowV2.tsx:2773`; `PhoneMessengerAuthFlow.tsx:261,603`. | IP confirm limit, strict Zod → 400, channel gate (`route.ts:41-77`); phone OTP TTL 10 мин и consume-on-success (`phoneAuth.ts:20,248-254`), challenge attempt limits. Нет CAPTCHA — канонично. Для staff пароль не проверяется, F2. |
| 37 | `POST /api/auth/phone/messenger-bind/finish` (`apps/webapp/src/app/api/auth/phone/messenger-bind/finish/route.ts:41`) | Забрать готовый bot bind secret, сервером подтвердить OTP/merge и войти. | **Да**, login purpose (`:197-211`); profile bind не создаёт новую. | `PhoneMessengerAuthFlow.tsx:175,260`; integrator подготавливает состояние через отдельный complete endpoint. | IP confirm limit, strict Zod → 400, opaque setup token/status, channel gate and one-time consume (`route.ts:44-106`; `phoneMessengerBind.ts:237,403-428`); bind secret TTL 15 мин (`phoneMessengerBind.ts:17,102`). Нет CAPTCHA. Для staff пароль не проверяется, F2. |
| 38 | `POST /api/auth/phone/messenger-bind/start` (`apps/webapp/src/app/api/auth/phone/messenger-bind/start/route.ts:36`) | Начать login/profile phone binding через Telegram/MAX bot. | Нет. | `PhoneMessengerAuthFlow.tsx:361`; external integrator завершает flow. | Zod/E.164 → 400, patient channel gate, per-phone/user limit, profile-bind session gate (`route.ts:30-89`); opaque setup secret TTL 15 мин (`:187-193`; `phoneMessengerBind.ts:17,102`). CAPTCHA нет. |
| 39 | `POST /api/auth/phone/messenger-bind/status` (`apps/webapp/src/app/api/auth/phone/messenger-bind/status/route.ts:11`) | Poll состояния bind secret и получить OTP challenge id. | Нет. | `PhoneMessengerAuthFlow.tsx:149,430`. | Zod token → 400, high-entropy server token/status/TTL in service (`route.ts:7-40`; `phoneMessengerBind.ts:318-353`). Нет route rate/CAPTCHA/signature; bearer secret — защита доступа. |
| 40 | `POST /api/auth/phone/start` (`apps/webapp/src/app/api/auth/phone/start/route.ts:70`) | Начать phone OTP login/profile bind и выбрать delivery channel. | Нет. | `AuthFlowV2.tsx:1254,2826`; `PhoneMessengerAuthFlow.tsx:308`. | Zod/E.164 → 400, channel policy, per-contact OTP cooldown/attempt limits; публичный login всегда neutral 500 мс с synthetic challenge для неизвестного номера (`route.ts:52-125,388-419`); OTP TTL 10 мин (`phoneAuth.ts:20`). Route IP limit и CAPTCHA отсутствуют; CAPTCHA для OTP не нужна. |
| 41 | `POST /api/auth/specialist-signup/confirm` (`apps/webapp/src/app/api/auth/specialist-signup/confirm/route.ts:45`) | Подтвердить specialist signup OTP, выдать pending-enrollment doctor session и provision clinic. | **Да**, `:139-186,227-242`. | `AuthFlowV2.tsx:2077`. | IP confirm limit, email toggle, Zod → 400, rollout gate (`route.ts:48-74`); purpose-bound OTP/attempt/TTL (`:139-160`), staff profile + pending-enrollment assurance. На первом успехе session mint вызывается дважды, Q4. |
| 42 | `POST /api/auth/specialist-signup/retry` (`apps/webapp/src/app/api/auth/specialist-signup/retry/route.ts:11`) | Повторить provisioning клиники после уже подтверждённой регистрации. | Нет новой. | `StaffSecuritySection.tsx:152`. | Transactional email toggle, doctor session **и** `factor_verified` (`route.ts:13-25`); body нет; provisioning failure → 503. Rate/CAPTCHA неприменимы к уже аутентифицированному retry. |
| 43 | `POST /api/auth/specialist-signup/slug` (`apps/webapp/src/app/api/auth/specialist-signup/slug/route.ts:16`) | Нормализовать и проверить доступность clinic slug. | Нет. | `AuthFlowV2.tsx:1024`. | IP confirm limit, Zod max → 400, rollout gate (`route.ts:19-38`); directory validation → 400/409 (`:40-48`). Никакой credential не проверяет. |
| 44 | `POST /api/auth/specialist-signup/start` (`apps/webapp/src/app/api/auth/specialist-signup/start/route.ts:62`) | Создать pending doctor+clinic signup с password и отправить email OTP. | Нет. | `AuthFlowV2.tsx:1086,2264`. | Transactional email toggle, Zod/FIO/org/slug → 400, rollout gate, per-email rate before account lookup (`route.ts:64-125`); password hash + purpose-bound email OTP 30 мин (`:125-130,195-227`). CAPTCHA отсутствует: пароль здесь выбирается, а не угадывается. |
| 45 | `POST /api/auth/telegram-init` (`apps/webapp/src/app/api/auth/telegram-init/route.ts:28`) | Проверить Telegram Mini App `initData` и войти по binding. | **Да**, `exchangeTelegramInitData` (`apps/webapp/src/modules/auth/service.ts:704-754`). | `miniAppSessionRecovery.ts:56,94`; `AuthBootstrap.tsx:501-525,675`. | Zod → 400, channel toggle (`route.ts:31-66`); Telegram HMAC/auth_date TTL 1 час + whitelist/existing binding (`service.ts:504-556,704-729`). Нет route rate/CAPTCHA. Raw initData log только diagnostics DEV/TEST (`miniappAuthVerboseServerLog.ts:3-7`). Канон отключает Mini App, F3. |
| 46 | `GET /api/auth/telegram-login/config` (`apps/webapp/src/app/api/auth/telegram-login/config/route.ts:10`) | Вернуть публичное имя Telegram bot для widget/contact gate. | Нет. | `patientMessengerContactGate.ts:68`. | Body нет; channel toggle + configured username, без секрета (`route.ts:13-16`). Нет rate/TTL. |
| 47 | `POST /api/auth/telegram-login` (`apps/webapp/src/app/api/auth/telegram-login/route.ts:16`) | Telegram Login Widget callback → binding → сессия. | **Да**, `exchangeTelegramLoginWidget` (`apps/webapp/src/modules/auth/service.ts:869-933`). | Только `TelegramLoginButton.tsx:120`; сам компонент нигде не импортирован, что прямо зафиксировано каноном (`AUTH_AND_IDENTITY_CANON.md:105-113`). | Широкая Zod-record → 400 только для не-object, channel toggle и bot config (`route.ts:11-30`); HMAC, `auth_date` ≤1 ч (+60 с future skew), whitelist/existing binding (`telegramLoginVerify.ts:3-65`; `service.ts:875-908`). Нет rate/CAPTCHA. Оставлен на будущее по канону, не «лишнее». |

## ЛИШНЕЕ

### U1. Доказанно незваная legacy-пара messenger login

По доступному репозиторию ни UI, ни server code, ни integrator не вызывают и не завершают:

1. `POST /api/auth/messenger/start`;
2. `POST /api/auth/messenger/poll`;

Два config adapters — `GET /api/auth/login/alternatives-config` и `GET /api/auth/oauth/providers` — также не
имеют runtime caller, но активная документация объявляет их public contract. Из-за неизвестных external/native
clients они не названы доказанно лишними и вынесены в Q1.

Доказательство пустого результата:

- точные URL:
  `for url in '/api/auth/messenger/start' '/api/auth/messenger/poll' '/api/auth/login/alternatives-config' '/api/auth/oauth/providers'; do rg -n -F "$url" apps packages docs --glob '!apps/webapp/src/app/api/auth/**' --glob '!**/*.test.*' --glob '!**/*.spec.*'; done` — только docs/port/back-reference, ни одного runtime fetch/server caller;
- фрагменты пути проверены тем же exact-поиском по `messenger/start`, `messenger/poll`,
  `login/alternatives-config`, `oauth/providers`;
- имена ожидаемых клиентов:
  `rg -n "startMessengerLogin|messengerStart|pollMessengerLogin|messengerPoll|fetchLoginAlternatives|getLoginAlternativesPublicConfig|fetchOauthProviders|getOAuthProviders" apps packages docs --glob '!apps/webapp/src/app/api/auth/**' --glob '!**/*.test.*' --glob '!**/*.spec.*'` — только server helper `getLoginAlternativesPublicConfig`, не HTTP-клиент;
- code-search:
  `node /home/dev/brain/tools/code-search.mjs "caller fetch /api/auth/<path>" --repo bcb -k 8` для каждого из четырёх проверенных путей — кандидаты для messenger ведут на новый `phone/messenger-bind` flow, config-кандидаты — на `publicAuthSnapshot`, прямого caller нет;
- back-reference registry:
  `rg -n "messenger/(start|poll)|login/alternatives-config|oauth/providers" apps/webapp/src/modules/auth/auth.md docs/ARCHITECTURE docs/_TODO --glob '*.md'` — старые messenger docs и declarative route lists; для двух config routes активный `auth.md:126` прямо говорит, что `/app` получает тот же снимок сервером.

`messenger/start` + `messenger/poll` не просто незваны: их класс прямо отменён каноном
(`AUTH_AND_IDENTITY_CANON.md:88-100`). Для двух config routes доказано только отсутствие **внутреннего**, а не
любого возможного внешнего consumer.

`GET /api/auth/logout` также не имеет caller, но файл имеет живой POST caller и потому вынесен в дубли/Q3, а не
назван отдельной лишней route-группой. `POST /api/auth/telegram-login` не достигается из UI, но канон прямо
требует сохранить его на будущее (`AUTH_AND_IDENTITY_CANON.md:105-113`). `dev-public` вызывается человеком по
DEV-runbook, поэтому не лишний.

## ДУБЛИ

### D1. Legacy messenger login против `phone/messenger-bind`

`messenger/start` + `messenger/poll` выполняют старый сценарий «телефон → bot deep-link → polling → session»
(`messenger/start/route.ts:54-83`; `messenger/poll/route.ts:68-105`). Новый живой сценарий делает то же через
`phone/messenger-bind/{start,status,finish}` с opaque bind secret, канонической привязкой контакта, merge и OTP
(`phone/messenger-bind/start/route.ts:92-193`; `finish/route.ts:74-206`). Старый путь расходится хуже: сначала
раскрывает существование телефона, не имеет живого caller/confirm producer и ставит session напрямую.

### D2. Три проекции одного public auth config

`login/alternatives-config`, `oauth/providers` и частично `telegram-login/config` возвращают срез того, что уже
собирает `buildPrefetchedPublicAuthConfig`; сам модуль это признаёт (`publicAuthSnapshot.ts:1-4`), а `AppEntryRsc`
передаёт снимок UI напрямую (`AppEntryRsc.tsx:72-75`). Первые две HTTP-проекции не имеют caller;
`telegram-login/config` остаётся нужен отдельному authenticated contact gate (`patientMessengerContactGate.ts:68`).

### D3. Logout GET и POST

Обе операции вызывают один `clearSession` и один redirect (`logout/route.ts:14-26`); POST вызывается формой,
GET не вызывается. Расхождение только в небезопасной для state-change HTTP-семантике GET — Q3.

### D4. Две пациентские email-регистрации, одна уже всегда запрещена

`email-otp/register` — действующий канонический patient flow (`email-otp/register/route.ts:50-114`).
`email-password/register` пытается начать тот же patient signup с паролем, но теперь всегда отвечает 403 до body
(`email-password/register/route.ts:85-99`), а её confirm и UI resend-ветки сохранены
(`email-password/register/confirm/route.ts:38-53`; `AuthFlowV2.tsx:2396-2429`). Это не второй работающий способ,
а stranded duplicate после запрета patient password (`AUTH_AND_IDENTITY_CANON.md:212-227`).

### D5. Две двери запускают один password-setup challenge

`email-password/forgot` при `needs_email_setup` и `email-password/setup-access` обе создают purpose
`password_setup` (`forgot/route.ts:78-94`; `setup-access/route.ts:28-53`). Они расходятся в contract:
`forgot` обычно обещает нейтральный ответ, но здесь выдаёт `setupRequired`; `setup-access` открыто отвечает
`not_eligible` и, в отличие от `forgot`, проверяет email toggle. Это источник findings F4/F7.

### D6. Два URL одного Yandex callback

`/oauth/callback` и `/oauth/callback/yandex` буквально вызывают один handler
(`oauth/callback/route.ts:5-11`; `oauth/callback/yandex/route.ts:5-10`). Legacy alias ещё показан в admin UI как
допустимая настройка (`AuthProvidersSection.tsx:386-388`), поэтому без проверки фактического redirect URI назвать
его удаляемым нельзя.

## СДЕЛАНО ПЛОХО

### CRITICAL — F1. Global admin по-прежнему входит простым email OTP в обход 2FA

`email-otp/confirm` после OTP повышает роль по owner-email policy и сразу зовёт `setSessionFromUser`, не вызывая
staff-security (`email-otp/confirm/route.ts:116-142`). Достижимый эффект: владелец почтового ящика получает
admin-session без пароля и без включённого TOTP. Это уже дословно зарегистрированная каноном дыра:
`AUTH_AND_IDENTITY_CANON.md:202-210,1053-1058`; нарушено правило «глобальный админ — почта+пароль, 2FA по
админской политике» (`:49-53`) и «резерв — только passkey/2FA, никогда email code» (`:181-186`).

### HIGH — F2. Phone/bot двери не ограничивают найденную учётку ролью `client`

`phone/confirm` и `phone/messenger-bind/finish` объявляют patient channel, но после поиска аккаунта не требуют
`role === client`; они передают любую роль в `prepareVerifiedPrimaryLogin` и затем ставят session
(`phone/confirm/route.ts:170-179`; `phone/messenger-bind/finish/route.ts:197-206`). Helper для staff без лично
enrolled TOTP возвращает session options без требования пароля (`verifiedStaffPrimaryLogin.ts:31-67`). Legacy
`messenger/poll`, Telegram/MAX init и Telegram Login Widget ещё слабее — сохраняют найденную роль напрямую
(`messenger/poll/route.ts:68-105`; `service.ts:704-754,805-850,869-933`).

На shared-host контуре это даёт doctor/admin session после patient OTP/bot proof; при разнесённых production-host
часть случаев дополнительно режет общий surface-role gate (`service.ts:1161-1169`), но это не проверка состава
факторов и не действует на shared-host. Нарушены наборы дверей и правило слабейшего способа
(`AUTH_AND_IDENTITY_CANON.md:46-53,181-186`). Passkey не входит в finding: канон отдельно принимает его как
полноценный multifactor (`:170-200`).

### HIGH — F3. Канонически снятые token-exchange и Mini App входы всё ещё вызываются и выдают сессии

Канон требует убрать deep-link JWT exchange как класс и временно отключить Mini App целиком
(`AUTH_AND_IDENTITY_CANON.md:84-103`). Но `AuthBootstrap`/recovery продолжают вызывать:
`exchange` (`AuthBootstrap.tsx:729`, `miniAppSessionRecovery.ts:140`), `telegram-init`
(`AuthBootstrap.tsx:675`, `miniAppSessionRecovery.ts:56,94`) и `max-init`
(`AuthBootstrap.tsx:696`, `miniAppSessionRecovery.ts:75,115`). Все три реально mint session
(`service.ts:686-692,704-754,805-850`). Это не мёртвый остаток: на включённом channel toggle подписанный token
или provider initData по существующему binding заканчивается авторизованной сессией, прямо вопреки строке канона.

Тот же legacy `messenger/start` раскрывает `user_not_found` (`messenger/start/route.ts:54-60`) и его poll способен
mint session, но внутренних caller/producer уже нет. Внутри poll дополнительно вычисляется безопасный
`effectiveRole`, а затем при расхождении в БД и session всё равно записывается сырой `envRole`
(`messenger/poll/route.ts:79-104`), что демотирует staff до `client`; из-за отсутствия producer это latent defect,
а не отдельный достижимый finding. Основной impact этой пары — лишний опасный код D1/U1.

### HIGH — F4. Password setup различает состояние аккаунта до проверки кода

`forgot` только для `needs_email_setup` возвращает `setupRequired:true` и настоящий `challengeId`, тогда как
неизвестный/обычный адрес получает нейтральное тело (`email-password/forgot/route.ts:15-19,78-97`).
`setup-access` отвечает `not_eligible` для остальных состояний (`setup-access/route.ts:28-33`), а
`setup-code/complete` разделяет `already_has_login`/`not_eligible` ещё до consume OTP
(`setup-code/complete/route.ts:63-88`). Достижимый эффект: неаутентифицированный клиент перечисляет contact-only,
password и unknown account states по status/body. Нарушено прямое требование password door: существующий и
несуществующий адрес не различаются ни текстом, ни кодом ответа (`AUTH_AND_IDENTITY_CANON.md:814-816`).

### MEDIUM — F5. `oauth/start` проверяет Host surface, а не явно указанную дверь

`oauth/start` получает `roleLoginPortal` (`apps/webapp/src/app/api/auth/oauth/start/route.ts:46-50,141-148`),
но не переводит его в policy name: Yandex берёт `getResolvedSurface()` (`:151-166`), остальные провайдеры зовут
`isOAuthProviderEnabled(provider)` без explicit surface (`:177-258`). Эта функция при отсутствии аргумента
использует Host-derived surface (`apps/webapp/src/modules/auth/authChannelPolicy.ts:20-38,109-117`). В то же время
страница правильно передаёт explicit portal policy в snapshot именно потому, что на общем DEV/TEST Host все
двери иначе схлопываются в staff (`apps/webapp/src/app/app/AppEntryRsc.tsx:65-75,100-109`).

Достижимый эффект на действующем shared-host DEV/TEST: UI показывает метод по policy одной двери, а start
разрешает/запрещает его по policy другой; включённый способ отвечает `oauth_disabled` либо выключенный можно
вызвать напрямую. Нарушены независимые наборы трёх дверей (`AUTH_AND_IDENTITY_CANON.md:46-53`) и требование, что
экран динамически отражает именно управляемый набор способов (`:282-297`). На разнесённом production Host этот
конкретный mismatch скрывается правильным Host surface; production не проверялся.

### MEDIUM — F6. Admin UI подсказывает несуществующий VK callback URL

Реальный route — `/api/auth/oauth/callback/vk`
(`apps/webapp/src/app/api/auth/oauth/callback/vk/route.ts:5-10`), а placeholder поля `vk_id_redirect_uri` —
`https://example.com/api/auth/oauth/callback/vk-id`
(`apps/webapp/src/app/app/settings/AuthProvidersSection.tsx:319-326`). Достижимый эффект: администратор следует
подсказке, регистрирует `/vk-id` у провайдера и callback получает 404 вместо входа. Нарушено каноническое решение
довести VK ID до рабочего состояния и вносить его ключи/настройки через `/app/admin/auth`
(`AUTH_AND_IDENTITY_CANON.md:239-253`).

### MEDIUM — F7. Contact-only пациенту предлагают password setup, который completion обязан отклонить

`forgot` и `setup-access` отправляют `password_setup` challenge contact-only записи
(`forgot/route.ts:78-92`; `setup-access/route.ts:28-53`), UI затем ведёт в `setup-code/complete`
(`AuthFlowV2.tsx:2195-2208`), но completion после успешного OTP отвергает роль `client`
(`setup-code/complete/route.ts:106-117`). Человек получает код и форму установки пароля, но завершить путь не
может. Канон уже фиксирует именно этот разрыв: оставшиеся producers создают пациента, пароль ему запрещён, письмо
всё ещё уходит и не должно обещать установку пароля (`AUTH_AND_IDENTITY_CANON.md:124-146`).

## ВОПРОСЫ ВЛАДЕЛЬЦУ

### Q1. Можно ли удалить два незваных config HTTP adapters?

**ВОПРОС ВЛАДЕЛЬЦУ — строки канона нет.** Внутренних callers у `login/alternatives-config` и
`oauth/providers` нет; `/app` использует `publicAuthSnapshot`. Но оба пути перечислены активным `auth.md` как
public contract (`apps/webapp/src/modules/auth/auth.md:91,126,242`). Неизвестно, поддерживаются ли native/external
клиенты. Нужен выбор: compatibility contract или удалить adapters. Messenger pair такого решения не ждёт: его
класс уже отменён каноном.

### Q2. Должен ли OAuth state быть привязан к начавшему браузеру и одноразово consumed?

**ВОПРОС ВЛАДЕЛЬЦУ — строки канона нет.** State содержит случайный id, HMAC и срок 10 минут, но хранится stateless
«без cookie» (`oauthSignedState.ts:54-71`) и verifier проверяет только purpose/expiry/HMAC
(`:188-237`); один state можно предъявить повторно до expiry и он не связан с браузером. Apple дополнительно
проверяет nonce в id_token (`oauth/callback/apple/route.ts:125-134`), VK — PKCE
(`oauthSignedState.ts:128-174`), Google/Yandex — нет. Это потенциальный login-CSRF/session-substitution класс,
но канон не задаёт browser-binding/one-time правило, поэтому это не finding.

### Q3. Нужен ли state-changing `GET /api/auth/logout`?

**ВОПРОС ВЛАДЕЛЬЦУ — строки канона нет.** Caller есть только у POST (`LogoutForm.tsx:33`), а GET делает ту же
мутацию (`logout/route.ts:14-26`). Cross-site top-level GET может принудительно разлогинить пользователя; это
доступность, не захват аккаунта. Канон не определяет поддержку logout bookmark/GET, поэтому удаление не
предписывается.

### Q4. Должен ли первый specialist signup создавать session дважды?

**ВОПРОС ВЛАДЕЛЬЦУ — строки канона нет.** При обычном первом confirm маршрут после OTP вызывает
`setSessionFromUser` (`apps/webapp/src/app/api/auth/specialist-signup/confirm/route.ts:139-186`), затем после
успешного provisioning с тем же role/assurance вызывает его снова (`:227-242`). Каждый вызов ставит новый cookie,
пишет login event и запускает new-device логику (`apps/webapp/src/modules/auth/service.ts:238-321`). Это выглядит
как две записи истории на одно действие, но канон не говорит, должна ли pre-provision session сознательно
заменяться post-provision session; поэтому без решения это не finding.
