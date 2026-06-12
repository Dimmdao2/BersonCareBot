# COMMUNICATIONS_MD_V2 — Execution Log

## Этап 5a — бэкенд-агрегация комментариев

**Дата:** 2026-06-13

### Что сделано

#### 1. Новый тип `StageItemViewerUnreadCount` и порт-метод

- `modules/program-item-discussion/types.ts` — добавлен тип `StageItemViewerUnreadCount` (`stageItemId`, `total`, `unread`, `latestMessageAt`). Семантика: `total` = все пациентские сообщения, `unread` = после `lastReadAt` для viewer'а.
- `modules/program-item-discussion/ports.ts` — аддитивно добавлен метод `listUnreadCountsForViewerByStageItems({ stageItemIds, viewerUserId })` — batch-запрос «всего/непрочитанных» по массиву stageItemId.
- `modules/program-item-discussion/service.ts` — обёртка `listUnreadCountsForViewerByStageItems` в сервисе (UUID-валидация).

#### 2. InMemory-паритет

- `infra/repos/inMemoryProgramItemDiscussion.ts` — реализован `listUnreadCountsForViewerByStageItems`: итерирует по `rows`, считает patient messages per stageItem, учитывает `reads` map для viewer'а, возвращает строку для каждого переданного id.

#### 3. Pg-реализация

- `infra/repos/pgProgramItemDiscussion.ts` — реализован `listUnreadCountsForViewerByStageItems` через Drizzle: два отдельных SELECT (totals per stageItem + read cursors), затем WHERE с subquery для items с lastReadAt. Всё через Drizzle ORM, без pool.query/client.query.

#### 4. Загрузчик списка пациентов (левый пейн)

- `app/app/doctor/comments/loadDoctorCommentPatients.ts` — новый загрузчик:
  - Фетчит пациентов `supportStatus: "on"`, затем `listUnreadExerciseCommentsForDoctor` (limit=2000 — практически без пагинации, т.к. врач ведёт десятки пациентов).
  - Считает `unreadCount` = число stageItem'ов с непрочитанным последним сообщением (приближение, см. развилки ниже).
  - Возвращает `CommentPatientRow[]`: `patientUserId`, `isOnSupport: true`, `unreadCount`, поля для поиска (`displayName`, `phone`, `telegramId`, `maxId`).
  - Сортировка: unreadCount DESC → displayName ASC.
  - Не включает пациентов с нулевыми непрочитанными.

#### 5. Загрузчик упражнений пациента (правый пейн, state B)

- `app/app/doctor/comments/loadDoctorPatientExercisesWithComments.ts` — новый загрузчик:
  - Получает активный инстанс через `pickActivePlanInstance` → `getInstanceById`.
  - Обходит **все** этапы и **все** items (active + disabled) — в отличие от `loadDoctorExerciseCommentAttention` (только active).
  - Фетчит `listUnreadCountsForViewerByStageItems` batch для всех exercise-items.
  - Фильтрует: только `itemType === "exercise"` + `total > 0`.
  - Группирует по этапам: активные (`in_progress` | `available`) сверху + `isActive: true`, закрытые снизу + `isActive: false`.
  - Внутри этапа — сортировка по `latestCommentAt` DESC.
  - Параметр `includePastPrograms` (дефолт false): при `true` — fallback на последний по updatedAt инстанс.
  - Возвращает `PatientExercisesWithCommentsResult` с метаданными + `groups[]`.

#### 6. API-роут (state B)

- `app/api/doctor/comments/patients/[patientUserId]/exercises/route.ts` — тонкий GET:
  - `requireDoctorApiSession` + UUID-валидация patientUserId.
  - Query param `includePastPrograms=true` опционально.
  - Возвращает `{ ok: true, data: PatientExercisesWithCommentsResult | null }`.

#### 7. Тред (state C) — существующие роуты достаточны

Для треда упражнения (state C) новых роутов не создавалось — всё уже есть:
- **Чтение треда:** `GET /api/doctor/treatment-program-instances/[instanceId]/items/[stageItemId]/discussion` → `listDiscussionPageMerged` (с legacy-merge). Возвращает `messages`, `pageInfo`, `totalCount`, `peerLastReadAt`.
- **Ответ:** `POST /api/doctor/treatment-program-instances/[instanceId]/items/[stageItemId]/program-note-reply` → `sendProgramNoteReply`.
- **Mark read:** `POST /api/doctor/treatment-program-instances/[instanceId]/items/[stageItemId]/discussion/read` → `markReadForViewer(viewerUserId, stageItemId)`.

