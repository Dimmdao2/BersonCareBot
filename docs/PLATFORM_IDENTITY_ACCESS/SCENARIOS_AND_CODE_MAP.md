# Сценарии и привязка к коду BersonCareBot

Детализация для реализации и ревью. Пути к файлам — от корня репозитория.

---

## 1. Данные и канон (webapp DB)

| Артефакт | Где в проекте |
|----------|----------------|
| Таблица `platform_users`, `user_channel_bindings` | Миграции `apps/webapp/migrations/` (например `006_platform_users.sql` и последующие) |
| Резолв канона по `merged_into_id` | `apps/webapp/src/infra/repos/pgCanonicalPlatformUser.ts` (`resolveCanonicalUserId`, `followMergedIntoChain`) |
| Загрузка `SessionUser` с телефоном и bindings | `apps/webapp/src/infra/repos/pgUserByPhone.ts` (`findByUserId`, `createOrBind`, `loadSessionUser`) |
| Слияние двух клиентов | `apps/webapp/src/infra/repos/pgPlatformUserMerge.ts` (`mergePlatformUsersInTransaction`, `pickMergeTargetId`) |

**Инвариант:** после merge все чтения и записи от имени пользователя должны использовать **канонический** id (через `resolveCanonicalUserId` / `findByUserId`).

---

## 2. Сессия и cookie

| Что | Где |
|-----|-----|
| Cookie session, decode/encode, TTL | `apps/webapp/src/modules/auth/service.ts` (`SESSION_COOKIE_NAME`, `getCurrentSession`, `setSessionFromUser`, `exchangeIntegratorToken`, `exchangeTelegramInitData`, …) |
| Подтягивание пользователя из БД для UUID | `resolveSessionUserAgainstDb` в том же файле → `pgUserByPhonePort.findByUserId` |
| Типы `SessionUser`, `AppSession` | `apps/webapp/src/shared/types/session.ts` |
| Текущий пользователь для `/api/me` | `apps/webapp/src/app/api/me/route.ts` + `apps/webapp/src/modules/users/service.ts` (`getCurrentUser`) |
| **`platformAccess` (tier из БД по канону)** в JSON `/api/me` | Тот же `route.ts` → `resolvePlatformAccessContext` (`apps/webapp/src/modules/platform-access/`); при отсутствии `DATABASE_URL` или ошибке БД поле `null` |

**Цель инициативы:** при **записи** сессии после логина в cookie должен попадать **канонический** `userId`, когда он уже известен; tier при каждом запросе — из БД по канону, а не «только из cookie».

**Фаза C (сессия):** нормативный текст и решение по `tg:…` / не-UUID — `sessionCanonicalUserIdPolicy.ts` (onboarding-only compatibility); запись cookie только в route handlers / server actions (`exchange*`, `setSessionFromUser`, `phone/confirm`, OAuth callback).

**Ограничение Next.js:** обновление cookie не из произвольного Server Component — см. комментарии в `getCurrentSession` про роль; та же дисциплина для любых полей snapshot.

---

## 3. Вход по каналам (мессенджер)

| Шаг | Где |
|-----|-----|
| Создание/поиск пользователя по binding канала | `apps/webapp/src/infra/repos/pgIdentityResolution.ts` (`findOrCreateByChannelBinding`, `findByChannelBinding`) |
| Вызов при exchange токена / initData | `apps/webapp/src/modules/auth/service.ts` (`exchangeIntegratorToken`, `exchangeTelegramInitData`, `exchangeTelegramLoginWidget`) через inject `IdentityResolutionPort` из DI |
| Сборка deps | `apps/webapp/src/app-layer/di/buildAppDeps.ts` |

**Сценарий «первый заход в Telegram/Max» (фаза B — закрыта):**

