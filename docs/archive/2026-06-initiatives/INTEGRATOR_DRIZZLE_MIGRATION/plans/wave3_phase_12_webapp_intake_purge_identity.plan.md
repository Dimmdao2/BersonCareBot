---
name: Wave3 Phase12 Webapp intake purge identity
overview: Высокий риск — online intake, full purge, identity resolution, phone bind, merge preview, integrator-merge route.
status: completed
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
    status: completed
  - id: w3-p12-verify
    content: "12E: devDb integration tests purge/intake/merge; rg ноль по raw query в scope фазы."
    status: completed
---

# Wave 3 — фаза 12: Intake, purge, identity

## Размер

**L** — отдельный PR; не смешивать с booking.

## Подфазы (обязательный порядок)

### 12A — intake core

- Файл: `infra/repos/pgOnlineIntake.ts`.
- Цель: убрать прямой query-tail без изменения advisory semantics.
- **Закрытие (2026-06-06):** domain SQL → `runWebappPgText` / `runIntakePgText`; Class C TX + `pgAdvisoryXactLockShared` без изменений; `pool.query` = 0.
- **Post-audit (2026-06-06):** opt-in devDb read-only — `pgOnlineIntake.devDb.integration.test.ts` (`listRequests`, `getById` null/round-trip).
- Проверка:
  - `pnpm --dir apps/webapp exec vitest run --project fast src/infra/repos/pgOnlineIntake.advisoryLock.test.ts`
  - opt-in devDb: `USE_REAL_DATABASE=1 RUN_ONLINE_INTAKE_DEV_DB=1 pnpm exec vitest run src/infra/repos/pgOnlineIntake.devDb.integration.test.ts`
  - `rg "pool\\.query" apps/webapp/src/infra/repos/pgOnlineIntake.ts` — 0; `rg "client\\.query" …` — 9× Class C TX (+ 1× JSDoc mention).

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

- Файлы: `platformUserFullPurge.ts`, `platformUserMergePreview.ts`, `strictPlatformUserPurge.ts`, `platformUserPurgeSql.ts`.
- Цель: безопасная TX-migration без потери семантики удаления/preview.
- **Закрытие (2026-06-06):** domain SQL → `runPurgeClientPgText` / `runPurgePoolPgText` / `runPgPoolPgText`; Class C TX (`BEGIN`/`COMMIT`/`ROLLBACK`) только в `deleteIntegratorPhoneData` + `strictPlatformUserPurge`; merge preview — read-only через executor (`pool.query` = 0).
- **Post-audit (2026-06-06):** bridge tests — phone-keyed purge, integrator projection; load tests — `searchMergeCandidates` / `searchMergeUsersForManualMerge`; devDb read-only — `platformUserFullPurge.devDb.integration.test.ts` (unknown id + row load), `platformUserMergePreview.devDb.integration.test.ts` (empty query + phone search + same_id); `strictPlatformUserPurge` mock `fetchMessengerBindings`.
- Проверка:
  - `pnpm --dir apps/webapp exec vitest run --project fast src/infra/platformUserFullPurge.bridge.test.ts src/infra/platformUserMergePreview.load.test.ts src/infra/platformUserMergePreview.test.ts src/infra/strictPlatformUserPurge.test.ts`
  - opt-in devDb: `USE_REAL_DATABASE=1 RUN_PURGE_DEV_DB=1` / `RUN_MERGE_PREVIEW_DEV_DB=1` — см. `platformUserFullPurge.devDb.integration.test.ts`, `platformUserMergePreview.devDb.integration.test.ts`
  - `rg 'pool\.query' apps/webapp/src/infra/platformUserFullPurge.ts apps/webapp/src/infra/platformUserMergePreview.ts` — 0

### 12E — phase verify

