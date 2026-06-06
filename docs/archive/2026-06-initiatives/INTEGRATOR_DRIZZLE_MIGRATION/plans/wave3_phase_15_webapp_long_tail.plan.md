---
name: Wave3 Phase15 Webapp long tail
overview: Остаток webapp — references, settings, symptom diary, treatment tail, email auth ports, integrator push, routes, messengerPhoneHttpBindExecute (по решению DECISIONS).
status: completed
isProject: false
todos:
  - id: w3-p15a-refs-settings-diary
    content: "15A: pgReferences (17), pgSystemSettings (7), pgSymptomDiary (18), configAdapter — migration batch."
    status: completed
  - id: w3-p15b-auth-email-ports
    content: "15B: pgEmailSetupFlowPort, pgEmailPasswordLookup, pgUserPasswordCredentials, pgOAuthBindings, pgLoginTokens, pgPhoneChallengeStore, pgEmailSetupTokens."
    status: completed
  - id: w3-p15c-treatment-tail
    content: "15C: pgTreatmentProgram (3), pgTreatmentProgramItemSnapshot (1), pgMaterialRating, pgUserPins, pgPhoneHistory."
    status: completed
  - id: w3-p15d-integrator-push
    content: "15D: integratorPushOutbox.ts — db.query на Pool -> Drizzle public.integrator_push_outbox."
    status: completed
  - id: w3-p15e-messenger-bind-and-routes
    content: "15E: messengerPhoneHttpBindExecute + routes tail (api/media/upload, admin users profile, recordPublicBookingMergeCandidates, resolveOrCreateUserByPhone)."
    status: completed
  - id: w3-p15-verify
    content: "15F: rg webapp prod — целевой ноль unexplained pool.query; список Class B/C в RAW_SQL и LOG."
    status: completed
---

# Wave 3 — фаза 15: Webapp long tail

## Размер

**M** (много файлов, малый query count каждый).

## Подфазы (обязательный порядок)

### 15A — references/settings/diary (**done** 2026-06-06)

- Файлы: `pgReferences.ts`, `pgSystemSettings.ts`, `pgSymptomDiary.ts`, `configAdapter`.
- Цель: закрыть частые low/medium query paths.
- Проверка:
  - targeted tests references/diary/settings;
  - `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos/pgReferences.ts apps/webapp/src/infra/repos/pgSystemSettings.ts apps/webapp/src/infra/repos/pgSymptomDiary.ts`.
- **Итог:** `pool.query`/`client.query` = **0** в трёх repo; TX → `runWebappTransaction` (`saveCatalog`, `upsertManyInTransaction`); `configAdapter` без изменений (P11). Vitest 15A bundle — **33 passed** (fast).

### 15B — auth/email ports tail (**done** 2026-06-06)

- Файлы: `pgEmailSetupFlowPort`, `pgEmailPasswordLookup`, `pgUserPasswordCredentials`, `pgOAuthBindings`, `pgLoginTokens`, `pgPhoneChallengeStore`, `pgEmailSetupTokens`.
- Цель: убрать raw query из auth-tail без изменения auth contracts.
- Проверка:
  - fast tests auth/email flows;
  - parity по token/credential lookups.
- **Итог:** `pool.query`/`client.query` = **0** в 7 repo; TX → `runWebappTransaction`; email merge → `mergePlatformUsersInTransaction` через `PlatformMergeDbClient` bridge; conflict audit — `upsertOpenConflictLog(getPool())` (Class C в `adminAuditLog`). Vitest 15B bundle — repo parity (auth-state kinds, token/credential lookups, TX paths) + auth/email route/service tests — **green** (fast).

### 15C — treatment and minor infra tails (**done** 2026-06-06)

- Файлы: `pgTreatmentProgram.ts`, `pgTreatmentProgramItemSnapshot.ts`, `pgMaterialRating.ts`, `pgUserPins.ts`, `pgPhoneHistory.ts`.
- Цель: закрыть остатки малого объёма запросов.
- Проверка:
  - targeted tests treatment/material rating/pins.
