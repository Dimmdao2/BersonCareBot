# AUDIT — Phase 2 (UNIFIED_BLOCK_EDITOR)

Аудит выполнения Phase 2 против `02_UNIFIED_BLOCK_EDITOR_PLAN.md` (scope, mandatory behavior, design constraints, out of scope, phase checklist, completion criteria, test gate). Дата аудита: 2026-04-29.

Источник факта о составе работ: запись **2026-04-29 — Phase 2 — EXEC** в `LOG.md` и текущее дерево файлов из этого списка.

---

## 1. Verdict

**Pass with notes.**

Цели Phase 2 по единому входу «Настроить», секциям редактора (видимость блока, статус, превью, элементы, группированный picker) и сохранению операций над элементами **в одном потоке** закрыты на уровне UI и демо-данных. Замечания: (1) server actions пока **только** `revalidatePath` без записи в `patient_home_*` — после закрытия/refresh состояние снова приходит с сервера как в демо; (2) **repair** в UI — оптимистичная демо-логика (нет отдельного repair-диалога/выбора новой цели); (3) в плане в списке «Modify» фигурировал `PatientHomeAddItemDialog.tsx` — файл **удалён**, функциональность перенесена в unified dialog (расхождение с текстом плана, не дефект продукта).

---

## 2. Checklist coverage (`02_UNIFIED_BLOCK_EDITOR_PLAN.md`)

| Пункт чеклиста | Статус | Доказательство |
| --- | --- | --- |
| One clear user-facing entrypoint `Настроить` exists per block. | **Да** | `PatientHomeBlockSettingsCard.tsx`: одна кнопка «Настроить» для CMS и системных блоков; открытие `PatientHomeBlockEditorDialog`. |
| All previous block item operations preserved. | **Да (UI + вызовы actions; персистенция — заглушки)** | `PatientHomeBlockEditorItems.tsx`: dnd + `reorderPatientHomeBlockItemsAction`; глаз + `togglePatientHomeBlockItemVisibilityAction`; удаление + `deletePatientHomeBlockItemAction`; «Исправить» + `repairPatientHomeBlockItemAction`. Добавление: `PatientHomeBlockEditorDialog` → `onPickCandidate` (локальный список + уменьшение кандидатов). |
| Candidate picker supports grouped target types for mixed blocks. | **Да** | `PatientHomeBlockCandidatePicker.tsx`: `GROUP_ORDER` / `GROUP_HEADINGS` (`Разделы` / `Материалы` / `Курсы`); RTL в `patientHomeBlockEditor.test.tsx` для `subscription_carousel`. |
| Repair flow still available for unresolved refs. | **Да (минимальный UX)** | Для `!row.resolved` кнопка «Исправить» в `PatientHomeBlockEditorItems.tsx`; нет второй модалки поверх (nested stack снижен). Нет выбора новой цели — см. §7. |
| Tests updated for new interaction model. | **Да** | `patientHomeBlockEditor.test.tsx` (mock `next/navigation`), `actions.test.ts` (`reorder…` + `revalidatePath`). |
| `LOG.md` updated. | **Да** | Запись **2026-04-29 — Phase 2 — EXEC** с файлами и командами проверок. |

**Test gate (phase-level):** в `LOG.md` указаны успешные прогоны указанных `vitest`-файлов, `tsc --noEmit`, `lint`; полный корневой CI планом не требовался.

---

## 3. Scope vs implementation (`02_UNIFIED_BLOCK_EDITOR_PLAN.md` §Scope / §Candidate Files)

