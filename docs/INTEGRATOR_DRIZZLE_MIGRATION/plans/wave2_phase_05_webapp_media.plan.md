---
name: Wave2 Phase05 Webapp media
overview: Миграция сырого SQL в медиа-слое webapp на Drizzle + runWebappSql/execute(sql); webapp transcode — только enqueue (claim — media-worker P8).
status: completed
isProject: false
todos:
  - id: p05-inventory
    content: "Сверка с RAW_SQL_INVENTORY §2.4 (медиа) + §2.5 multipart; порядок: сначала изолированные repos, затем preview worker (самый большой tx)."
    status: completed
  - id: p05-core-repos
    content: "s3MediaStorage.ts, mediaFoldersRepo.ts, mediaUploadSessionsRepo.ts, pgMediaTranscodeJobs.ts — Drizzle; advisory wrappers должны уже соответствовать этапу 3 или оставаться execute(sql) в той же tx."
    status: completed
  - id: p05-preview-multipart
    content: "mediaPreviewWorker.ts, routes multipart cleanup/init — транзакции и cleanup путей; не ослаблять проверки статусов media_files."
    status: completed
  - id: p05-system-health
    content: "Проверить, что метрики system-health / operator health по-прежнему согласованы с новыми запросами (при изменении полей)."
    status: completed
  - id: p05-verify
    content: "typecheck + P5 vitest bundle (56) + pnpm run ci; smoke-чеклист в LOG (unit + staging defer P8)."
    status: completed
---

# Wave 2 — этап 5: webapp медиа

## Размер

**L**

## Definition of Done

- [x] Ключевые медиа-репозитории и критичные route-handlers не используют сырой `pool.query`/`client.query` без обоснования.
- [x] S3 + БД остаются согласованы: не появляется `ready` без объекта, pending upload cleanup не удаляет чужой объект, `pending_delete` не теряется, multipart abort идемпотентен; transcode **enqueue** idempotent в webapp (claim concurrency — media-worker P8).
- [x] CI по затронутым пакетам зелёный.

## Scope

**Разрешено:** `apps/webapp/src/infra/repos/s3MediaStorage.ts`, `media*`, `mediaSqlPredicates.ts`, `pgMediaTranscodeJobs.ts`, `pgMediaFileIntakeResolve.ts`, `pgMediaUsageSummary.ts`, `src/infra/db/runWebappSql.ts`, `src/app/api/**/multipart/**`, `mediaPreviewWorker.ts`.

**Вне scope:** изменение пайплайна ffmpeg в media-worker (этап 8), смена ACL модели.

**Связь с этапом 3:** этап 5 не пересматривает выбор ключей advisory locks и session/xact семантику. Если этап 3 ещё не выполнен, advisory в медиа можно оставить на текущем `execute(sql)` паттерне и зафиксировать остаток в LOG.

## Риски

Advisory locks, pending_delete, multipart abort — обязательны тесты и поэтапный rollout.

## Декомпозиция исполнения

### 1. Inventory and invariants

- [x] Сверить `RAW_SQL_INVENTORY.md` §2.4–2.6 и текущий `rg "pool\\.query|client\\.query" apps/webapp/src --glob "*media*" --glob "*Media*"`.
- [x] Перед кодом зафиксировать инварианты: `media_files.status`, S3 object key, `pending_delete`, upload session state, preview state, transcode job status.
- [x] Разделить scope на groups: core repos, multipart routes, preview worker, system health metrics.

### 2. Schema and shared repo helpers

- [x] Проверить Drizzle declarations для `media_files`, folders, upload sessions, preview jobs/state, transcode jobs.
- [x] Для repeated status transitions завести локальные helper predicates, чтобы не дублировать raw SQL conditions.
- [x] Advisory wrappers из этапа 3 не менять, кроме адаптации call signature.

### 3. Core repos

- [x] `s3MediaStorage.ts`: перевести create/update/delete/status transitions; сохранить media id lock и cleanup order.
- [x] `mediaFoldersRepo.ts`: перевести CRUD/list; сохранить сортировку и parent constraints.
- [x] `mediaUploadSessionsRepo.ts`: перевести session create/complete/fail/cleanup; сохранить pending `media_files` cleanup.
- [x] `pgMediaTranscodeJobs.ts`: перевести enqueue на Drizzle/`runWebappSql`; **claim/reschedule/complete** остаются в `apps/media-worker` (Wave 2 этап 8).
- [x] Тесты: folder list order, upload session cleanup, pending-delete, transcode enqueue idempotency.

### 4. Multipart routes

