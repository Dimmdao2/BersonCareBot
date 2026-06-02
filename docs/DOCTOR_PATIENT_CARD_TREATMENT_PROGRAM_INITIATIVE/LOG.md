# LOG — DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE

**Назначение:** решения, проверки, инвентаризация кода, ссылки на PR.

---

## 2026-06-03 — Аудит фазы 2: remediation (unsaved gate, RTL smoke)

- **Unsaved gate:** `isFlushableDirty` / `hasInstanceEditorDraftFlushableChanges` — status API блокируется только при metadata-dirty; structural-only не мешает смене статуса этапа/программы.
- **Тесты:** `InstanceEditorUnsavedChangesDialog.test.tsx`; RTL smoke `TreatmentProgramInstanceDetailClient.phase2.test.tsx` (add stage → dirty без editor-mutation fetch); unit `hasInstanceEditorDraftFlushableChanges`.
- **Проверки:** vitest phase-2 suite (57 tests); `tsc --noEmit` webapp.

---

## 2026-06-03 — Фаза 2 batch-toolbar: полное закрытие (хвосты + проверки)

- **Хвосты:** guard-тест editor fetch; RTL SaveBar (`structuralPending`); context test metadata+addItemCreate; `expandLines` в pickers; dialog `test_set_expand`; snapshot helper tests; убраны мёртвые props `InstanceStageGroupsPanel`.
- **Вне scope фазы 2:** UI «замена элемента» (`patchItemStructural.replace`) — модель готова, экран не требовался.
- **План:** `.cursor/plans/instance-editor-batch-toolbar_3d597170.plan.md` — фаза 2 закрыта полностью.
- **Проверки:** vitest phase-2 suite; `tsc --noEmit` webapp.

---

## 2026-06-03 — Аудит фазы 1 + фаза 2: UI → draft (structural без немедленного API)

- **Модель:** `groupHides`; union `itemCreates` (`library_item`, `freeform_recommendation`, `test_set_expand`, `lfk_complex_expand`); `applyStageOrder` фиксирует этап 0 первым.
- **Context / SaveBar:** `hideGroup`; `saveDraft` → `{ structuralPending }` + toast при только structural.
- **UI:** reorder/add/hide/patch/delete элементов и групп, модалка библиотеки — через draft API; `expandLines` в picker для test set / lfk complex; `treatmentProgramLibraryDraftSnapshot.ts`.
- **Доки:** `treatment-program-shared/README.md`, `api.md` (structural в черновике, не immediate API); план `.cursor/plans/instance-editor-batch-toolbar_3d597170.plan.md` — todos `phase-1-draft-model`, `draft-model` **completed**.
- **Проверки:** vitest 33 tests (draft + dialog + pickers); `tsc --noEmit` webapp.

---

## 2026-06-03 — Редактор инстанса: фаза 1 закрыта (browser draft model)

- **Draft:** расширен `InstanceEditorDraft` — `stageOrder`, `stageCreates`, `groupCreates`, `itemCreates`, `itemDeletes`, `itemReorders`, `groupReorders`, `itemStructuralPatches`; client-id через `draft:` prefix.
- **Merge/normalize:** `mergeInstanceEditorDraftIntoDetailRaw`; normalize для draft-сущностей (stage/group/item creates); `pickInstanceEditorDraftFlushChanges` vs `hasInstanceEditorDraftStructuralChanges`.
- **Context:** `setStageOrder`, `addStageCreate`, `addGroupCreate`, `addItemCreate`, `deleteItem`, `setItemReorder`, `setGroupReorder`, `patchItemStructural`; `saveDraft` после legacy flush сбрасывает только metadata-секции (`clearFlushableInstanceEditorDraftSections`).
- **План:** `.cursor/plans/instance-editor-batch-toolbar_3d597170.plan.md` — todo `phase-1-draft-model` **completed** (фаза 2 — отдельная запись выше).
- **Проверки:** vitest 20 tests (`instanceEditorDraft`, `InstanceEditorDraftContext`, `flushInstanceEditorDraft`); `tsc --noEmit` webapp.

---

## 2026-06-02 — Фаза 7: B6 превью шаблонов + proactive-лента на «Сегодня» (MVP)

- **B6 хвост:** список шаблонов — `MediaThumb` + worker `previewSmUrl` из `media_files` (`enrichTemplateListPreviewMedia`, `templateListPreviewToPreviewUi`).
- **Proactive MVP:** модуль `doctor-proactive-insights` — `on_support`: wellbeing 3 дн. ≤ 2/5 (якорь сегодня/вчера); inactivity по **активному instance** 5+ дн.; порт `queryInsights` + `listForPatient` (scoped).
- **UI / API:** секция «Сигналы пациентов» на «Сегодня»; блок «Сигналы» в карточке (Обзор); deep links; бейдж `todayAttention`; `GET /api/doctor/proactive-insights/summary`.
- **Не дублируем:** inbox «К проверке» (фаза 5).
- **Аудит (2026-06-02):** исправлены двойной build insights, global lastDone, video preview skeleton, stale test `doctorNavLinks`; добавлены тесты `mapProactiveInsightsForToday`, `mediaPreviewUiModel.templateList`, integration `loadDoctorTodayDashboard`.
- **Доки:** `ACTIVE_WORKQUEUE.md`, `TODO.md`, `DOCTOR_DASHBOARD_METRICS.md`, `api.md`, `ROADMAP_2.md` §4.1, план-очередь §фаза 7, `APP_RESTRUCTURE_INITIATIVE/LOG.md`.
- **Проверки:** vitest proactive + dashboard + menu (63+ targeted); `tsc --noEmit` webapp.