1. Нет строки в `user_channel_bindings` для `(channel_code, external_id)` → **до** `INSERT` в `platform_users` собираются кандидаты из **`resolutionHints`** из **подписанного** webapp-entry токена: (а) query `?t=` при `exchangeIntegratorToken`; (б) Mini App — то же значение в **`start_param`** внутри `initData` (после проверки подписи Telegram на сервере); (в) веб Login Widget — опциональное поле **`webappEntryToken`** в JSON POST `/api/auth/telegram-login`, если на странице входа в URL есть `?t=` (клиент подмешивает токен в тело запроса; поле **не** входит в hash виджета). Подсказки: UUID в `sub`, `integratorUserId`, телефон из токена **только** при совпадении с каноном с **`patient_phone_trust_at`** (`pgIdentityResolution.ts`, `findTrustedCanonicalUserIdByPhone`). Сырой client-controlled UUID в `start_param` **без** HMAC **не** принимается.
2. **Компактный токен без `bindings`:** если в signed payload только `sub` вида **`tg:<id>`** или **`max:<id>`**, messenger binding берётся из `sub` (`effectiveMessengerBinding` в `service.ts`).
3. **Интегратор → токен:** при сборке ссылок из webhook Telegram/MAX в токен подмешивается **`integratorUserId`**, если identity уже есть в БД интегратора (`getLinkDataByIdentity` в `apps/integrator/src/app/routes.ts`).
4. Если кандидатов нет → новая строка `platform_users` (без телефона) + binding — **технический якорь** ([`SPECIFICATION.md`](SPECIFICATION.md) §7).
5. Tier: **`client` без доверенного телефона** → **onboarding**, не patient.

