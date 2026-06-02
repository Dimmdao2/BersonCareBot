---
name: instance-editor-batch-toolbar
overview: "Редизайн редактора инстанса программы: sticky toolbar, сворачиваемые этапы, отдельная модалка порядка этапов, общий диалог комментариев и единое batch-сохранение редакторских правок с одной записью истории. Фазы 1–2 закрыты (2026-06-03); активна фаза 3 (server editor-batch)."
todos:
  - id: phase-1-draft-model
    content: "Фаза 1: Расширить InstanceEditorDraft, merge/normalize, context API, flush vs structural split"
    status: completed
  - id: draft-model
    content: "Фаза 2: Перевести editor-операции в in-memory (TreatmentProgramInstanceDetailClient, InstanceAddLibraryItemDialog)"
    status: completed
  - id: batch-save
    content: "Фаза 3: Добавить серверный batch-save use-case, route и единое событие истории program_changed"
    status: pending
  - id: toolbar-stages
    content: "Фаза 4: Сделать sticky toolbar, collapsible stages и удалить drag этапов из карточек"
    status: pending
  - id: stage-order-modal
    content: "Фаза 5: Добавить модалку изменения порядка этапов с локальным draft-сохранением"
    status: pending
  - id: comments-dialog
    content: "Фаза 6: Добавить общий диалог комментариев по всем пунктам с searchable фильтром"
    status: pending
  - id: history-gate-tests
    content: "Фаза 7: Обновить историю, unsaved gate, документацию и focused проверки"
    status: pending
isProject: false
---

# План: редактор инстанса программы

## Статус плана (2026-06-03)

| Фаза | Статус |
|------|--------|
| 1 — browser draft model | **Закрыта** |
| 2 — UI → in-memory draft | **Закрыта** |
| 3 — server `editor-batch` | **Следующая** |
| 4–7 — toolbar, collapsible, comments, history | pending |

