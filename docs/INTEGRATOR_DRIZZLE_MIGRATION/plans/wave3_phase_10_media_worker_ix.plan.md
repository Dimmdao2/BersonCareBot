---
name: Wave3 Phase10 Media worker IX
overview: media-worker processTranscodeJob/processProgramSubmissionTranscode/watermark/pipeline — Class B execute; claim.ts permanent pg.
status: pending
isProject: false
todos:
  - id: w3-p10-executor
    content: "Minimal sql executor на существующем Pool (без shared schema package) — helper в media-worker."
    status: pending
  - id: w3-p10-process-transcode
    content: "processTranscodeJob.ts — status updates/joins через executor."
    status: pending
  - id: w3-p10-process-program
    content: "processProgramSubmissionTranscode.ts — то же."
    status: pending
  - id: w3-p10-settings-reads
    content: "watermarkEnabled.ts, pipelineEnabled.ts — settings через executor."
    status: pending
  - id: w3-p10-claim-adr
    content: "claim.ts без изменений; ADR в RAW_SQL если ещё нет."
    status: pending
  - id: w3-p10-verify
    content: "pnpm --dir apps/media-worker test; rg pool.query (expect claim only)."
    status: pending
---

# Wave 3 — фаза 10: Media-worker (фаза IX)

## Размер

**M**

## Definition of Done

- [ ] `processTranscodeJob.ts`, `processProgramSubmissionTranscode.ts`, `watermarkEnabled.ts`, `pipelineEnabled.ts` — нет прямого `pool.query`; SQL идёт через minimal executor (Class B).
- [ ] `claim.ts` — **без изменений**; тесты `claim.test.ts` зелёные.
- [ ] **Нет** нового shared schema package в monorepo.
- [ ] LOG: «shared schema package — backlog вне Wave 3».
- [ ] Флаги/JSON из `system_settings` в worker проходят через Zod-валидацию (без unsafe cast).

## Scope

**Разрешено:** `apps/media-worker/src/**` (кроме изменения семантики claim).

**Вне scope:** webapp `pgMediaTranscodeJobs` (уже Wave 2 P5); DDL migrations.

## Решение из Wave 2 P8 (подтверждено кодом)

- Worker остаётся на `pg.Pool`.
- Claim: `FOR UPDATE SKIP LOCKED` — **Class C**.
- Фаза 10: только post-claim processing SQL.

## Подход к executor

```text
Pool → thin runMediaWorkerSql(pool, sqlFragment)
```

Не дублировать `apps/webapp/db/schema` — использовать `sql` tagged + qualified table names (`public.media_transcode_jobs`).

## Inventory (2026-06-05)

| Файл | pool.query count |
|------|------------------|
| `jobs/claim.ts` | 8 — **keep** |
| `processTranscodeJob.ts` | 10 — migrate |
| `processProgramSubmissionTranscode.ts` | 7 — migrate |
| `watermarkEnabled.ts` | 1 — migrate |
| `pipelineEnabled.ts` | 1 — migrate |

## Проверки

```bash
rg 'pool\.query' apps/media-worker/src --glob '*.ts'
pnpm --dir apps/media-worker run test
pnpm --dir apps/media-worker run typecheck
```

## Открытое

- E2E staging multipart→claim — обязательный gate в фазе 16.
