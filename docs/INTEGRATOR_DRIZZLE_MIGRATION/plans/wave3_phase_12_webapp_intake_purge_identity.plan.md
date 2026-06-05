---
name: Wave3 Phase12 Webapp intake purge identity
overview: Высокий риск — online intake, full purge, identity resolution, phone bind, merge preview, integrator-merge route.
status: in_progress
isProject: false
todos:
  - id: w3-p12a-intake
    content: "12A: pgOnlineIntake.ts (33) — runWebappSql + advisory parity, integration tests."
    status: completed
  - id: w3-p12b-identity-phone
    content: "12B: pgUserByPhone (21), pgIdentityResolution (12), pgPhoneMessengerBind (20) + Zod boundary checks."
    status: completed
  - id: w3-p12c-merge-route
    content: "12C: app/api/doctor/clients/integrator-merge/route.ts (14) — thin route, SQL в infra/service."
    status: completed
  - id: w3-p12d-purge-preview
    content: "12D: platformUserFullPurge.ts (40), platformUserMergePreview.ts (24), strictPlatformUserPurge.ts — TX Class B и безопасные dry-run semantics."
    status: pending
  - id: w3-p12-verify
    content: "12E: devDb integration tests purge/intake/merge; rg ноль по raw query в scope фазы."
    status: pending
---

# Wave 3 — фаза 12: Intake, purge, identity

## Размер

**L** — отдельный PR; не смешивать с booking.

## Подфазы (обязательный порядок)

### 12A — intake core

- Файл: `infra/repos/pgOnlineIntake.ts`.
- Цель: убрать прямой query-tail без изменения advisory semantics.
- **Закрытие (2026-06-06):** domain SQL → `runWebappPgText` / `runIntakePgText`; Class C TX + `pgAdvisoryXactLockShared` без изменений; `pool.query` = 0.
- Проверка:
  - `pnpm --dir apps/webapp exec vitest run --project fast src/infra/repos/pgOnlineIntake.advisoryLock.test.ts`
  - `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos/pgOnlineIntake.ts` — только Class C TX (9×) + JSDoc.

### 12B — identity and phone bind

- Файлы: `pgUserByPhone.ts`, `pgIdentityResolution.ts`, `pgPhoneMessengerBind.ts`, `identityPhoneRowSchemas.ts`, `identityPhoneSql.ts`.
- Цель: унифицировать query execution и валидацию входов/rows через Zod.
- **Закрытие (2026-06-06):** domain SQL → `runIdentityPoolPgText` / `runIdentityClientPgText` / `runPgPoolPgTextOnPool`; Zod row-shape + input boundary в `identityPhoneRowSchemas`; `pool.query` = 0; platform-merge bridge через executor на `PoolClient`.
- **Post-audit (2026-06-06):** `pgUserByPhone.createOrBind.test.ts`; расширены `pgIdentityResolution` / `identityPhoneRowSchemas` tests; Zod на `ChannelContext`, `findOrCreate` params, resolution hints.
- Проверка:
  - `pnpm --dir apps/webapp exec vitest run --project fast src/infra/repos/pgUserByPhone.test.ts src/infra/repos/pgUserByPhone.createOrBind.test.ts src/infra/repos/pgIdentityResolution.test.ts src/infra/repos/identityPhoneRowSchemas.test.ts src/modules/auth/phoneMessengerBind.test.ts`
  - `rg "pool\\.query" apps/webapp/src/infra/repos/pgUserByPhone.ts apps/webapp/src/infra/repos/pgIdentityResolution.ts apps/webapp/src/infra/repos/pgPhoneMessengerBind.ts` — 0
  - `rg "JSON\\.parse\\(|as unknown" …` — 0

### 12C — integrator-merge route thinness

- Файл: `app/api/doctor/clients/integrator-merge/route.ts`.
- Цель: route остаётся thin, SQL остаётся в infra/service.
- **Закрытие (2026-06-06):** orchestration → `infra/integratorPlatformUserMerge.ts` (рядом с `manualMergeIntegratorGate.ts`, не repo-port); Zod body + integrator HTTP error → `integratorPlatformUserMergeSchemas.ts`; domain SQL → `runIdentityClientPgText`; Class C TX (`BEGIN`/`COMMIT`/`ROLLBACK`) в service; route — auth, v2 flag, parse body, map HTTP.
- **Post-audit (2026-06-06):** precheck / unconfigured / generic M2M / orphan_clear_race / unexpected ROLLBACK — service tests; route — `invalid_body`, `same_id`, `dryRun`; `integratorPlatformUserMergeSchemas.test.ts`; `parseIntegratorMergeHttpDetails` — parity `details` с legacy.
- Проверка:
  - `pnpm --dir apps/webapp exec vitest run --project fast src/infra/integratorPlatformUserMerge.test.ts src/infra/integratorPlatformUserMergeSchemas.test.ts src/app/api/doctor/clients/integrator-merge/route.test.ts`
  - `rg "pool\\.query|client\\.query|db\\.query" apps/webapp/src/app/api/doctor/clients/integrator-merge/route.ts` — 0