**Статус и границы фазы B** — [§10](#10-фаза-b--статус-закрыта).

---

## 4. Привязка телефона (OTP)

| Шаг | Где |
|-----|-----|
| Старт OTP, `ChannelContext` (web / telegram + chatId) | `apps/webapp/src/app/api/auth/phone/start/route.ts`, `apps/webapp/src/modules/auth/phoneAuth.ts` (`startPhoneAuth`) |
| Подтверждение кода | `apps/webapp/src/app/api/auth/phone/confirm/route.ts` → `confirmPhoneAuth` → `pgUserByPhonePort.createOrBind` |
| Merge при конфликте binding и пользователя по телефону | `createOrBind` в `pgUserByPhone.ts` → `mergePlatformUsersInTransaction(..., "phone_bind")` |

**Сценарий «второй мессенджер, тот же номер»:** вставка binding для канона, найденного по телефону, конфликтует с binding другого `user_id` → ветка merge `phone_bind` в `createOrBind`.

**Сценарий «канон с телефоном из интегратора, новый канал без binding»:** до доверенной привязки пользователь не считается patient для полного UI; безопасный путь — OTP → `createOrBind` → при необходимости merge ([`SPECIFICATION.md`](SPECIFICATION.md) §10).

---

## 5. OAuth (веб)

| Шаг | Где |
|-----|-----|
| Callback Yandex | `apps/webapp/src/app/api/auth/oauth/callback/route.ts` |
| Редирект на bind-phone если нет телефона | тот же файл после `setSessionFromUser` |
| Резолв пользователя OAuth | `apps/webapp/src/modules/auth/oauthYandexResolve.ts` и порты в callback |

**Сценарий:** провайдер не отдал телефон → сессия с каноном, tier **onboarding** → обязательный bind-phone (или эквивалент) до **patient**.

---

## 6. Интегратор (webhook → БД)

| Событие / действие | Где |
|--------------------|-----|
| Обработка типов событий | `apps/webapp/src/modules/integrator/events.ts` |
| `user.upserted`, `contact.linked` → канон + телефон + binding | `pgUserProjectionPort.upsertFromProjection` (телефон и `patient_phone_trust_at` внутри upsert; отдельный `updatePhone` после `contact.linked` **не** вызывается) |
| Rubitime / запись → ensure клиента по телефону | `ensureClientFromAppointmentProjection` в `apps/webapp/src/infra/repos/pgUserProjection.ts`, вызов из `events.ts` (appointment.record.upserted) |
| Сборка `users` deps для событий | `buildAppDeps`; в `apps/webapp/src/app/api/integrator/events/route.ts` дополнительно `resolveCanonicalPlatformUserId` → цепочка merge для **diary.*** событий с `payload.userId` |

**Сценарий «Rubitime создал клиента с телефоном»:** в БД появляется/обогащается канон с `phone_normalized`; при первом входе в мессенджер цель — **привязать** канал к этому канону доверенным путём, а не создавать второго клиента (фаза B плана).

---

## 7. Политика доступа (целевое состояние)

**Жёсткое правило:** **route policy** и **API policy** опираются на **один и тот же** access context из модуля tier ([`MASTER_PLAN.md`](MASTER_PLAN.md) §2). Недопустимо: «страницы через tier, API через старые точечные проверки `phone`».

| Область | Текущее состояние (ориентир) | Цель инициативы |
|---------|------------------------------|-----------------|
| Страницы `/app/patient/*` | Разные импорты guards (`requirePatientAccess`, `requirePatientAccessWithPhone`, `getOptionalPatientSession`) из `@/app-layer/guards/requireRole`; **layout** при `DATABASE_URL` — tier через `patientClientBusinessGate` + `patientPathRequiresBoundPhone` + `resolvePatientLayoutPathname` (`x-bc-pathname` или fallback `Referer`) + `x-bc-search` | Один модуль **route & API policy** + delegating в access context |
| API `/api/patient/*`, **`/api/booking/*`**, server actions | После **C.02:** patient-бизнес через **`requirePatientApiBusinessAccess`** (в `/api/patient/*` и booking; алиас `requirePatientApiSessionWithPhone` в `requireRole.ts`) и `requirePatientAccessWithPhone`; общий **`patientClientBusinessGate`** | **Те же** правила и тот же whitelist, что для страниц |
| Список публичных / onboarding маршрутов | Размазан по коду | Явный перечень в **одном** модуле политики + тесты |

Конкретные пути страниц — под префиксом `apps/webapp/src/app/app/patient/` (маршрут URL `/app/patient/...`). API — не только `/api/patient/*`: любой эндпоинт, выполняющий **бизнес-действие** от имени пациента (в т.ч. запись на приём), должен проходить ту же проверку tier.

**Фаза C.02 ([`MASTER_PLAN.md`](MASTER_PLAN.md) §5):** выравнивание до фазы D: **`patientClientBusinessGate`**; booking и `/api/patient/*` на **`requirePatientApiBusinessAccess`**; **`resolvePatientLayoutPathname`** в `patientPhonePolicy.ts` + `app/app/patient/layout.tsx` (редкий fallback по `Referer`, если нет `x-bc-pathname`); RSC intake LFK/nutrition — `requirePatientAccessWithPhone` вровень с `online-intake` API; негативные тесты 403 для booking.

**Onboarding на сервере:** запрет бизнес-операций дублируется в **handlers/actions**; whitelist активации серверный ([`SPECIFICATION.md`](SPECIFICATION.md) §4).

---

## 8. Trusted sources (фаза A — зафиксировано в коде)

**Жёстко:** **не** любое место в коде, которое делает `UPDATE platform_users … phone_normalized`, автоматически считается **trusted source** для tier **patient**. На чтении tier опирается на колонку **`platform_users.patient_phone_trust_at`** (см. миграцию `apps/webapp/migrations/068_platform_users_patient_phone_trust.sql`): при непустом `phone_normalized` tier **patient** только если `patient_phone_trust_at IS NOT NULL`. Миграция **backfill** для уже существующих строк с телефоном выставляет метку времени (legacy, [`SPECIFICATION.md`](SPECIFICATION.md) §12).

**Закрытый перечень в коде:** enum `TrustedPatientPhoneSource` в `apps/webapp/src/modules/platform-access/trustedPhonePolicy.ts` (расширять только через PR в политику + соответствующий writer в БД). Якорные вызовы `trustedPatientPhoneWriteAnchor(…)` стоят в перечисленных writers (grep по репозиторию) — на tier в рантайме не влияют, связывают код с enum для ревью.

**Read-side ([`SPECIFICATION.md`](SPECIFICATION.md) §5):** функция **`isTrustedPatientPhoneActivation`** в том же `trustedPhonePolicy.ts` — единственная точка решения «телефон на каноне засчитан для tier patient»; **`resolvePlatformAccessContext`** вызывает её при вычислении `phoneTrustedForPatient` / `tier` для `client`.

**Mini App (клиент):** `apps/webapp/src/shared/lib/patientMessengerContactGate.ts` — если в ответе `/api/me` есть `platformAccess`, «номер есть» для снятия гейта контакта трактуется как **`tier === "patient"`**, а не только наличие `user.phone` (телефон в snapshot без доверия → onboarding).

| Enum (`TrustedPatientPhoneSource`) | Где выставляется `patient_phone_trust_at` / доверие |
|------------------------------------|-----------------------------------------------------|
| `otp_create_or_bind` | `apps/webapp/src/infra/repos/pgUserByPhone.ts` — успешный `createOrBind` после OTP (`UPDATE … patient_phone_trust_at = now()`). |
| `integrator_upsert_from_projection` | `apps/webapp/src/infra/repos/pgUserProjection.ts` — `upsertFromProjection` (INSERT с телефоном; UPDATE при непустом `phoneNormalized`). |
| `integrator_ensure_client_from_appointment` | Тот же файл — `ensureClientFromAppointmentProjection` (INSERT/UPDATE с телефоном записи). |
| `integrator_update_phone` | Тот же файл — `updatePhone`. |
| `oauth_yandex_verified_phone` | `apps/webapp/src/modules/auth/oauthYandexResolve.ts` — INSERT нового пользователя с непустым нормализованным телефоном из Yandex. |
| `platform_user_merge` | `apps/webapp/src/infra/repos/pgPlatformUserMerge.ts` — перенос/объединение `patient_phone_trust_at` при merge (auto + manual ветки `UPDATE platform_users AS pu`). |

**Access context / tier (единая точка резолва):** `resolvePlatformAccessContext` в `apps/webapp/src/modules/platform-access/resolvePlatformAccessContext.ts`; контракт `PlatformAccessContext` — поля `dbRole` и **`tier`** (как в SPECIFICATION §3; для doctor/admin — `tier: null`). Типы — `apps/webapp/src/modules/platform-access/types.ts`. Публичный re-export: `apps/webapp/src/modules/platform-access/index.ts`. **Patient business gate (C.02):** `patientClientBusinessGate` в `apps/webapp/src/modules/platform-access/patientClientBusinessGate.ts` — единый критерий для `requirePatientAccessWithPhone`, `requirePatientApiBusinessAccess` и layout patient-зоны при БД.

**Важно:** прочие писатели `phone_normalized` (скрипты в `apps/webapp/scripts/`, ручной SQL, новые репозитории) **не** считаются trusted, пока не добавлены в enum **и** не выставляют `patient_phone_trust_at` согласно решению в PR.

Любое новое место, которое пишет телефон и должно влиять на patient-tier, **обязано** быть занесено в trusted policy **или** не влиять на tier до отдельного решения.

---

## 9. Наблюдаемость (DoD)

- Логировать **причину** итогового tier (код/enum причины, без утечки PII).
- Логировать **trusted / неTrusted** (или эквивалент) на критичных шагах резолва identity, где это уместно.
- Логировать или иным образом учитывать **merge**, **phone_bind**, критичные **projection** на входах — для расследований «почему onboarding».

---

## 10. Фаза B — статус (закрыта)

**Повторный независимый аудит (2026-04-10):** сверка с [`MASTER_PLAN.md`](MASTER_PLAN.md) §5 (фаза B) и смежными DoD (в частности **§3 п.5** — multi-channel без «угадывания» канона по неверифицированному телефону в мессенджере). **P0/P1 по фазе B не выявлено**; остатки ниже осознанно отнесены к **фазам C / E**, не к B.

Цели §5 по **канал ↔ канон** и сокращению лишних `INSERT platform_users` считаются **выполненными** в объёме таблицы.

| Пункт §5 (фаза B) | Реализация в коде |
|-------------------|-------------------|
| **Порядок на первом входе мессенджера:** до `INSERT` — поиск канона по подсказкам и слияние кандидатов | `findOrCreateByChannelBinding` (`pgIdentityResolution.ts`): сначала существующий binding; иначе `collectMessengerResolutionCandidates` → `mergeCanonicalPlatformUserCandidates` → при отсутствии кандидатов — новый `platform_users` + binding. Подсказки: UUID в `sub` (после `resolveCanonicalUserId`), `integratorUserId` → `findCanonicalUserIdByIntegratorId`, телефон из токена **только** через `findTrustedCanonicalUserIdByPhone` (согласование с DoD §3 §5 / SPEC §10). |
| **Интегратор кормит канон, не подменяет tier на web** | `user.upserted` / `contact.linked` → `upsertFromProjection` без дублирующего `updatePhone` после `contact.linked` (`events.ts`). `appointment.record.upserted` → `ensureClientFromAppointmentProjection` (`events.ts`, `pgUserProjection.ts`). |
| **Якорные файлы** | `pgIdentityResolution.ts`, `modules/integrator/events.ts`, `pgUserProjection.ts` — соответствуют плану; wiring `resolveCanonicalPlatformUserId` для `diary.*` — `events/route.ts` + `resolveDiaryPlatformUserId` в `events.ts`. |

| Тема (детализация) | Реализация |
|--------------------|------------|
| Подсказки не только `?t=` в URL | Подписанный webapp-entry токен: **`start_param`** в Telegram `initData` и **`webappEntryToken`** в POST `/api/auth/telegram-login` (при `t=` на странице). Сверка с каналом: `webappEntryTokenMatchesVerifiedMessenger` в `service.ts`. |
| Компактный JWT без `bindings` | `sub` вида **`tg:<id>`** / **`max:<id>`** → `effectiveMessengerBinding` → тот же путь `findOrCreateByChannelBinding` с hints из тела токена. |
| Интегратор → поле токена | `integratorUserId` в webapp-entry payload при наличии identity в БД интегратора (`getLinkDataByIdentity` в `apps/integrator/...`, сборка в `telegram`/`max` webhook + `webappEntryToken.ts`). |
| `display_name` при привязке к существующему канону | После merge по hints непустое имя с верифицированного входа обновляет `display_name` (`pgIdentityResolution.ts`). |
| Логи (частично) | `[identity_resolution] path=…` в `pgIdentityResolution.ts`; в `service.ts` — `resolution_hints_from` для `telegram-init` и `telegram-login`. Полный DoD **§8** (tier / trusted на всех шагах) — **фаза E**. |

| Вне scope фазы B | Куда |
|------------------|------|
| **`collectCandidateIds`** (проекция): телефон для merge по signed webhook шире, чем hints мессенджера | Осознанно; см. комментарий в `pgUserProjection.ts`. |
| **`integratorUserId` в ссылке бота** | Появляется только после записи identity в БД интегратора — ограничение данных, не дыра в B. |
| **Канонический `userId` в cookie / onboarding-only сессия на всех входах** | **Фаза C** — см. `sessionCanonicalUserIdPolicy.ts`, `exchangeIntegratorToken` (UUID `sub`), OAuth/phone `setSessionFromUser`; единая route/API policy — фаза D. |
| **Полная наблюдаемость** | **Фаза E** (DoD §8). |

## 11. Чек-лист для агента/разработчика

**Фаза A (закрыта по контракту и точке истины):** модули access context + trusted policy; read-side `isTrustedPatientPhoneActivation`; `platformAccess` в `GET /api/me`; гейт Mini App учитывает `tier` при наличии `platformAccess`.

**Фаза B (закрыта по канал ↔ канон, см. §10):** hints из signed entry-токена (`?t=`, `start_param`, `webappEntryToken`); `tg:`/`max:` в `sub`; `integratorUserId` из integrator DB в токене; diary → канон; логи merge/insert в `pgIdentityResolution`; сырой client UUID в `start_param` без HMAC не принимается.

- [ ] Три модуля: access context/tier, trusted phone policy, route & API policy ([`MASTER_PLAN.md`](MASTER_PLAN.md) §2). *(Два первых — фаза A; route & API policy — фаза D.)*
- [x] Резолв `{ canonicalUserId, dbRole, tier }`; для doctor/admin tier не смешивать с patient-политикой ([`SPECIFICATION.md`](SPECIFICATION.md) §3).
- [x] Штатные точки входа (exchange, OAuth, phone confirm): канонический UUID в cookie при наличии БД и доверенного резолва; иначе явный onboarding-only транспорт (`legacy_non_uuid_session` для `client`) — фаза C (`sessionCanonicalUserIdPolicy.ts`, `service.ts`).
- [x] **Скоуп C + C.02 (готово):** patient-бизнес в Route Handlers `/api/patient/*` и **`/api/booking/*`** — **`requirePatientApiBusinessAccess`**; server actions и перечисленные в чек-листе C.02 RSC — **`requirePatientAccessWithPhone`**; общий критерий — **`patientClientBusinessGate`**. *(Полное совпадение «каждая страница = тот же guard, что API» и вытеснение `getOptionalPatientSession` + snapshot-телефона — **фаза D**.)*
- [ ] Onboarding: бизнес-действия запрещены на сервере вне серверного whitelist активации. *(Частично: layout + API; единый серверный whitelist-модуль — фаза D.)*
- [x] Решение по legacy `tg:…` / не-UUID задокументировано как архитектурное (`sessionCanonicalUserIdPolicy.ts`, SPEC §6, MASTER §5 C).
- [x] Trusted phone: новые writers в БД не считаются trusted по умолчанию.
- [ ] Наблюдаемость по §9.
- [ ] Legacy `client` без телефона → onboarding.
- [ ] `pnpm run ci` зелёный; тесты на сценарии §3–§6 + негативные API в onboarding.
- [ ] Обновлён этот файл и при необходимости `AUTH_RESTRUCTURE`.

**Чек-лист C.02 (закрыто в коде до фазы D):**

- [x] `/api/booking/*` (create, cancel, my, slots, catalog) — `requirePatientApiBusinessAccess` с тем же телом 401/403, что `/api/patient/*`; тесты 403 `patient_activation_required` (create, my).
- [x] `/api/patient/*` — импорт **`requirePatientApiBusinessAccess`** (алиас `requirePatientApiSessionWithPhone` только в `requireRole.ts` + тест алиаса).
- [x] Один gate `patientClientBusinessGate` в `platform-access` (без третьей копии условий в handlers).
- [x] `app/app/patient/layout.tsx` — при `DATABASE_URL` для `client` редирект по tier + `resolvePatientLayoutPathname` + `patientPathRequiresBoundPhone`; без БД — прежний snapshot-телефон.
- [x] RSC: напоминания, журнал правила, сообщения, **intake LFK/nutrition** — `requirePatientAccessWithPhone` там, где бизнес вровень с API/actions.

### Предусловия перед EXEC фазы D (зафиксировано 2026-04-10)

| Условие | Статус |
|---------|--------|
| Фаза **C** закрыта по §5 (канон в cookie / legacy non-UUID onboarding-only) | [x] |
| Фаза **C.02** закрыта (booking + patient API + `patientClientBusinessGate` + layout tier + RSC из чек-листа C.02) | [x] |
| `pnpm run ci` зелёный перед стартом D | обязательно прогнать перед пушем |
| **Цель D:** один модуль **route & API policy** (whitelist страниц = правила API/actions), вытеснение разрозненных guards и точечных проверок телефона в patient-контуре | следующий EXEC |

**Остаточные паттерны до D (не блокер C.02):** страницы в **`PREFIX_ALLOWLIST`** (`patientPhonePolicy.ts`), в т.ч. **`/app/patient/profile`** — намеренно **`requirePatientAccess`** + данные по `userId` до tier **patient**; кабинет / дневник / покупки / визард записи — **`getOptionalPatientSession`** + гостевой UI и snapshot **`patientHasPhoneOrMessenger`**, опора на layout (tier) + **API с `requirePatientApiBusinessAccess`** для мутаций. При **пустом** pathname в layout (`resolvePatientLayoutPathname` → `""`) редирект по tier **не** включается — см. комментарий в `patientPhonePolicy.ts`; в штатной навигации задаёт **`middleware`** (`x-bc-pathname`).
