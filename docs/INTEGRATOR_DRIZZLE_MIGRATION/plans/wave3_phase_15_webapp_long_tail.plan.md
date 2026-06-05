---
name: Wave3 Phase15 Webapp long tail
overview: Остаток webapp — references, settings, symptom diary, treatment tail, email auth ports, integrator push, routes, messengerPhoneHttpBindExecute (по решению DECISIONS).
status: pending
isProject: false
todos:
  - id: w3-p15-refs-settings
    content: "pgReferences (17), pgSystemSettings (7), pgSymptomDiary (18), configAdapter."
    status: pending
  - id: w3-p15-treatment
    content: "pgTreatmentProgram (3), pgTreatmentProgramItemSnapshot (1) — instance/events уже Drizzle."
    status: pending
  - id: w3-p15-email-auth-ports
    content: "pgEmailSetupFlowPort, pgEmailPasswordLookup, pgUserPasswordCredentials, pgOAuthBindings, pgLoginTokens, pgPhoneChallengeStore, pgEmailSetupTokens."
    status: pending
  - id: w3-p15-integrator-push
    content: "integratorPushOutbox.ts — db.query на Pool → Drizzle public.integrator_push_outbox."
    status: pending
  - id: w3-p15-messenger-bind
    content: "messengerPhoneHttpBindExecute — мигрировать на Drizzle executor + Zod boundary validation."
    status: pending
  - id: w3-p15-routes-tail
    content: "api/media/upload, admin users profile, recordPublicBookingMergeCandidates, resolveOrCreateUserByPhone."
    status: pending
  - id: w3-p15-verify
    content: "rg webapp prod — целевой ноль unexplained pool.query; список Class B/C в RAW_SQL."
    status: pending
---

# Wave 3 — фаза 15: Webapp long tail

## Размер

**M** (много файлов, малый query count каждый).

## Definition of Done

- [ ] После фазы: `rg 'pool\.query|client\.query' apps/webapp/src` → только файлы с **явной** Class C пометкой в RAW_SQL.
- [ ] `integratorPushOutbox` на Drizzle model из `apps/webapp/db/schema`.
- [ ] `messengerPhoneHttpBindExecute` без прямого `pool.query`/`client.query`, с Zod-валидацией критичных payload/rows.

## Scope — остаток после фаз 11–14

Типичные файлы (2026-06-05):

| Файл | queries |
|------|---------|
| `pgReferences.ts` | 17 |
| `pgSymptomDiary.ts` | 18 |
| `pgSystemSettings.ts` | 7 |
| `pgUserPasswordCredentials.ts` | 12 |
| `pgEmailSetupFlowPort.ts` | 9 |
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
