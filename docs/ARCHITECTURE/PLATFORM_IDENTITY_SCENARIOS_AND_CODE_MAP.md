# Сценарии и привязка к коду BersonCareBot

Детализация для реализации и ревью. Пути к файлам — от корня репозитория.

---

## 1. Данные и канон (webapp DB)

| Артефакт                                                  | Где в проекте                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Таблица `platform_users`, `user_channel_bindings`         | Миграции `apps/webapp/migrations/` (например `006_platform_users.sql` и последующие)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Резолв канона по `merged_into_id`                         | `apps/webapp/src/infra/repos/pgCanonicalPlatformUser.ts` (`resolveCanonicalUserId`, `followMergedIntoChain`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Загрузка `SessionUser` с телефоном и bindings             | `apps/webapp/src/infra/repos/pgUserByPhone.ts` (`findByUserId`, `createOrBind`, `loadSessionUser`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Слияние двух клиентов                                     | `apps/webapp/src/infra/repos/pgPlatformUserMerge.ts` (`mergePlatformUsersInTransaction`, `pickMergeTargetId`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Admin: справочный поиск по ФИО и расширенный ручной merge | `GET /api/doctor/clients/name-match-hints`, `GET /api/doctor/clients/merge-user-search`; UI `/app/doctor/clients/name-match-hints` (ссылки с `scope=all`), `AdminMergeAccountsPanel.tsx` внутри аккордеона карточки (`ClientProfileCard`), ленивые запросы кандидатов/preview при открытой секции, отмена гонок `merge-preview`, ошибки поиска отдельно от пустого списка; `POST /api/doctor/clients/integrator-merge` и сброс фантомного `integrator_user_id` у дубликата — см. `ARCHITECTURE/PLATFORM_USER_MERGE.md`; инфра `platformUserNameMatchHints.ts`, `searchMergeUsersForManualMerge` в `platformUserMergePreview.ts` |

**Инвариант:** после merge все чтения и записи от имени пользователя должны использовать **канонический** id (через `resolveCanonicalUserId` / `findByUserId`).

---

## 2. Сессия и cookie

| Что                                                          | Где                                                                                                                                                                    |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cookie session, decode/encode, TTL                           | `apps/webapp/src/modules/auth/service.ts` (`SESSION_COOKIE_NAME`, `getCurrentSession`, `setSessionFromUser`, `exchangeIntegratorToken`, `exchangeTelegramInitData`, …) |
| Подтягивание пользователя из БД для UUID                     | `resolveSessionUserAgainstDb` в том же файле → `pgUserByPhonePort.findByUserId`                                                                                        |
| Типы `SessionUser`, `AppSession`                             | `apps/webapp/src/shared/types/session.ts`                                                                                                                              |
| Текущий пользователь для `/api/me`                           | `apps/webapp/src/app/api/me/route.ts` + `apps/webapp/src/modules/users/service.ts` (`getCurrentUser`)                                                                  |
| **`platformAccess` (tier из БД по канону)** в JSON `/api/me` | Тот же `route.ts` → `resolvePlatformAccessContext` (`apps/webapp/src/modules/platform-access/`); при отсутствии `DATABASE_URL` или ошибке БД поле `null`               |

**Цель инициативы:** при **записи** сессии после логина в cookie должен попадать **канонический** `userId`, когда он уже известен; tier при каждом запросе — из БД по канону, а не «только из cookie».

**Фаза C (сессия):** нормативный текст и решение по `tg:…` / не-UUID — `sessionCanonicalUserIdPolicy.ts` (onboarding-only compatibility); запись cookie только в route handlers / server actions (`exchange*`, `setSessionFromUser`, `phone/confirm`, OAuth callback).

**Runbook (эксплуатация, не замена архитектуры C):** при жалобах «в onboarding, хотя телефон был» — сверить канон в webapp-БД (`phone_normalized`, `patient_phone_trust_at`), цепочку merge и формат `userId` в cookie (UUID vs legacy `tg:`/`max:`). Legacy-транспорт в cookie не является ключом канона; политика — `sessionCanonicalUserIdPolicy.ts` + `resolvePlatformAccessContext` (`legacy_non_uuid_session` → tier onboarding для `client`). Порядок расследования: свежий вход через штатный exchange vs устаревшая сессия; при необходимости повторный bind/OTP по продуктовому потоку.

**Ограничение Next.js:** обновление cookie не из произвольного Server Component — см. комментарии в `getCurrentSession` про роль; та же дисциплина для любых полей snapshot.

---

## 3. Вход по каналам (мессенджер)

| Шаг                                           | Где                                                                                                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Создание/поиск пользователя по binding канала | `apps/webapp/src/infra/repos/pgIdentityResolution.ts` (`findOrCreateByChannelBinding`, `findByChannelBinding`)                                                               |
| Вызов при exchange токена / initData          | `apps/webapp/src/modules/auth/service.ts` (`exchangeIntegratorToken`, `exchangeTelegramInitData`, `exchangeTelegramLoginWidget`) через inject `IdentityResolutionPort` из DI |
| Сборка deps                                   | `apps/webapp/src/app-layer/di/buildAppDeps.ts`                                                                                                                               |

**Канон URL Mini App (webapp, с 2026-05):** точки входа **`/app/tg`** (Telegram) и **`/app/max`** (MAX) — общий RSC `apps/webapp/src/app/app/AppEntryRsc.tsx`; integrator собирает подписанный `?t=` в `apps/integrator/src/integrations/webappEntryToken.ts` (`buildWebappEntryUrlFromSource`). Legacy `?ctx=bot|max` на `/app` обрабатывает `apps/webapp/src/middleware/platformContext.ts` (`handlePlatformContextRequest`; при `ctx=max` на `/app` — редирект на `/app/max`). Заголовок `x-bc-entry-hint` в `apps/webapp/src/proxy.ts` задаёт `classifyEntryHintFromRequest` (pathname `/app/tg` | `/app/max` → miniapp-hint до эвристики `token_exchange`).

**Сценарий «первый заход в Telegram/Max» (фаза B — закрыта):**

1. Нет строки в `user_channel_bindings` для `(channel_code, external_id)` → **до** `INSERT` в `platform_users` собираются кандидаты из **`resolutionHints`** из **подписанного** webapp-entry токена: (а) query `?t=` при `exchangeIntegratorToken`; (б) Mini App — то же значение в **`start_param`** внутри `initData` (после проверки подписи Telegram на сервере); (в) веб Login Widget — опциональное поле **`webappEntryToken`** в JSON POST `/api/auth/telegram-login`, если на странице входа в URL есть `?t=` (клиент подмешивает токен в тело запроса; поле **не** входит в hash виджета). Подсказки: UUID в `sub`, `integratorUserId`, телефон из токена **только** при совпадении с каноном с **`patient_phone_trust_at`** (`pgIdentityResolution.ts`, `findTrustedCanonicalUserIdByPhone`). Сырой client-controlled UUID в `start_param` **без** HMAC **не** принимается.
2. **Компактный токен без `bindings`:** если в signed payload только `sub` вида **`tg:<id>`** или **`max:<id>`**, messenger binding берётся из `sub` (`effectiveMessengerBinding` в `service.ts`).
3. **Интегратор → токен:** при сборке ссылок из webhook Telegram/MAX в токен подмешивается **`integratorUserId`**, если identity уже есть в БД интегратора (`getLinkDataByIdentity` в `apps/integrator/src/app/routes.ts`).
4. Если кандидатов нет → новая строка `platform_users` (без телефона) + binding — **технический якорь** ([`PLATFORM_IDENTITY_SPECIFICATION.md`](PLATFORM_IDENTITY_SPECIFICATION.md) §7).
5. Tier: **`client` без доверенного телефона** → **onboarding**, не patient.

**Статус и границы фазы B** — [§10](#10-фаза-b--статус-закрыта).

---

## 4. Привязка телефона (OTP)

| Шаг                                                    | Где                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Старт OTP, `ChannelContext` (web / telegram + chatId)  | `apps/webapp/src/app/api/auth/phone/start/route.ts`, `apps/webapp/src/modules/auth/phoneAuth.ts` (`startPhoneAuth`)                                                                                                                      |
| Подтверждение кода                                     | `apps/webapp/src/app/api/auth/phone/confirm/route.ts` → `confirmPhoneAuth` → `pgUserByPhonePort.createOrBind`                                                                                                                            |
| Merge при конфликте binding и пользователя по телефону | `createOrBind` в `pgUserByPhone.ts` → `mergePlatformUsersInTransaction(..., "phone_bind")`                                                                                                                                               |
| Привязка телефона из integrator / signed HTTP bind     | `@bersoncare/platform-merge` **`applyMessengerPhonePublicBind`** → тот же полный merge зависимостей, затем `integrator.contacts` (`channelUsers.setUserPhone`, очистка чужих `contacts` по тому же нормализованному номеру перед INSERT) |

**Сценарий «второй мессенджер, тот же номер»:** вставка binding для канона, найденного по телефону, конфликтует с binding другого `user_id` → ветка merge `phone_bind` в `createOrBind`.

**Сценарий «канон с телефоном из интегратора, новый канал без binding»:** до доверенной привязки пользователь не считается patient для полного UI; безопасный путь — OTP → `createOrBind` → при необходимости merge ([`PLATFORM_IDENTITY_SPECIFICATION.md`](PLATFORM_IDENTITY_SPECIFICATION.md) §10).

---

## 5. OAuth (веб)

| Шаг                                      | Где                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Callback Yandex                          | `apps/webapp/src/app/api/auth/oauth/callback/yandex/route.ts` (legacy: `callback/route.ts`) |
| Редирект на bind-phone если нет телефона | тот же файл после `setSessionFromUser`                                                      |
| Резолв пользователя OAuth                | `apps/webapp/src/modules/auth/oauthYandexResolve.ts` и порты в callback                     |

**Сценарий:** провайдер не отдал телефон → сессия с каноном, tier **onboarding** → обязательный bind-phone (или эквивалент) до **patient**.

---

## 6. Интегратор (webhook → БД)

| Событие / действие                                            | Где                                                                                                                                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Обработка типов событий                                       | `apps/webapp/src/modules/integrator/events.ts`                                                                                                                                    |
| `user.upserted`, `contact.linked` → канон + телефон + binding | `pgUserProjectionPort.upsertFromProjection` (телефон и `patient_phone_trust_at` внутри upsert; отдельный `updatePhone` после `contact.linked` **не** вызывается)                  |
| Rubitime / запись → ensure клиента по телефону                | `ensureClientFromAppointmentProjection` в `apps/webapp/src/infra/repos/pgUserProjection.ts`, вызов из `events.ts` (appointment.record.upserted)                                   |
| Сборка `users` deps для событий                               | `buildAppDeps`; в `apps/webapp/src/app/api/integrator/events/route.ts` дополнительно `resolveCanonicalPlatformUserId` → цепочка merge для **diary.\*** событий с `payload.userId` |

**Сценарий «Rubitime создал клиента с телефоном»:** в БД появляется/обогащается канон с `phone_normalized`; при первом входе в мессенджер цель — **привязать** канал к этому канону доверенным путём, а не создавать второго клиента (фаза B плана).

---

## 7. Политика доступа (целевое состояние)

**Жёсткое правило:** **route policy** и **API policy** опираются на **один и тот же** access context из модуля tier ([`MASTER_PLAN.md`](MASTER_PLAN.md) §2). Недопустимо: «страницы через tier, API через старые точечные проверки `phone`».

| Область                                                    | Текущее состояние (ориентир)                                                                                                                                                                                                                                                                                                                                             | Цель инициативы                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Страницы `/app/patient/*`                                  | Guards из `requireRole` + **единый модуль** `patientRouteApiPolicy.ts` (`patientPathRequiresBoundPhone`, `patientPageMinAccessTier`, `resolvePatientLayoutPathname`); layout при `DATABASE_URL` — `patientClientBusinessGate` + заголовки `x-bc-pathname` / `x-bc-search`; RSC с чтением персональных данных из БД — **`patientRscPersonalDataGate`** (`requireRole.ts`) | Один модуль **route & API policy** (фаза D — закрыта) + access context + согласованный RSC-gate |
| API `/api/patient/*`, **`/api/booking/*`**, server actions | **`requirePatientApiBusinessAccess`** / **`requirePatientAccessWithPhone`**; перечень patient-business API — **`patientApiPathIsPatientBusinessSurface`**; общий **`patientClientBusinessGate`**                                                                                                                                                                         | Совпадает с политикой страниц (whitelist навигации vs бизнес-gate)                              |
| Список публичных / onboarding маршрутов                    | `patientRouteApiPolicy.ts` (префиксы без tier patient + `patientPageMinAccessTier`)                                                                                                                                                                                                                                                                                      | Тесты `patientRouteApiPolicy.test.ts`                                                           |

Конкретные пути страниц — под префиксом `apps/webapp/src/app/app/patient/` (маршрут URL `/app/patient/...`). API — не только `/api/patient/*`: любой эндпоинт, выполняющий **бизнес-действие** от имени пациента (в т.ч. запись на приём), должен проходить ту же проверку tier.

**RSC и чтение БД:** страницы с `getOptionalPatientSession`, которые загружают **персональные** данные по `userId`, вызывают **`patientRscPersonalDataGate`** в `apps/webapp/src/app-layer/guards/requireRole.ts` — внутри тот же **`patientClientBusinessGate`**, что у `requirePatientApiBusinessAccess`; при `need_activation` — guest-заглушки; при `stale_session` — редирект на `/app?next=`. Snapshot телефона в cookie (`patientSessionSnapshotHasPhone`, в т.ч. через `patientHasPhoneOrMessenger` в UI) **не** заменяет этот gate для запросов в БД. **Пример:** `/app/patient/sections/warmups` — `listRulesByUser` и виджет `SectionWarmupsReminderBar` только после gate → **`allow`** (каталог карточек раздела остаётся доступен при `guest`). Регрессия: **`page.warmupsGate.test.tsx`** (guest не вызывает `listRulesByUser`; allow — вызывает).

**Фаза C.02 ([`MASTER_PLAN.md`](MASTER_PLAN.md) §5):** выравнивание до фазы D: **`patientClientBusinessGate`**; booking и `/api/patient/*` на **`requirePatientApiBusinessAccess`**; **`resolvePatientLayoutPathname`** + whitelist перенесены в **`patientRouteApiPolicy.ts`** (фаза D); RSC intake LFK/nutrition — `requirePatientAccessWithPhone` вровень с `online-intake` API; негативные тесты 403 для booking.

**Onboarding на сервере:** запрет бизнес-операций дублируется в **handlers/actions**; whitelist активации серверный ([`PLATFORM_IDENTITY_SPECIFICATION.md`](PLATFORM_IDENTITY_SPECIFICATION.md) §4).

---

## 8. Trusted sources (фаза A — зафиксировано в коде)

**Жёстко:** **не** любое место в коде, которое делает `UPDATE platform_users … phone_normalized`, автоматически считается **trusted source** для tier **patient**. На чтении tier опирается на колонку **`platform_users.patient_phone_trust_at`** (см. миграцию `apps/webapp/migrations/068_platform_users_patient_phone_trust.sql`): при непустом `phone_normalized` tier **patient** только если `patient_phone_trust_at IS NOT NULL`. Миграция **backfill** для уже существующих строк с телефоном выставляет метку времени (legacy, [`PLATFORM_IDENTITY_SPECIFICATION.md`](PLATFORM_IDENTITY_SPECIFICATION.md) §12).

**Закрытый перечень в коде:** enum `TrustedPatientPhoneSource` в `apps/webapp/src/modules/platform-access/trustedPhonePolicy.ts` (расширять только через PR в политику + соответствующий writer в БД). Якорные вызовы `trustedPatientPhoneWriteAnchor(…)` стоят в перечисленных writers (grep по репозиторию) — на tier в рантайме не влияют, связывают код с enum для ревью.

**Read-side ([`PLATFORM_IDENTITY_SPECIFICATION.md`](PLATFORM_IDENTITY_SPECIFICATION.md) §5):** функция **`isTrustedPatientPhoneActivation`** в том же `trustedPhonePolicy.ts` — единственная точка решения «телефон на каноне засчитан для tier patient»; **`resolvePlatformAccessContext`** вызывает её при вычислении `phoneTrustedForPatient` / `tier` для `client`.

**Mini App (клиент):** `apps/webapp/src/shared/lib/patientMessengerContactGate.ts` — если в ответе `/api/me` есть `platformAccess`, «номер есть» для снятия гейта контакта трактуется как **`tier === "patient"`**, а не только наличие `user.phone` (телефон в snapshot без доверия → onboarding).

**Гейт контакта — два слоя:** основной контроль в **integrator** — **прод:** `processAcceptedIncomingEvent` → **`buildPlan`** по `scripts.json` + центральный план для **`callback.received`** без `linkedPhone` в [`resolver.ts`](../../apps/integrator/src/kernel/orchestrator/resolver.ts) (до матчинга сценариев). Для **`message.received`** тот же запрос контакта строится в `buildLinkedPhoneMessageMenuGatePlan`: в Telegram `input.action` обычно уже задан в [`webhook.ts`](../../apps/integrator/src/integrations/telegram/webhook.ts) через `normalizeTelegramMessageAction` (словарь подписей ввода и **прежних** клавиатур: «Запись»/«Дневник»/«Меню»/«Приложение»/…); если `action` пуст, текст дополнительно разбирается через [`telegramReplyTextToMenuAction`](../../apps/integrator/src/integrations/telegram/mapIn.ts) только для подписей **текущей reply-клавиатуры**, попадающих в `TELEGRAM_REPLY_MENU_ACTIONS` (сейчас — **две** кнопки «Запись» + «Приложение»; см. `replyMenu.json`, план [`.cursor/plans/archive/telegram_menu_reply_admin.plan.md`](../../.cursor/plans/archive/telegram_menu_reply_admin.plan.md)). Сравнение с гейтом — с **`MESSAGE_MENU_ACTIONS_NEED_PHONE`** в том же [`resolver.ts`](../../apps/integrator/src/kernel/orchestrator/resolver.ts): `booking.open`, `menu.more`, `cabinet.open`, `diary.open` (ручной ввод и старые клавиатуры сохранены). Deep link из `/start` с `action` из [`MESSENGER_START_SPECIAL_ACTIONS`](../../apps/integrator/src/kernel/orchestrator/messengerStartConstants.ts) этим message-гейтом не режется (список синхронизирован с `excludeActions` в `scripts.json` и с исключениями дедупа `/start` в [`incomingEventPipeline.ts`](../../apps/integrator/src/kernel/eventGateway/incomingEventPipeline.ts)). Семантика `requestPhoneLink` / клавиатура `request_contact` совпадает с [`requestContactFlow.ts`](../../apps/integrator/src/kernel/domain/usecases/requestContactFlow.ts). [`handleUpdate`](../../apps/integrator/src/kernel/domain/usecases/handleUpdate.ts) / [`handleMessage`](../../apps/integrator/src/kernel/domain/usecases/handleMessage.ts) — **не** webhook-путь (тесты/наследие); там же разведены исходы `setUserPhone`: конфликт номера vs ошибка сохранения (`phoneLinkUserMessages.ts`). Без привязки номера в канале пользователь не получает полноценное меню/WebApp в чате (**включая** `/start <внешний_id>` без номера — в запрос контакта). **Привязка в сценариях:** `user.phone.link` в [`executeAction.ts`](../../apps/integrator/src/kernel/domain/executor/executeAction.ts) опирается на метаданные `writeDb`: при отсутствии `userPhoneLinkApplied` или флаге `phoneLinkIndeterminate` пользователю показывается нейтральная ошибка, а не текст про «другой аккаунт». **Executor:** автоподмешивание reply-меню с WebApp при `sendMenuOnButtonPress` — только при `ctx.base.linkedPhone === true` ([`delivery.ts`](../../apps/integrator/src/kernel/domain/executor/handlers/delivery.ts), см. [`INTEGRATOR_CONTRACT.md`](../../apps/webapp/INTEGRATOR_CONTRACT.md) Flow 6b). **Ограничение:** мутация `user.state.set` в [`writePort.ts`](../../apps/integrator/src/infra/db/writePort.ts) для записи состояния в БД по-прежнему только для `resource === 'telegram'` (Max обрабатывается отдельными ветками сценариев). **Регрессия контента:** [`userScriptsLinkedPhoneGate.test.ts`](../../apps/integrator/src/content/userScriptsLinkedPhoneGate.test.ts) — в правилах с `match.context.linkedPhone: false` в `steps` нет ключей `webAppUrlFact` и `web_app` (WebApp-кнопки). **Риски при расширении:** третий канал или колбэк без `callbackQueryId` — центральный гейт колбэков может не сработать; новые правила `message.received` — проверять приоритет относительно `*.need_phone`. **Страховка webapp:** при открытом WebApp и отсутствии tier **patient** в `/api/me` — `MiniAppShareContactGate` + `POST /api/patient/messenger/request-contact` (лимиты — `BOT_CONTACT_MINI_APP_GATE.md`); при ошибке `/api/me` (не 401) — `me_unavailable`. См. [`../archive/2026-04-initiatives/AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md`](../archive/2026-04-initiatives/AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md).

**Источник `linkedPhone` (integrator):** admin `system_settings` **`integrator_linked_phone_source`** — `public_then_contacts` (по умолчанию), `public_only` (только канон `public.platform_users`), `contacts_only` (аварийный откат). Реализация: `apps/integrator/src/infra/db/repos/channelUsers.ts`, `linkedPhoneSource.ts`; UI: `/app/settings` (диагностика админа).

| Enum (`TrustedPatientPhoneSource`)          | Где выставляется `patient_phone_trust_at` / доверие                                                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `otp_create_or_bind`                        | `apps/webapp/src/infra/repos/pgUserByPhone.ts` — успешный `createOrBind` после OTP (`UPDATE … patient_phone_trust_at = now()`).                                                                                |
| `integrator_upsert_from_projection`         | `apps/webapp/src/infra/repos/pgUserProjection.ts` — `upsertFromProjection` (INSERT с телефоном; UPDATE при непустом `phoneNormalized`).                                                                        |
| `integrator_ensure_client_from_appointment` | Тот же файл — `ensureClientFromAppointmentProjection` (INSERT/UPDATE с телефоном записи).                                                                                                                      |
| `integrator_update_phone`                   | Тот же файл — `updatePhone`.                                                                                                                                                                                   |
| `oauth_yandex_verified_phone`               | `apps/webapp/src/modules/auth/oauthYandexResolve.ts` — INSERT нового пользователя с непустым нормализованным телефоном из Yandex.                                                                              |
| `platform_user_merge`                       | `apps/webapp/src/infra/repos/pgPlatformUserMerge.ts` — перенос/объединение `patient_phone_trust_at` при merge (auto + manual ветки `UPDATE platform_users AS pu`).                                             |
| `admin_manual_profile_patch`                | `apps/webapp/src/infra/repos/pgUserProjection.ts` — `patchAdminClientProfile` при успешном `PATCH /api/admin/users/:userId/profile` (ФИО, email, телефон; нормализация `+7` и конфликт по `phone_normalized`). |

**Access context / tier (единая точка резолва):** `resolvePlatformAccessContext` в `apps/webapp/src/modules/platform-access/resolvePlatformAccessContext.ts`; контракт `PlatformAccessContext` — поля `dbRole` и **`tier`** (как в SPECIFICATION §3; для doctor/admin — `tier: null`). Типы — `apps/webapp/src/modules/platform-access/types.ts`. Публичный re-export: `apps/webapp/src/modules/platform-access/index.ts`. **Patient business gate (C.02):** `patientClientBusinessGate` в `apps/webapp/src/modules/platform-access/patientClientBusinessGate.ts` — единый критерий для `requirePatientAccessWithPhone`, `requirePatientApiBusinessAccess` и layout patient-зоны при БД; при ошибке резолва канона в БД для `client` — **fail-safe** `need_activation` (не `allow` по snapshot).

**Route & API policy (фаза D):** `apps/webapp/src/modules/platform-access/patientRouteApiPolicy.ts` — whitelist навигации без tier **patient** (в т.ч. кабинет, визард `/app/patient/booking/*`, дневник, покупки, уведомления, публичные sections/content и onboarding-страницы), `patientPageMinAccessTier`, `patientApiPathIsPatientBusinessSurface`, `patientSessionSnapshotHasPhone` (только UI-snapshot), `patientServerActionPageAllowsOnboardingOnly` (список для профиля; **runtime** — `patientOnboardingServerActionSurfaceOk` в `onboardingServerActionSurface.ts`, вызов из `profile/actions.ts`; закрытие **D-SA-1**). Re-export: `apps/webapp/src/modules/platform-access/index.ts`. Shim: `apps/webapp/src/app-layer/guards/patientPhonePolicy.ts`.

**Важно:** прочие писатели `phone_normalized` (скрипты в `apps/webapp/scripts/`, ручной SQL, новые репозитории) **не** считаются trusted, пока не добавлены в enum **и** не выставляют `patient_phone_trust_at` согласно решению в PR.

**Ops вне приложения:** пошаговые правила для ручных правок и скриптов — [`apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md`](../../apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md); оглавление папки — [`apps/webapp/scripts/README.md`](../../apps/webapp/scripts/README.md). Утилита по номеру телефона (purge/reassign и т.д., в т.ч. `runStrictPurgePlatformUser`) — [`apps/webapp/scripts/user-phone-admin.ts`](../../apps/webapp/scripts/user-phone-admin.ts).

Любое новое место, которое пишет телефон и должно влиять на patient-tier, **обязано** быть занесено в trusted policy **или** не влиять на tier до отдельного решения.

---

## 9. Наблюдаемость (DoD)

- Логировать **причину** итогового tier (код/enum причины, без утечки PII).
- Логировать **trusted / неTrusted** (или эквивалент) на критичных шагах резолва identity, где это уместно.
- Логировать или иным образом учитывать **merge**, **phone_bind**, критичные **projection** на входах — для расследований «почему onboarding».

**Статус (фаза E, 2026-04-11):** в рантайме webapp для клиента с каноном из БД — структурированный **`console.info` `[platform_access]`** в `resolvePlatformAccessContext.ts` (`tier`, `resolution`, `phone_trusted`, `has_phone_db`, id канона; без сырого телефона). При отклонении onboarding server action вне allowlist pathname — **`[platform_access] onboarding_server_action_rejected`** (`onboardingServerActionSurface.ts`; см. [`PHASE_E_REAUDIT_REPORT.md`](PHASE_E_REAUDIT_REPORT.md)). Дополнительно: **`[identity_resolution]`**, **`[auth/exchange]`** (legacy transport), **`[merge]`**, **`[patient_layout]`** (см. [`PHASE_E_AUDIT_REPORT.md`](PHASE_E_AUDIT_REPORT.md) §6). **`GET /api/me`** отдаёт **`platformAccess`** как клиентский эквивалент.

---

## 10. Фаза B — статус (закрыта)

**Повторный независимый аудит (2026-04-10):** сверка с [`MASTER_PLAN.md`](MASTER_PLAN.md) §5 (фаза B) и смежными DoD (в частности **§3 п.5** — multi-channel без «угадывания» канона по неверифицированному телефону в мессенджере). **P0/P1 по фазе B не выявлено**; остатки ниже осознанно отнесены к **фазам C / E**, не к B.

Цели §5 по **канал ↔ канон** и сокращению лишних `INSERT platform_users` считаются **выполненными** в объёме таблицы.

| Пункт §5 (фаза B)                                                                                      | Реализация в коде                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Порядок на первом входе мессенджера:** до `INSERT` — поиск канона по подсказкам и слияние кандидатов | `findOrCreateByChannelBinding` (`pgIdentityResolution.ts`): сначала существующий binding; иначе `collectMessengerResolutionCandidates` → `mergeCanonicalPlatformUserCandidates` → при отсутствии кандидатов — новый `platform_users` + binding. Подсказки: UUID в `sub` (после `resolveCanonicalUserId`), `integratorUserId` → `findCanonicalUserIdByIntegratorId`, телефон из токена **только** через `findTrustedCanonicalUserIdByPhone` (согласование с DoD §3 §5 / SPEC §10). |
| **Интегратор кормит канон, не подменяет tier на web**                                                  | `user.upserted` / `contact.linked` → `upsertFromProjection` без дублирующего `updatePhone` после `contact.linked` (`events.ts`). `appointment.record.upserted` → `ensureClientFromAppointmentProjection` (`events.ts`, `pgUserProjection.ts`).                                                                                                                                                                                                                                    |
| **Якорные файлы**                                                                                      | `pgIdentityResolution.ts`, `modules/integrator/events.ts`, `pgUserProjection.ts` — соответствуют плану; wiring `resolveCanonicalPlatformUserId` для `diary.*` — `events/route.ts` + `resolveDiaryPlatformUserId` в `events.ts`.                                                                                                                                                                                                                                                   |

| Тема (детализация)                                 | Реализация                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Подсказки не только `?t=` в URL                    | Подписанный webapp-entry токен: **`start_param`** в Telegram `initData` и **`webappEntryToken`** в POST `/api/auth/telegram-login` (при `t=` на странице). Сверка с каналом: `webappEntryTokenMatchesVerifiedMessenger` в `service.ts`.                                                                                              |
| Компактный JWT без `bindings`                      | `sub` вида **`tg:<id>`** / **`max:<id>`** → `effectiveMessengerBinding` → тот же путь `findOrCreateByChannelBinding` с hints из тела токена.                                                                                                                                                                                         |
| Интегратор → поле токена                           | `integratorUserId` в webapp-entry payload при наличии identity в БД интегратора (`getLinkDataByIdentity` в `apps/integrator/...`, сборка в `telegram`/`max` webhook + `webappEntryToken.ts`).                                                                                                                                        |
| `display_name` при привязке к существующему канону | После merge по hints непустое имя с верифицированного входа обновляет `display_name` (`pgIdentityResolution.ts`).                                                                                                                                                                                                                    |
| Логи (частично)                                    | `[identity_resolution] path=…` в `pgIdentityResolution.ts`; в `service.ts` — `resolution_hints_from` для `telegram-init` и `telegram-login`. DoD **§8** по tier/trust на чтении канона — **`[platform_access]`** в `resolvePlatformAccessContext.ts` + агрегат логов (см. §9, [`PHASE_E_AUDIT_REPORT.md`](PHASE_E_AUDIT_REPORT.md)). |

| Вне scope фазы B                                                                                      | Куда                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`collectCandidateIds`** (проекция): телефон для merge по signed webhook шире, чем hints мессенджера | Осознанно; см. комментарий в `pgUserProjection.ts`.                                                                                                             |
| **`integratorUserId` в ссылке бота**                                                                  | Появляется только после записи identity в БД интегратора — ограничение данных, не дыра в B.                                                                     |
| **Канонический `userId` в cookie / onboarding-only сессия на всех входах**                            | **Фаза C** — см. `sessionCanonicalUserIdPolicy.ts`, `exchangeIntegratorToken` (UUID `sub`), OAuth/phone `setSessionFromUser`; единая route/API policy — фаза D. |
| **Полная наблюдаемость**                                                                              | **Фаза E** — закрыта по §9 и аудиту [`PHASE_E_AUDIT_REPORT.md`](PHASE_E_AUDIT_REPORT.md).                                                                       |

## 11. Чек-лист для агента/разработчика

**Фаза A (закрыта по контракту и точке истины):** модули access context + trusted policy; read-side `isTrustedPatientPhoneActivation`; `platformAccess` в `GET /api/me`; гейт Mini App учитывает `tier` при наличии `platformAccess`.

**Фаза B (закрыта по канал ↔ канон, см. §10):** hints из signed entry-токена (`?t=`, `start_param`, `webappEntryToken`); `tg:`/`max:` в `sub`; `integratorUserId` из integrator DB в токене; diary → канон; логи merge/insert в `pgIdentityResolution`; сырой client UUID в `start_param` без HMAC не принимается.

- [x] Три модуля: access context/tier, trusted phone policy, route & API policy ([`MASTER_PLAN.md`](MASTER_PLAN.md) §2). _(Route & API policy — `patientRouteApiPolicy.ts`, фаза D.)_
- [x] Резолв `{ canonicalUserId, dbRole, tier }`; для doctor/admin tier не смешивать с patient-политикой ([`PLATFORM_IDENTITY_SPECIFICATION.md`](PLATFORM_IDENTITY_SPECIFICATION.md) §3).
- [x] Штатные точки входа (exchange, OAuth, phone confirm): канонический UUID в cookie при наличии БД и доверенного резолва; иначе явный onboarding-only транспорт (`legacy_non_uuid_session` для `client`) — фаза C (`sessionCanonicalUserIdPolicy.ts`, `service.ts`).
- [x] **Скоуп C + C.02 + D (route/API policy):** patient-бизнес в Route Handlers `/api/patient/*` и **`/api/booking/*`** — **`requirePatientApiBusinessAccess`**; server actions — **`requirePatientAccessWithPhone`** (кроме onboarding-поверхности профиля); критерий tier — **`patientClientBusinessGate`**; whitelist страниц и API-поверхностей — **`patientRouteApiPolicy.ts`**. **`getOptionalPatientSession`** — для страниц с tier **guest** в политике; перед чтением персональных данных из БД на RSC — **`patientRscPersonalDataGate`** (`requireRole.ts`); snapshot-телефон — только UI-копирайт заглушек (**`patientSessionSnapshotHasPhone`**), не gate для БД.
- [x] Onboarding: бизнес-действия вне whitelist — запрет на сервере; whitelist навигации и активации — **`patientRouteApiPolicy`** + guards.
- [x] Решение по legacy `tg:…` / не-UUID задокументировано как архитектурное (`sessionCanonicalUserIdPolicy.ts`, SPEC §6, MASTER §5 C).
- [x] Trusted phone: новые writers в БД не считаются trusted по умолчанию.
- [x] Наблюдаемость по §9 (`[platform_access]` + §9 статус; аудит [`PHASE_E_AUDIT_REPORT.md`](PHASE_E_AUDIT_REPORT.md)).
- [x] Legacy `client` без телефона → onboarding (`resolvePlatformAccessContext.test.ts` Phase E + существующие кейсы).
- [x] `pnpm run ci` зелёный; тесты на сценарии §3–§6 + негативы onboarding (`requireRole.phaseEOnboardingDenial.test.ts`, `patientTier`, booking 403, exchange\*).
- [x] Обновлён этот файл по итогам аудита фазы E; `AUTH_RESTRUCTURE` — без обязательных правок (пересечение зафиксировано в MASTER / SCENARIOS).

**Чек-лист C.02 (закрыто в коде до фазы D):**

- [x] `/api/booking/*` (create, cancel, my, slots, catalog) — `requirePatientApiBusinessAccess` с тем же телом 401/403, что `/api/patient/*`; тесты 403 `patient_activation_required` (create, my).
- [x] `/api/patient/*` — импорт **`requirePatientApiBusinessAccess`** (алиас `requirePatientApiSessionWithPhone` только в `requireRole.ts` + тест алиаса).
- [x] Один gate `patientClientBusinessGate` в `platform-access` (без третьей копии условий в handlers).
- [x] `app/app/patient/layout.tsx` — при `DATABASE_URL` для `client` редирект по tier + `resolvePatientLayoutPathname` + `patientPathRequiresBoundPhone`; без БД — прежний snapshot-телефон.
- [x] RSC: напоминания, журнал правила, сообщения, **intake LFK/nutrition** — `requirePatientAccessWithPhone` там, где бизнес вровень с API/actions.

### Предусловия перед EXEC фазы D (зафиксировано 2026-04-10)

| Условие                                                                                                                                                                 | Статус                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Фаза **C** закрыта по §5 (канон в cookie / legacy non-UUID onboarding-only)                                                                                             | [x]                                             |
| Фаза **C.02** закрыта (booking + patient API + `patientClientBusinessGate` + layout tier + RSC из чек-листа C.02)                                                       | [x]                                             |
| `pnpm run ci` зелёный перед стартом D                                                                                                                                   | обязательно прогнать перед пушем                |
| **Цель D:** один модуль **route & API policy** (whitelist страниц = правила API/actions), вытеснение разрозненных guards и точечных проверок телефона в patient-контуре | [x] **`patientRouteApiPolicy.ts`** (2026-04-10) |

**Закрыто D:** whitelist без tier **patient** для навигации расширен согласованно с RSC (кабинет, `/app/patient/booking/*`, дневник, покупки, уведомления, legacy `/lessons` / `/emergency`); **`/app/patient/profile`** — onboarding (`requirePatientAccess`); гостевой UI — **`patientSessionSnapshotHasPhone`** через `guestAccess`. При **пустом** pathname в layout редирект по tier **не** включается — см. `patientRouteApiPolicy.ts`; штатно pathname задаёт **`middleware`** (`x-bc-pathname`).
