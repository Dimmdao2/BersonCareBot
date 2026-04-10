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

## 8. Trusted sources (зафиксировать в коде на фазе A)

**Жёстко:** **не** любое место в коде, которое делает `UPDATE platform_users … phone_normalized`, автоматически считается **trusted source** для tier **patient**. Только явно зарегистрированные в **trusted phone policy** пути засчитывают активацию. Иначе разъезжается смысл «доверенный телефон» между репозиториями и админскими SQL.

Минимальный состав для централизованного модуля «телефон засчитан для patient» (примерный каркас — расширять только через PR в политику):

1. Успешный `createOrBind` после OTP (подтверждённый номер).
2. Доверенные проекции: пути, которые выставляют `phone_normalized` через `pgUserProjection` / `updatePhone` из **проверенного** контура интегратора (закрытый перечень вызовов).

Любое новое место, которое пишет телефон и должно влиять на patient-tier, **обязано** быть занесено в trusted policy **или** не влиять на tier до отдельного решения.

---

## 9. Наблюдаемость (DoD)

- Логировать **причину** итогового tier (код/enum причины, без утечки PII).
- Логировать **trusted / неTrusted** (или эквивалент) на критичных шагах резолва identity, где это уместно.
- Логировать или иным образом учитывать **merge**, **phone_bind**, критичные **projection** на входах — для расследований «почему onboarding».

## 10. Чек-лист для агента/разработчика

- [ ] Три модуля: access context/tier, trusted phone policy, route & API policy ([`MASTER_PLAN.md`](MASTER_PLAN.md) §2).
- [ ] Резолв `{ canonicalUserId, dbRole, tier }`; для doctor/admin tier не смешивать с patient-политикой ([`SPECIFICATION.md`](SPECIFICATION.md) §3).
- [ ] Все штатные точки входа: канонический id в cookie **или** явная onboarding-only сессия без patient-доступа ([`MASTER_PLAN.md`](MASTER_PLAN.md) DoD §2).
- [ ] API и server actions используют **тот же** access context, что и страницы; нет параллельных «только phone» проверок для бизнес-операций.
- [ ] Onboarding: бизнес-действия запрещены на сервере вне серверного whitelist активации.
- [ ] Решение по legacy `tg:…` задокументировано как архитектурное (фаза C), не только runbook.
- [ ] Trusted phone: новые writers в БД не считаются trusted по умолчанию.
- [ ] Наблюдаемость по §9.
- [ ] Legacy `client` без телефона → onboarding.
- [ ] `pnpm run ci` зелёный; тесты на сценарии §3–§6 + негативные API в onboarding.
- [ ] Обновлён этот файл и при необходимости `AUTH_RESTRUCTURE`.
