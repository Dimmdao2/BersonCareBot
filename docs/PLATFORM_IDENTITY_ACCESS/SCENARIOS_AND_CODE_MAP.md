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

**Ограничение Next.js:** обновление cookie не из произвольного Server Component — см. комментарии в `getCurrentSession` про роль; та же дисциплина для любых полей snapshot.

---

## 3. Вход по каналам (мессенджер)

| Шаг | Где |
|-----|-----|
| Создание/поиск пользователя по binding канала | `apps/webapp/src/infra/repos/pgIdentityResolution.ts` (`findOrCreateByChannelBinding`, `findByChannelBinding`) |
| Вызов при exchange токена / initData | `apps/webapp/src/modules/auth/service.ts` (`exchangeIntegratorToken`, `exchangeTelegramInitData`, `exchangeTelegramLoginWidget`) через inject `IdentityResolutionPort` из DI |
| Сборка deps | `apps/webapp/src/app-layer/di/buildAppDeps.ts` |

**Сценарий «первый заход в Telegram/Max» (сейчас):**

1. Нет строки в `user_channel_bindings` для `(channel_code, external_id)` → создаётся **новая** строка `platform_users` (без телефона) + binding — **технический якорь** ([`SPECIFICATION.md`](SPECIFICATION.md) §7).
2. Tier по спецификации: **`client` без доверенного телефона** → **onboarding**, не patient.
3. **Целевое улучшение (фаза B плана):** до этого INSERT — попытка найти существующего канона (integrator user id из токена, уже доставшиеся события, и т.д.) по правилам доверия, чтобы **уменьшить** дубли до merge.

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
| `user.upserted`, `contact.linked` → канон + телефон + binding | вызовы `pgUserProjectionPort.upsertFromProjection`, `updatePhone` |
| Rubitime / запись → ensure клиента по телефону | `ensureClientFromAppointmentProjection` в `apps/webapp/src/infra/repos/pgUserProjection.ts`, вызов из `events.ts` (appointment.record.upserted) |
| Сборка `users` deps для событий | `buildAppDeps` и регистрация портов |

**Сценарий «Rubitime создал клиента с телефоном»:** в БД появляется/обогащается канон с `phone_normalized`; при первом входе в мессенджер цель — **привязать** канал к этому канону доверенным путём, а не создавать второго клиента (фаза B плана).

---

## 7. Политика доступа (целевое состояние)

**Жёсткое правило:** **route policy** и **API policy** опираются на **один и тот же** access context из модуля tier ([`MASTER_PLAN.md`](MASTER_PLAN.md) §2). Недопустимо: «страницы через tier, API через старые точечные проверки `phone`».

| Область | Текущее состояние (ориентир) | Цель инициативы |
|---------|------------------------------|-----------------|
| Страницы `/app/patient/*` | Разные импорты guards (`requirePatientAccess`, `getOptionalPatientSession`) из `@/app-layer/guards/requireRole` — актуальность путей проверять в дереве | Один модуль **route & API policy** + delegating в access context |
| API `/api/patient/*`, server actions | Точечные проверки (`getCurrentSession`, `phone`) | **Те же** правила и тот же whitelist, что для страниц |
| Список публичных / onboarding маршрутов | Размазан по коду | Явный перечень в **одном** модуле политики + тесты |

Конкретные пути страниц — под префиксом `apps/webapp/src/app/app/patient/` (маршрут URL `/app/patient/...`). API — не только `/api/patient/*`: любой эндпоинт, выполняющий **бизнес-действие** от имени пациента, должен проходить ту же проверку tier.

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

**Access context / tier (единая точка резолва):** `resolvePlatformAccessContext` в `apps/webapp/src/modules/platform-access/resolvePlatformAccessContext.ts`; контракт `PlatformAccessContext` — поля `dbRole` и **`tier`** (как в SPECIFICATION §3; для doctor/admin — `tier: null`). Типы — `apps/webapp/src/modules/platform-access/types.ts`. Публичный re-export: `apps/webapp/src/modules/platform-access/index.ts`.

**Важно:** прочие писатели `phone_normalized` (скрипты в `apps/webapp/scripts/`, ручной SQL, новые репозитории) **не** считаются trusted, пока не добавлены в enum **и** не выставляют `patient_phone_trust_at` согласно решению в PR.

Любое новое место, которое пишет телефон и должно влиять на patient-tier, **обязано** быть занесено в trusted policy **или** не влиять на tier до отдельного решения.

---

## 9. Наблюдаемость (DoD)

- Логировать **причину** итогового tier (код/enum причины, без утечки PII).
- Логировать **trusted / неTrusted** (или эквивалент) на критичных шагах резолва identity, где это уместно.
- Логировать или иным образом учитывать **merge**, **phone_bind**, критичные **projection** на входах — для расследований «почему onboarding».

## 10. Чек-лист для агента/разработчика

**Фаза A (закрыта по контракту и точке истины):** модули access context + trusted policy; read-side `isTrustedPatientPhoneActivation`; `platformAccess` в `GET /api/me`; гейт Mini App учитывает `tier` при наличии `platformAccess`.

- [ ] Три модуля: access context/tier, trusted phone policy, route & API policy ([`MASTER_PLAN.md`](MASTER_PLAN.md) §2). *(Два первых — фаза A; route & API policy — фаза D.)*
- [x] Резолв `{ canonicalUserId, dbRole, tier }`; для doctor/admin tier не смешивать с patient-политикой ([`SPECIFICATION.md`](SPECIFICATION.md) §3).
- [ ] Все штатные точки входа: канонический id в cookie **или** явная onboarding-only сессия без patient-доступа ([`MASTER_PLAN.md`](MASTER_PLAN.md) DoD §2).
- [ ] API и server actions используют **тот же** access context, что и страницы; нет параллельных «только phone» проверок для бизнес-операций.
- [ ] Onboarding: бизнес-действия запрещены на сервере вне серверного whitelist активации.
- [ ] Решение по legacy `tg:…` задокументировано как архитектурное (фаза C), не только runbook.
- [x] Trusted phone: новые writers в БД не считаются trusted по умолчанию.
- [ ] Наблюдаемость по §9.
- [ ] Legacy `client` без телефона → onboarding.
- [ ] `pnpm run ci` зелёный; тесты на сценарии §3–§6 + негативные API в onboarding.
- [ ] Обновлён этот файл и при необходимости `AUTH_RESTRUCTURE`.
