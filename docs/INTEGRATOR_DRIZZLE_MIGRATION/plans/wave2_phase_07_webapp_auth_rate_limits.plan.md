---
name: Wave2 Phase07 Webapp auth rate limits
overview: Миграция сырого SQL в auth и rate-limit модулях на Drizzle через infra где уже есть pool.query; сохранить семантику OTP/email/channel link.
status: pending
isProject: false
todos:
  - id: p07-inventory
    content: "Сверить список файлов с RAW_SQL_INVENTORY §2.2 (channelLink, channelLinkClaim, service, rate limits, phoneOtpLimits, emailAuth)."
    status: pending
  - id: p07-rate-limits
    content: "Вынести повторяющиеся паттерны rate limit в узкий infra helper или расширить существующий repos-слой без дублирования SQL строк."
    status: pending
  - id: p07-channel-link
    content: "channelLink.ts / channelLinkClaim.ts: Drizzle + транзакции; классификация владельца — тесты на граничные счётчики."
    status: pending
  - id: p07-auth-service
    content: "modules/auth/service.ts: переносить только ветки с pool.query; SQL уходит в ports/infra repos и вызывается через существующую DI/ports схему, без импорта infra из modules."
    status: pending
  - id: p07-verify
    content: "Запуск существующих auth-тестов + typecheck; без поднятия глобальных таймаутов vitest (политика webapp-тестов)."
    status: pending
---

# Wave 2 — этап 7: webapp auth и rate limits

## Размер

**M** (много файлов, но узкие запросы; высокая чувствительность к безопасности).

## Definition of Done

- [ ] Нет необоснованного `pool.query` в перечисленных auth/rate-limit путях.
- [ ] Ключевые тесты auth зелёные; новые edge-case добавлены только где была найдена дыра.

## Scope

**Разрешено:** `apps/webapp/src/modules/auth/*.ts` при переносе SQL в `apps/webapp/src/infra/repos/*` + вызовы из модулей через существующие абстракции (не нарушать ESLint modules→infra).

**Вне scope:** смена провайдеров OAuth/SMS; новые env для секретов.

**Решение:** не переписывать весь `modules/auth/service.ts`. Меняются только места с сырой SQL; публичное поведение API, классификация ошибок и провайдеры остаются прежними. Новые helper/repo должны сохранять направление зависимостей `module port -> infra implementation -> buildAppDeps`.

## Примечание

Интеграторный путь `messengerPhoneHttpBindExecute.ts` остаётся на отдельном пуле до отдельной задачи унификации — не раздувать этап без постановки.

## Декомпозиция исполнения

### 1. Inventory and security baseline

- [ ] Сверить `RAW_SQL_INVENTORY.md` §2.2 и текущий `rg "pool\\.query|client\\.query" apps/webapp/src/modules/auth apps/webapp/src/infra --glob "*.ts"`.
- [ ] Для каждого SQL-call записать security meaning: rate limit, OTP, channel link ownership, email auth, registration merge.
- [ ] Не менять error codes, HTTP statuses, audit actions и публичные тексты.

### 2. Rate limits

- [ ] Найти повторяющиеся patterns `INSERT bucket`, `increment`, `window reset`, `SELECT count`.
- [ ] Вынести в узкий infra helper/repo, если минимум два call-sites совпадают по паттерну.
- [ ] Сохранить ключ лимита и source IP semantics; не добавлять новые env.
- [ ] Тесты: limit hit, limit reset, different key isolation.

### 3. Channel link / claim

- [ ] `channelLink.ts` и `channelLinkClaim.ts`: перенести SQL в port/repo implementation, не импортировать infra из module.
- [ ] Сохранить классификацию claim vs real conflict и `mergeReason` priority.
- [ ] Тесты: existing owner, claimable binding, real conflict, expired token.

### 4. OTP and email auth

- [ ] `phoneOtpLimits`, email lookup/auth paths: перевести только raw SQL участки.
- [ ] Сохранить normalization, trusted phone semantics, duplicate email conflict behavior.
- [ ] Тесты: cooldown/limit, duplicate email, setup access path.

### 5. `modules/auth/service.ts`

- [ ] Не переписывать весь сервис; выделить только SQL-dependent branches.
- [ ] Добавить/расширить port types в module layer, implementation в infra, wiring в `buildAppDeps`.
- [ ] Проверить ESLint no-restricted-imports: module не должен импортировать `@/infra/db` или `@/infra/repos`.

### 6. Verification

- [ ] `rg "@/infra/db|@/infra/repos" apps/webapp/src/modules/auth --glob "*.ts"` — новых нарушений нет.
- [ ] `rg "pool\\.query|client\\.query" apps/webapp/src/modules/auth apps/webapp/src/infra --glob "*.ts"` — остатки в auth/rate-limit scope объяснены.
- [ ] `pnpm --dir apps/webapp run typecheck`
- [ ] Целевые auth/rate-limit tests; не поднимать global Vitest timeouts.
- [ ] LOG: какие security branches переведены и какие остались на pg с причиной.

## Решения по сложным местам

- Auth SQL переносится без изменения security policy: error classes, audit actions, HTTP statuses и `mergeReason` priority сохраняются.
- Rate-limit keys/window semantics не менять. Helper/repo может менять реализацию хранения, но не ключ лимита.
- Clean Architecture обязательна: module defines port, infra implements, `buildAppDeps` wires.
- `messengerPhoneHttpBindExecute.ts` остаётся вне scope; phone-bind shared package унификация — отдельный backlog.

## Stop conditions

- Если перенос требует изменить rate-limit key или trusted IP semantics, остановиться и оформить security decision.
- Если module начинает импортировать `@/infra/db` или `@/infra/repos`, остановиться и переделать через port.
- Если auth tests требуют переписать expected error branch, считать это behavioral change и согласовать отдельно.
