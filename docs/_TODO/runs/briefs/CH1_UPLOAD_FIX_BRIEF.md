# Ч1 — bounded fix-round по независимому audit `d2ff0858f` (#1082)

## Роль, authority и target

Ты worker, не новый аудитор. До кода прочитай `AGENTS.md` §5, §7, §9, §10/§10b и §24,
`docs/ORCHESTRATION_BINDINGS.md`, Ч1/Ч1б `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` и
`docs/_TODO/runs/testsuite-v2/CH1_UPLOAD_BLIND_AUDIT_REPORT.md`.

Работай только в `wt/ch1-upload-current` поверх product `e94b3069d` и audit/tests `d2ff0858f`. Четыре findings
аудита — полный scope. Новую таблицу, migration, upload-service, экран, storage cleanup Ч1б, DB/DEV/TEST/PROD,
deploy и push не делать.

Источник оракула: Ч1 — «`ready` недостижим без validated received-object result, все шесть путей на двери,
structural gate с self-test запрещает седьмой обход»; постоянные route/UI/S3/gate tests из `d2ff0858f` — готовый
независимый kill-set. Повторный blind-pass не нужен: worker делает этот набор зелёным, оркестратор принимает diff.

## Исправить ровно F1–F4

1. **F1 filename/extension.** Закрытая intent-door отвергает пустое/whitespace/path-only/некорректное имя и
   несовместимую с policy MIME extension до side effects. Не подставлять `upload` за пустое имя. Сохрани именованные
   policy и разные лимиты шести путей; не вводи единый усреднённый лимит.
2. **F2 proxy ordering.** `/api/media/upload` валидирует intent каждого файла до folder/DB/presign/storage
   boundary. Auth остаётся первым security gate; invalid file не вызывает `folderExists`/assignability/storage.
3. **F3 unforgeable acceptance.** `{ } as ReceivedUpload`, `as unknown as`, alias/wrapper/re-export и прямой
   pending/ready/storage-adapter path не должны позволять acceptance. Не полагайся только на TypeScript type:
   acceptance boundary проверяет runtime capability/brand, который может создать только received validator, либо
   использует другой существующий закрытый runtime seam. Не экспортируй новый конструктор марки и не добавляй
   allowlist для обходов.
4. **F4 executable gate.** Доработай существующий `check-media-upload-door.mjs`, чтобы все восемь постоянных
   bypass fixtures стали зелёными, сохрани negative controls и подключи обычный gate в действующий webapp lint/CI
   graph. `--self-test` тоже обязан выполняться каноническим repo gate там, где остальные structural self-tests
   реально запускаются; не делай source-text test на один импорт/комментарий.

## Acceptance и сдача

Сначала зафиксируй исходные красные: route suite `3 red`, gate suite `8 red`. Затем озелени тот же набор без
удаления/ослабления assertions:

- `uploadDoorAcceptance.route.test.ts`, `mediaUploadDoorGate.unit.test.ts`, `PatientTabFiles.ui.test.tsx`,
  `s3UploadPrefix.unit.test.ts` и worker `uploadValidation.test.ts`;
- standalone gate и `--self-test`;
- webapp typecheck, targeted ESLint, test-runner visibility и scoped `git diff --check`;
- если обычный webapp lint теперь включает gate, выполни его; внешний unrelated failure укажи точным путём/командой.

Проверь, что новые runtime checks не ломают все шесть route и не переносят Ч1б cleanup в scope. Создай
`docs/_TODO/runs/testsuite-v2/CH1_UPLOAD_FIX_REPORT.md`, коммит product + tests/report + плановую отметку только если
все четыре findings и 11 красных oracle закрыты. В сообщении коммита назови `#1082`, audit `d2ff0858f`, команды и
что Ч1б/DB evidence не выполнены. Не пушить.
