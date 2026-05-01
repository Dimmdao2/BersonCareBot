# AUDIT — Phase 1 (DIAGNOSTICS_AND_LABELS)

Аудит выполнения Phase 1 против `01_DIAGNOSTICS_LABELS_PLAN.md` (чеклист, acceptance, required UX, out of scope). Дата аудита: 2026-04-29.

Источник факта о составе работ: запись **2026-04-29 — Phase 1 — EXEC** в `LOG.md` и текущее дерево файлов из этого списка.

---

## 1. Verdict

**Pass with notes.**

Цели Phase 1 по копирайту, превью пустых/скрытых состояний и строкам для неразрешённых целей закрыты; чеклист в `01_DIAGNOSTICS_LABELS_PLAN.md` отмечен выполненным и согласуется с кодом. Замечание: пункт про «отсутствие регресса» формально выполнен в условии **отсутствия прежних server actions** add/edit/reorder/repair в репозитории (зафиксировано в `LOG.md`).

---

## 2. Checklist coverage (`01_DIAGNOSTICS_LABELS_PLAN.md`)

| Пункт чеклиста | Статус | Доказательство |
| --- | --- | --- |
| Metadata helper added with full block coverage. | **Да** | `blocks.ts` (CMS + системные коды), `getPatientHomeBlockEditorMetadata` / `getPatientHomeBlockDisplayTitle` / `getPatientHomeAddItemDialogTitle` в `blockEditorMetadata.ts`; покрытие в `blockEditorMetadata.test.ts` по всем `PATIENT_HOME_CMS_BLOCK_CODES`. |
| Settings copy uses metadata helper. | **Да** | `PatientHomeBlockSettingsCard.tsx`, `PatientHomeBlockPreview.tsx`, unified `PatientHomeBlockEditorDialog.tsx` / picker импортируют метаданные из `@/modules/patient-home/blockEditorMetadata` и `@/modules/patient-home/blocks`. Отдельный `PatientHomeAddItemDialog.tsx` не используется с Phase 2 (см. `02_UNIFIED_BLOCK_EDITOR_PLAN.md`, FIX). |
| Empty-state warnings implemented. | **Да** | `PatientHomeBlockPreview`: скрытый блок, видимый пустой CMS-блок (`role="alert"` + текст из `VISIBLE_EMPTY_ADMIN`), системные блоки без списка. |
| No functional regression in existing add/edit/reorder/repair actions. | **Условно да** → **документально закрыто FIX** | Ранее в дереве не было целевых actions; Phase 1 не добавляла server actions с побочными эффектами. Обязательство на будущее: `BLOCK_EDITOR_CONTRACT.md`, раздел «Обязательная повторная верификация (AUDIT_PHASE_1 §2, FIX)». |
| Tests for metadata and UI copy added/updated. | **Да** | `blockEditorMetadata.test.ts`, `patientHomeUnresolvedRefs.test.ts`, `patientHomeBlockEditor.test.tsx` (RTL: раздел/курс, предупреждение пустого блока, non-item, диалог). |
| `LOG.md` updated. | **Да** | Запись Phase 1 EXEC с перечнем файлов и командами проверок. |

**Test gate (phase-level):** в `LOG.md` указаны успешные прогоны `vitest` (указанные тестовые файлы), `tsc --noEmit`, `lint`; полный корневой CI не требовался планом.

---

## 3. Acceptance criteria

| Критерий | Статус | Комментарий |
| --- | --- | --- |
| Editor copy matches actual target types. | **Да** | Лейблы добавления и существительные согласованы с типами по `BLOCK_EDITOR_CONTRACT.md` / MASTER (раздел vs материал vs смешанный случай). |
| Admin can understand why a visible block is absent on runtime. | **Да** | Текст `emptyPreviewText` / `emptyRuntimeText` и превью для пустого включённого блока. |
| No DB schema changes. | **Да** | В перечне Phase 1 (`LOG.md`) нет `db/schema`, `drizzle-migrations`, SQL. |
| `pnpm --dir apps/webapp exec vitest run <phase files>` passes. | **Да** | Зафиксировано в `LOG.md`. |

**Completion criteria плана:**

- «Editors can understand…» — **да** (см. превью + заголовки карточек + диалог).
- «No runtime behavior changes» — трактуется как **пациентский runtime** и данные главной: см. раздел 6.

---

## 4. Required UX outcomes

| Требование | Статус | Проверка |
| --- | --- | --- |
| `situations` uses «Добавить раздел». | **Да** | `blockEditorMetadata.ts` → `addLabel: "Добавить раздел"`; тест и RTL на кнопке. |
| `courses` uses «Добавить курс». | **Да** | `addLabel: "Добавить курс"`; RTL. |
| `subscription_carousel` uses mixed label. | **Да** | `addLabel: "Добавить раздел / материал / курс"`; unit-тест в `blockEditorMetadata.test.ts`. |
| visible-empty block warns that patient runtime may hide it. | **Да** | Константа `VISIBLE_EMPTY_ADMIN` + `role="alert"` в превью при `isBlockVisible && visibleItemsCount === 0`. |
| non-item blocks explain where data comes from. | **Да** | Ветка `!patientHomeBlockRequiresItemList` в `PatientHomeBlockPreview` + `emptyPreviewText` для `lfk_progress` / `next_reminder` / `mood_checkin`; RTL для `lfk_progress`. |