---

## 2026-06-02 — Фаза 5: cross-patient inbox «К проверке» на «Сегодня»

- **Данные:** `listPendingEvaluationResultsGlobal` / `listPendingTestEvaluationsGlobal` — result-строки по top N **попыток** (PG: `count distinct attempt` + `limit` по `max(created_at)`); `countPendingEvaluationAttemptsGlobal` / `countPendingTestEvaluationAttemptsGlobal` — точный total для truncation; тип `PendingProgramTestEvaluationGlobalRow` (+ `patientUserId`, `patientDisplayName`). Порт/сервис: `progress-service.ts`, `pgTreatmentProgramTestAttempts.ts`, `inMemoryTreatmentProgramInstance.ts`.
- **«Сегодня»:** `DoctorTodayPendingProgramTestsSection`, `mapPendingProgramTestsForToday`, `loadDoctorTodayDashboard`; строка «Тесты к проверке» в «Требует внимания»; якорь `#doctor-today-section-pending-tests`; порядок preview = порядок PG top-N.
- **Deep link:** `doctorClientTreatmentProgramInstanceHref` + query `focusItemId` (UUID `treatment_program_test_results.id`) → `doctorProgramTestResultDomId`, scroll/highlight с retry до mount; карточка (`DoctorClientProgramTab`) «Оценить» — тот же href. RSC `page.tsx`: UUID для `focusItemId` и `discussionItem`.
- **Меню:** бейдж «Сегодня» — `GET /api/doctor/pending-program-tests/summary`, `useDoctorPendingProgramTestsCount`, `DoctorMenuBadgeKey.pendingProgramTests` (ROADMAP_2 §2.2).
- **Доки / синхронизация:** `api.md`, `ACTIVE_WORKQUEUE.md`, `TODO.md`, `CARD_REDESIGN_PLAN.md` §11, `ROADMAP_2.md` §2.2–2.3, план-очередь §фаза 5.
- **Проверки:** `progress-service.test.ts`, `mapPendingProgramTestsForToday.test.ts`, `DoctorTodayDashboard.test.tsx`, `doctorClientInstanceHref.test.ts`, `pending-program-tests/summary/route.test.ts`, `DoctorMenuAccordion.test.tsx`, `useDoctorPendingProgramTestsCount.test.tsx`; targeted vitest + `tsc --noEmit` webapp.

---

## 2026-06-02 — Фаза 4 (финал): продуктовое правило фильтров picker

- **Решение owner:** пункты «Без региона» / «Без типа» (`DOCTOR_CATALOG_FILTER_MISSING`) — **только** на экранах **создания/редактирования** в библиотеке врача (`DoctorCatalogFiltersForm`: упражнения, тесты, комплексы и т.д.) для аудита незаполненных карточек. В picker **добавления из библиотеки в программу/шаблон** (`TreatmentProgramLibraryPickerToolbar`, `InstanceAddLibraryItemDialog`, `TreatmentProgramConstructorClient`) — **убраны**.
- **Код:** без `missingValueOption` в toolbar; `treatmentProgramLibraryPickerFilters` — только конкретные коды региона/нагрузки; из `TreatmentProgramLibraryRow` убраны `matchesMissing*`.
- **Проверки:** 13 тестов (`treatmentProgramLibraryPickerFilters.test.ts`, `InstanceAddLibraryItemDialog.test.tsx`, `buildTreatmentProgramLibraryPickers.test.ts`); `tsc --noEmit` webapp.
- **Доки:** `treatment-program-shared/README.md`, этот LOG, `ACTIVE_WORKQUEUE.md`, план-очередь, `TODO.md` §Doctor card.

---

## 2026-06-02 — Фаза 3: черновик редактора назначенной программы (metadata)

