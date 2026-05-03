# AUDIT — Stage A3 (PROGRAM_PATIENT_SHAPE)

**Дата:** 2026-05-03  
**Scope:** Stage A3 — группы внутри этапа (`treatment_program_*_stage_groups`), nullable `group_id` на элементах, копирование при назначении шаблона, CRUD/reorder групп без DnD, сгруппированный рендер у пациента.  
**Источники:** [`STAGE_A3_PLAN.md`](STAGE_A3_PLAN.md), [`MASTER_PLAN.md`](MASTER_PLAN.md), [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md).

---

## 1. Verdict

- **Status:** **PASS** по пяти проверкам запроса (см. §2–§6).
- **Summary:** Схема и FK согласованы с Drizzle; `createInstanceTree` в PG и in-memory сначала вставляет группы, строит карту `sourceGroupId → instance group id`, затем элементы с `groupId` или `NULL`; удаление группы (шаблон и экземпляр) обнуляет `group_id` у элементов и не удаляет строки элементов. Пациентский UI и read-model учитывают группы / «Без группы» / скрытие пустых групп. В контуре A3 (treatment-program templates/instances + patient programs) **новых** импортов `@dnd-kit/*` нет; в репозитории пакеты уже есть для других экранов.

---

## 1b. Post-FIX (аудит → код)

| ID | Результат |
|---|---|
| **Critical / Major** | **N/A:** в §7 первичного аудита не заводились отдельные Critical/Major — вердикт **PASS** по §2–§6 без блокирующих дефектов. |
| **A3-ASSIGN-DEF** | **Закрыт:** `instance-service.ts` `assignTemplateToPatient` — `const groupRows = [...(st.groups ?? [])].sort(...)` (см. §8.1 п.3). |
| **A3-UI-INST-01** | **Defer (product):** полноценный UI «редактировать instance-группу» не требовался для PASS; **`PATCH .../stage-groups/[groupId]`** остаётся каналом до отдельной UI-задачи. |
| **Пустой этап у пациента (Info §5)** | **Defer (UX):** не нарушение контракта A3; улучшение подписи/скрытия пустого тела этапа — вне scope этого FIX. |

---

## 2. Таблицы групп и `group_id`

| Критерий | Статус | Доказательство |
|---|---|---|
| Таблица групп шаблона | **PASS** | `apps/webapp/db/drizzle-migrations/0029_treatment_program_a3_stage_groups.sql` — `treatment_program_template_stage_groups` (`id`, `stage_id`, `title`, `description`, `schedule_text`, `sort_order`); FK `stage_id` → `treatment_program_template_stages` **ON DELETE CASCADE**. |
| Таблица групп экземпляра | **PASS** | Там же — `treatment_program_instance_stage_groups` + `source_group_id` → `treatment_program_template_stage_groups` **ON DELETE SET NULL**. |
| `group_id` на элементах | **PASS** | `ALTER TABLE ..._template_stage_items` / `..._instance_stage_items` ADD `group_id uuid`; FK на соответствующую таблицу групп **ON DELETE SET NULL** (при удалении группы ссылка обнуляется). |
| Индексы | **PASS** | `idx_treatment_program_tpl_stage_groups_stage_order`, `idx_treatment_program_inst_stage_groups_stage_order` на `(stage_id, sort_order)`. |
| Согласованность Drizzle | **PASS** | `apps/webapp/db/schema/treatmentProgramTemplates.ts` — `treatmentProgramTemplateStageGroups`, `groupId` на `treatmentProgramTemplateStageItems`; `treatmentProgramInstances.ts` — `treatmentProgramInstanceStageGroups`, `groupId` на instance items. |

**Замечание (Info):** на таблицах групп **нет** `created_at`/`updated_at` — это согласовано с текущим паттерном этапов шаблона (там тоже нет audit-колонок в миграции A1/A3).

---

## 3. Copy service (назначение шаблона → экземпляр)

| Критерий | Статус | Доказательство |
|---|---|---|
| Порядок: группы до элементов | **PASS** | `pgTreatmentProgramInstance.ts` `createInstanceTree`: цикл по `st.groups` (sorted) → `insert(instGroupTable)`, затем цикл по `st.items` с `groupId` из карты `templateGroupIdToInstance.get(...)`. |
| NULL-группы у элементов | **PASS** | `it.templateGroupId == null ? null : … ?? null` — элемент без группы в шаблоне остаётся с `group_id = NULL` в экземпляре. |
| Сохранение полей группы | **PASS** | Вставка `title`, `description`, `scheduleText`, `sortOrder`, `sourceGroupId` из входного `CreateTreatmentProgramInstanceTreeInput`. |
| Источник данных для copy | **PASS** | `instance-service.ts` `assignTemplateToPatient`: `groupInputs` из **`(st.groups ?? [])`** (sorted), `templateGroupId: it.groupId` для каждого элемента шаблона; затем `instances.createInstanceTree({ stages: stageInputs })`. |
| In-memory паритет | **PASS** | `inMemoryTreatmentProgramInstance.ts` — тот же порядок `(st.groups ?? [])`, карта, `groupId` на item row. |
| Защита от «битой» ссылки на группу шаблона | **PASS** | Если `templateGroupId` не попал в карту (устаревший id), выражение даёт **`null`** — элемент не остаётся с несуществующим FK instance-группы. |

