---
name: Wave3 Phase10 Media worker IX
overview: media-worker processTranscodeJob/processProgramSubmissionTranscode/watermark/pipeline — Class B execute; claim.ts permanent pg.
status: completed
isProject: false
todos:
  - id: w3-p10a-preflight
    content: "10A: preflight перед кодом — зафиксировать SQL inventory media-worker, подготовить executor contract, список инвариантов claim/transcode."
    status: completed
  - id: w3-p10b-runtime
    content: "10B: minimal sql executor + миграция processTranscodeJob/processProgramSubmissionTranscode/watermarkEnabled/pipelineEnabled на executor."
    status: completed
  - id: w3-p10c-ops-prep
    content: "10C: подготовить staging smoke pack (чеклист, команды, expected logs/queries, rollback hints) для обязательного gate фазы 17."
    status: completed
  - id: w3-p10-claim-adr
    content: "claim.ts без изменений; ADR в RAW_SQL если ещё нет."
    status: completed
  - id: w3-p10-verify
    content: "После 10A-10C: pnpm --dir apps/media-worker test (22); rg pool.query (claim+transport); pnpm run ci green; smoke pack в LOG."
    status: completed
---

# Wave 3 — фаза 10: Media-worker (фаза IX)

## Размер

**M**

## Исполнение через composer

- `1 composer run = 1 PR = 1 фаза` (фаза 10 — отдельный прогон/PR, не объединять с фазой 09).
- Внутри фазы 10 порядок обязателен: `10A → 10B → 10C`.
- Для DB/json-границ (feature flags/settings): обязательна Zod-валидация, без unsafe cast.
- Staging smoke gate остаётся в фазе 17 и не блокирует запуск фазы 10.

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
  - `pnpm run ci`

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

- [x] `processTranscodeJob.ts`, `processProgramSubmissionTranscode.ts`, `watermarkEnabled.ts`, `pipelineEnabled.ts` — нет прямого `pool.query`; SQL идёт через minimal executor (Class B).
- [x] `claim.ts` — **без изменений**; тесты `claim.test.ts` зелёные.
- [x] **Нет** нового shared schema package в monorepo.
- [x] LOG: «shared schema package — backlog вне Wave 3».
- [x] Флаги/JSON из `system_settings` в worker проходят через Zod-валидацию (без unsafe cast).
- [x] Подфазы 10A-10C закрыты; staging smoke pack подготовлен до старта фазы 17.

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

## Inventory (baseline до 10B, 2026-06-05)

| Файл | `pool.query` (до) | После фазы 10 |
|------|-------------------|---------------|
| `jobs/claim.ts` | 8 — **Class C, без изменений** | 8 |
| `processTranscodeJob.ts` | 10 | **0** → `runMediaWorkerPgText` |
| `processProgramSubmissionTranscode.ts` | 7 | **0** → `runMediaWorkerPgText` |
| `watermarkEnabled.ts` | 1 | **0** → `runMediaWorkerPgText` + Zod |
| `pipelineEnabled.ts` | 1 | **0** → `runMediaWorkerPgText` + Zod |
| *(новый)* `runMediaWorkerSql.ts` | — | Class B transport (1× `pool.query`) |

## Проверки

```bash
rg 'pool\.query' apps/media-worker/src --glob '*.ts'
pnpm --dir apps/media-worker run test
pnpm --dir apps/media-worker run typecheck
pnpm run ci
```

## Закрытие (2026-06-06)

- **10A:** baseline + инварианты в [LOG.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/LOG.md) §Wave 3 phase 10.
- **10B:** `runMediaWorkerSql.ts`, `systemSettingBoolean.ts`, `watermarkEnabled.test.ts`; миграция 4 файлов; `drizzle-orm` dep; suite **22 passed**; typecheck green.
- **10C:** staging smoke pack в LOG §10C (исполнение — фаза 17).
- **claim ADR:** без изменений; Class C в RAW_SQL §3.
- **rg:** prod `pool.query` — только `claim.ts` + transport `runMediaWorkerSql.ts`.
- **`pnpm run ci`** — green (2026-06-06).

## Открытое

- E2E staging multipart→claim — обязательный gate в фазе 17.