#### 8. Тесты

- `loadDoctorCommentPatients.test.ts` — 9 тестов: пустой список, без unread, счётчик, сортировка, поля поиска, excludedUserIds.
- `loadDoctorPatientExercisesWithComments.test.ts` — 8 тестов: null без instances, пустые группы, группировка active/closed, сортировка, total/unread агрегация, includePastPrograms, фильтр типов.
- `inMemoryProgramItemDiscussion.test.ts` — добавлены 7 тестов для `listUnreadCountsForViewerByStageItems`.
- `service.unread.test.ts`, `syncDiscussionReadFromSupportInbound.test.ts` — добавлены vi.fn() для нового метода (TypeScript-паритет).

### Проверки

- `npx tsc --noEmit` — **0 ошибок** в наших файлах (pre-existing в schedule/booking-** — параллельная инициатива).
- `npx vitest run` по 9 файлам — **71 passed (9 files)**, все GREEN.
- `webappPhase15F.verify.test.ts` — **5/5 GREEN**. Все новые SQL через Drizzle, pool.query не добавлялись.
- `npx eslint` по всем изменённым/новым файлам — **0 ошибок**.

### Затронутые файлы

**Новые:**
- `apps/webapp/src/app/app/doctor/comments/loadDoctorCommentPatients.ts`
- `apps/webapp/src/app/app/doctor/comments/loadDoctorCommentPatients.test.ts`
- `apps/webapp/src/app/app/doctor/comments/loadDoctorPatientExercisesWithComments.ts`
- `apps/webapp/src/app/app/doctor/comments/loadDoctorPatientExercisesWithComments.test.ts`
- `apps/webapp/src/app/api/doctor/comments/patients/[patientUserId]/exercises/route.ts`

**Изменённые (аддитивно):**
- `apps/webapp/src/modules/program-item-discussion/types.ts` — новый тип `StageItemViewerUnreadCount`
- `apps/webapp/src/modules/program-item-discussion/ports.ts` — новый метод порта
- `apps/webapp/src/modules/program-item-discussion/service.ts` — сервисная обёртка
- `apps/webapp/src/infra/repos/inMemoryProgramItemDiscussion.ts` — inMemory реализация
- `apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts` — pg/Drizzle реализация
- `apps/webapp/src/modules/program-item-discussion/service.unread.test.ts` — добавлен vi.fn()
- `apps/webapp/src/modules/program-item-discussion/syncDiscussionReadFromSupportInbound.test.ts` — добавлен vi.fn()
- `apps/webapp/src/infra/repos/inMemoryProgramItemDiscussion.test.ts` — 7 новых тестов

### Сознательно не сделано / вне scope

- **UI (state B, C)** — этап 5b.
- **Тред state C** — роуты уже существуют, задокументированы выше. UI 5b подключится к ним напрямую.

### Развилки (для фиксации)

1. **Email в поиске по пациентам.** `ClientListItem` содержит только `hasEmail: boolean`, без email-строки. Для полнотекстового поиска нужен `getClientIdentity` per-patient — дорого на больших списках (N×1 запрос). **Решение:** email в поиск не включён. `CommentPatientRow` содержит `phone`, `telegramId`, `maxId`, `displayName`. UI 5b реализует клиентский поиск по этим полям. Добавить email позже можно через отдельный batch-метод `listClientIdentitiesBatch` в порте.

2. **Семантика «unreadCount» в левом пейне.** Сейчас: `unreadCount` = число отдельных stageItem'ов (упражнений) с непрочитанным последним сообщением. Это приближение: если пациент написал 5 комментариев к одному упражнению — считается как 1. Альтернатива: реальное число сообщений (через `listUnreadCountsForViewerByStageItems` + fanout по программам). Отложено, текущее поведение достаточно для бейджа в левом пейне.