### 12D — purge and merge preview

- Файлы: `platformUserFullPurge.ts`, `platformUserMergePreview.ts`, `strictPlatformUserPurge.ts`.
- Цель: безопасная TX-migration без потери семантики удаления/preview.
- Проверка:
  - devDb tests purge/preview.
  - dry-run path подтверждён тестом.

### 12E — phase verify

- Цель: контроль остатка raw SQL по scope фазы и финальная фиксация в LOG/RAW_SQL.
- Проверка:
  - `rg -l "pool\\.query|client\\.query" apps/webapp/src --glob "*.ts"` + фильтр по scope фазы.
  - targeted suite для intake/purge/merge.

## Definition of Done

- [ ] Нет `pool.query` / `client.query` в файлах фазы (кроме Class C advisory/TX с ADR).
- [ ] `platformUserFullPurge` / `pgOnlineIntake` — существующие integration tests зелёные.
- [ ] Merge preview не ломает `platform-merge` consumer contract (merge engine остаётся pg в package).
- [ ] В identity/merge ветках все внешние payload/row-shape проходят Zod-валидацию.
- [ ] Подфазы 12A-12E закрыты последовательно, каждая с записью проверки в LOG.

## Scope

| Файл | queries |
|------|---------|
| `infra/repos/pgOnlineIntake.ts` | 33 |
| `infra/platformUserFullPurge.ts` | 40 |
| `infra/platformUserMergePreview.ts` | 24 |
| `infra/repos/pgUserByPhone.ts` | 21 |
| `infra/repos/pgPhoneMessengerBind.ts` | 20 |
| `infra/repos/pgIdentityResolution.ts` | 12 |
| `app/api/doctor/clients/integrator-merge/route.ts` | 14 |
| `infra/strictPlatformUserPurge.ts` | 6 (если не в P11) |
| `app-layer/platform-user/*` | 1–2 each |

**Вне scope:** `packages/platform-merge` implementation.

## Стратегия

1. **intake** первым — изолированный домен, advisory уже унифицирован.
2. **identity/phone** — второй блок; shared helpers с auth ports.
3. **purge/preview** — последним в PR; максимальные integration tests.

## Риски

| Риск | Митигация |
|------|-----------|
| Потеря данных purge | devDb tests + dry-run flags |
| Race intake | advisory lock tests (existing) |
| integrator-merge route fat | вынести в `infra/*` service (`integratorPlatformUserMerge.ts`) |

## Проверки

**12A (закрыто):**

```bash
rg 'pool\.query' apps/webapp/src/infra/repos/pgOnlineIntake.ts   # 0
rg 'client\.query' apps/webapp/src/infra/repos/pgOnlineIntake.ts # 9× Class C TX
pnpm --dir apps/webapp exec vitest run --project fast src/infra/repos/pgOnlineIntake.advisoryLock.test.ts
```

**12B (закрыто):**

```bash
rg 'pool\.query' apps/webapp/src/infra/repos/pgUserByPhone.ts apps/webapp/src/infra/repos/pgIdentityResolution.ts apps/webapp/src/infra/repos/pgPhoneMessengerBind.ts  # 0
pnpm --dir apps/webapp exec vitest run --project fast src/infra/repos/pgUserByPhone.test.ts src/infra/repos/pgUserByPhone.createOrBind.test.ts src/infra/repos/pgIdentityResolution.test.ts src/infra/repos/identityPhoneRowSchemas.test.ts src/modules/auth/phoneMessengerBind.test.ts
```

**12C (закрыто):**

```bash
rg 'pool\.query|client\.query|db\.query' apps/webapp/src/app/api/doctor/clients/integrator-merge/route.ts  # 0
rg 'pool\.query' apps/webapp/src/infra/integratorPlatformUserMerge.ts  # 0
pnpm --dir apps/webapp exec vitest run --project fast src/infra/integratorPlatformUserMerge.test.ts src/infra/integratorPlatformUserMergeSchemas.test.ts src/app/api/doctor/clients/integrator-merge/route.test.ts
```

**12E (финал фазы):**

```bash
rg 'pool\.query|client\.query' apps/webapp/src/infra/platformUserFullPurge.ts apps/webapp/src/infra/repos/pgOnlineIntake.ts
pnpm --dir apps/webapp exec vitest run --project fast pgOnlineIntake pgPlatformUserMerge strictPlatformUserPurge 2>/dev/null | tail -20
```