- **Черновик (metadata):** `treatment-program-shared/instanceEditorDraft.ts`, `InstanceEditorDraftContext`, sticky `InstanceEditorSaveBar`; правки метаданных этапа/группы, `localComment`, нагрузка упражнения — in-memory; один batch save (`flushInstanceEditorDraft`) с единственным confirm для `active`. **Structural** операции — отдельный план batch-toolbar (фазы 1–2 закрыты 2026-06-03, см. LOG выше).
- **Guard:** `programInstanceMutationGuard` — структурные мутации без confirm на клик; `useInstanceEditorUnsavedGate` — модалка перед **сменой статуса этапа** и **«Завершить программу»** при dirty; `beforeunload` при уходе со страницы.
- **Normalize:** `normalizeInstanceEditorDraft` / `isInstanceEditorDraftDirty` — no-op blur не помечает черновик dirty; partial batch failure → перезагрузка baseline + toast «сохранено частично».
- **Backend:** `updateInstance(status=completed)` закрывает все этапы (кроме `skipped`) + события `stage_completed`.
- **Карточка:** блок «Изменения программы» на табе «Обзор» (`buildDoctorClientRecentProgramChanges`, до 5 событий).
- **Проверки:** `instanceEditorDraft.test.ts`, `flushInstanceEditorDraft.test.ts`, `instance-service.test.ts` (complete→stages), `buildDoctorClientRecentProgramChanges.test.ts`, `loadDoctorClientProgramCardAggregates.test.ts`; `tsc --noEmit` webapp; `api.md` — UX черновика редактора.

---

## 2026-06-02 — Фаза 4: фильтры каталога в модалке экземпляра программы

- **Shared:** `treatmentProgramLibraryPickerFilters.ts`, `TreatmentProgramLibraryPickerToolbar`, `useTreatmentProgramLibraryPickerList` — поиск + регион + тип нагрузки; empty state «Ничего не найдено по фильтрам»; фильтры для **exercise** и **lfk_complex** (метаданные состава комплекса).
- **`InstanceAddLibraryItemDialog`** и **`TreatmentProgramConstructorClient`** — общий toolbar/hook.
- **`buildTreatmentProgramLibraryPickers`:** `regionCodes` / `loadType` / `loadTypes`; RSC — `bodyRegionIdToCode`, `lfkTemplates` с `includeExerciseDetails: true`. В picker программы/шаблона **нет** «Без региона» / «Без типа» (только на экранах каталогов врача).
- **Проверки:** `treatmentProgramLibraryPickerFilters.test.ts`, `InstanceAddLibraryItemDialog.test.tsx`, `buildTreatmentProgramLibraryPickers.test.ts`; `tsc --noEmit` webapp.

---

## 2026-06-02 — Фаза 6: CMS enum + `/help` (очередь workqueue, финал)

- **Таксономия / БД:** `CONTENT_PAGE_ROLES` + `contentPageRoleForSection` (`modules/content-sections/content-page-roles.ts`); раздел `help` — миграция `0103_help_content_section.sql`; константы `HELP_SECTION_SLUG`, `canonicalSlugs` (`preparation`, `cost`).
- **CMS (врач):** сайдбар «Статьи справки»; страницы только в `?section=help`; slug `help` защищён от создания/удаления; подсказка slug в `ContentForm`.
- **Пациент:** `/app/patient/help` (каталог), `/app/patient/help/[slug]` (`modules/help-content/listHelpArticles.ts`, `PatientContentSlugArticle`); `export const dynamic = "force-dynamic"`.
- **Хвосты аудита:** `revalidatePatientContentPaths` (`saveContentPage`, `applyContentLifecycle`, `setContentPageRequiresAuth`); канонический URL — редирект `/app/patient/content/[slug]` → `/help/[slug]` (`patientHelpArticlePath.ts`); `CabinetInfoLinks` + `buildCabinetInfoLinkTiles` (плитки на «Запись»; план `patient_help_booking_surface` **закрыт** 2026-06-03: city-aware адрес, `/app/patient/about`, `CMS_EDITOR_CHECKLIST.md`).
- **Доки / синхронизация:** `ROADMAP_2` §1.7/§3.3, `DOCTOR_CMS_AND_RUNTIME.md`, `ACTIVE_WORKQUEUE.md`, `TODO.md`, `APP_RESTRUCTURE_INITIATIVE/LOG.md`, план-очередь §фаза 6, `modules/help-content/README.md`.
- **Проверки:** vitest 34+ (`help-content`, `content-sections`, `revalidatePatientContentPaths`, `cabinetInfoLinkTiles`, `sections/actions`); `tsc --noEmit` webapp.

---

## 2026-06-02 — Синхронизация docs и плана (фазы 3–5 закрыты)

- План-очередь: YAML todos 0–7 completed (`status: completed`); фаза 6 — см. запись выше.
- Фаза 5 (финал): count API, бейдж «Сегодня», UUID query, аудит порядка preview — отражено в плане §фаза 5, `ROADMAP_2` §2.2–2.3, `ACTIVE_WORKQUEUE.md`, `TODO.md`, `docs/README.md`.

---

## 2026-06-02 — Фаза 2C: хвост по аудиту

**Сделано:** честный `sent` в напоминаниях (relay/email/push); `undeliverable` → `reminder_sent_at` без вечного tick; `getPatientClientIdentity` (`role=client`); UI — дата постановки, выполненные, ошибки загрузки; одна форма на «Сегодня»; тесты route/summary/complete/global + notify; deploy/cron таблица, якорь `#doctor-client-section-tasks`, `api.md` / `SPECIALIST_TASKS.md`.

**Проверки:** vitest (specialist-tasks, `tasks/route.test`); `tsc --noEmit`.

