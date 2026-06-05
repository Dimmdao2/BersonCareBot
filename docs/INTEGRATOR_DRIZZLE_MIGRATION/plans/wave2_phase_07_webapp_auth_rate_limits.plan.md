---
name: Wave2 Phase07 Webapp auth rate limits
overview: Миграция сырого SQL в auth и rate-limit модулях на Drizzle через infra; сохранена семантика OTP/email/channel link.
status: completed
isProject: false
todos:
  - id: p07-inventory
    content: "Сверить список файлов с RAW_SQL_INVENTORY §2.2 (channelLink, channelLinkClaim, service, rate limits, phoneOtpLimits, emailAuth)."
    status: completed
  - id: p07-rate-limits
    content: "Вынести повторяющиеся паттерны rate limit в узкий infra helper или расширить существующий repos-слой без дублирования SQL строк."
    status: completed
  - id: p07-channel-link
    content: "channelLink.ts / channelLinkClaim.ts: Drizzle + транзакции; классификация владельца — тесты на граничные счётчики."
    status: completed
  - id: p07-auth-service
    content: "modules/auth/service.ts: переносить только ветки с pool.query; SQL уходит в ports/infra repos и вызывается через существующую DI/ports схему, без импорта infra из modules."
    status: completed
  - id: p07-verify
    content: "Запуск существующих auth-тестов + typecheck; без поднятия глобальных таймаутов vitest (политика webapp-тестов)."
    status: completed
  - id: p07-post-audit
    content: "Post-audit: CA ports (rate limits, OAuth, email send), pgOAuthUserResolve, ensureAuthModulePortsBound в API routes, devDb smoke rate limit, ESLint allowlist."
    status: completed
---

# Wave 2 — этап 7: webapp auth и rate limits

## Размер

**M** (много файлов, но узкие запросы; высокая чувствительность к безопасности).

## Definition of Done

- [x] Нет необоснованного `pool.query` в перечисленных auth/rate-limit путях.
- [x] Ключевые тесты auth зелёные; новые edge-case добавлены только где была найдена дыра.

## Scope

**Разрешено:** `apps/webapp/src/modules/auth/*.ts` при переносе SQL в `apps/webapp/src/infra/repos/*` + вызовы из модулей через существующие абстракции (не нарушать ESLint modules→infra).

**Вне scope:** смена провайдеров OAuth/SMS; новые env для секретов.

**Решение:** не переписывать весь `modules/auth/service.ts`. Меняются только места с сырой SQL; публичное поведение API, классификация ошибок и провайдеры остаются прежними. Новые helper/repo должны сохранять направление зависимостей `module port -> infra implementation -> buildAppDeps`.

## Примечание

Интеграторный путь `messengerPhoneHttpBindExecute.ts` остаётся на отдельном пуле до отдельной задачи унификации — не раздувать этап без постановки.

## Закрытие (2026-06-05)

- **Infra:** `pgAuthRateLimitEvents.ts` (`checkAndRecordAuthRateLimitEvent` через `runWebappTransaction` + xact advisory lock); `pgPhoneOtpLimits.ts`; `pgDevBypassPlatformUserPhone.ts`; `pgEmailAuth.ts`; `pgChannelLinkClaim.ts`; `pgOAuthUserResolve.ts`.
- **Rate limits (6):** auth (5) + `publicBookingRateLimit` — DB-path через `pgAuthRateLimitEvents`; wiring в `modules/auth/authRateLimits.ts` + `createSlidingWindowRateLimit`; in-memory fallback без изменений.
- **Clean Architecture:** module ports (`authRateLimitPort`, `emailAuthPort`, `phoneOtpLimitsPort`, `devBypassPlatformUserPhonePort`, `oauthUserResolvePort`, `emailSendPort`); `bindAuthModulePorts.ts` + `ensureAuthModulePortsBound()` в `buildAppDeps` и в API routes до rate limit / email / OAuth resolve; ESLint allowlist сужен (rate limits, emailAuth, phoneOtpLimits, publicBookingRateLimit, oauth resolve сняты).
- **OTP / email:** `phoneOtpLimits` → `pgPhoneOtpLimits`; `emailAuth` → `pgEmailAuth` через port; отправка кода → `emailSendPort` (integrator adapter только в composition root).
- **Channel link:** claim SQL → `pgChannelLinkClaim`; `channelLink.ts` — DML через Drizzle bridge; `client.query(BEGIN|COMMIT|ROLLBACK)` только для `mergePlatformUsersInTransaction` / claim tx.
- **OAuth resolve:** SQL → `pgOAuthUserResolve`; `oauthYandexResolve` / `oauthWebLoginResolve` — business logic через `oauthUserResolvePort` (без `@/infra/*` в modules).
- **service.ts:** dev bypass phone UPDATE → port `applyDevBypassPlatformUserPhoneInDb` (allowlisted: dynamic import `pgUserByPhone` / `pgUserProjection`).
- **Остаток (осознанно):** `client.query` tx control в channel link merge/claim; `channelLink.ts`, `service.ts`, `oauthWebSession.ts`, `yandexOAuthCallbackHandler.ts` — allowlisted legacy infra imports.
- **Тесты:** auth module vitest **243 passed**; additions — `pgAuthRateLimitEvents.test.ts`, `pgOAuthUserResolve.test.ts`, `oauthWebLoginResolve.test.ts`, opt-in `pgAuthRateLimitEvents.devDb.integration.test.ts`.
- **Проверки:** `pnpm --dir apps/webapp run typecheck`; полный `pnpm run ci`.