- Цель: контроль остатка raw SQL по scope фазы и финальная фиксация в LOG/RAW_SQL.
- **Закрытие (2026-06-06):** `pool.query` = 0 по всему scope фазы 12 (включая `app-layer/platform-user/*` → `runPgPoolPgText`); Class C `client.query` только intake (9× runtime + JSDoc), integrator merge (11×), purge integrator TX (3×), strict purge (3×). Vitest `--project fast` phase-12 bundle — **115 passed** (13 CI files); opt-in devDb — **8 skipped** без env (3 intake + 2 purge + 3 preview).
- **Post-audit tails (2026-06-06):** `pgOnlineIntake.devDb.integration.test.ts`; расширены `platformUserFullPurge.devDb` / `platformUserMergePreview.devDb`; docs sync (`LOG`, `RAW_SQL`, `DRIZZLE_TRANSITION_PLAN`, `wave3_INDEX`, `docs/README.md`).
- **Следующая фаза:** [wave3_phase_13_webapp_booking_doctor.plan.md](./wave3_phase_13_webapp_booking_doctor.plan.md).
- Проверка:
  - `rg 'pool\.query'` по scope-файлам фазы — 0
  - `pnpm --dir apps/webapp exec vitest run --project fast` (13 CI files + 3 opt-in devDb) — см. блок **12E** ниже

## Definition of Done

- [x] Нет `pool.query` / `client.query` в файлах фазы (кроме Class C advisory/TX с ADR).
- [x] `platformUserFullPurge` / `pgOnlineIntake` — существующие integration tests зелёные.
- [x] Merge preview не ломает `platform-merge` consumer contract (merge engine остаётся pg в package).
- [x] В identity/merge ветках все внешние payload/row-shape проходят Zod-валидацию.
- [x] Подфазы 12A-12E закрыты последовательно, каждая с записью проверки в LOG.

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

**12D (закрыто):**

```bash
rg 'pool\.query' apps/webapp/src/infra/platformUserFullPurge.ts apps/webapp/src/infra/platformUserMergePreview.ts  # 0
rg 'client\.query' apps/webapp/src/infra/platformUserFullPurge.ts  # 3× Class C integrator TX
rg 'client\.query' apps/webapp/src/infra/strictPlatformUserPurge.ts  # 3× Class C + advisory
pnpm --dir apps/webapp exec vitest run --project fast src/infra/platformUserFullPurge.bridge.test.ts src/infra/platformUserMergePreview.load.test.ts src/infra/platformUserMergePreview.test.ts src/infra/strictPlatformUserPurge.test.ts
```

**12E (закрыто):**

```bash
# pool.query = 0 по scope фазы 12
rg 'pool\.query' apps/webapp/src/infra/repos/pgOnlineIntake.ts apps/webapp/src/infra/platformUserFullPurge.ts apps/webapp/src/infra/platformUserMergePreview.ts apps/webapp/src/infra/repos/pgUserByPhone.ts apps/webapp/src/infra/repos/pgIdentityResolution.ts apps/webapp/src/infra/repos/pgPhoneMessengerBind.ts apps/webapp/src/infra/integratorPlatformUserMerge.ts apps/webapp/src/infra/strictPlatformUserPurge.ts apps/webapp/src/app/api/doctor/clients/integrator-merge/route.ts apps/webapp/src/app-layer/platform-user/resolveOrCreateUserByPhone.ts apps/webapp/src/app-layer/platform-user/recordPublicBookingMergeCandidates.ts

pnpm --dir apps/webapp exec vitest run --project fast \
  src/infra/repos/pgOnlineIntake.advisoryLock.test.ts \
  src/infra/repos/pgUserByPhone.test.ts src/infra/repos/pgUserByPhone.createOrBind.test.ts \
  src/infra/repos/pgIdentityResolution.test.ts src/infra/repos/identityPhoneRowSchemas.test.ts \
  src/modules/auth/phoneMessengerBind.test.ts \
  src/infra/integratorPlatformUserMerge.test.ts src/infra/integratorPlatformUserMergeSchemas.test.ts \
  src/app/api/doctor/clients/integrator-merge/route.test.ts \
  src/infra/platformUserFullPurge.bridge.test.ts src/infra/platformUserMergePreview.load.test.ts \
  src/infra/platformUserMergePreview.test.ts src/infra/strictPlatformUserPurge.test.ts
# opt-in devDb (read-only): USE_REAL_DATABASE=1 + DATABASE_URL
#   RUN_ONLINE_INTAKE_DEV_DB=1  → pgOnlineIntake.devDb.integration.test.ts
#   RUN_PURGE_DEV_DB=1          → platformUserFullPurge.devDb.integration.test.ts
#   RUN_MERGE_PREVIEW_DEV_DB=1  → platformUserMergePreview.devDb.integration.test.ts
```