---

## 2026-06-02 — UX-аудит 2B (P0/P1)

**Сделано:**
- Встроенный чат в табе «Коммуникации» (`DoctorClientEmbeddedChat`); Hero/Strip → таб + якорь; модалка чата убрана.
- Inbox и Care Plan → deep link `?discussionItem=`; на экране инстанса автооткрытие `DoctorProgramItemDiscussionDialog`.
- Action Strip: заголовок «Сейчас», variant по приоритету; «План не открыт» только в Strip.
- Обзор: primary/secondary карточки; иконки типов элементов; заметки в `<details>`; легенда разминки на спарклайне.
- Программа: зона «Срочное» (`doctorClientUrgentZoneClass`); Records/Account — единые секции/карточки; админ ⌄ вне таб-бара; sticky табы.

**Проверки:** `tsc --noEmit`; vitest `ClientProfileCard*`, `doctor-client-card/*` (21 passed). Документация: `CARD_REDESIGN_PLAN.md`, `README.md`, `ROADMAP.md`, `api.md`.

**Не делали:** Hero-сводка задач (2C); inline quick-reply в карточке.

---

## 2026-06-02 — UI-полировка карточки (после ревью Composer)

**Сделано:** общий `doctorClientCardChrome.ts`; Hero — вторая строка на mobile (запись + сопровождение); Action Strip → `#doctor-client-section-program-inbox`; таб «Программа» — сначала inbox/тесты; Care Plan — прогресс этапов, кликабельные строки с превью, plain-text goals; спарклайн на всю ширину; убран пустой блок в «Коммуникации»; единые бейджи на табах.

---

## 2026-06-02 — Фаза 2B: доработки по аудиту

**Сделано:**
- `loadDoctorClientProgramCardData`: агрегаты + `carePlan` (текущий этап, goals/objectives, элементы с «Новое», static-превью) + `programInbox` (комментарии/медиа без ответа врача, CTA «Ответить в программе»).
- Обзор: `buildDoctorClientCarePlanOverview`; спарклайн самочувствия с маркерами ЛФК (`warmupScatter`).
- Тесты: `buildDoctorClientCarePlanOverview.test.ts`, `loadDoctorClientProgramCardAggregates.test.ts`; якоря `pending-program-tests` / `communications`, `?chat=1`, раскрытие графика.
- `apps/webapp/src/app/api/api.md` — контракт RSC-агрегатов карточки.

**Не делали:** фаза 2C (задачи, Drizzle, worker, Hero-сводка задач); inline quick-reply в карточке (ответ на экране инстанса).

---

## 2026-06-02 — Фаза 2B: карточка врача (Tabs + Hero + Action Strip)

**Сделано:**
- `ClientProfileCard` — каркас: `PatientCareBar`, `PatientActionStrip`, табы Обзор / Программа / Коммуникации / Записи / Учётка; якоря `#doctor-client-section-*` → таб + scroll (`useDoctorClientAnchorTab`).
- RSC: `loadDoctorClientProgramCardData` (комментарии/медиа по последнему сообщению пациента в обсуждении элемента; «план не открыт» через `patientPlanUpdatedBadgeForInstance`), `buildDoctorClientWellbeingModel` + `displayTimeZone` на `[userId]/page.tsx`.
- Обзор: Care Plan summary + CTA, спарклайн самочувствия + lazy полный график, заметки; Program/Records/Account — перенос существующих панелей по §4.5.
- Hero: компактный `DoctorClientSupportCareBar`; чат-кнопка «Чат»; меню `⋯`.

**Семантика «нового» в Action Strip (2B-3):** по каждому активному элементу инстанса — последнее сообщение `senderRole=patient` без ответа врача после; медиа отдельным счётчиком (`mediaFileId`).

**Проверки:** `pnpm --dir apps/webapp exec tsc --noEmit`; vitest `countDiscussionAttention.test.ts`, `ClientProfileCard.backLink.test.tsx`, `ClientProfileCard.anchorTab.test.tsx` (fast).

---

## 2026-06-02 — Фаза 2A: дизайн карточки утверждён

- Модель карточки: **Tabs + Hero**, график самочувствия **вторичный** (спарклайн в «Обзоре», полный — по клику) — owner.
- Оформлен [`CARD_REDESIGN_PLAN.md`](CARD_REDESIGN_PLAN.md): user tasks, data inventory (что есть / новые агрегаты), IA (Hero + Action Strip + табы Обзор/Программа/Коммуникации/Записи/Учётка + Админ), декомпозиция, data/API контракт, миграция якорей, execution slices, acceptance checklist.
- Добавлена сущность **«Задача» специалиста** (фаза 2C): глобальные + по пациенту, дата постановки/описания/срок/напоминание/важность/выполнение; каналы напоминаний — настройка специалиста; доставка через worker. В карточке — секция «Задачи» + сводка невыполненных в Hero; глобальные — на «Сегодня».
- Cursor: `active_workqueue_plan_30236040` — `phase-2-doctor-card` `completed`; добавлены `phase-2c-*`.