- [x] `media/multipart/init/route.ts`: ошибка init не оставляет `pending` строку без причины.
- [x] `internal/media-multipart/cleanup/route.ts`: cleanup удаляет только eligible pending sessions/files.
- [x] Route handlers остаются thin: parsing/auth/service/repo call, без бизнес-логики в handler.
- [x] Тесты: init failure cleanup, abort idempotency, unauthorized remains unchanged.

### 5. Preview worker

- [x] Перевести worker DB reads/writes по preview state.
- [x] Сохранить порядок: claim candidate → generate/record result → mark final/error.
- [x] Не менять image/video preview policy и S3 key layout.
- [x] Тесты или smoke: image preview success, video preview fallback, retry/error state.

### 6. System health and metrics

- [x] Проверить `collectAdminSystemHealthData` и operator health media metrics после изменений — без изменений SQL (осознанно вне scope P5).
- [x] Сохранить имена JSON fields и thresholds.
- [x] Aggregation shape не менялся — отдельный тест не требуется.

### 7. Verification

- [x] `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos apps/webapp/src/app/api --glob "*media*" --glob "*Media*" --glob "*multipart*"` — остатки объяснены (TX transport на `PoolClient`).
- [x] `pnpm --dir apps/webapp run typecheck`
- [x] Целевые media/multipart/transcode tests (**56 passed**, vitest `--project fast`).
- [x] `pnpm run ci` (полный барьер монорепо).
- [x] LOG smoke (см. Wave 2 этап 5 в LOG.md): upload/init, multipart cleanup/abort, preview generation, pending_delete purge, transcode **enqueue** (claim — media-worker P8).

## Решения по сложным местам

- S3 и БД остаются неатомарными; порядок операций сохраняется как в legacy. Drizzle не должен менять “сначала объект/потом status” или cleanup ordering.
- Multipart cleanup должен иметь те же eligibility predicates; расширение cleanup predicate запрещено без отдельного теста на активную загрузку.
- Preview/transcode claim остаётся `execute(sql)` с `SKIP LOCKED`, если builder не даёт прямой эквивалентности.
- ACL модель медиа не меняется; любые идеи capability token/patient scoped access — в security backlog, не в этот этап.

## Stop conditions

- Если нужен новый status/column/index для медиа, остановиться и оформить DDL rollout.
- Если тест/smoke показывает `ready` без объекта или объект без строки БД, не закрывать этап.
- Если S3 cleanup требует изменения bucket/key policy, вынести в отдельный media ops plan.

## Закрытие (2026-06-05)

- **Инфра:** `mediaSqlPredicates.ts`; `runWebappSql.getWebappSqlFromPgClient` для Drizzle на dedicated `PoolClient`.
- **Репозитории:** `s3MediaStorage.ts`, `mediaFoldersRepo.ts`, `mediaUploadSessionsRepo.ts`, `pgMediaTranscodeJobs.ts` (enqueue), `pgMediaFileIntakeResolve.ts`, `pgMediaUsageSummary.ts`, `mediaPreviewWorker.ts`.
- **Routes:** `media/multipart/init` (rollback pending); `internal/media-multipart/cleanup` (repo helpers; `cleaned` без stale-lock inflation).
- **Исключения (документировано):** `client.query("BEGIN"|"COMMIT"|"ROLLBACK")` на PoolClient; `collectAdminSystemHealthData` / `adminTranscodeHealthMetrics` — без изменений SQL; transcode claim — `apps/media-worker` (Wave 2 P8).
- **Тесты (vitest `--project fast`, P5 bundle):** **56 passed** — `init/route.test.ts`, `cleanup/route.test.ts`, `mediaFoldersRepo.test.ts`, `mediaUploadSessionsRepo.test.ts`, `pgMediaTranscodeJobs.test.ts`, `s3MediaStorage.test.ts`, `mediaPreviewWorker.test.ts`, `pgMediaFileIntakeResolve.test.ts`, `mediaTranscodeAutoEnqueue.test.ts`.
- **Документация:** [LOG.md](../LOG.md) § Wave 2 этап 5; [RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md) — P5 done для медиа repos/routes §2.4–2.5; [plans/README.md](./README.md), [DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md).
- **Проверки (воспроизводимые):**
  - `rg 'pool\.query|client\.query' apps/webapp/src/infra/repos apps/webapp/src/app/api --glob '*media*' --glob '*Media*' --glob '*multipart*'` → только TX transport на `PoolClient`
  - `pnpm --dir apps/webapp run typecheck`
  - P5 vitest bundle (список файлов — § этап 5 в [LOG.md](../LOG.md))
  - `pnpm run ci`