3. **Прошлые программы (includePastPrograms).** Параметр реализован в загрузчике, но в основном UI-потоке не используется. Стратегия: показывать только активную программу (дефолт). Прошлые — опциональная кнопка/раскрытие в UI 5b. Данные уже готовы к передаче через `includePastPrograms=true` в API.

4. **«Всего» в бейдже упражнения (state B).** `totalComments` = число patient-сообщений (без admin/doctor-ответов). Это соответствует семантике обсуждения. Если нужен счётчик "всего включая ответы врача" — нужно добавить отдельный count в порт.

---

## Этап 4b — UI формы рассылки

**Дата:** 2026-06-13

### Что сделано

1. **Порядок полей формы (Задача 1)**
   - Изменён на: Аудитория → Категория → Каналы → Заголовок → Текст → кнопки.
   - Раньше: Аудитория → Каналы → Категория → … Перемещение: секция «Категория» поднята над «Каналы · куда отправить».

2. **Аудитория — замена нативного `<select>` на доктор-дропдаун (Задача 2)**
   - `BroadcastAudienceSelect.tsx` переписан: нативный `<select>` → `ReferenceSelect` с `prefetchedItems` (псевдо-справочник из `BROADCAST_AUDIENCE_FILTERS_ORDER`).
   - Реализация: `prefetchedItems` строятся из массива фильтров, каждый элемент `{id, code, title, sortOrder}`. `valueMatch="id"`, `searchable={false}`, `showAllOnFocus` — дропдаун без ввода текста.
   - `displayLabel` реализован через `Input` из `ReferenceSelect` (отображает `selectedLabel`). Сырые uuid не показываются.
   - `isAudienceEstimateApproximate`-предупреждение (`broadcast-audience-form-warning`) — сохранено.
   - Новые сегменты с новыми DB-фильтрами и «Выбрать вручную» (диалог) — НЕ реализованы (развилка, зафиксирована ниже).

3. **Категория — 4 тоггл-чипа (Задача 3)**
   - `labels.ts`: аддитивно добавлен `BROADCAST_FORM_CATEGORIES` — массив 4 объектов `{value, label}` в порядке ТЗ §5.2:
     `organizational`→«Организационное», `important_notice`→«Важное», `service`→«Сервисное», `marketing`→«Рекламное».
   - `CATEGORY_LABELS` и `AUDIENCE_LABELS` — не тронуты (используются в журнале рассылок).
   - В `BroadcastForm.tsx` старый `CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS)` (8 элементов) заменён на `BROADCAST_FORM_CATEGORIES` (4 элемента).
   - Дефолт `category=""` → `"organizational"` в `useState` И в `handleReset`.
   - При загрузке черновика: `if (draft.category) setCategory(draft.category)` — черновик имеет приоритет над дефолтом.

4. **Каналы — дефолт изменён (Задача 4)**
   - `useState`: `new Set(["bot_message", "sms"])` → `new Set(BROADCAST_DEFAULT_CHANNELS)` (т.е. `["telegram","max","push"]`).
   - `handleReset`: аналогичная замена.
   - `BROADCAST_DEFAULT_CHANNELS` уже определён в `broadcastChannels.ts` (этап 4a).
   - Плитки рендерятся из `BROADCAST_ACTIVE_CHANNELS` (5 каналов: Telegram · MAX · Push · SMS · Email).
   - Под каждой плиткой — точная цифра из `channelCounts[ch]` (типы расширены в этапе 4a).

5. **Отступ заголовка «Новая рассылка» (Задача 5)**
   - В `BroadcastsTab.tsx`: `mb-3` → `mb-1` у `<h2>`.

6. **Независимый скролл вкладки рассылок (Задача 6)**
   - `BroadcastsMainView` переведён с `grid min-h-0 gap-4` на `CatalogSplitLayout` + `DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE`.
   - Левый пейн (`leftPane`) — форма с `overflow-y-auto`; правый пейн (`rightPane`) — журнал с `overflow-y-auto`.
   - Соотношение колонок: `lg:grid-cols-[1fr_1.2fr]` (форма : журнал ~ 1:1.2, аналогично чатам).
   - Паттерн идентичен `DoctorSupportInbox.tsx` (Этап 2) и `DoctorOnlineIntakeClient.tsx` (Этап 3).

### Проверки

