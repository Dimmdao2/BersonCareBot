# Doctor Communications — Execution Log (TODO#3)

## Block 1 (2026-06-11) — Data-слой: doctor-wide read-метод

### Что сделано
- **1.A** `types.ts`: добавлены `DoctorExerciseCommentCursor`, `ListDoctorExerciseCommentsInput`, `DoctorExerciseCommentRow`.
- **1.A** `ports.ts`: добавлены `listUnreadExerciseCommentsForDoctor` + `listExerciseCommentsForDoctor`.
- **1.B** `pgProgramItemDiscussion.ts`: helper `queryDoctorExerciseComments` — CTE с `selectDistinctOn` по `instanceStageItemId`, внешний фильтр `senderRole='patient'` + `mediaFileId IS NULL` (применяется ПОСЛЕ DISTINCT ON, чтобы учитывать admin-reply как latest), LEFT JOIN `_reads` по viewer, keyset-пагинация.
- **1.C** `inMemoryProgramItemDiscussion.ts`: helper `inMemoryDoctorExerciseComments` — двухфазный алгоритм (1: latest среди всех сообщений пациента; 2: фильтр senderRole+media+read+cursor), паритет с pg-логикой.
- **1.D** `service.ts`: обёртки с `assertUuid` + clamp limit.
- **1.D** `service.test.ts`: расширен тестами валидации сервиса и 7 inMemory-сценариев (unread: newest first, exclude other patients, admin-latest excluded, media-latest excluded, already-read excluded, keyset cursor, empty patientUserIds; history: read+unread included).
- `service.unread.test.ts`, `syncDiscussionReadFromSupportInbound.test.ts`: добавлены `vi.fn()` для новых методов в существующие моки.

### Проверки
- `pnpm --dir apps/webapp typecheck` — зелёный
- `pnpm --dir apps/webapp test -- src/modules/program-item-discussion` — зелёный (1129 passed)

### DI
`buildAppDeps.ts` не менялся — `programItemDiscussionService` автоматически содержит новые методы (строки 756/799/979/1498).

### Сознательно не сделано
- `EXPLAIN` на реальной БД (нет миграции, в рамках Block 1 не требуется).
- Рефактор «Сегодня» на новый метод — вне scope (отдельный backlog-шаг).