---

## 2026-06-02 — Синхронизация планов и docs (фазы 0–1 закрыты)

- Cursor: `active_workqueue_plan_30236040` — `phase-0` / `phase-1` / `phase-7` todos `completed`.
- Cursor: `phase1_support_model_7c745931` — все todos `completed`, DoD [x].
- Репозиторий: [`docs/ACTIVE_WORKQUEUE.md`](../ACTIVE_WORKQUEUE.md), [`docs/TODO.md`](../TODO.md) §Doctor card (P0 + support).

---

## 2026-06-02 — Фаза 1: доработки по аудиту

- Route-тесты patient discussion/media: мок `doctorClients.getPatientProgramInteractionPolicy`; кейсы `403` comments/media.
- UX: `support` только при `scope=all`; `listBasePath` сохраняет `support`; ссылка «Программа без сопровождения» на «Сегодня» при ненулевом списке.
- `inMemoryDoctorClients`: фильтры `supportStatus`; RTL disabled на плитке программы; `PROMO_ASSIGNMENT_SOURCE.md`, `api.md`.

---

## 2026-06-02 — Фаза 1: модель «На сопровождении»

- Таблица `doctor_patient_support` + backfill `on_support=true` для активных doctor-программ (миграция `0101_doctor_patient_support.sql`).
- Метрика `onSupportCount` и «Сегодня» — по флагу сопровождения; списки `?support=on` и `?support=programWithoutSupport`.
- Врач: PATCH/GET `support-settings`, панель в `ClientProfileCard`, doctor-scope defaults в `/app/settings`.
- Пациент: effective policy на UI (visible/disabled) и API (`403` `patient_support_*_disabled`).
- Док: `DOCTOR_DASHBOARD_METRICS.md`, `docs/TODO.md` (первые два пункта §Doctor card).
- Проверки: targeted vitest (support policy, routes, patient UI), `pnpm --dir apps/webapp typecheck`.

---

## 2026-06-01 — Закрытие MASTER_PLAN; продуктовые решения; backlog в TODO

- **Ручной smoke** назначения программы — ✅ подтверждён owner (используется на prod).
- **O5–O7** — решения зафиксированы в [`ROADMAP.md`](ROADMAP.md) §5.
- **Следующий контур** (сопровождение, карточка, черновик редактора, графики) — [`docs/TODO.md`](../../TODO.md) §Doctor card; не блокирует закрытие [`MASTER_PLAN.md`](MASTER_PLAN.md).

---

## 2026-05-14 — Инбокс «Тесты, ожидающие оценки» по попытке

- DTO `PendingProgramTestEvaluationRow`: `attemptId`, `attemptSubmittedAt`; PG + in-memory `listPendingEvaluationResultsForPatient` заполняют поля.
- `groupPendingProgramTestEvaluations.ts` + unit-тесты (`fast`): группы по `attempt_id`, сортировка групп по `submitted_at` ↓, tie-break по `attemptId` (лекс. убывание), внутри группы — `createdAt` ↑, затем `resultId`.
- `ClientProfileCard`: одна карточка на попытку, бейдж «К проверке · N» (N = число неоценённых результатов), ссылка «Открыть» с `#doctor-program-instance-test-results`.
- Экран экземпляра программы: **`GET .../test-results`** отдаёт **`attemptAcceptMap`**; кнопка «Принять попытку» только для актуального хвоста (см. `apps/webapp/src/app/api/api.md`).

---

## 2026-05-05

- Созданы [`README.md`](README.md) и [`ROADMAP.md`](ROADMAP.md) — консолидация источников по задаче «шаблон → instance → правки» из карточки врача.

---

## 2026-05-05 — Выполнение MASTER_PLAN.md

### Шаг 1: Удалён `AssignLfkTemplatePanel` из карточки и страниц

- `ClientProfileCard.tsx`: удалён `import AssignLfkTemplatePanel`, удалены пропсы `publishedLfkTemplates` и `assignLfkEnabled`, удалён рендер `<AssignLfkTemplatePanel ... />`.
- `[userId]/page.tsx`: убран `deps.lfkTemplates.listTemplates(...)` из `Promise.all`, удалены соответствующие пропсы.
- `page.tsx` (список клиентов): убран `deps.lfkTemplates.listTemplates(...)` из верхнеуровневого `Promise.all` (лишний запрос к БД при каждом рендере), удалены пропсы.
- `ClientProfileCard.backLink.test.tsx`: удалён `vi.mock("./AssignLfkTemplatePanel", ...)`.
- Проверка: `rg "AssignLfkTemplatePanel" apps/webapp/src` → только удаляемые файлы; `rg "publishedLfkTemplates|assignLfkEnabled" apps/webapp/src/app/app/doctor/clients` → пусто.
- `pnpm --dir apps/webapp exec tsc --noEmit` → OK.

### Шаг 2: Удалены файлы `AssignLfkTemplatePanel.tsx` и `assignLfkTemplateAction.ts`