- `npx tsc --noEmit` — **0 ошибок** в наших файлах (pre-existing ошибки в `schedule/**`, `booking-**` — параллельная инициативa).
- `npx vitest run BroadcastForm.test.tsx BroadcastAudienceSelect.test.tsx BroadcastsTab.test.tsx` — **24 passed (3 files)**.
- `npx eslint` по всем изменённым файлам — **0 ошибок**.

### Затронутые файлы

- `apps/webapp/src/app/app/doctor/broadcasts/BroadcastForm.tsx` — порядок полей, категории, дефолты.
- `apps/webapp/src/app/app/doctor/broadcasts/BroadcastAudienceSelect.tsx` — переписан на `ReferenceSelect`.
- `apps/webapp/src/app/app/doctor/broadcasts/labels.ts` — аддитивно добавлен `BROADCAST_FORM_CATEGORIES`.
- `apps/webapp/src/app/app/doctor/communications/tabs/BroadcastsTab.tsx` — `CatalogSplitLayout`, отступ заголовка.
- Тест-файлы: `BroadcastForm.test.tsx`, `BroadcastAudienceSelect.test.tsx`, `BroadcastsTab.test.tsx` — обновлены под новый порядок, дропдаун, дефолты.

### Сознательно не сделано

- **«Выбрать вручную» (диалог со списком пациентов)** — не реализован. Требует нового сегмента `manual` в `BroadcastAudienceFilter`, диалога с поиском пациентов, доступа к `DoctorClientsPort`. Выходит за рамки этапа, пересекается с зоной параллельной инициативы (`doctor-appointments`). Зафиксировано как развилка.
- **Новые сегменты аудитории** (`on_support`, `with_program`, `with_subscription`, и др.) — не добавлены. Требуют новых DB-фильтров в `modules/doctor-broadcasts/broadcastEligible.ts` и, возможно, джойнов с `modules/doctor-appointments`. Зафиксировано как развилка.

### Развилки

- **Новые сегменты аудитории (§5.1):** В ТЗ перечислены сегменты «На сопровождении», «С программой», «Приём в этом месяце», «С абонементами», «Подписчики», «Новые», «Бывшие», «С отменами». Их реализация требует: (a) добавления новых значений `BroadcastAudienceFilter`, (b) реализации фильтрации в `resolveBroadcastAudience` через порты, (c) потенциального пересечения с `pgDoctorAppointments.ts` (чужая зона). Не делать без явного согласования скопа.
- **«Выбрать вручную»:** Диалог со списком пациентов и чекбоксами — отдельный большой кусок UI/бэкенда. Требует хранения `userId[]` вместо enum-фильтра в команде рассылки. Обсудить с владельцем продукта.
- **Мобильный UX BroadcastsTab:** `CatalogSplitLayout` использует `mobileView="list"` (фиксированный). Правый пейн (журнал) на мобиле не доступен без переключения. Для мобильного UX нужно добавить `mobileView` state и кнопку переключения, аналогично чатам/заявкам.

---

## Этап 4a — бэкенд каналов рассылок

**Дата:** 2026-06-13

### Что сделано

1. **5-канальная модель (`broadcastChannels.ts`)**
   - Тип `BroadcastChannel` расширен: добавлены `"telegram"`, `"max"`, `"email"`.
   - `BROADCAST_ACTIVE_CHANNELS` → `["telegram","max","push","sms","email"]`.
   - Добавлен `BROADCAST_DEFAULT_CHANNELS = ["telegram","max","push"]` — используется при пустом вводе.
   - `normalizeBroadcastChannels`: пустой ввод → default-каналы; `"bot_message"` раскрывается в `["max","telegram"]` (backward compat).

2. **Перегейтирование delivery jobs (`deliveryJobs.ts`)**
   - Разделён `wantsBot` на `wantsTelegram` / `wantsMax` с поддержкой legacy-флага `legacyBotMessage`.
   - Telegram-job: `channels.includes("telegram") || legacyBotMessage`.
   - Max-job: `channels.includes("max") || legacyBotMessage`.
   - SMS — без изменений.