| Требование scope | Статус | Комментарий |
| --- | --- | --- |
| One launch action from block card | **Да** | См. §2. |
| Section: block status + visibility | **Да** | `PatientHomeBlockRuntimeStatus.tsx` + `Switch` видимости блока в `PatientHomeBlockEditorDialog.tsx`. |
| Section: patient preview summary | **Да** | `PatientHomeBlockPreview` внутри диалога (секция «Что увидит пациент»). |
| Section: items list (reorder, hide/show, delete, repair) | **Да** | `PatientHomeBlockEditorItems.tsx`. |
| Section: candidate picker with type grouping | **Да** | `PatientHomeBlockCandidatePicker.tsx`. |
| Новые файлы из плана | **Да** | Все четыре перечисленных компонента присутствуют. |
| `PatientHomeBlockItemsDialog.tsx` / `PatientHomeRepairTargetsDialog.tsx` | **Да (реэкспорт)** | Совместимость: алиас на `PatientHomeBlockEditorDialog`. |
| `PatientHomeAddItemDialog.tsx` | **Заменено удалением** | Отдельной модалки нет; добавление в секции «Добавить» unified dialog. Имеет смысл при желании поправить §Candidate Files в `02_UNIFIED_BLOCK_EDITOR_PLAN.md` (документ, не блокер аудита). |
| `actions.ts` | **Да** | Заглушки + `revalidatePath(routePaths.doctorPatientHome)` в `actions.ts`. |

---

## 4. Mandatory behavior to keep

| Операция | Статус | Где |
| --- | --- | --- |
| add item | **Да** | Выбор кандидата → `onPickCandidate` в `PatientHomeBlockEditorDialog.tsx`. |
| reorder items | **Да** | `@dnd-kit` + `reorderPatientHomeBlockItemsAction`. |
| toggle item visibility | **Да** | Eye / EyeOff + `togglePatientHomeBlockItemVisibilityAction`. |
| delete item | **Да** | Trash + `deletePatientHomeBlockItemAction`. |
| repair unresolved targets | **Частично** | CTA есть; поведение — локальная «демо-починка» строки без сценария выбора новой цели/CMS-return (ожидаемо до фаз с данными и Phase 3/4). |

---

## 5. Completion criteria

| Критерий | Статус | Комментарий |
| --- | --- | --- |
| Editor can perform all block operations from one coherent flow. | **Да (когерентный UX)** | Одна модалка; системные блоки без списка элементов — секции списка/candidates скрыты через `patientHomeBlockRequiresItemList` в `PatientHomeBlockEditorDialog.tsx`. |
| No runtime data-model regressions. | **Да в смысле плана** | В footprint Phase 2 (`LOG.md`) нет изменений `apps/webapp/db/schema/*`, миграций Drizzle под `patient_home_*`. Таблиц под runtime-модель в webapp DB по прежнему нет (grep `patient_home` в `apps/webapp/db` — пусто). Пациентский data path не подключался — регрессии модели данных нет. |

---

## 6. Design constraints

| Ограничение | Статус | Проверка |
| --- | --- | --- |
| Avoid nested modal stacks where possible. | **Да** | Одна `Dialog`; repair не открывает вторую модалку. |
| Dialog usable on smaller laptop heights (scrollable body). | **Да** | `DialogContent` с `max-h` + `ScrollArea` с `max-h-[min(52vh,420px)]` в `PatientHomeBlockEditorDialog.tsx`. |
| Preview remains non-clickable. | **Да** | `PatientHomeBlockPreview`: текстовые блоки/`role="alert"`, без ссылок в ветке «есть видимые элементы». |
| Admin UI clarity over polish. | **Ок** | Секции с заголовками и поясняющим мелким текстом. |

---

## 7. Out of scope (негативная проверка)

| Запрет | Статус |
| --- | --- |
| No DB schema changes. | **Ок** | Нет schema/migrations в перечне Phase 2; подтверждение по дереву `apps/webapp/db`. |
| No inline-create yet (Phase 3). | **Ок** | Для пустого `situations` — ссылка «Создать раздел» на `/app/doctor/content/sections/new` (`PatientHomeBlockCandidatePicker.tsx`), не форма inline в диалоге. |
| No slug rename flow (Phase 4). | **Ок** | Не реализовано. |
| No patient runtime visual/style changes. | **Ок по footprint Phase 2** | Изменения: `settings/patient-home/*`, `modules/patient-home/patientHomeEditorDemo.ts`, `app/app/doctor/patient-home/page.tsx`, документы инициативы. Путь `apps/webapp/src/app/app/patient/**` в перечень Phase 2 не входит. |