- **Итог:** `pool.query`/`client.query` = **0** в 5 scope-repo; domain SQL → `runWebappPgText`; `pgPhoneHistory` — TX-scoped executor через `getWebappSqlFromPgClient`. Vitest 15C bundle — **26 passed** (fast).

### 15D — integrator push outbox (**done** 2026-06-06)

- Файл: `infra/integrator-push/integratorPushOutbox.ts`.
- Цель: перевести `.query(` на Drizzle-модель `public.integrator_push_outbox`.
- Проверка:
  - integration tests push outbox producer/consumer contract;
  - `rg "\\.query\\(" apps/webapp/src/infra/integrator-push/integratorPushOutbox.ts`.
- **Итог:** `db.query` = **0**; enqueue/complete/fail/reschedule → Drizzle `insert`/`update` на `integratorPushOutbox`; claim → `runWebappSql` + `execute(sql)` (SKIP LOCKED); Zod на claimed rows; PoolClient → `getWebappSqlFromPgClient`. Vitest 15D bundle — **22 passed** (fast).

### 15E — messenger bind and routes tail (**done** 2026-06-06)

- Файлы: `app-layer/integrator/messengerPhoneHttpBindExecute.ts` + route tails из scope.
- Цель: убрать прямой query в bind-TX с сохранением семантики и Zod boundary validation.
- Проверка:
  - targeted tests bind/phone merge;
  - route thinness check (SQL вне route handlers).
- **Итог:** `pool.query`/`client.query` = **0** в `messengerPhoneHttpBindExecute`; domain SQL → `runWebappPgText` + `getWebappSqlFromPgClient`; TX control → `runPgPoolPgText` (BEGIN/COMMIT/ROLLBACK); Zod (`bindInputSchema`, `mergedIntoRowSchema`, `integratorIdentityRowSchema`). Route tails: SQL вынесен в `pgAdminClientProfileConflicts`, `pgMediaFolderLookup`; `recordPublicBookingMergeCandidates` / `resolveOrCreateUserByPhone` — verify-only (P12E, runtime tests). Vitest 15E bundle — **26 passed** (fast): max `ensureIdentityForMessenger`, Zod-reject identity row, `MessengerPhoneLinkError` + audit/incident, route/repo/P12E runtime gates.

### 15F — phase verify (**done** 2026-06-06)

- Цель: финально зафиксировать raw SQL остаток и Class B/C список.
- Проверка:
  - `rg -l "pool\\.query|client\\.query" apps/webapp/src --glob "*.ts" | rg -v "\\.test\\.ts"`
  - update `RAW_SQL_INVENTORY.md` + запись в `LOG.md`.
- **Итог:** runtime tail **25** файлов (Class B pool **2** + Class B client **1** + Class C **22**); domain `pool.query` = **0** вне allowlist; `webappPhase15F.verify.test.ts` — **5 passed**; RAW_SQL baseline **78→25**; фаза **15 closed**.

## Definition of Done

- [x] После фазы: `rg 'pool\.query|client\.query' apps/webapp/src` → только файлы с **явной** Class B/C пометкой в RAW_SQL (**15F** 2026-06-06).
- [x] `integratorPushOutbox` на Drizzle model из `apps/webapp/db/schema` (**15D** 2026-06-06).
- [x] `messengerPhoneHttpBindExecute` без прямого `pool.query`/`client.query`, с Zod-валидацией критичных payload/rows (**15E** 2026-06-06).
- [x] Подфазы 15A-15F закрыты последовательно и отражены в LOG (**15F** 2026-06-06).

## Scope — остаток после фаз 11–14

Типичные файлы (2026-06-05):