3. **Email fan-out (новый файл `fanOutBroadcastEmail.ts`)**
   - Отправка через `sendTransactionalSmtpEmail` по списку eligible-клиентов.
   - Адреса resolveтся через `BroadcastEmailRecipientsPort.getVerifiedEmailsForUserIds`.
   - SMTP-конфиг запрашивается lazy через `getSmtpValueJson: () => Promise<unknown>` — не блокирует инициализацию DI.
   - Полностью guarded: если `fanOutBroadcastEmailDeps` не задан — email-канал виден, счётчик реальный, но письма не отправляются.
   - Результат: `{ attempted, delivered, errors, skipped }`.

4. **Реальные счётчики каналов (`broadcastChannelCounts.ts`)**
   - Telegram: `COUNT(DISTINCT user_id) FROM user_channel_bindings WHERE channel_code = 'telegram'`.
   - Max: `COUNT(DISTINCT user_id) FROM user_channel_bindings WHERE channel_code = 'max'`.
   - Push: `COUNT(DISTINCT user_id) FROM user_web_push_subscriptions` (было hardcoded 0).
   - Email: `COUNT(*) FROM platform_users WHERE email_verified_at IS NOT NULL AND email_normalized IS NOT NULL AND merged_into_id IS NULL`.
   - SMS: `COUNT(*) FROM platform_users WHERE phone_normalized IS NOT NULL AND merged_into_id IS NULL`.
   - Поле `bot_message` = telegram (legacy alias).

5. **Инфраструктура email-recipients**
   - `pgBroadcastEmailRecipients.ts` — Drizzle реализация (запрос по `user_id ANY(::uuid[])`, только verified, не merged).
   - `inMemoryBroadcastEmailRecipients.ts` — in-memory stub для тестов.

6. **`BroadcastChannelCounts` (`draftPort.ts`)** — добавлены поля `telegram`, `max`, `email`.

7. **`BroadcastAudienceResolveResult` (`ports.ts`)** — добавлено опциональное `emailEligibleUserIds?: ReadonlySet<string>`.

8. **`broadcastEligible.ts`** — `filterEligibleBroadcastClients` принимает `emailEligibleUserIds`; `deriveBroadcastDeliveryPolicy` учитывает `wantsEmail`.

9. **DI wiring (`buildAppDeps.ts`)** — `createDoctorBroadcastsService` получает `fanOutBroadcastEmailDeps` с lazy getter `getSmtpValueJson`.

10. **UI-файлы (минимальные)**
    - `labels.ts` и `BroadcastForm.tsx` — добавлены метки для `telegram`, `max`, `email`.

### Тесты

- `broadcastChannels.test.ts` — обновлены ожидания для новых каналов по умолчанию и раскрытия `bot_message`.
- `deliveryJobs.test.ts` — 3 новых теста: явные `telegram`/`max`/`telegram+max` каналы.
- `service.test.ts` — исправлены ожидания каналов и policy kinds; добавлены тесты email fanout и guarded-режима.
- `broadcastEligible.test.ts` — добавлены тесты email-eligibility и channel-policy для telegram/max/email.
- `fanOutBroadcastEmail.test.ts` (новый) — 4 теста: отправка, skip без email, ошибки SMTP, reject resolver.
- `inMemoryBroadcastChannelCounts.test.ts` (новый) — 3 теста.

**Итог:** 8 test files, 65 tests — все GREEN.

### Гейт Phase15F

5/5 тестов GREEN. Все новые SQL — только через Drizzle `db.execute(sql\`...\`)`. pool.query/client.query не добавлялись.

### Не сделано (scope этапа 4b)

- UI изменения в `BroadcastForm.tsx` (тайлы каналов, UX email-channel) — этап 4b.
- Фильтрация по `emailEligibleUserIds` в `resolveBroadcastAudience` (buildAppDeps) — сейчас `emailEligibleUserIds` не передаётся из audience resolver, email-фанаут отправляет всем eligible-клиентам у кого есть verified email. Для точного контроля нужно добавить resolving через `broadcastEmailRecipientsPort` в `resolveBroadcastAudience`.

### Риски и решения

- **Legacy bot_message**: полная backward-compat через нормализацию на входе + флаг `legacyBotMessage` в deliveryJobs.
- **Lazy SMTP**: `getSmtpValueJson` вызывается per-execution, не при инициализации — корректно для кешированного DI.
- **Email fanout guarded**: если SMTP не настроен — `sendTransactionalSmtpEmail` вернёт ошибку/ok:false, которая логируется и считается в `errors`, но не роняет broadcast.