## Декомпозиция исполнения

### 1. Inventory and security baseline

- [x] Сверить `RAW_SQL_INVENTORY.md` §2.2 и текущий `rg "pool\\.query|client\\.query" apps/webapp/src/modules/auth apps/webapp/src/infra --glob "*.ts"`.
- [x] Для каждого SQL-call записать security meaning: rate limit, OTP, channel link ownership, email auth, registration merge.
- [x] Не менять error codes, HTTP statuses, audit actions и публичные тексты.

### 2. Rate limits

- [x] Найти повторяющиеся patterns `INSERT bucket`, `increment`, `window reset`, `SELECT count`.
- [x] Вынести в узкий infra helper/repo, если минимум два call-sites совпадают по паттерну.
- [x] Сохранить ключ лимита и source IP semantics; не добавлять новые env.
- [x] Тесты: limit hit, limit reset, different key isolation.

### 3. Channel link / claim

- [x] `channelLink.ts` и `channelLinkClaim.ts`: перенести SQL в port/repo implementation, не импортировать infra из module.
- [x] Сохранить классификацию claim vs real conflict и `mergeReason` priority.
- [x] Тесты: existing owner, claimable binding, real conflict, expired token.

### 4. OTP and email auth

- [x] `phoneOtpLimits`, email lookup/auth paths: перевести только raw SQL участки.
- [x] Сохранить normalization, trusted phone semantics, duplicate email conflict behavior.
- [x] Тесты: cooldown/limit, duplicate email, setup access path.

### 5. `modules/auth/service.ts`

- [x] Не переписывать весь сервис; выделить только SQL-dependent branches.
- [x] Добавить/расширить port types в module layer, implementation в infra, wiring в `buildAppDeps`.
- [x] Проверить ESLint no-restricted-imports: module не должен импортировать `@/infra/db` или `@/infra/repos`.

### 6. Verification

- [x] `rg "@/infra/db|@/infra/repos" apps/webapp/src/modules/auth --glob "*.ts"` — новых нарушений нет.
- [x] `rg "pool\\.query|client\\.query" apps/webapp/src/modules/auth apps/webapp/src/infra --glob "*.ts"` — остатки в auth/rate-limit scope объяснены.
- [x] `pnpm --dir apps/webapp run typecheck`
- [x] Целевые auth/rate-limit tests; не поднимать global Vitest timeouts.
- [x] LOG: какие security branches переведены и какие остались на pg с причиной.

## Решения по сложным местам

- Auth SQL переносится без изменения security policy: error classes, audit actions, HTTP statuses и `mergeReason` priority сохраняются.
- Rate-limit keys/window semantics не менять. Helper/repo может менять реализацию хранения, но не ключ лимита.
- Clean Architecture обязательна: module defines port, infra implements, `buildAppDeps` wires.
- `messengerPhoneHttpBindExecute.ts` остаётся вне scope; phone-bind shared package унификация — отдельный backlog.

## Stop conditions

- Если перенос требует изменить rate-limit key или trusted IP semantics, остановиться и оформить security decision.
- Если module начинает импортировать `@/infra/db` или `@/infra/repos`, остановиться и переделать через port.
- Если auth tests требуют переписать expected error branch, считать это behavioral change и согласовать отдельно.
