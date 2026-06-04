---
name: Wave2 Phase05 Webapp media
overview: Миграция сырого SQL в медиа-слое webapp (s3MediaStorage, folders, upload sessions, preview worker, multipart routes, transcode jobs) на Drizzle + execute(sql) для advisory/claim где нужно.
status: pending
isProject: false
todos:
  - id: p05-inventory
    content: "Сверка с RAW_SQL_INVENTORY §2.4 (медиа) + §2.5 multipart; порядок: сначала изолированные repos, затем preview worker (самый большой tx)."
    status: pending
  - id: p05-core-repos
    content: "s3MediaStorage.ts, mediaFoldersRepo.ts, mediaUploadSessionsRepo.ts, pgMediaTranscodeJobs.ts — Drizzle; advisory wrappers должны уже соответствовать этапу 3 или оставаться execute(sql) в той же tx."
    status: pending
  - id: p05-preview-multipart
    content: "mediaPreviewWorker.ts, routes multipart cleanup/init — транзакции и cleanup путей; не ослаблять проверки статусов media_files."
    status: pending
  - id: p05-system-health
    content: "Проверить, что метрики system-health / operator health по-прежнему согласованы с новыми запросами (при изменении полей)."
    status: pending
  - id: p05-verify
    content: "typecheck + целевые webapp тесты; smoke-чеклист в LOG: upload/init, multipart cleanup/abort, preview generation, pending_delete purge, transcode queue claim/reschedule."
    status: pending
---

# Wave 2 — этап 5: webapp медиа

## Размер

**L**

## Definition of Done

- [ ] Ключевые медиа-репозитории и критичные route-handlers не используют сырой `pool.query`/`client.query` без обоснования.
- [ ] S3 + БД остаются согласованы: не появляется `ready` без объекта, pending upload cleanup не удаляет чужой объект, `pending_delete` не теряется, multipart abort идемпотентен, transcode jobs не claimятся двумя воркерами.
- [ ] CI по затронутым пакетам зелёный.

## Scope

**Разрешено:** `apps/webapp/src/infra/repos/s3MediaStorage.ts`, `media*`, `pgMediaTranscodeJobs.ts`, `src/app/api/**/multipart/**`, `mediaPreviewWorker.ts`.

**Вне scope:** изменение пайплайна ffmpeg в media-worker (этап 8), смена ACL модели.

**Связь с этапом 3:** этап 5 не пересматривает выбор ключей advisory locks и session/xact семантику. Если этап 3 ещё не выполнен, advisory в медиа можно оставить на текущем `execute(sql)` паттерне и зафиксировать остаток в LOG.

## Риски

Advisory locks, pending_delete, multipart abort — обязательны тесты и поэтапный rollout.

## Декомпозиция исполнения

### 1. Inventory and invariants

- [ ] Сверить `RAW_SQL_INVENTORY.md` §2.4–2.6 и текущий `rg "pool\\.query|client\\.query" apps/webapp/src --glob "*media*" --glob "*Media*"`.
- [ ] Перед кодом зафиксировать инварианты: `media_files.status`, S3 object key, `pending_delete`, upload session state, preview state, transcode job status.
- [ ] Разделить scope на groups: core repos, multipart routes, preview worker, system health metrics.

### 2. Schema and shared repo helpers

- [ ] Проверить Drizzle declarations для `media_files`, folders, upload sessions, preview jobs/state, transcode jobs.
- [ ] Для repeated status transitions завести локальные helper predicates, чтобы не дублировать raw SQL conditions.
- [ ] Advisory wrappers из этапа 3 не менять, кроме адаптации call signature.

### 3. Core repos

- [ ] `s3MediaStorage.ts`: перевести create/update/delete/status transitions; сохранить media id lock и cleanup order.
- [ ] `mediaFoldersRepo.ts`: перевести CRUD/list; сохранить сортировку и parent constraints.
- [ ] `mediaUploadSessionsRepo.ts`: перевести session create/complete/fail/cleanup; сохранить pending `media_files` cleanup.
- [ ] `pgMediaTranscodeJobs.ts`: перевести enqueue/claim/reschedule/complete/fail; claim с concurrency сохранить через `execute(sql)` если builder неочевиден.
- [ ] Тесты: folder list order, upload session cleanup, pending-delete, transcode claim idempotency.

### 4. Multipart routes

- [ ] `media/multipart/init/route.ts`: ошибка init не оставляет `pending` строку без причины.
- [ ] `internal/media-multipart/cleanup/route.ts`: cleanup удаляет только eligible pending sessions/files.
- [ ] Route handlers остаются thin: parsing/auth/service/repo call, без бизнес-логики в handler.
- [ ] Тесты: init failure cleanup, abort idempotency, unauthorized remains unchanged.

### 5. Preview worker

- [ ] Перевести worker DB reads/writes по preview state.
- [ ] Сохранить порядок: claim candidate → generate/record result → mark final/error.
- [ ] Не менять image/video preview policy и S3 key layout.
- [ ] Тесты или smoke: image preview success, video preview fallback, retry/error state.

### 6. System health and metrics

- [ ] Проверить `collectAdminSystemHealthData` и operator health media metrics после изменений.
- [ ] Сохранить имена JSON fields и thresholds.
- [ ] При изменении SQL формы добавить тест на aggregation shape.

### 7. Verification

- [ ] `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos apps/webapp/src/app/api --glob "*media*" --glob "*Media*" --glob "*multipart*"` — остатки объяснены.
- [ ] `pnpm --dir apps/webapp run typecheck`
- [ ] Целевые media/multipart/transcode tests.
- [ ] LOG smoke: upload/init, multipart cleanup/abort, preview generation, pending_delete purge, transcode queue claim/reschedule.

## Решения по сложным местам

- S3 и БД остаются неатомарными; порядок операций сохраняется как в legacy. Drizzle не должен менять “сначала объект/потом status” или cleanup ordering.
- Multipart cleanup должен иметь те же eligibility predicates; расширение cleanup predicate запрещено без отдельного теста на активную загрузку.
- Preview/transcode claim остаётся `execute(sql)` с `SKIP LOCKED`, если builder не даёт прямой эквивалентности.
- ACL модель медиа не меняется; любые идеи capability token/patient scoped access — в security backlog, не в этот этап.

## Stop conditions

- Если нужен новый status/column/index для медиа, остановиться и оформить DDL rollout.
- Если тест/smoke показывает `ready` без объекта или объект без строки БД, не закрывать этап.
- Если S3 cleanup требует изменения bucket/key policy, вынести в отдельный media ops plan.