**~~Низкий риск~~ (закрыт FIX):** `assignTemplateToPatient` использует **`[...(st.groups ?? [])]`** — см. §1b **A3-ASSIGN-DEF**.

---

## 4. Удаление группы и строки элементов

| Критерий | Статус | Доказательство |
|---|---|---|
| Шаблон: элементы не удаляются | **PASS** | `pgTreatmentProgram.ts` `deleteTemplateStageGroup`: `update(itemTable).set({ groupId: null }).where(eq(itemTable.groupId, groupId))`, затем `delete` группы. |
| Экземпляр: элементы не удаляются | **PASS** | `pgTreatmentProgramInstance.ts` `deleteInstanceStageGroup`: аналогично `UPDATE ... group_id = NULL`, затем `DELETE` группы. |
| In-memory | **PASS** | `inMemoryTreatmentProgram.ts` / `inMemoryTreatmentProgramInstance.ts` — цикл по items с обнулением `groupId` перед удалением группы из Map. |
| FK как запасной рельс | **PASS** | Миграция: FK item → group **ON DELETE SET NULL** (двойная защита при прямом удалении группы на уровне БД). |

---

## 5. Patient render (grouped / ungrouped)

| Критерий | Статус | Доказательство |
|---|---|---|
| Группы с видимыми элементами | **PASS** | `PatientTreatmentProgramDetailClient.tsx` `PatientInstanceStageBody`: `sortedGroups` = группы, у которых есть хотя бы один `visibleItems` с `groupId === g.id`; внутри `<details open>` список элементов группы. |
| «Без группы» после групп | **PASS** | Блок `ungroupedItems`; заголовок «Без группы» только если `sortedGroups.length > 0` (как в плане A3.5). |
| Только негруппированные элементы | **PASS** | Если групп нет, заголовок «Без группы» не показывается — один список без лишней подписи. |
| `schedule_text` в summary | **PASS** | В `<summary>` выводится `g.scheduleText` при непустом значении (`text-xs text-muted-foreground`). |
| Пустые группы у пациента | **PASS** | Группа без видимых активных элементов не попадает в `sortedGroups`. Дополнительно read-model: `omitDisabledInstanceStageItemsForPatientApi` в `stage-semantics.ts` убирает из `stages[].groups` группы, у которых не осталось видимых элементов после фильтра `disabled` (`GET` пациента и RSC `page.tsx` используют helper). |
| Тест | **PASS** | `stage-semantics.test.ts` — кейс «группа только из disabled» → `groups` пустой. |

**Замечание (Info):** при этапе без видимых элементов остаётся пустой блок контента под заголовком этапа — UX edge, не нарушение контракта A3.

---

## 6. Зависимости drag-and-drop

| Критерий | Статус | Доказательство |
|---|---|---|
| Нет новых импортов DnD в A3-файлах | **PASS** | `rg "@dnd-kit|dnd-kit"` по `apps/webapp/src/app/app/patient/treatment-programs/**`, `.../doctor/treatment-program-templates/**`, `.../doctor/clients/treatment-programs/**` — **0** совпадений. |
| Перестановка в UI A3 | **PASS** | Конструктор шаблона и панель групп экземпляра врача: кнопки ↑/↓ + `POST .../groups/reorder` (или обмен `sortOrder` у элементов шаблона через PATCH `stage-items`); выбор группы у элемента — **Select**, не drag. |
| Корневой `package.json` | **Info** | В `apps/webapp/package.json` по-прежнему указаны `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` — **другие** фичи репозитория; в рамках A3 зависимости не расширялись под группы программ. |

---

## 7. Замечания вне критерия «PASS» (product / backlog)

| ID | Уровень | Статус / описание |
|---|---|---|
| **A3-UI-INST-01** | Info | **Defer:** см. §1b — UI редактирования текста instance-группы; API `PATCH .../stage-groups/[groupId]` без изменений. |
| **A3-ASSIGN-DEF** | Low | **Закрыт:** см. §1b — `st.groups ?? []` в `assignTemplateToPatient`. |

---

## 8. MANDATORY FIX INSTRUCTIONS

Любой **FIX** по замечаниям A3, регрессиям в этой области или расширению групп — выполнять **только** с соблюдением правил ниже. Нарушение считается некорректным закрытием задачи.

### 8.1 Данные и копирование