**Документация:** `BLOCK_EDITOR_CONTRACT.md` дополнен заметкой Phase 1 (optional artifact из плана — выполнено).

---

## 5. Out of scope (негативная проверка)

| Запрет | Статус |
| --- | --- |
| No new actions with side effects. | **Ок** | Нет новых `actions.ts` / server actions в списке Phase 1. |
| No patient runtime visual changes (в смысле плана: patient shell/cards/nav из Phase 1). | **Ок по footprint Phase 1** | См. раздел 6. |
| No shell/nav/styles redesign. | **Ок** | Изменения навигации — добавление одного пункта в меню врача (`doctorNavLinks.ts`) и `routePaths`, что в scope админки Phase 1. |

---

## 6. Пациентский schema и runtime (отдельная проверка)

**Метод:** сопоставление **объявленного Phase 1 footprint** из `LOG.md` (2026-04-29 — Phase 1 — EXEC) с зонами, которые план явно исключил.

### 6.1. Схема БД и миграции

- В перечне файлов Phase 1 **нет** `apps/webapp/db/schema/*`, `apps/webapp/db/drizzle-migrations/*`, `*.sql` миграций webapp.
- **Вывод:** в рамках заявленного Phase 1 **схема БД не менялась**.

### 6.2. Runtime пациента (`/app/patient`, карточки главной, сборка данных)

Запрещённые для Phase 1 по пути кода зоны (смысл out of scope «No patient runtime visual changes»):

- `apps/webapp/src/app/app/patient/**` (страницы и `home/*` карточки),
- `patientHomeCardStyles.ts` привязка к визуалу карточек (план MASTER: не трогать визуальные примитивы пациента).

**Footprint Phase 1 по `LOG.md`:** только `modules/patient-home/{blocks,blockEditorMetadata*,patientHomeUnresolvedRefs*}`, `app/app/settings/patient-home/*`, `app/app/doctor/patient-home/page.tsx`, `paths.ts`, `doctorNavLinks.ts`, `modules/patient-home/README.md`, документы инициативы.

- Пересечения с `apps/webapp/src/app/app/patient/**` **нет**.
- Новые модули `blockEditorMetadata` / `patientHomeUnresolvedRefs` **не** импортируются из `app/app/patient/*` (проверка по графу импортов: grep / использование — только doctor/settings UI и тесты).

**Вывод:** заявленный Phase 1 **не менял** пациентский runtime-сборщик главной и пациентские RSC/клиенты под `/app/patient`.

### 6.3. Предупреждение для ветки с параллельными изменениями

На рабочей ветке `patient-app-visual-redesign-initiative` в репозитории могут сосуществовать **другие** незакоммиченные или чужие коммиты, затрагивающие `patient/page.tsx`, `globals.css`, навигацию пациента и т.д. Они **не входят** в перечень Phase 1 CMS workflow в `LOG.md`. Итог раздела 6 относится к **изолированному набору файлов Phase 1**; при общем merge-review следует убедиться, что пациентские изменения пришли из другой инициативы, а не из Phase 1.

---

## 7. Minor notes

- Диалог добавления элемента пока **заглушка** по данным CMS (ожидаемо до следующих фаз); копирайт и заголовок уже контекстные — цель Phase 1 достигнута.
- `tsc` на некоторых машинах может требовать чистого `apps/webapp/.next` из‑за устаревшего сгенерированного `validator.ts` — зафиксировано в `LOG.md`, не дефект продукта Phase 1.

---

## 8. Readiness to Phase 2

**Да:** метаданные и превью дают стабильную основу для `02_UNIFIED_BLOCK_EDITOR_PLAN.md` (единый редактор, кандидаты, runtime status), при условии что следующая фаза не ломает публичные контракты `getPatientHomeBlockEditorMetadata` без миграции копирайта в UI.

---

## 9. Mandatory fixes — статус после FIX (2026-04-29)

По результатам аудита требовалось:

1. **Закрепить обязательство** по чеклисту «No functional regression…» (в аудите — **Условно да**, §2) после появления реальных add/edit/reorder/repair.
2. **Убрать устаревшее утверждение**, что `blocks.ts` отсутствует в дереве (после Phase 1 файл есть).

**Сделано (документация):**

- В `BLOCK_EDITOR_CONTRACT.md` добавлен раздел **«Обязательная повторная верификация (AUDIT_PHASE_1 §2, FIX)»** с пошаговым чеклистом на момент появления server actions.
- В том же файле обновлены абзац про `blocks.ts` и раздел **§B** (Phase 0 FIX): пути редактора существуют с Phase 1; повторная проверка привязана к **изменениям** резолвинга/превью, а не к «ожиданию появления» путей.

**Дополнение Phase 2 FIX (2026-04-29):** server actions для reorder / visibility / delete / repair / видимости блока объявлены как **заглушки** (`revalidatePath` без `patient_home_*`). Строка чеклиста Phase 1 про регрессию add/edit/reorder/repair остаётся **условно да** до персистентной реализации и smoke по `BLOCK_EDITOR_CONTRACT.md` §«AUDIT_PHASE_1 §2»; см. `AUDIT_PHASE_2.md` §8 и уточнение в том же контракте.
