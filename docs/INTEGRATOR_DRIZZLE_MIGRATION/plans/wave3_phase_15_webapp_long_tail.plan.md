---
name: Wave3 Phase15 Webapp long tail
overview: Остаток webapp — references, settings, symptom diary, treatment tail, email auth ports, integrator push, routes, messengerPhoneHttpBindExecute (по решению DECISIONS).
status: pending
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
    status: pending
  - id: w3-p15d-integrator-push
    content: "15D: integratorPushOutbox.ts — db.query на Pool -> Drizzle public.integrator_push_outbox."
    status: pending
  - id: w3-p15e-messenger-bind-and-routes
    content: "15E: messengerPhoneHttpBindExecute + routes tail (api/media/upload, admin users profile, recordPublicBookingMergeCandidates, resolveOrCreateUserByPhone)."
    status: pending
  - id: w3-p15-verify
    content: "15F: rg webapp prod — целевой ноль unexplained pool.query; список Class B/C в RAW_SQL и LOG."
    status: pending
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

### 15C — treatment and minor infra tails

- Файлы: `pgTreatmentProgram.ts`, `pgTreatmentProgramItemSnapshot.ts`, `pgMaterialRating.ts`, `pgUserPins.ts`, `pgPhoneHistory.ts`.
- Цель: закрыть остатки малого объёма запросов.
- Проверка:
  - targeted tests treatment/material rating/pins.

### 15D — integrator push outbox

- Файл: `infra/integrator-push/integratorPushOutbox.ts`.
- Цель: перевести `.query(` на Drizzle-модель `public.integrator_push_outbox`.
- Проверка:
  - integration tests push outbox producer/consumer contract;
  - `rg "\\.query\\(" apps/webapp/src/infra/integrator-push/integratorPushOutbox.ts`.

### 15E — messenger bind and routes tail

- Файлы: `messengerPhoneHttpBindExecute.ts` + route tails из scope.
- Цель: убрать прямой query в bind-TX с сохранением семантики и Zod boundary validation.
- Проверка:
  - targeted tests bind/phone merge;
  - route thinness check (SQL вне route handlers).

### 15F — phase verify

- Цель: финально зафиксировать raw SQL остаток и Class B/C список.
- Проверка:
  - `rg -l "pool\\.query|client\\.query" apps/webapp/src --glob "*.ts" | rg -v "\\.test\\.ts"`
  - update `RAW_SQL_INVENTORY.md` + запись в `LOG.md`.

## Definition of Done

- [ ] После фазы: `rg 'pool\.query|client\.query' apps/webapp/src` → только файлы с **явной** Class C пометкой в RAW_SQL.
- [ ] `integratorPushOutbox` на Drizzle model из `apps/webapp/db/schema`.
- [ ] `messengerPhoneHttpBindExecute` без прямого `pool.query`/`client.query`, с Zod-валидацией критичных payload/rows.
- [ ] Подфазы 15A-15F закрыты последовательно и отражены в LOG.

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
| `pgMaterialRating.ts` | 3 |
| `pgTreatmentProgram.ts` | 3 |
| `pgUserPins.ts` | 4 |
| `pgPhoneHistory.ts` | 2 |
| `pgTreatmentProgramItemSnapshot.ts` | 1 |
| `integratorPushOutbox.ts` | db.query (все методы) |
| `messengerPhoneHttpBindExecute.ts` | 5 |
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
rg -l 'pool\.query|client\.query' apps/webapp/src --glob '*.ts' | rg -v '\.test\.ts'
rg '\.query\(' apps/webapp/src/infra/integrator-push/integratorPushOutbox.ts
```

## Закрытие 15A (2026-06-06)

| Подфаза | Итог |
|---------|------|
| **15A** | `pgReferences`, `pgSystemSettings`, `pgSymptomDiary` → `runWebappPgText`; `saveCatalog` / `upsertManyInTransaction` → `runWebappTransaction`; `configAdapter` — уже P11 |

**Gate 15A:** `rg pool.query|client.query` по трём repo-файлам → **0**.

**Tests:** `pgReferences.repo.test.ts`, `pgSystemSettings.repo.test.ts`, `pgSymptomDiary.repo.test.ts` + `configAdapter.test.ts`, `inMemoryReferences.test.ts`, `symptom-service.test.ts` — **33 passed** (fast). DevDb smokes — opt-in; staging — gate **phase 17**.

**Остаток webapp (post-15A):** **42** prod-файла с `pool.query`/`client.query` (цель 15F — только Class C с пометкой в RAW_SQL).

**Документация (sync 15A):** [../LOG.md](../LOG.md) §Wave 3 phase 15A; [wave3_INDEX.md](./wave3_INDEX.md); [README.md](./README.md); [../DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md); [../RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md) §Wave 3 phase 15A.

## Закрытие 15B (2026-06-06)

| Подфаза | Итог |
|---------|------|
| **15B** | 7 auth/email repos → `runWebappPgText`; TX (`applyEmailSetupCompletion`, `registerPendingVerification`, email duplicate merge) → `runWebappTransaction` |

**Gate 15B:** `rg pool.query|client.query` по 7 repo-файлам → **0**.

**Tests:** `pgAuthEmailPorts15B.repo.test.ts` + `pgEmailSetupAccessPort.test.ts` + `oauth/callback/route.test.ts` + `email-password/register` + `email-setup.routes` + `emailSetupFlow/service` — **52 passed** (fast).

**Остаток webapp (post-15B):** **35** prod-файла с `pool.query`/`client.query`.

**Документация (sync 15B):** [../LOG.md](../LOG.md) §Wave 3 phase 15B; [wave3_INDEX.md](./wave3_INDEX.md); [README.md](./README.md); [../DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md); [../RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md) §Wave 3 phase 15B.

## Следующая подфаза

**15C** — treatment and minor tails (`pgTreatmentProgram`, `pgTreatmentProgramItemSnapshot`, `pgMaterialRating`, `pgUserPins`, `pgPhoneHistory`).