---

## Этап 3 (A2) — Заявки

**Дата:** 2026-06-12

### Что сделано

1. **Фильтры статусов → мультитоггл (без «Все»):**
   - Удалён тип `FilterMode` и массив `FILTER_CHIPS` со старым single-select (включая режим `"all"`).
   - Добавлен новый `FILTER_CHIPS: { status: IntakeStatus; label: string }[]` с 4 статусами: `new`, `in_review`, `booked`, `rejected` (без «Все»).
   - State заменён с `filterMode: FilterMode` на `selectedStatuses: Set<IntakeStatus>` (пустое множество = показать все заявки).
   - Функция `toggleStatus(status)` — клик вкл/выкл конкретный статус. Несколько статусов можно включить одновременно.
   - Логика фильтрации: `selectedStatuses.size === 0 ? allItems : allItems.filter(item => selectedStatuses.has(item.status))`.
   - Атрибут `aria-pressed` на каждой кнопке отражает текущее состояние тоггла.
   - Текст empty-state при фильтрации изменён: если нет заявок и выбраны статусы — «Нет заявок в выбранных статусах»; если список пуст совсем — «Заявок нет».
   - Удалён неиспользуемый импорт `doctorStatCardShellClass` из `doctorVisual`.

2. **Независимый скролл (CatalogSplitLayout):**
   - Раскладка переведена с `<div className="grid min-h-[400px]" style={{gridTemplateColumns:"1fr 1.4fr"}}>` на `CatalogSplitLayout` с `className={cn(DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE, "lg:grid-cols-[1fr_1.4fr]")}`.
   - Левый пейн (`leftPane`) — список заявок с тогглами; правый пейн (`rightPane`) — статистика + карточка детали. Каждый скроллится независимо.
   - `mobileView` переключается автоматически: `selectedId ? "detail" : "list"`.
   - Добавлены импорты: `CatalogSplitLayout`, `DoctorEmptyState`, `DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE`.

3. **Пустые состояния — `DoctorEmptyState`:**
   - Ad-hoc `<div>...<p>Выберите заявку слева</p>...</div>` заменён на `<DoctorEmptyState>`.
   - Состояния загрузки (левый пейн и правая карточка) также переведены на `DoctorEmptyState`.

4. **Статистика заявок (7/30/90/год) — НЕ тронута** (независима от фильтра, по решению владельца).
5. **Deep-link `?id=` и `onDetailChange`** — не сломаны; логика сохранена без изменений.

### Проверки

- `npx tsc --noEmit` — 0 ошибок в изменённых файлах (pre-existing ошибки в `schedule/**` — из параллельной инициативы, не наши).
- `npx vitest run src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.test.tsx` — **18 passed (1 file)**.
- `npx eslint DoctorOnlineIntakeClient.tsx DoctorOnlineIntakeClient.test.tsx` — **0 ошибок** (нет вывода).

### Затронутые файлы

- `apps/webapp/src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.tsx` — основной файл этапа.
- `apps/webapp/src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.test.tsx` — обновлены тесты под мультитоггл; добавлены кейсы «пустой выбор = все», «клик вкл/выкл», «несколько тогглов», «нет кнопки Все».

### Сознательно не сделано

- Mobile-кнопка «назад» в `mobileBackSlot` — не добавлялась (по аналогии с чатами, Этап 2). `CatalogSplitLayout` поддерживает слот, но мобильный UX не является фокусом этапа. Зафиксировано как развилка.
- Счётчики для статусов `booked` и `rejected` в чипах — не показываются (только `new` и `in_review` имеют счётчики, как было). Логика счётчиков не менялась.

### Развилки

- **Mobile UX заявок**: при открытии детали на мобильном (`mobileView="detail"`) пользователь не может вернуться к списку без выбора другой заявки — нет кнопки «← Назад» в `mobileBackSlot`. Аналогичная развилка из Этапа 2 (чаты). Решение — добавить `mobileBackSlot` с кнопкой ghost «← Назад» для закрытия детали.
- **Счётчики для всех статусов в тогглах**: сейчас счётчики отображаются только для `new` и `in_review`. Можно добавить для `booked` и `rejected` — небольшое изменение, но выходит за рамки текущего scope (требует уточнения у владельца, нужны ли все счётчики или только "горячие").
- **Начальный выбор тогглов**: дефолт — пустое множество (все заявки). Ранее дефолт был `filterMode="new"` (только новые). Изменение поведения может потребовать уточнения у владельца (если предпочтительно показывать только новые при входе). Зафиксировано как продуктовая развилка.