1. **Порядок в `createInstanceTree` (PG и in-memory):** сначала вставка **всех** групп этапа и построение карты `sourceGroupId` (шаблон) → `id` группы экземпляра; затем вставка **элементов** с вычисленным `group_id`. Нельзя вставлять элементы с несмэпленным `group_id` до создания строк группы.
2. **`templateGroupId` / `groupId` NULL:** при копировании элемент с `group_id = NULL` в шаблоне обязан стать элементом с **`group_id = NULL`** в экземпляре. Ссылка на несуществующую или не переданную в `groups[]` группу шаблона при маппинге должна давать **`NULL`**, а не «висячий» UUID.
3. **`assignTemplateToPatient`:** при изменении формы `TreatmentProgramTemplateDetail` обязательно сохранять передачу **`groups`** и **`templateGroupId`** в `CreateTreatmentProgramInstanceTreeInput`. Рекомендуется **`const groupRows = [...(st.groups ?? [])]`** в сервисе назначения, чтобы не падать на `undefined`.
4. **Миграции:** новые колонки/таблицы для групп — только через Drizzle schema + `drizzle-kit` / согласованный SQL в `apps/webapp/db/drizzle-migrations/` и журнал `meta/_journal.json`. Не добавлять «тихий» `group_id` без FK, если в проекте для этих таблиц принят FK.

### 8.2 Удаление группы

5. **Удаление группы (шаблон или экземпляр)** в приложении: **сначала** `UPDATE` всех элементов этапа с `group_id = <id>` на **`NULL`**, **затем** `DELETE` строки группы. В PG это уже в `deleteTemplateStageGroup` / `deleteInstanceStageGroup`; in-memory — тот же смысловой порядок. **Запрещено** каскадно полагаться только на FK без явного update в коде репозитория, если это меняет наблюдаемое поведение транзакций/событий.
6. **Строки элементов (`treatment_program_*_stage_items`)** при удалении группы **не** удалять; отключение у пациента — по-прежнему только **`status: disabled`** (A2), не смешивать с удалением группы.

### 8.3 Read-model пациента

7. **`omitDisabledInstanceStageItemsForPatientApi`:** любое изменение фильтра `items` обязано сохранять согласованность с **`stages[].groups`** (удалять группы без оставшихся видимых элементов). После правок — обновить **`stage-semantics.test.ts`** и **`api.md`** (пациентский `GET`).
8. **UI пациента** для групп: использовать примитивы из `patientVisual.ts` и существующий паттерн (`patientListItemClass`, `patientMutedTextClass`, …); не тянуть стили из `app/app/patient/home/*`.

### 8.4 API и UI врача (без DnD)

9. **Не добавлять** в файлы `TreatmentProgramConstructorClient.tsx`, `TreatmentProgramInstanceDetailClient.tsx` (и связанные API routes групп программ) зависимости **`@dnd-kit/*`**, `react-beautiful-dnd`, `react-dnd` и аналоги для reorder групп/элементов. Reorder — через **`POST .../groups/reorder`** или существующий механизм PATCH `sortOrder` / обмен порядком кнопками.
10. Любое новое поле тела для doctor routes групп или `groupId` в PATCH — обновить **`apps/webapp/src/app/api/api.md`**.

### 8.5 Архитектура модулей

11. Бизнес-логика групп остаётся в **`modules/treatment-program/*`** и репозиториях; **`route.ts`** — только parse, guard, `buildAppDeps()`, ответ. Не импортировать `@/infra/db/*` / `@/infra/repos/*` из `modules/**` (см. workspace rules).

### 8.6 Контур файлов для FIX A3

12. Типичная зона: `apps/webapp/src/modules/treatment-program/**`, `apps/webapp/src/infra/repos/pgTreatmentProgram*.ts`, `inMemoryTreatmentProgram*.ts`, `apps/webapp/db/schema/treatmentProgram*.ts`, `apps/webapp/db/drizzle-migrations/**`, `apps/webapp/src/app/api/doctor/treatment-program-templates/**`, `.../treatment-program-instances/**`, `apps/webapp/src/app/app/doctor/**/treatment-program*/**`, `apps/webapp/src/app/app/patient/treatment-programs/**`, `apps/webapp/src/app/api/patient/treatment-program-instances/**`, тесты перечисленных областей.

---

## 9. Повторяемые проверки (smoke)

```bash
rg "treatment_program_template_stage_groups|treatment_program_instance_stage_groups|group_id|templateGroupId|omitDisabledInstanceStageItemsForPatientApi" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/instance-service.test.ts src/modules/treatment-program/stage-semantics.test.ts
pnpm --dir apps/webapp exec tsc --noEmit
```

---

## 10. Ключевые ссылки на код

| Тема | Путь |
|---|---|
| Миграция A3 | `apps/webapp/db/drizzle-migrations/0029_treatment_program_a3_stage_groups.sql` |
| Copy tree PG | `apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts` (`createInstanceTree`, `deleteInstanceStageGroup`) |
| Copy tree in-memory | `apps/webapp/src/infra/repos/inMemoryTreatmentProgramInstance.ts` |
| Назначение шаблона | `apps/webapp/src/modules/treatment-program/instance-service.ts` (`assignTemplateToPatient`) |
| Удаление группы шаблона | `apps/webapp/src/infra/repos/pgTreatmentProgram.ts` (`deleteTemplateStageGroup`) |
| Patient read-model | `apps/webapp/src/modules/treatment-program/stage-semantics.ts` |
| Patient UI | `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx` |