| Файл | queries (baseline → post-15A) |
|------|---------|
| `pgReferences.ts` | 17 → **0** (P15A) |
| `pgSymptomDiary.ts` | 18 → **0** (P15A) |
| `pgSystemSettings.ts` | 7 → **0** (P15A) |
| `configAdapter.ts` | 0 (P11, вне diff 15A) |
| `pgUserPasswordCredentials.ts` | 12 → **0** (P15B) |
| `pgEmailSetupFlowPort.ts` | 9 → **0** (P15B) |
| `pgEmailPasswordLookup.ts` | 4 → **0** (P15B) |
| `pgOAuthBindings.ts` | 2 → **0** (P15B) |
| `pgLoginTokens.ts` | 5 → **0** (P15B) |
| `pgPhoneChallengeStore.ts` | 5 → **0** (P15B) |
| `pgEmailSetupTokens.ts` | 5 → **0** (P15B) |
| `pgMaterialRating.ts` | 3 → **0** (P15C) |
| `pgTreatmentProgram.ts` | 3 → **0** (P15C) |
| `pgUserPins.ts` | 4 → **0** (P15C) |
| `pgPhoneHistory.ts` | 2 → **0** (P15C) |
| `pgTreatmentProgramItemSnapshot.ts` | 1 → **0** (P15C) |
| `integratorPushOutbox.ts` | 4× `db.query` → **0** (P15D) |
| `app-layer/integrator/messengerPhoneHttpBindExecute.ts` | 5 → **0** (P15E) |
| `s3MediaStorage.ts` | 7 (TX only — Class C) |
| `mediaUploadSessionsRepo.ts` | 6 (verify P5) |
| `mediaPreviewWorker.ts` | 6 (verify P5) |
| `userLifecycleLock.ts` | 6 (advisory P3) |
| `multipartSessionLock.ts` | 3 (advisory P3) |
| `infra/db/client.ts` | 1 health |

**Вне scope:** повторная миграция LFK/reminders/media enqueue (Wave 2).

## messengerPhoneHttpBindExecute — решение фазы

Фиксированно: **мигрировать в Wave 3** (сохранить SQL-семантику bind-TX, убрать прямой `pool.query`, добавить Zod boundary validation).

## Проверки

```bash
rg -l 'pool\.query|client\.query' apps/webapp/src --glob '*.ts' | rg -v '\.test\.ts'  # 27 (25 runtime + 2 comment-only)
pnpm --dir apps/webapp exec vitest run --project fast \
  src/infra/repos/webappPhase15F.verify.test.ts \
  src/infra/repos/webappPhase15E.repo.test.ts \
  src/modules/integrator/messengerPhoneHttpBindExecute15E.test.ts \
  src/app/api/integrator/messenger-phone/bind/route.test.ts \
  src/infra/repos/pgReferences.repo.test.ts \
  src/infra/repos/pgAuthEmailPorts15B.repo.test.ts \
  src/infra/repos/pgTreatmentTail15C.repo.test.ts \
  src/infra/integrator-push/integratorPushOutbox.test.ts \
  src/infra/repos/pgDoctorAnalyticsMetricAccounts.test.ts
# ожидание: 93 passed (fast) — полный phase-15 closure bundle
```

## Закрытие 15A (2026-06-06)

| Подфаза | Итог |
|---------|------|
| **15A** | `pgReferences`, `pgSystemSettings`, `pgSymptomDiary` → `runWebappPgText`; `saveCatalog` / `upsertManyInTransaction` → `runWebappTransaction`; `configAdapter` — уже P11 |

**Gate 15A:** `rg pool.query|client.query` по трём repo-файлам → **0**.

**Tests:** `pgReferences.repo.test.ts`, `pgSystemSettings.repo.test.ts`, `pgSymptomDiary.repo.test.ts` + `configAdapter.test.ts`, `inMemoryReferences.test.ts`, `symptom-service.test.ts` — **33 passed** (fast). DevDb smokes — opt-in; staging — gate **phase 17**.

**Остаток webapp (post-15A):** **42** prod-файла с `pool.query`/`client.query` (цель 15F — только Class C с пометкой в RAW_SQL).

