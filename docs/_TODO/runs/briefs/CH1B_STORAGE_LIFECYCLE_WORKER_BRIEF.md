# Ч1б — единый commit/abort lifecycle для upload failures (#1082)

Ты worker полного Ч1б stage. Прочитай `AGENTS.md` §1/§5/§7/§9/§10/§24,
`docs/ORCHESTRATION_BINDINGS.md`, Ч1/Ч1б в `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`,
`CH1B_STORAGE_LIFECYCLE_BLIND_AUDIT_REPORT.md`, принятые Ч1 audit/fix reports и соседние media/patient-files
module docs. Только выданная ветка; PROD/TEST/deploy/push/taskdb запрещены. DEV не нужен для worker.

Источник оракула: Ч1б — «Готово = единый commit/abort lifecycle на существующих `media_files`/storage ports и
доказанный cleanup каждого из трёх достижимых сбоев; новой таблицы или второго upload-service нет».

## Полный stage и consequences

Закрыть весь blind kill-set `09cd009a2`, а не только красный K1 test:

1. **K1 proxy:** PUT success + DB failure не оставляет object без lifecycle record. Предпочтительный минимальный
   путь — record-first `media_files.pending → S3 PUT → CAS ready`; post-PUT/mark-ready failure оставляет durable
   pending row для общей уборки. Если остаётся прямой compensation delete, его failure обязан сохранить retryable
   lifecycle state. Намеренный audit-test можно исправить под record-first oracle; не закреплять прямой S3 delete
   как архитектуру.
2. **K2 abandoned single-PUT:** существующий purge перед batch атомарно stages в `pending_delete` только
   sessionless `media_files.pending` старше 24h; recent pending и row с active multipart session не трогает. Затем
   штатный `purgePendingMediaDeleteBatch` делает S3-first/DB-second/retry. Не строить вторую queue/cron/table.
3. **K3 terminal receive failure:** generic, program-submission и patient-file confirm не достигают ready/enqueue/
   quota и ровно один раз stages abort через общий media lifecycle adapter. S3 failure оставляет `pending_delete`,
   route не hard-deletes DB/S3 самостоятельно. Multipart complete/abort contract сохраняется и переиспользует ту
   же lifecycle boundary там, где это terminal media failure.
4. **K4 linked patient file:** в одной Drizzle transaction со stage abort удалить только незавершённую linked
   `patient_files` metadata; после media purge nullable FK не должен сделать broken legacy file видимым. Настоящие
   legacy `mediaFileId IS NULL` записи не менять.
5. **Boundary:** расширить один existing upload-door AST gate/self-test: intake/confirm routes не импортируют
   direct repo abort/S3 delete; lifecycle доступен через existing adapter/port. Allowlist и второй scanner запрещены.

## Не сломать

Принятые Ч1 `UploadPolicyId`, `PreparedMediaUpload`, `ReceivedUpload`, intent/received validation и все шесть intake
paths; active multipart session cleanup; recent uploads; preview worker; pending-delete retries; ready media reads;
patient-files list/quota semantics для уже существующих legacy rows. Новая migration, таблица, upload service,
storage abstraction или permanent DEV-db test запрещены.

## Acceptance

- Saved behavior oracles K1–K4 green, включая injected S3-delete failure/retry state, linked metadata removal,
  stale/recent/session-backed selection and proxy record-first failure ordering.
- Accepted Ч1 route suite 23/23 и upload validation/gate suites green; gate self-test kills a planted direct route
  cleanup import.
- Focused repo/service tests, scoped lint, webapp typecheck, raw-SQL gate and diff-check green.
- Один report под `docs/_TODO/runs/single-entry/` maps K1–K4 + boundary to code/test evidence and names any
  unverified live behavior. Worker не закрывает Ч1б checkbox.

Один coherent commit `#1082`, чистое дерево. После worker — независимый behavior/lifecycle audit; только PASS
разрешает merge в `wt/single-entry-integration`.
