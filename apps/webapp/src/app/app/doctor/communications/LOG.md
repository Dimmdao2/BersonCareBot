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

## Block 2 (2026-06-11) — Таб «Комментарии»: данные + UI

### Что сделано
- **2.A** `loadDoctorExerciseCommentsForTab.ts` — загрузчик: on-support один раз, один doctor-wide
  вызов `listUnreadExerciseCommentsForDoctor`, обогащение displayName/href/label; совместим с
  `TodayExerciseCommentAttentionItem[]` для reuse `DoctorExerciseCommentsList`. 9 unit-тестов.
- **2.B** `app/api/doctor/exercise-comments/route.ts` — GET-route: cursor-пагинация через
  `listExerciseCommentsForDoctor`, серверный добор поиска `?q=`, `requireDoctorApiSession`.
  8 unit-тестов (401, пустой список, обогащение, неверный cursor, cursor-проброс, пагинация, добор,
  hasMore=false при поиске).
- **2.C** `DoctorCommentsTab.tsx` — client-компонент: SSR-пропы (initialItems/cursor/hasMore),
  ленивая история через «Загрузить ещё» → route, reuse `DoctorExerciseCommentsList`
  (→ `ProgramItemDiscussionMessageBody`). 8 component-тестов (jsdom).
- **2.D** `useDoctorExerciseCommentsSearch.ts` — хук: локальный фильтр (patient/body/title) +
  debounced серверный добор при 0 локальных совпадениях; `shouldRunDoctorCommentsServerSearch`.
  3 unit-теста чистой утилиты.

### Проверки
- Все 4 тест-файла зелёные (28 тестов):
  - `src/app/app/doctor/comments/loadDoctorExerciseCommentsForTab` — 9 passed
  - `src/app/api/doctor/exercise-comments/route` — 8 passed
  - `src/app/app/doctor/comments/DoctorCommentsTab` — 8 passed
  - `src/app/app/doctor/comments/useDoctorExerciseCommentsSearch` — 3 passed
- `pnpm --dir apps/webapp typecheck` — зелёный
- Phase-gate `src/app/app/doctor/comments` — 20 passed (3 files)

### rg-чеклисты
- `rg "loadDoctorExerciseCommentAttention" src/app/app/doctor/comments/DoctorCommentsTab.tsx` → не найдено ✅
- `rg "ProgramItemDiscussionMessageBody" src/app/app/doctor/comments` → найдено в `DoctorExerciseCommentsList.tsx` ✅

### Сознательно не сделано
- Серверная пагинация поиска (глобальный поиск не нужен по scope).
- Интеграция в shell/page.tsx — это Этапы 3 и 6.