LOG: [`docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md) §2026-06-03 (фазы 1–2).

## Scope

Разрешено трогать:
- [apps/webapp/src/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx](apps/webapp/src/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx)
- shared editor/DnD файлы в [apps/webapp/src/app/app/doctor/treatment-program-shared/](apps/webapp/src/app/app/doctor/treatment-program-shared/)
- doctor API routes под [apps/webapp/src/app/api/doctor/treatment-program-instances/](apps/webapp/src/app/api/doctor/treatment-program-instances/)
- сервис/порты/типы программы в [apps/webapp/src/modules/treatment-program/](apps/webapp/src/modules/treatment-program/)
- обсуждения пунктов в [apps/webapp/src/modules/program-item-discussion/](apps/webapp/src/modules/program-item-discussion/) и текущий dialog рядом с инстансом
- релевантные тесты и LOG активной инициативы [docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md)

Вне scope:
- patient UI и patient routes, кроме возможной cache revalidation после сохранения
- GitHub Actions / CI workflow
- новая БД-схема, если `treatment_program_events.event_type` не требует DDL; если обнаружится DB enum/check, сначала остановиться и уточнить миграцию
- переписывание всего конструктора шаблонов программы

## Решения

- Сделать полноценный batch-save: один новый doctor endpoint, один сервисный use-case, одна доменная запись истории `program_changed` с summary/diff в payload.
- Все редакторские изменения инстанса копить в браузерном `InstanceEditorDraft`; статусные действия этапа/программы остаются отдельными командами, но при dirty draft сначала требуют сохранение.
- Модалка «Изменить порядок этапов» сохраняет порядок в браузерный draft и закрывается; глобальная кнопка «Сохранить изменения» отправляет всё одним batch.
- Карточки этапов больше не имеют stage drag handle и не обёрнуты в stage-level sortable в основном списке.
- Комментарии: общий диалог по всем пунктам программы, фильтр по пункту с поиском; default показывает все сообщения.

## Фазы исполнения

Всего: **7 фаз**.

### Фаза 1 — Базовая модель browser draft ✅ (2026-06-03)

- [x] Расширить [instanceEditorDraft.ts](apps/webapp/src/app/app/doctor/treatment-program-shared/instanceEditorDraft.ts): секции `stageOrder`, `stageCreates`, `groupCreates`, `itemCreates`, `itemDeletes`, `itemReorders`, `groupReorders`, `itemStructuralPatches`.
- [x] `mergeInstanceEditorDraftIntoDetailRaw`, `normalizeInstanceEditorDraft`, `isInstanceEditorDraftDirty`, `pickInstanceEditorDraftFlushChanges`, `hasInstanceEditorDraftStructuralChanges`, `clearFlushableInstanceEditorDraftSections`.
- [x] [InstanceEditorDraftContext.tsx](apps/webapp/src/app/app/doctor/treatment-program-shared/InstanceEditorDraftContext.tsx): `setStageOrder`, `addStageCreate`, `addGroupCreate`, `addItemCreate`, `deleteItem`, `setItemReorder`, `setGroupReorder`, `patchItemStructural`; `saveDraft` не сбрасывает structural после legacy flush.
- [x] Unit/RTL: `instanceEditorDraft.test.ts`, `InstanceEditorDraftContext.test.tsx`, `flushInstanceEditorDraft.test.ts`.
- [x] Инвентарь editor `fetch` → фаза 2 (см. README §фаза 2, закрыта 2026-06-03).

### Фаза 2 — Перевод editor-операций в in-memory ✅ (2026-06-03)

- [x] Reorder этапов/групп/элементов, add stage/group/item, delete/hide item, patch `groupId`/`isActionable`/`status` — draft API в `TreatmentProgramInstanceDetailClient`.
- [x] `InstanceAddLibraryItemDialog` → `addItemCreate` (library / freeform / test set expand / lfk complex expand); `expandLines` в pickers.
- [x] `saveDraft` + SaveBar: `structuralPending` UX; status этапа/программы — по-прежнему immediate API.
- [x] Vitest 33 tests; `tsc --noEmit` webapp.

### Фаза 3 — Серверный batch-save и единое событие
- Добавить новый route: `POST /api/doctor/treatment-program-instances/[instanceId]/editor-batch`.
- Добавить use-case `doctorApplyInstanceEditorBatch` в [instance-service.ts](apps/webapp/src/modules/treatment-program/instance-service.ts) через порты и сервисные инварианты stage zero/system groups.
- Обновить [flushInstanceEditorDraft.ts](apps/webapp/src/app/app/doctor/treatment-program-shared/flushInstanceEditorDraft.ts): вместо последовательных PATCH отправлять один batch payload.
- Добавить единое событие истории `program_changed` с detail payload (добавлено/удалено/перемещено/обновлено).
- Проверки фазы:
  - service tests (успешный batch, валидационные ошибки, откат ошибки);
  - route tests (auth/body/validation);
  - проверка единственной записи истории за batch.

### Фаза 4 — Sticky toolbar и режимы экрана
- В [TreatmentProgramInstanceDetailClient.tsx](apps/webapp/src/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx) добавить sticky toolbar внутри `#app-shell-doctor` (`top-[var(--doctor-sticky-offset,0px)]`).
- Слева направо: название программы, пациент, статус.
- Правая зона: `Добавить этап`, `Изменить порядок`, `Сохранить изменения`.
- Добавить кнопку `Комментарии` в центральной зоне.
- Убрать дублирующий [InstanceEditorSaveBar.tsx](apps/webapp/src/app/app/doctor/treatment-program-shared/InstanceEditorSaveBar.tsx) из этого экрана.
- Проверки фазы:
  - RTL smoke toolbar;
  - sticky-поведение в doctor shell.

### Фаза 5 — Сворачиваемые этапы и модалка порядка
- Сделать collapsible этапы: по умолчанию раскрыт активный этап (`in_progress`, иначе `available`, иначе первый незавершённый).
- Убрать drag-handle этапа из карточек; убрать stage DnD в основном списке.
- Добавить модалку `Изменить порядок этапов`: список названий, DnD, `Сохранить порядок`.
- Сохранение в модалке меняет только draft `stageOrder`, закрывает модалку.
- Проверки фазы:
  - component tests default-expanded/manual toggle;
  - reorder modal tests на локальный порядок и отсутствие прямого `/stages/reorder`.

### Фаза 6 — Общий диалог комментариев по всем пунктам
- Добавить doctor API summary/list по instance (в [app/api/doctor/treatment-program-instances/...](apps/webapp/src/app/api/doctor/treatment-program-instances/)) с фильтром по `stageItemId`.
- Добавить диалог уровня instance (новый компонент рядом с [DoctorProgramItemDiscussionDialog.tsx](apps/webapp/src/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/DoctorProgramItemDiscussionDialog.tsx)):
  - список обсуждений по всем пунктам,
  - searchable select по пунктам программы,
  - фильтр `Все пункты` по умолчанию.
- Сохранить текущий per-item сценарий (`discussionItem`) без регресса.
- Проверки фазы:
  - route/service tests (all + filtered);
  - RTL тест фильтра и открытия thread.

### Фаза 7 — История, unsaved gate, документация, регрессия
- Добавить форматирование `program_changed` в [types.ts](apps/webapp/src/modules/treatment-program/types.ts): строка `Программа изменена`.
- В таймлайне сделать раскрытие detail payload по клику на строку `Программа изменена`.
- Обновить [InstanceEditorUnsavedChangesDialog.tsx](apps/webapp/src/app/app/doctor/treatment-program-shared/InstanceEditorUnsavedChangesDialog.tsx):
  - текст: `Для изменения статуса этапа (программы) необходимо сохранить изменения. Сохранить?`
  - кнопки: `Сохранить`, `Вернуться к редактированию`.
- Обновить [docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md).
- Финальные проверки:
  - focused vitest по draft/service/routes/dialog/reorder;
  - `pnpm --dir apps/webapp run typecheck`.

## Definition of Done

- В основном списке этапов нет drag-handle для этапов; порядок этапов меняется только через модалку.
- Этапы сворачиваются/разворачиваются вручную; при первом открытии раскрыт активный этап.
- Sticky toolbar содержит программу, пациента, статус, комментарии, добавление этапа, порядок этапов, сохранение.
- Editor mutations не пишутся сразу в БД; глобальное сохранение отправляет batch и создаёт одну понятную запись истории.
- Статусные действия при dirty draft показывают модалку с сохранением или возвратом к редактированию.
- Общие комментарии открываются из toolbar и фильтруются по любому пункту программы.
- Focused тесты и linter/typecheck по изменённой области проходят.