**Документация (sync 15A):** [../LOG.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/LOG.md) §Wave 3 phase 15A; [wave3_INDEX.md](./wave3_INDEX.md); [README.md](./README.md); [../DRIZZLE_TRANSITION_PLAN.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/DRIZZLE_TRANSITION_PLAN.md); [../RAW_SQL_INVENTORY.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/RAW_SQL_INVENTORY.md) §Wave 3 phase 15A.

## Закрытие 15B (2026-06-06)

| Подфаза | Итог |
|---------|------|
| **15B** | 7 auth/email repos → `runWebappPgText`; TX (`applyEmailSetupCompletion`, `registerPendingVerification`, email duplicate merge) → `runWebappTransaction` |

**Gate 15B:** `rg pool.query|client.query` по 7 repo-файлам → **0**.

**Tests:** `pgAuthEmailPorts15B.repo.test.ts` + `pgEmailSetupAccessPort.test.ts` + `oauth/callback/route.test.ts` + `email-password/register` + `email-setup.routes` + `emailSetupFlow/service` — **52 passed** (fast).

**Остаток webapp (post-15B):** **35** prod-файла с `pool.query`/`client.query`.

**Документация (sync 15B):** [../LOG.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/LOG.md) §Wave 3 phase 15B; [wave3_INDEX.md](./wave3_INDEX.md); [README.md](./README.md); [../DRIZZLE_TRANSITION_PLAN.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/DRIZZLE_TRANSITION_PLAN.md); [../RAW_SQL_INVENTORY.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/RAW_SQL_INVENTORY.md) §Wave 3 phase 15B.

## Закрытие 15C (2026-06-06)

| Подфаза | Итог |
|---------|------|
| **15C** | 5 treatment/minor repos → `runWebappPgText`; `pgPhoneHistory` — `getWebappSqlFromPgClient` на caller `PoolClient` |

**Gate 15C:** `rg pool.query|client.query` по 5 repo-файлам → **0**.

**Tests:** `pgTreatmentTail15C.repo.test.ts` (runtime + parity: pins, phone history TX, material rating, item snapshot) + `pgTreatmentProgram.test.ts` (usage summary + list preview) + `inMemoryMaterialRating.detail.test.ts` — **26 passed** (fast).

**Остаток webapp (post-15C):** **30** prod-файлов с `pool.query`/`client.query`.

**Документация (sync 15C):** [../LOG.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/LOG.md) §Wave 3 phase 15C; [wave3_INDEX.md](./wave3_INDEX.md); [README.md](./README.md); [../DRIZZLE_TRANSITION_PLAN.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/DRIZZLE_TRANSITION_PLAN.md); [../RAW_SQL_INVENTORY.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/RAW_SQL_INVENTORY.md) §Wave 3 phase 15C.

## Закрытие 15D (2026-06-06)

| Подфаза | Итог |
|---------|------|
| **15D** | `integratorPushOutbox.ts` → Drizzle `integratorPushOutbox` model; claim CTE — Class B `execute(sql)` |

**Gate 15D:** `rg '\.query\(' apps/webapp/src/infra/integrator-push/integratorPushOutbox.ts` → **0**.

**Tests:** `integratorPushOutbox.test.ts` (runtime + producer/consumer + Zod reject) + `runIntegratorPushWorkerTick.test.ts` (worker orchestration) + `syncToIntegrator.test.ts` + `notifyIntegrator.test.ts` — **22 passed** (fast).

**DoD (15D):** чекбокс `integratorPushOutbox` на Drizzle model — **закрыт**; §RAW_SQL раздел E — строка claim `execute(sql)`.

**Callers:** `syncToIntegrator`, `notifyIntegrator`, `runIntegratorPushWorkerTick` — без изменений сигнатур (`Pool \| PoolClient`).

**Документация (sync 15D):** [../LOG.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/LOG.md) §Wave 3 phase 15D; [wave3_INDEX.md](./wave3_INDEX.md); [README.md](./README.md); [../DRIZZLE_TRANSITION_PLAN.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/DRIZZLE_TRANSITION_PLAN.md); [../RAW_SQL_INVENTORY.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/RAW_SQL_INVENTORY.md) §Wave 3 phase 15D.