- `rg "assignLfkTemplateFromDoctor|assignLfkTemplateAction|AssignLfkTemplatePanel" apps/webapp/src` → только сами файлы, внешних ссылок нет.
- Файлы удалены.
- `pnpm --dir apps/webapp exec tsc --noEmit` → OK.

### Шаг 3: Модалка выбора шаблона в `PatientTreatmentProgramsPanel.tsx`

- Инлайн-`Select` + старая кнопка «Назначить программу» заменены на CTA «Назначить программу лечения» + `Dialog`.
- Модалка: поиск по названию (всегда виден), прокручиваемый список с выделением, inline-ошибка (`role="alert"`), кнопки «Отмена» / «Назначить».
- Успех: `toast.success("Программа лечения назначена")` + закрытие модалки + перезагрузка списка инстансов.
- 409/ошибка: показывается `data.error` inline под списком, модалка остаётся открытой.
- `DialogContent`: `className="max-h-[80vh] overflow-y-auto"`.

### Шаг 4: Целевые проверки (без full CI)

- `pnpm --dir apps/webapp exec tsc --noEmit` → OK.
- `pnpm --dir apps/webapp lint` → OK.
- `pnpm --dir apps/webapp test -- PatientTreatmentProgramsPanel` → 3 новых теста зелёные; 539 файлов / 2763 теста всего прошли.

### Что намеренно не трогали

- `lfkAssignments` в `buildAppDeps` и `pgLfkAssignments.ts` — используются в purge/merge/diaries.
- `DoctorLfkComplexExerciseOverridesPanel` — оставлен для правки legacy-данных.
- API `treatment-program-instances` — контракт не менялся.
- Никаких миграций и изменений схемы БД.

---

## 2026-05-07 — Parity UI: конструктор шаблона → экран назначенной программы

Краткая матрица (template constructor vs doctor instance editor):

| Блок | Шаблон (`TreatmentProgramConstructorClient`) | Инстанс (до работ) | Инстанс (цель) |
|------|----------------------------------------------|--------------------|----------------|
| Карточка этапа | `TPL_CONSTRUCTOR_LEARNING_STAGE_CARD_CLASS`, цветная шапка | Простая `section` + текст | Тот же shell + цветная шапка этапа |
| Toolbar этапа | `+ Группа`, настройки этапа, reorder этапов | `StageDoctorControls` отдельным блоком | `+ Группа` в шапке карточки; управление этапом в теле |
| Группа | Карточка с цветной шапкой, элементы inline в `ul` | Строка группы; элементы только в модалке «Изменить» | Карточка как в шаблоне; элементы inline под группой |
| Элемент | Компактная строка + модалка настроек | Развёрнутая карточка | Компактный `<details>` + детали при раскрытии |
| Мутации | Черновик/публикация | Без единого guard | `requestProgramInstanceDataMutation` для `active`; lock при `completed` |

Общий код: `@/app/app/doctor/treatment-program-shared/*` (shell styles + guard).

---

## 2026-05-07 — Реализация Constructor-style UI для экземпляра программы

- Shell как у конструктора шаблона: `INSTANCE_CONSTRUCTOR_LEARNING_STAGE_CARD_CLASS`, цветные шапки этапа/групп, группы с inline-элементами; этап 0 «Общие рекомендации» — карточка с шапкой в левой колонке.
- Мутации: `requestProgramInstanceDataMutation` / `isProgramInstanceEditLocked` (`programInstanceMutationGuard.ts`); для `active` — `confirm` перед PATCH/POST; для `completed` — кнопки отключены.
- Элементы: `<details>` + бейдж «Комментарий: своё» при непустом `localComment`.
- Файлы: `TreatmentProgramInstanceDetailClient.tsx`, `treatment-program-shared/*`.
- Проверки: `pnpm --dir apps/webapp exec tsc --noEmit`, `pnpm exec eslint` по затронутым путям.
- Не делали: полноценный «добавить элемент из каталога» как в шаблоне (отдельный picker / POST items из UI).

---

## 2026-05-07 — Системные группы экземпляра и документация

- Реализованы/зафиксированы: `system_kind` на `treatment_program_instance_stage_groups` (Drizzle + миграции `0044`, `0045` — уникальность одной rec/tests на этап), автоподстановка системных групп в `createInstanceTree` при ungrouped `recommendation`/`clinical_test` без строк в `groups` (`instance-tree-system-groups.ts`).
- Обновлены: `PROGRAM_PATIENT_SHAPE_PLAN.md` §1.1 / §1.1a, `ROADMAP.md` §4, `PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md` (таблица фильтров), JSDoc в `types.ts` для дерева экземпляра.

---

## 2026-05-07 — Правки по пост-реализационному аудиту (UX/a11y/DRY)

