---
name: Wave3 Phase09 Integrator P1plus
overview: Закрыть только оставшиеся после phase08 prod db.query в integrator; не мигрировать на Drizzle код/таблицы, которые phase08 переводит на public или удаляет.
status: completed
isProject: false
todos:
  - id: w3-p09a-settings-config
    content: "09A: Settings/config readers после phase08: общий helper для чтения public.system_settings + Zod, без runtime-зависимости от integrator mirror."
    status: completed
  - id: w3-p09b-simple-repos
    content: "09B: Простые repos (platformUserDeliveryPhone, resolvePlatformUserIdForRubitimeBooking, canonicalUserId, linkedPhoneSource, messengerStaffIds, adminIncidentAlertRelay) → runIntegratorSql/helper."
    status: completed
  - id: w3-p09c-complex-repos
    content: "09C: Сложные repos (idempotencyKeys, adminStats, integrationDataQualityIncidents, patientHomeMorningPing repo+handler, branchTimezone) с сохранением семантики."
    status: completed
  - id: w3-p09d-gcal
    content: "09D: Google Calendar (calendarDescription, resolvePackageCalendarContext, runtimeConfig) + cache/invalidation parity."
    status: completed
  - id: w3-p09e-throttle
    content: "09E: rubitimeApiThrottle: throttle row read/update через drizzle session на том же PoolClient (Class B), advisory semantics unchanged."
    status: completed
  - id: w3-p09-verify
    content: "После 09A-09E: rg integrator await db.query (exclude migrate/scripts/client health); targeted tests per batch + integrator typecheck."
    status: completed
---

# Wave 3 — фаза 09: Integrator P1+

## Размер

**M** (после phase08 scope должен уменьшиться; один PR, минимум 5 commit-батчей).

## Вход из phase08

- `integrator.system_settings` не является runtime source of truth: все settings/config readers должны читать `public.system_settings`.
- `settingsSyncRoute` / `system_settings_sync` — legacy compatibility, не мигрировать как runtime-source в phase09.
- `bookingProfilesRepo` и `integrator.rubitime_*` legacy catalog tables — move-to-public/deprecate candidate; не входят в phase09.
- `rubitime_records` — raw-audit-only/deprecate candidate; не расширять как бизнес-канон записи.
- `user_reminder_*` — move-to-public candidate; phase09 может трогать текущие dispatch paths только если сохраняет technical state semantics и не расширяет зеркало.

## Исполнение через composer

- `1 composer run = 1 PR = 1 фаза` (для текущего состояния: фаза 09 идёт отдельным прогоном/PR, без объединения с фазой 10).
- Внутри фазы 09 порядок обязателен: `09A → 09B → 09C → 09D → 09E`.
- Для всех DB/json-границ в изменяемых файлах: обязательна Zod-валидация; новый `JSON.parse(... ) as unknown` запрещён.
- Staging smoke gate остаётся в фазе 17 и не блокирует запуск фазы 09.

## Подфазы (обязательный порядок)

### 09A — settings/config foundation

- Цель: унифицировать чтение `public.system_settings` через helper + Zod.
- Файлы: `config/appBaseUrl.ts`, `config/appTimezone.ts`, `config/smtpOutbound.ts`, `config/operationalVerboseLog.ts`, `repos/linkedPhoneSource.ts`, `gcal/runtimeConfig.ts`.
- Проверка:
  - `rg "JSON\\.parse\\(|as unknown" apps/integrator/src/config apps/integrator/src/infra/db/repos/linkedPhoneSource.ts apps/integrator/src/integrations/google-calendar/runtimeConfig.ts`
  - targeted tests на кеши `appBaseUrl`/`appTimezone`.

### 09B — simple repos batch

- Цель: убрать прямой `await db.query` из низкорисковых repo/read paths.
- Файлы: `repos/platformUserDeliveryPhone.ts`, `repos/resolvePlatformUserIdForRubitimeBooking.ts`, `repos/canonicalUserId.ts`, `infra/db/messengerStaffIds.ts`, `infra/db/adminIncidentAlertRelay.ts`.
- Проверка:
  - `rg "await db\\.query" apps/integrator/src/infra/db/repos/platformUserDeliveryPhone.ts apps/integrator/src/infra/db/repos/resolvePlatformUserIdForRubitimeBooking.ts apps/integrator/src/infra/db/repos/canonicalUserId.ts apps/integrator/src/infra/db/messengerStaffIds.ts apps/integrator/src/infra/db/adminIncidentAlertRelay.ts`
  - `pnpm --dir apps/integrator run test -- --run platformUserDeliveryPhone canonicalUserId`

### 09C — complex repos batch

- Цель: сохранить поведение dynamic/aggregate/cross-schema paths.
- Файлы: `repos/idempotencyKeys.ts`, `repos/adminStats.ts`, `repos/integrationDataQualityIncidents.ts`, `repos/patientHomeMorningPing.ts`, `kernel/domain/executor/handlers/patientHomeMorningPing.ts`, `infra/db/branchTimezone.ts`.
- Проверка:
  - `pnpm --dir apps/integrator run test -- --run idempotency adminStats branchTimezone patientHomeMorningPing`
  - `rg "public\\." apps/integrator/src/infra/db/branchTimezone.ts`

### 09D — google calendar batch

- Цель: перевести весь gcal-tail в рамках одной подфазы и не оставить "половинчатый" runtime.
- Файлы: `integrations/google-calendar/calendarDescription.ts`, `integrations/google-calendar/resolvePackageCalendarContext.ts`, `integrations/google-calendar/runtimeConfig.ts`.
- Проверка:
  - targeted tests по gcal flows;
  - проверка кэшей/дефолтов timezone/baseUrl.