---

## 8. Пациентский runtime и пересечение с AUDIT_PHASE_1 §2

**Footprint Phase 2** (из `LOG.md`): не содержит `app/app/patient/**`, `patientHomeResolvers.ts`, карточек главной пациента.

**Вывод:** заявленный Phase 2 **не меняет** сборку/визуал пациентской главной.

**Связь с `BLOCK_EDITOR_CONTRACT.md` («Обязательная повторная верификация (AUDIT_PHASE_1 §2, FIX)»):** add/edit/reorder/repair теперь **существуют** как server actions-заглушки с `revalidatePath`, но **smoke на реальной БД** и сценарий «repair с выбором цели» чеклистом Phase 1 **ещё не закрываются** — это ожидаемо до персистентного слоя `patient_home_*`. Рекомендация: при подключении БД выполнить пункты 1–3 того раздела и обновить строку регрессии в `AUDIT_PHASE_1.md`.

---

## 9. Optional documentation artifacts

| Артефакт плана | Статус |
| --- | --- |
| update `LOG.md` | **Выполнено** |
| optional `BLOCK_EDITOR_CONTRACT.md` if interaction model changes | **Закрыто FIX (2026-04-29)** | См. `BLOCK_EDITOR_CONTRACT.md` — снимок Phase 2, заметка Phase 2, уточнение AUDIT_PHASE_1 §2; `AUDIT_PHASE_2.md` §12. |

---

## 10. Minor notes

- Сброс локального состояния при открытии: `editorSession` + `key` на диалоге в `PatientHomeBlockSettingsCard.tsx` (обход `setState` в `useEffect`, см. `LOG.md`).
- Ссылка «Открыть в CMS» для `course` ведёт на общий путь шаблонов (`PatientHomeBlockEditorItems.tsx` → `cmsEditHref`) — допустимо как временный маршрут до точного редактора курса.
- Чеклист в `02_UNIFIED_BLOCK_EDITOR_PLAN.md` отмечен выполненным — согласуется с результатами разделов 2–7 при учёте оговорок про персистенцию и repair.

---

## 11. Readiness to Phase 3

**Да:** каркас unified editor и picker готовы к подключению реальных кандидатов/строк из БД и к **inline-create** по `03_INLINE_CREATE_SECTIONS_PLAN.md` без смены основной точки входа «Настроить».

Условие: закрепить контракт repair (выбор новой цели vs переход в CMS) до расширения данных, чтобы не накапливать технический долг на «демо-исправлении».

---

## 12. Mandatory fixes — статус после FIX (2026-04-29)

По результатам аудита (§3, §8, §9) требовалось закрыть документальный разрыв с репозиторием и зафиксировать в контракте модель Phase 2 / заглушки actions.

**Сделано:**

1. **`02_UNIFIED_BLOCK_EDITOR_PLAN.md`:** в §Candidate Files убрано несуществующее изменение `PatientHomeAddItemDialog.tsx`; добавлено явное примечание, что добавление встроено в `PatientHomeBlockEditorDialog.tsx`.
2. **`BLOCK_EDITOR_CONTRACT.md`:** снимок Phase 2 (unified dialog, реэкспорты, заглушки `actions.ts`); заметка Phase 2 в «Заметки для следующих фаз» (repair-заглушка до БД); уточнение в разделе **AUDIT_PHASE_1 §2** — пункты 1–3 чеклиста относятся к персистенции, заглушки их не закрывают.
3. **`AUDIT_PHASE_1.md`:** актуализирована строка таблицы §2 про metadata helper; в §9 добавлено дополнение Phase 2 FIX про заглушки actions.

Полный smoke на БД и сценарий repair с выбором цели по-прежнему отложены до появления `patient_home_*` и реализации actions (§8).