---

## Этап 2 (A1) — Чаты

**Дата:** 2026-06-12

### Что сделано

1. **Ширины пейнов и независимый скролл:**
   - `DoctorSupportInbox.tsx` — раскладка переведена с `grid style={gridTemplateColumns:"1.4fr 1fr"}` на `CatalogSplitLayout` с `className="lg:grid-cols-[1fr_1.2fr]"` (чат шире списка). Обёртка получила `DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE` для фиксированной высоты (вьюпорт − шапка − таб-бар). Каждый пейн имеет `overflow-y-auto` внутри — список и тред скроллятся независимо.
   - Добавлены импорты `CatalogSplitLayout`, `DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE`, `DoctorEmptyState`.

2. **Тред (`DoctorChatPanel`) — горизонтальный padding и интервал:**
   - `ChatView.tsx` — добавлен `px-3` к scroll-области для `variant === "doctor"` (через `cn`). Composer-обёртка получила `px-3` для той же ветки. Интервал между сообщениями в grouped-режиме: `space-y-3` для `doctor`, `space-y-2` для `patient` (было `space-y-2` везде).
   - `DoctorClientEmbeddedChat` использует тот же `DoctorChatPanel` с `variant="doctor"` — правки применятся и там, что ожидаемо (padding сообщений уместен в embedded-виде тоже).

3. **Превью в списке чатов — одна строка с ellipsis:**
   - Превью изменено с `<div className="... truncate">` на `<p className="... truncate">`. Добавлен `overflow-hidden` на `min-w-0 flex-1` контейнер строки для гарантированного ограничения ширины. Текст превью (`getSenderPrefix: lastMessageText`) уже был в `truncate` — `<p>` + `overflow-hidden` на родителе обеспечивает одну строку.

4. **Пустое правое состояние — `DoctorEmptyState`:**
   - Ad-hoc `<div>...<p>...</p><p>...</p></div>` заменён на `<DoctorEmptyState size="sm" className="flex-1 items-center justify-center px-6 text-center">` с двумя `<span>`. Текст «Выберите чат слева» сохранён (тест проходит).

5. **Поиск, чипы «Непрочитанные»/«★ На сопровождении», логика поллинга** — не тронуты.

### Проверки

- `npx tsc --noEmit` — **0 ошибок** (нет вывода).
- `npx vitest run DoctorSupportInbox.test.tsx` — **15 passed (1 file)**.
- `npx vitest run DoctorChatPanel.test.tsx` — **3 passed (1 file)**.
- `npx eslint DoctorSupportInbox.tsx ChatView.tsx` — **0 ошибок** (нет вывода).

### Затронутые файлы

- `apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx` — основной файл этапа.
- `apps/webapp/src/modules/messaging/components/ChatView.tsx` — padding и интервал для doctor-variant.

### Сознательно не сделано

- `DoctorChatPanel.tsx` не менялся — правки padding сделаны в `ChatView` (через ветку по `variant`), что более правильно с точки зрения разделения ответственности.
- Mobile-навигация (кнопка «назад» в мобильном виде) — не добавлялась: `CatalogSplitLayout` имеет `mobileBackSlot` проп, но для чатов мобильный UX не является объектом этого этапа. Зафиксировано как развилка.
- `rounded-2xl` в `ChatView` для пузырьков (`doctor` variant) — не менялся; он находится в `grouped` map и технически нарушает §A.3, но правка пузырьков чата не входила в scope этапа.

### Развилки