- **Guard:** добавлен `runIfProgramInstanceMutationAllowed`; мутации инстанса в `TreatmentProgramInstanceDetailClient` переведены на него (единая точка после sync `requestProgramInstanceDataMutation`).
- **Скрыть группу:** одно подтверждение — текст для `active` включает предупреждение об активной программе и последствия hide (раньше было guard + второй `confirm`).
- **Дубль «Отключено»:** убран бейдж в свёрнутой строке `<details>` карточки элемента; статус остаётся в строке действий (`InstanceStageItemDoctorRow`).
- **a11y:** `DialogDescription` для завершения программы, отключения элемента с историей; расширено описание модалки «Настройки этапа» (шаблон → правки только для пациента).
- **`CommentBlock`:** опциональный `mutationsDisabled` — при завершённой программе скрыта форма нового комментария и недоступны правки/удаление существующих.
- **DRY shell:** константы шапок/карточек конструктора шаблона импортируются из `treatment-program-shared/treatmentProgramConstructorShellStyles.ts` (алиасы `TPL_*`).
- **Не делали:** UI «добавить элемент из каталога» на экране инстанса — по-прежнему бэклог parity с шаблоном.

Проверки: `pnpm --dir apps/webapp exec tsc --noEmit` → OK; `pnpm --dir apps/webapp exec eslint` по путям `TreatmentProgramInstanceDetailClient`, `TreatmentProgramConstructorClient`, `treatment-program-shared/*`, `CommentBlock` → OK.

---

## 2026-05-08 — Плоские тесты в программе (`clinical_test`) и синхронизация доков

- Продуктовый тип элемента этапа для одного клинического теста: **`clinical_test`**; развёртывание каталожного набора — **`POST .../items/from-test-set`** (шаблон и инстанс). Снимок элемента по-прежнему несёт массив **`tests[]`** там, где нужен состав (например после разворота из набора).
- Документация: `ROADMAP.md` §4, `apps/webapp/src/app/api/api.md`, `docs/README.md`, `ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md`, `PROGRAM_PATIENT_SHAPE_PLAN.md` §1 / §1.1a / таблица completion, `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/{LOG,BLOCK_LAYOUT_REFERENCE}.md`, JSDoc в `testSetSnapshotView.ts` и `stageItemSnapshot.ts`, лог событий `item_added` при expand — `source: "expand_test_set_into_clinical_tests"`.
- Миграция `0048`: конвертация legacy `test_set` → строки `clinical_test` по строкам каталога **`test_set_items`** (не по JSON snapshot).

---

## 2026-05-08 — Рекомендации: дефолт «постоянная» на экземпляре