## Закрытие 15E (2026-06-06)

| Подфаза | Итог |
|---------|------|
| **15E** | `messengerPhoneHttpBindExecute` → `runWebappPgText` / `runPgPoolPgText`; route SQL → `pgAdminClientProfileConflicts`, `pgMediaFolderLookup` |

**Gate 15E:** `rg pool.query|client.query` по `app-layer/integrator/messengerPhoneHttpBindExecute.ts`, `api/media/upload/route.ts`, `api/admin/users/[userId]/profile/route.ts` → **0**.

**Tests:** `messengerPhoneHttpBindExecute15E.test.ts` (runtime + happy path + max CTE + Zod reject + blocked audit) + `webappPhase15E.repo.test.ts` (route/repo/P12E runtime gates + SQL parity) + `messenger-phone/bind/route.test.ts` — **26 passed** (fast).

**Verify-only (P12E):** `app-layer/platform-user/recordPublicBookingMergeCandidates.ts` и `app-layer/platform-user/resolveOrCreateUserByPhone.ts` — без `pool.query`; вызовы подтверждены в `app/api/booking/public/create/route.ts`.

**Остаток webapp (post-15E, `rg -l`):** **27** (incl. 2 comment-only); runtime **25** — финал **15F**.

**Документация (sync 15E):** [../LOG.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/LOG.md) §Wave 3 phase 15E; [wave3_INDEX.md](./wave3_INDEX.md); [README.md](./README.md); [../DRIZZLE_TRANSITION_PLAN.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/DRIZZLE_TRANSITION_PLAN.md); [../RAW_SQL_INVENTORY.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/RAW_SQL_INVENTORY.md) §Wave 3 phase 15E.

## Закрытие 15F (2026-06-06)

| Подфаза | Итог |
|---------|------|
| **15F** | Gate: domain `pool.query` = **0**; Class B (**3** raw-query files) + Class C (**22** TX files); verify test + RAW_SQL §15F |

**Gate 15F:** runtime tail **25** unique prod-файлов; `rg -l` **27** (incl. 2 comment-only: `pgBookingCatalog`, `pgDoctorAppointments`).

**Class B:** `runWebappSql.ts`, `client.ts` (health), `pgAdminPlatformUserStats.ts` (uuid[]).

**Class C (22):** intake, purge, merge, identity, user projection, comms, media TX, locks, channel link, doctor create/broadcast/motivation, appointments, s3 media.

**Tests:** `webappPhase15F.verify.test.ts` — **5 passed**; phase 15 closure bundle — **93 passed** (fast).

**Документация (sync 15F):** [../LOG.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/LOG.md) §Wave 3 phase 15F + §phase 15 итог; [wave3_INDEX.md](./wave3_INDEX.md); [README.md](./README.md); [../DRIZZLE_TRANSITION_PLAN.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/DRIZZLE_TRANSITION_PLAN.md); [../RAW_SQL_INVENTORY.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/RAW_SQL_INVENTORY.md) §Wave 3 phase 15F.

#### Post-audit closure 15F (2026-06-06)

- **RAW_SQL §15E:** уточнён `rg -l` **27** vs runtime **25** (comment-only `pgBookingCatalog`, `pgDoctorAppointments`).
- **RAW_SQL §15F:** migrated scope gate — только `pool.query`/`client.query` (не Drizzle relational `db.query.*`).
- **Closure bundle:** **93 passed** (15F + 15E incl. bind route + 15A–15D + analytics read-source); команда в §Проверки.
- **HEAD bleed fix:** `pgDoctorAnalyticsMetricAccounts.ts` — `resolveReadSource` + legacy exclusion + unit test `rubitime_legacy` path.
- **Plan remark closure:** verify-only P12E пути зафиксированы явно (`app-layer/platform-user/*`) вместо неявных ссылок.

## Следующая фаза Wave 3

**16** — [wave3_phase_16_legacy_cutover.plan.md](./wave3_phase_16_legacy_cutover.plan.md) (legacy migration dependency cutover).
