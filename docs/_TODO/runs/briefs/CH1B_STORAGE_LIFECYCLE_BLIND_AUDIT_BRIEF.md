# Ч1б — blind audit живых storage commit/abort разрывов до worker

Тест или взгляд: **смешанный blind test**. Ты независимый auditor-live и сначала строишь kill-set, затем читаешь
детали реализации. До действий прочитай `AGENTS.md` (§5, §7, §9, §10/§10a/§10b, §24),
`docs/ORCHESTRATION_BINDINGS.md`, `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` Ч1/Ч1б, принятые Ч1 briefs,
audit/fix reports и текущие media upload/storage ports. Работай только в выданной ветке. DB/server/DEV/TEST/PROD,
deploy, push и product fix запрещены.

Authority — открытый Ч1б целиком: proxy S3→DB orphan; abandoned single-PUT pending+object; invalid patient confirm
оставляет linked patient/media metadata+object. Готово позже = единый commit/abort lifecycle на существующих
`media_files`/storage ports без новой таблицы/второго upload service. Ч1 уже принят: его two-stage validation,
context policies, `PreparedMediaUpload`/`ReceivedUpload` и six-path structural door не переписывать.

## Известная текущая карта, которую надо проверить независимо

- `createS3MediaStoragePort.upload` пишет S3 до ready-row и не компенсирует DB failure.
- Four single-PUT paths создают `media_files.pending`; только multipart имеет session/expiry cleanup.
- Patient-file invalid received-object path отвечает ошибкой и оставляет linked `patient_files` + pending media +
  object; план исправлен с прежнего ложного «удаляет DB row».
- Существующая надёжная дверь удаления уже одна: `deleteHard` stages `pending_delete`,
  `purgePendingMediaDeleteBatch` удаляет S3, затем DB, и ретраит S3 failure. Проверить, можно ли расширить именно её.

## Blind kill-set и обязательный выход

До предложения fix-а посадить/смоделировать четыре достижимых failure-paths и назвать wrong observable result:

1. успешный proxy PUT, затем DB ready/insert fault — object не должен остаться без lifecycle record;
2. single-PUT object + `media_files.pending` без upload session старше действующего безопасного TTL — должен быть
   подбираем cleanup, а recent pending и multipart session-backed row не должны удаляться;
3. terminal HEAD/type/size/signature failure в generic, submission и patient-file confirm — ready/enqueue/quota
   недостижимы, cleanup обязан остаться retryable при S3 delete failure;
4. abort linked pending patient file — незавершённая `patient_files` metadata не должна после media purge стать
   видимым broken legacy file через nullable `mediaFileId`.

Проверить также, что route не может сам делать hard delete/S3 delete в обход lifecycle adapter, а accepted Ч1 door
и multipart abort не ломаются. Отрицательные контроли: recent pending, active multipart session, preview worker,
existing pending-delete retry.

Создай `docs/_TODO/runs/testsuite-v2/CH1B_STORAGE_LIFECYCLE_BLIND_AUDIT_REPORT.md` с exact командами, killed/missed
matrix, достижимыми сценариями и минимальным цельным worker-scope. Разрешено оставить только audit artifact и
намеренные acceptance tests, которые красны на текущем product и точно выражают эти четыре consequences.
Product fix, новая таблица/service/queue, миграция, plan checkbox и DB evidence запрещены. Временные production
faults полностью откатить; commit только audit artifacts/tests с `#1082`, если они намеренные и дерево чистое.