### 09E — rubitime throttle batch

- Цель: перевести throttle-row operations на Drizzle session на том же `PoolClient`.
- Файлы: `integrations/rubitime/rubitimeApiThrottle.ts`.
- Проверка:
  - `pnpm --dir apps/integrator run test -- --run rubitimeApiThrottle`
  - ручная сверка интервалов, ключа throttle-row и advisory semantics.

## Definition of Done

- [x] Нет `await db.query` в оставшихся после phase08 prod-файлах (кроме `client.ts` health, `migrate.ts`, scripts).
- [x] Ни один файл из phase08 `delete/deprecate` или `move-to-public` не «мигрирован ради миграции».
- [x] `projectionHealthCore.ts` без изменений (Class B) или только комментарий ADR.
- [x] Кэши `appBaseUrl` / `appTimezone` / invalidation — поведение как до миграции.
- [x] `branchTimezone` cross-schema join сохранён (qualified `public.*`).
- [x] `withRubitimeApiThrottle` — те же интервалы и advisory session.
- [x] Подфазы 09A-09E выполнены последовательно, и для каждой есть запись проверки в LOG.
- [x] Для settings/json границ в файлах фазы нет `JSON.parse(... ) as unknown` без Zod (`safeParse`/`parse`).

## Scope

**Разрешено:** `apps/integrator/src/infra/db/repos/*` (P1+ list), `apps/integrator/src/config/*`, `apps/integrator/src/integrations/google-calendar/*`, `apps/integrator/src/integrations/rubitime/rubitimeApiThrottle.ts`, `apps/integrator/src/kernel/domain/executor/handlers/patientHomeMorningPing.ts`, тесты рядом.

**Вне scope:** `bookingProfilesRepo`, `outgoingDeliveryQueue`, merge repos (уже Wave 2); scripts `resync-*`, `stage6-*`.

## Файловый чеклист (пересмотреть после phase08)

| Файл | Подход |
|------|--------|
| `repos/idempotencyKeys.ts` | `runIntegratorSql` + `GATEWAY_IDEMPOTENCY_ALLOWED_TABLES` |
| `infra/db/parseMessengerIdTokens.ts` | shared Zod id-list parser (post-audit) |
| `infra/db/publicSystemSettings.ts` | `public.system_settings` read helper (09A) |
| `repos/platformUserDeliveryPhone.ts` | `runIntegratorSql` |
| `repos/patientHomeMorningPing.ts` | `runIntegratorSql` |
| `handlers/patientHomeMorningPing.ts` | shared settings helper |
| `repos/adminStats.ts` | `runIntegratorSql`; динамика — Class B |
| `repos/linkedPhoneSource.ts` | `public.system_settings` helper + Zod |
| `repos/resolvePlatformUserIdForRubitimeBooking.ts` | `runIntegratorSql` |
| `repos/canonicalUserId.ts` | `runIntegratorSql` |
| `repos/integrationDataQualityIncidents.ts` | `runIntegratorSql` |
| `branchTimezone.ts` | `runIntegratorSql` join |
| `messengerStaffIds.ts` | `public.system_settings` helper + Zod |
| `adminIncidentAlertRelay.ts` | `public.system_settings` helper + Zod |
| `config/smtpOutbound.ts` | `public.system_settings` helper + Zod |
| `operationalVerboseLog.ts` | settings read |
| `config/appBaseUrl.ts` | settings + cache |
| `config/appTimezone.ts` | settings + cache |
| `gcal/calendarDescription.ts` | `runIntegratorSql` |
| `gcal/resolvePackageCalendarContext.ts` | `runIntegratorSql` |
| `gcal/runtimeConfig.ts` | `public.system_settings` helper + Zod |
| `rubitimeApiThrottle.ts` | `execute` on same client |

## Проверки

```bash
rg 'await db\.query' apps/integrator/src --glob '*.ts' \
  | rg -v 'migrate\.ts|/scripts/|client\.ts'
pnpm --dir apps/integrator run test -- --run idempotency adminStats branchTimezone rubitimeApiThrottle
pnpm --dir apps/integrator run typecheck
```

## Риски

| Риск | Митигация |
|------|-----------|
| Двойной канал settings | Те же таблицы/ключи; не трогать `settingsSyncRoute` write path |
| branchTimezone data-quality | Сохранить fallback + incident hook |
| idempotency dynamic SQL | `GATEWAY_IDEMPOTENCY_ALLOWED_TABLES` + `idempotencyKeys.test.ts` |

## Закрытие (2026-06-06)

- Подфазы **09A–09E** выполнены последовательно; prod `await db.query` (exclude `client.ts` health, `migrate.ts`, scripts) → **0**.
- Helper `publicSystemSettings.ts`, transport `runIntegratorSql.ts`, shared `parseMessengerIdTokens.ts`.
- Integrator suite: **1054 tests** passed; typecheck green.

## Post-audit / remarks closure (2026-06-06)

- **Zod id-lists:** `parseMessengerIdTokens` вместо `JSON.parse(...) as unknown` в `messengerStaffIds` / `adminIncidentAlertRelay`.
- **Idempotency whitelist:** экспорт `GATEWAY_IDEMPOTENCY_ALLOWED_TABLES`.
- **Тесты:** `parseMessengerIdTokens`, `platformUserDeliveryPhone`, `adminStats`, `idempotencyKeys`, `appBaseUrl` (cache).
- Журнал: [LOG.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/LOG.md) § «Post-audit closure».
