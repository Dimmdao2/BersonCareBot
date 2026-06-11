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

## Block 3 (2026-06-11) — Клиентский шелл с реестром и URL-sync

### Что сделано
- **3.A** `communicationsTabRegistry.ts` — реестр: `CommunicationsTabProps` (deepLinkParams / onDeepLinkChange / initialData),
  `CommunicationsTabRegistryEntry` (id / loader / deepLinkKeys), массив 4 записей; добавление таба = компонент + строка.
- **3.B** `DoctorCommunicationsShell.tsx` — `"use client"`: `DoctorAppShell` + `DoctorCommunicationsTabsNav` (reuse),
  `DYNAMIC_TABS` Map (module-level, `next/dynamic` + `ssr:false`), `mountedTabs` (Set, только растёт — keepMounted),
  `deepLinks` per-tab state, `handleTabChange` / `handleDeepLinkChange`.
- **3.B** `DoctorCommunicationsTabsNav.tsx` — добавлен опциональный `onTabClick?: (tab) => void`;
  при наличии рендерит `<button>` вместо `<Link>` (backwards-compatible).
- **3.B** `tabs/ChatsTab.tsx` — тонкая обёртка над `DoctorSupportInbox` (Block 4 добавит поллинг).
- **3.B** `tabs/IntakeTab.tsx` — обёртка над `DoctorOnlineIntakeClient`, передаёт `initialOpenRequestId={deepLinkParams.id}`.
- **3.B** `tabs/CommentsTab.tsx` — обёртка над `DoctorCommentsTab`, `initialData` → props (fallback пустой список).
- **3.B** `tabs/BroadcastsTab.tsx` — `deepLinkParams.archive === "1"` → `BroadcastDeliveryArchiveClient` с кнопкой «←»;
  иначе `BroadcastForm` + ленивая загрузка `BroadcastAuditLog` через `listBroadcastAuditAction`.
- **3.C** URL-sync: смена таба → `history.replaceState(?tab=<id>)`, deep-link-параметры добавляются/удаляются из URL;
  `popstate`-слушатель восстанавливает состояние при back/forward; инициализация deepLinks из `window.location.search` в `useEffect`.
- **3.C** `DoctorCommunicationsShell.test.tsx` — 10 тестов (jsdom): рендер, keepMounted кэш, hidden-атрибут,
  replaceState при смене таба, повторный переход не перемонтирует, чтение ?id/?archive из URL, запись ?id/?archive через onDeepLinkChange.
  Чанки прогреты в `beforeAll` (правило webapp-tests-lean-no-bloat).

### Проверки
- `pnpm --dir apps/webapp typecheck` — зелёный
- `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/communications` — 20 passed (3 файла)

### Сознательно не сделано
- Умный поллинг чатов (только активный+видимый таб) — Block 4.
- Полный deep-link write-sync для intake (onDeepLinkChange при открытии карточки) — Block 4.
- `page.tsx` (серверный вход-шелл с requireDoctorAccess + бейджи) — Block 6.

## Block 4 (2026-06-11) — Компоненты-табы

### Что сделано
- **4.A** `CommunicationsTabProps` — добавлен `isActive?: boolean`; шелл прокидывает `isActive={tabId === activeTab}`.
- **4.A** `DoctorSupportInbox.tsx` — добавлен `active?: boolean` проп; поллинг-`useEffect` (POLL_INTERVAL_MS=1000):
  `setInterval` только при `active=true`, внутри `pollOnce` guard `document.visibilityState !== "visible"` → ранний выход;
  `convSignature` на основе `conversationId+lastMessageAt+unreadFromUserCount` — `setState` только при реальном изменении.
  Также обновлён `sigRef` в `loadList` для корректного первого poll-tick.
- **4.A** `ChatsTab.tsx` — прокидывает `active={isActive ?? true}` в `DoctorSupportInbox`.
- **4.B** `DoctorOnlineIntakeClient.tsx` — добавлен `onDetailChange?: (id: string | null) => void`;
  вызывается при открытии (`onDetailChange(id)`), закрытии и неудачной загрузке (`onDetailChange(null)`).
- **4.B** `IntakeTab.tsx` — прокидывает `onDetailChange={(id) => onDeepLinkChange("id", id)}`.
- **4.C** `tabs/BroadcastsTab.test.tsx` — 3 теста: default-вид (Form), archive=1 (ArchiveClient), кнопка «← Рассылки».

### Проверки
- messages zone — 5 passed (3 старых + 2 новых polling-теста)
- online-intake zone — 5 passed (3 старых + 2 новых onDetailChange-теста)
- broadcasts zone — все зелёные
- communications zone — 20 passed + 3 новых BroadcastsTab = 23 passed
- `pnpm --dir apps/webapp typecheck` — зелёный

### rg-чеклисты
- `rg "setInterval" src/app/app/doctor/messages/DoctorSupportInbox.tsx` → найдено ✅
- `rg "onDetailChange" src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.tsx` → найдено ✅

### Сознательно не сделано
- `page.tsx` (серверный вход-шелл с requireDoctorAccess + бейджи) — Block 6.
- Живая проверка поллинга в браузере — Block 7.