- **`rounded-2xl` в пузырьках доктора** (`ChatView` doctor grouped mode): пузырьки используют `rounded-2xl`, что запрещено по §A.3. Исправление требует осторожности (patient variant не трогать). Можно добавить ветку `variant === "doctor" ? "rounded-lg" : "rounded-2xl"`. Зафиксировано как backlog, не сделано в этом этапе.
- **Mobile UX чатов**: `CatalogSplitLayout` поддерживает мобильный режим `mobileView="list"|"detail"`. Реализовано переключение `mobileView={selectedId ? "detail" : "list"}`, но кнопки «назад» нет (`mobileBackSlot` не задан). На мобиле правая панель будет перекрывать левую при выборе чата, но возврата к списку без выбора другого чата нет. Можно решить добавлением кнопки «← Назад» в `mobileBackSlot`.
- **`gap-3` между таб-навом и контентом**: развилка из Этапа 1 — при фиксированной высоте через `DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE` (использует `dvh`) `gap-3` из `<main className="flex flex-col gap-3">` включён в расчёт высот через CSS-переменные. При проверке tsc 0 ошибок, ожидаем что высоты работают корректно по аналогии с упражнениями.

---

## Этап 1 (A0) — порядок вкладок + каркас скролла

**Дата:** 2026-06-12

### Что сделано

1. **Порядок вкладок изменён** на `Чаты → Комментарии → Заявки → Рассылки`:
   - `doctorCommunicationsTabs.ts` — `COMMUNICATIONS_TABS` переставлен в порядок `chats, comments, intake, broadcasts`.
   - `communicationsTabRegistry.ts` — `COMMUNICATIONS_TAB_REGISTRY` приведён к тому же порядку.
   - `doctorCommunicationsTabs.test.ts` — имя теста и ожидаемый массив обновлены на `["chats","comments","intake","broadcasts"]`.
   - `communicationsTabRegistry.test.ts` — не трогался: тест сравнивает реестр с `COMMUNICATIONS_TABS` динамически, а не хардкодит порядок.
   - `DoctorCommunicationsShell.test.tsx` — не трогался: vi.mock полностью переопределяет реестр, порядок реального файла не влияет на тесты шелла.

2. **Каркас независимого скролла** (структурная подготовка):
   - `DoctorCommunicationsShell.tsx` — обёртке активного таба (`<div hidden=...>`) добавлены классы `flex-1 min-h-0`.
   - `<main>` в `DoctorAppShell` уже `flex flex-col` — добавленные классы позволят активному пейну таба растянуться на оставшуюся высоту контейнера, когда табы этапов 2–5 реализуют внутренний скролл через `CatalogSplitLayout`.
   - Скрытые табы (`hidden` = `display:none`) не участвуют в flex-раскладке — на layout не влияют.
   - Паттерн keepMounted и URL-sync (history.replaceState/popstate) не затронуты.

### Проверки

- `npx tsc --noEmit` — 0 ошибок (нет вывода).
- `npx vitest run` по 3 тест-файлам — **19 passed (3 files)**.
- `npx eslint` по изменённым файлам — 0 ошибок (нет вывода).

### Сознательно не сделано

- Редиректы старых URL — не менялись (вне scope этапа 1).
- Deep-link ключи — не менялись (не трогаем контракт).
- Левое навигационное меню (`doctorNavLinks.ts`) — не трогается (чужая зона).
- Переверстка конкретных табов под независимый скролл — это этапы 2–5.
- Визуальный split конкретных пейнов (CatalogSplitLayout внутри ChatsTab/IntakeTab/CommentsTab/BroadcastsTab) — этапы 2–5.

### Развилки

- **Высота контейнера коммуникаций.** `DoctorAppShell` использует `DOCTOR_PAGE_CONTAINER_CLASS` (`mx-auto w-full max-w-7xl px-3 pt-3 pb-6`) без явного `h-full` или `min-h-0`. Когда табы (этапы 2–5) начнут применять `CatalogSplitLayout` с высотами типа `DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE`, контейнер будет использовать `dvh`-вычисления относительно viewport — это поведение идентично упражнениям. Проверить при реализации первого таба со split-layout (этап 2), что высоты работают корректно и не нужно дополнительно передавать `h-full` через `DoctorAppShell`.
- **`gap-3` в `<main>`.** Пространство между таб-навом и контентом таба — `gap-3` из `<main className="flex flex-col gap-3">`. При применении split-layout в табах нужно убедиться, что `gap-3` не создаёт лишних отступов между таб-баром и областью контента. Если потребуется убрать зазор — нужна будет аддитивная правка `DoctorAppShell` или передача класса через проп (с сохранением обратной совместимости).
