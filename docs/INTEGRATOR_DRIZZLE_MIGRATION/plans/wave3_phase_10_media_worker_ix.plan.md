---
name: Wave3 Phase10 Media worker IX
overview: media-worker processTranscodeJob/processProgramSubmissionTranscode/watermark/pipeline — Class B execute; claim.ts permanent pg.
status: pending
isProject: false
todos:
  - id: w3-p10a-preflight
    content: "10A: preflight перед кодом — зафиксировать SQL inventory media-worker, подготовить executor contract, список инвариантов claim/transcode."
    status: pending
  - id: w3-p10b-runtime
    content: "10B: minimal sql executor + миграция processTranscodeJob/processProgramSubmissionTranscode/watermarkEnabled/pipelineEnabled на executor."
    status: pending
  - id: w3-p10c-ops-prep
    content: "10C: подготовить staging smoke pack (чеклист, команды, expected logs/queries, rollback hints) для обязательного gate фазы 17."
    status: pending
  - id: w3-p10-claim-adr
    content: "claim.ts без изменений; ADR в RAW_SQL если ещё нет."
    status: pending
  - id: w3-p10-verify
    content: "После 10A-10C: pnpm --dir apps/media-worker test; rg pool.query (expect claim only); smoke pack приложен в LOG."
    status: pending
---

# Wave 3 — фаза 10: Media-worker (фаза IX)

## Размер

**M**

## Подфазы (обязательный порядок)

### 10A — preflight

- Зафиксировать baseline:
  - `jobs/claim.ts` — permanent Class C.
  - `processTranscodeJob.ts`, `processProgramSubmissionTranscode.ts`, `watermarkEnabled.ts`, `pipelineEnabled.ts` — target migration.
- Подготовить "инварианты поведения":
  - те же статусы/transition graph;
  - те же условия retry/fail;
  - те же условия чтения feature flags из `system_settings`.
- Проверка:
  - `rg "pool\\.query" apps/media-worker/src --glob "*.ts"`
  - `pnpm --dir apps/media-worker run test -- --run claim`

### 10B — runtime migration

- Ввести thin helper `runMediaWorkerSql` на текущем `pg.Pool`.
- Перевести:
  - `processTranscodeJob.ts`
  - `processProgramSubmissionTranscode.ts`
  - `watermarkEnabled.ts`
  - `pipelineEnabled.ts`
- Ограничение: без shared schema package, без изменения семантики claim.
- Проверка:
  - `rg "pool\\.query" apps/media-worker/src --glob "*.ts"`
  - `pnpm --dir apps/media-worker run test`
  - `pnpm --dir apps/media-worker run typecheck`

### 10C — operational prep for staging smoke

- Подготовить "smoke pack" (док/LOG-блок) для фазы 17:
  - шаги multipart upload -> enqueue -> claim -> transcode done/failed;
  - какие логи смотреть (`media-worker`, webapp enqueue path);
  - какие SQL-проверки состояния нужны;
  - критерии pass/fail и что фиксировать в LOG.
- Подготовить rollback hints:
  - безопасный откат worker-runtime commit;
  - повторная проверка, что claim-path не затронут.

## Definition of Done

- [ ] `processTranscodeJob.ts`, `processProgramSubmissionTranscode.ts`, `watermarkEnabled.ts`, `pipelineEnabled.ts` — нет прямого `pool.query`; SQL идёт через minimal executor (Class B).
- [ ] `claim.ts` — **без изменений**; тесты `claim.test.ts` зелёные.
- [ ] **Нет** нового shared schema package в monorepo.
- [ ] LOG: «shared schema package — backlog вне Wave 3».
- [ ] Флаги/JSON из `system_settings` в worker проходят через Zod-валидацию (без unsafe cast).
- [ ] Подфазы 10A-10C закрыты; staging smoke pack подготовлен до старта фазы 17.

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

- E2E staging multipart→claim — обязательный gate в фазе 17.