- **`createTreatmentProgramInstanceService`:** при копировании шаблона в инстанс и при `doctorAddStageItem` для `recommendation` выставляется **`is_actionable = false`** (постоянная). Раньше было `true` (исполняемая). Переключение «Требует выполнения» — по-прежнему в UI карточки элемента инстанса (`PATCH` с `isActionable`).
- Тест: **`instance-service.test.ts`** — кейс дефолта «постоянная»; закрыт в репо (**не** блокируется prod-данными). Прогон: `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/instance-service.test.ts` (или полный CI).
- Документация: [`ROADMAP.md`](ROADMAP.md) §4, [`PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) §4.1, [`TARGET_STRUCTURE_PATIENT.md`](../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_PATIENT.md) §12.3; backlog «дефолт из каталога/шаблона» — [`docs/TODO.md`](../../TODO.md).

---

## 2026-05-05 — Аудит выполнения и закрытие документации

- Проведён полный аудит против `MASTER_PLAN.md` §Definition of Done и `DECOMPOSITION.md` этапы A–E.
- Все автоматически проверяемые пункты DoD (1–7, 9) **подтверждены** против кода и вывода тестов.
- **Единственный незакрытый пункт** — DoD №8 «ручной smoke» — требует живого стенда; в `MASTER_PLAN.md` шаг 4 помечен `⏳ pending`.
- Документация синхронизирована:
  - `MASTER_PLAN.md`: статус → ✅ выполнен, чеклисты шагов 1–3, 5 закрыты, DoD проставлены.
  - `DECOMPOSITION.md`: таблица этапов A–E обновлена статусами.
  - `ROADMAP.md`: заголовок и §6 Этап 2 отражают факт завершения.
- Оставшаяся работа по инициативе (этапы 3–6 из `ROADMAP.md`): правка инстанса из карточки, inbox «К проверке», каталоги — **отдельная задача**, не блокируется текущим состоянием.

---

## 2026-05-08 — Пустой индивидуальный план и свободный текст рекомендаций (этап 0)

### Сделано

- **`template_id` nullable на дереве создания:** `CreateTreatmentProgramInstanceTreeInput.templateId: string | null`, `TreatmentProgramInstanceStageInput.sourceStageId: string | null` (уже совпадало с БД).
- **`createBlankIndividualPlan`** в `instance-service`: один этап с `sort_order = 0`, заголовок этапа `TREATMENT_PROGRAM_TEMPLATE_STAGE_ZERO_TITLE`, заголовок инстанса по умолчанию `BLANK_INDIVIDUAL_PLAN_DEFAULT_TITLE`.
- **POST** `/api/doctor/clients/[userId]/treatment-program-instances`: тело `kind: "from_template" | "blank"` + **legacy** `{ templateId }` → трактуется как `from_template`.
- **Атомарное добавление свободного текста:** порт `createFreeformRecommendationAndStageItem` (PG транзакция: `recommendations` + `instance_stage_item`), сервис `doctorAddFreeformRecommendationToStageZero`, route `POST .../items/from-freeform-recommendation`. Тег строки каталога: `tp_instance_freeform`.
- **UI:** `PatientTreatmentProgramsPanel` — режим «Пустой план», метка «без шаблона» в списке; `InstanceAddLibraryItemDialog` — вкладки «Каталог» / «Свой текст» только для этапа 0.

### Проверки

- `pnpm --dir apps/webapp exec vitest run` (таргет): `instance-service.test.ts`, `PatientTreatmentProgramsPanel.test.tsx`, `InstanceAddLibraryItemDialog.test.tsx`, `treatment-program-instances/route.test.ts`, `from-freeform-recommendation/route.test.ts`.
- Ручной интеграционный сценарий — см. блок **«Ручной smoke»** ниже (не заменяет CI).
- Документация API: `apps/webapp/src/app/api/api.md` — строка про **`POST .../items/from-freeform-recommendation`**.
- Полный **`pnpm run ci`** (корень монорепо): после фикса импорта константы тега в `pgTreatmentProgramInstance.ts` (value-import вместо `import type`).

### Не делали

- Сущность «Приём», журнал посещений, FK приём → элемент.

### Ручной smoke (перед релизом или после деплоя)

1. Карточка пациента → «Назначить программу лечения» → «Пустой план» → создать; в списке инстансов есть суффикс «без шаблона».
2. То же с заполненным необязательным названием — заголовок инстанса в списке совпадает с вводом.
3. Открыть экземпляр → этап «Общие рекомендации» → добавить «Свой текст» (Markdown) → элемент появляется в списке этапа.
4. Войти как пациент этого пользователя → план лечения → рекомендация этапа 0 отображается.
5. Повторное назначение при уже активной программе → **409** и сообщение о второй активной программе.

Дублирование автоматических проверок: доменная логика этапа 0 для freeform — **`instance-service.test.ts`** (`doctorAddFreeformRecommendationToStageZero`); HTTP-маршрут — **`from-freeform-recommendation/route.test.ts`** (в т.ч. чужой **`stageId`** в URL).

### Доработка после аудита (тот же день)

- Пустой план: в модалке назначения — необязательное поле названия инстанса → `POST { kind: "blank", title? }`; guard «Назначение…» покрыт тестом «кнопка disabled на время POST».
- Этап 0 «Свой текст»: в модалке — **`Textarea`** для тела (в **`bodyMd`**); тест `InstanceAddLibraryItemDialog.test.tsx`.
- API-тесты **`from-freeform-recommendation`**: `401`, `403`, `404` (инстанс / пациент), `400` для не-этапа 0 (в route-тесте — **другой `stageId` в URL** + mock сервиса, зеркало отказа); **`clients/.../treatment-program-instances`**: `kind: "blank"` с `title`.
- Проверка: полный **`pnpm run ci`** после правок.

---

## 2026-06-02 — Фаза 2C: задачи специалиста

- Drizzle `specialist_tasks` + миграция `0102`; модуль `specialist-tasks` (порт/сервис/DI).
- API: `/api/doctor/tasks`, `/api/doctor/clients/:userId/tasks`, summary, complete; internal tick `specialist-task-reminders`.
- Настройки: `doctor_specialist_task_reminder_channels` в `/app/settings`.
- UI: секция «Задачи» в карточке (Обзор), Hero + Action Strip; «Мои задачи» на «Сегодня».
- Спека: `SPECIALIST_TASKS.md`.

### Проверки

- `pnpm --dir apps/webapp exec vitest run src/modules/specialist-tasks/service.test.ts`
- `pnpm --dir apps/webapp exec tsc --noEmit`

### Доработка после аудита (2026-06-02)

См. также §«Фаза 2C: хвост по аудиту» выше (финальная итерация). Кратко: честный `sent` + `undeliverable`; `getPatientClientIdentity`; UI (дата, выполненные, ошибки, одна форма на «Сегодня»); тесты notify/dispatch/route; план [`.cursor/plans/archive/active_workqueue_plan_30236040.plan.md`](../../.cursor/plans/archive/active_workqueue_plan_30236040.plan.md) (`phase-2c-audit-remediation` completed).

---

## 2026-05-09 — Аудит экрана инстанса (порядок этапа 0, контракт API)

- **Порядок элементов на этапе 0:** перестановка стрелками учитывает только **`item_type === "recommendation"`** внутри «ленты» этапа 0, чтобы не смешивать с другими строками с `group_id = null` (если они появятся).
- **Документация:** `apps/webapp/src/app/api/api.md` — **`DELETE .../stage-items/[itemId]`**, актуальный ввод freeform через **`Textarea`**; `ROADMAP.md` §4 — удаление строки инстанса при отсутствии истории.