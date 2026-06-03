---
name: instance-editor-batch-toolbar
overview: "Редизайн редактора инстанса программы: sticky toolbar, сворачиваемые этапы, модалка порядка этапов, общий диалог комментариев и единое batch-сохранение. Фазы 1–4 закрыты (2026-06-03); ф.5 частично — модалка порядка готова, collapsible этапы — следующий шаг."
todos:
  - id: phase-1-draft-model
    content: "Фаза 1: Расширить InstanceEditorDraft, merge/normalize, context API, flush vs structural split"
    status: completed
  - id: draft-model
    content: "Фаза 2: Editor → in-memory draft + аудит remediation (gate, RTL smoke, guard-тесты)"
    status: completed
  - id: batch-save
    content: "Фаза 3: editor-batch + program_changed + tx + pre-validate (audit remediation)"
    status: completed
  - id: toolbar-stages
    content: "Фаза 4: Sticky toolbar, InstanceEditorAddStageDialog, audit remediation — закрыта"
    status: completed
  - id: stage-order-modal
    content: "Фаза 5 (часть): InstanceEditorStageOrderDialog → draft stageOrder; inline stage DnD снят"
    status: completed
  - id: collapsible-stages
    content: "Фаза 5: Collapsible этапы (default expanded active) + тесты toggle"
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
| 2 — UI → in-memory draft | **Закрыта** (аудит remediation 2026-06-03) |
| 3 — server `editor-batch` | **Закрыта полностью** (2026-06-03; audit remediation: tx, pre-validate) |
| 4 — sticky toolbar | **Закрыта полностью** (2026-06-03; audit remediation) |
| 5 — collapsible этапы | **Следующая** (модалка порядка — **готова**, см. `InstanceEditorStageOrderDialog`) |

LOG: [`docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md) §2026-06-03 ф.4 (итог).

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
- Все редакторские изменения инстанса копить в браузерном `InstanceEditorDraft`; статусные действия этапа/программы остаются отдельными командами. **Unsaved gate (фаза 2):** блокирует status API только при **metadata-dirty** (`isFlushableDirty`); structural-only не блокирует. Финальный UX gate — фаза 7.
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

### Фаза 2 — Перевод editor-операций в in-memory ✅ (2026-06-03, закрыта полностью)

- [x] Reorder этапов/групп/элементов, add stage/group/item, delete/hide item, patch `groupId`/`isActionable`/`status` — draft API в `TreatmentProgramInstanceDetailClient`.
- [x] `localComment`, `loadSettings`, metadata этапа/группы — draft (`patchItemLocalComment`, `patchItemLoadSettings`, `patchStageMetadata`, `patchGroup`).
- [x] `InstanceAddLibraryItemDialog` → `addItemCreate` (library / freeform / test set expand / lfk complex expand); `expandLines` в pickers; `treatmentProgramLibraryDraftSnapshot.ts`.
- [x] `saveDraft` + SaveBar: `structuralPending` UX; status этапа/программы — immediate API.
- [x] Guard: `instanceEditorPhase2FetchGuard.test.ts` — нет immediate editor-mutation fetch в UI.
- [x] RTL/unit: `InstanceEditorSaveBar.test.tsx`, расширен `InstanceEditorDraftContext.test.tsx`, dialog/pickers/snapshot tests; `tsc --noEmit` webapp.
- [x] **Замена элемента (`replace`)** — только в модели draft; UI отложен (не блокер фазы 2).
- [x] **Аудит remediation:** `hasInstanceEditorDraftFlushableChanges` / `isFlushableDirty`; unsaved gate — metadata-only; RTL smoke `TreatmentProgramInstanceDetailClient.phase2.test.tsx`; `InstanceEditorUnsavedChangesDialog.test.tsx`; guard/SaveBar/snapshot tests.

### Фаза 3 — Серверный batch-save и единое событие ✅ (2026-06-03, закрыта полностью)

- [x] Route `POST /api/doctor/treatment-program-instances/[instanceId]/editor-batch` + Zod body `{ draft }`.
- [x] `doctorApplyInstanceEditorBatch` / `applyInstanceEditorBatch` — metadata + structural в одном проходе; `program_changed` с `payload.diff`.
- [x] Миграция `0104_program_changed_event_type.sql`; тип `program_changed` в schema/types.
- [x] `flushInstanceEditorDraft` → один POST editor-batch; `saveDraft` сбрасывает весь черновик.
- [x] Pre-validate до мутаций (`validateInstanceEditorBatchDraft`) — reorder, groupId, loadSettings.
- [x] PG/in-memory транзакция batch (`runInMutationTransaction`).
- [x] Тесты: `instanceEditorBatch.test.ts` (11 кейсов: empty/combined/rollback/tx), `instanceEditorBatchSchema.test.ts`, `editor-batch/route.test.ts`, guard flush → editor-batch, flush/context/SaveBar, `doctor-timeline-text`.

### Фаза 4 — Sticky toolbar и режимы экрана ✅ (2026-06-03, закрыта полностью)
- [x] Sticky toolbar в `#app-shell-doctor`: `INSTANCE_EDITOR_TOOLBAR_STICKY_CLASS` (`top-[calc(3.5rem+safe-area)]`, full-bleed `-mx-3`); `--doctor-sticky-offset` на `#app-shell-doctor` (`AppShell` doctor).
- [x] Три зоны на `lg`: meta | «Комментарии» | actions (`Добавить этап`, «Изменить порядок», save/discard).
- [x] `InstanceEditorSaveBar` снят с экрана (`@deprecated`); `InstanceEditorAddStageDialog`; scroll к `#doctor-program-instance-comments`.
- [x] Audit remediation: один CTA «Добавить этап»; `InstanceEditorStageOrderDialog`; inline stage DnD/drag-handle сняты.
- [x] RTL: `InstanceEditorToolbar.test.tsx`, `InstanceEditorAddStageDialog.test.tsx`, `InstanceEditorStageOrderDialog.test.tsx`, `TreatmentProgramInstanceDetailClient.phase4.test.tsx`; `api.md`; 20 vitest (phase2/4/guard); `tsc --noEmit`.

### Фаза 5 — Сворачиваемые этапы
- [x] `InstanceEditorStageOrderDialog`: DnD списка названий, «Сохранить порядок» → draft `stageOrder` (2026-06-03).
- [x] Stage DnD/drag-handle в основном списке сняты (2026-06-03).
- [ ] Collapsible этапы: default expanded active (`in_progress` → `available` → первый незавершённый).
- [ ] Проверки: component tests default-expanded/manual toggle.
- [x] Reorder modal tests; нет immediate `/stages/reorder` с экрана редактора.

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
