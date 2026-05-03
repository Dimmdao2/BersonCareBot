# AUDIT — Stage A2 (PROGRAM_PATIENT_SHAPE)

**Дата:** 2026-05-03  
**Scope:** Stage A2 — `is_actionable` / `status` (active|disabled) на `treatment_program_instance_stage_items`, Этап 0 (`sort_order = 0`), disable/enable вместо hard delete, события `item_disabled` / `item_enabled`, исключение disabled/persistent из прогресса, UI врача/пациента.  
**Источники:** [`STAGE_A2_PLAN.md`](STAGE_A2_PLAN.md), [`MASTER_PLAN.md`](MASTER_PLAN.md), [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md).

---

## 1. Verdict

- **Status:** **PASS** (после FIX 2026-05-03: **A2-READ-01**, **A2-TXN-01** закрыты; **A2-LEGACY-01** — defer, см. §4).
- **Summary:** Цепочка Drizzle → порты (pg + in-memory) → `instance-service` / `progress-service` → doctor `PATCH` stage-items → UI врача и пациента согласована с планом A2. Hard delete элемента экземпляра через API устранён; O4 зафиксирован на уровне instance item. Patient **`GET`** исключает `disabled` из `stages[].items`; disable/enable пишут строку события в **одной** DB-транзакции (PG).

---

## 1b. Post-FIX (2026-05-03)

| ID | Результат |
|---|---|
| **A2-READ-01** | **Закрыт:** `omitDisabledInstanceStageItemsForPatientApi` в `stage-semantics.ts`; применён в **`GET /api/patient/treatment-program-instances/[instanceId]`** и в RSC `app/app/patient/treatment-programs/[instanceId]/page.tsx`. Контракт — `api.md`. |
| **A2-TXN-01** | **Закрыт:** порт **`patchInstanceStageItemWithEvent`** (PG — `db.transaction`: update item + insert event + touch instance; in-memory — patch + `appendProgramEvent` в одном замыкании). `doctorDisableInstanceStageItem` / `doctorEnableInstanceStageItem` при наличии `events` вызывают его; без `events` — только `patch` (обратная совместимость тестовых фикстур). |
| **A2-LEGACY-01** | **Defer (Info):** контент/миграция шаблонов — вне runtime-FIX; рекомендация в `LOG.md` и §2.3 плана без изменения кода. |

## 2. Проверки по запросу аудита

### 2.1 `is_actionable` и `status` работают end-to-end

| Критерий | Статус | Доказательство |
|---|---|---|
| Схема БД + миграция | **PASS** | `apps/webapp/db/schema/treatmentProgramInstances.ts` — `isActionable`, `status` + CHECK `active` \| `disabled`. Миграция `apps/webapp/db/drizzle-migrations/0028_treatment_program_a2_instance_item_status.sql`. |
| Репозиторий | **PASS** | `pgTreatmentProgramInstance.ts`: `mapItem`, `createInstanceTree` / `addInstanceStageItem` / `patchInstanceStageItem` / **`patchInstanceStageItemWithEvent`**, `replaceInstanceStageItem` (сброс `status`/`isActionable` при замене). `inMemoryTreatmentProgramInstance.ts` — зеркально. |
| Назначение с шаблона | **PASS** | `instance-service.ts` `assignTemplateToPatient`: для `recommendation` задаётся `isActionable: true`, `status: "active"`; логика стартовых статусов этапов (Этап 0 + первый FSM-этап). |
| Doctor API | **PASS** | `apps/webapp/src/app/api/doctor/treatment-program-instances/[instanceId]/stage-items/[itemId]/route.ts` — `PATCH` с `status`, `isActionable`, `localComment`, `replace`. |
| Doctor UI | **PASS** | `TreatmentProgramInstanceDetailClient.tsx` — `InstanceStageItemDoctorRow`: `Badge`, `Select`, `Отключить`/`Включить`, `Dialog` при истории. |
| Тесты | **PASS** | `instance-service.test.ts` (ожидания `isActionable`/`status`), `treatment-program-events.test.ts`, `progress-service.test.ts` (A2-сценарии). |

### 2.2 Disabled items исключены из patient completion / read model

| Критерий | Статус | Доказательство |
|---|---|---|
| Completion (мутации) | **PASS** | `progress-service.ts`: `patientCompleteSimpleItem`, `patientEnsureTestAttempt`, `patientSubmitTestResult` — отказ при `!isInstanceStageItemActiveForPatient(item)` («Элемент отключён»). |
| Прогресс этапа | **PASS** | `maybeCompleteStageFromItems`: `isCompletableForStageProgress` исключает `status === "disabled"` и persistent recommendation. |
| Read model в web UI | **PASS** | `PatientTreatmentProgramDetailClient.tsx` — `visibleItems = stage.items.filter(isInstanceStageItemActiveForPatient)`. |
| Read model в JSON `GET` пациента | **PASS** | После FIX: `route.ts` вызывает `omitDisabledInstanceStageItemsForPatientApi` после `getInstanceForPatient`. Контракт в `api.md`. |

### 2.3 Stage 0 всегда видим и не влияет на FSM

| Критерий | Статус | Доказательство |
|---|---|---|
| Определение этапа 0 | **PASS** | `stage-semantics.ts` — `isStageZero(stage) => stage.sortOrder === 0`. |
| FSM автозавершения | **PASS** | `progress-service.ts` `maybeCompleteStageFromItems`: `if (isStageZero(stage)) return;`. |
| Доступ пациента при locked | **PASS** | `assertStageAccessibleForPatient`: для этапа 0 не блокирует по `locked`/`skipped`. |
| UI: всегда отдельный блок | **PASS** | `PatientTreatmentProgramDetailClient.tsx` — `stageZeroStages` рендерятся с `patientSectionSurfaceClass` и заголовком «Общие рекомендации»; `ignoreStageLockForContent` для контента элементов. |
| Назначение: стартовые статусы | **PASS** | `instance-service.ts` `assignTemplateToPatient` — этап с `sortOrder === 0` → `available`; первый этап с `sortOrder > 0` → `available`; остальные FSM-этапы → `locked`; fallback без FSM-этапов — индекс 0. |

### 2.4 Events `item_disabled` / `item_enabled` пишутся корректно

| Критерий | Статус | Доказательство |
|---|---|---|
| CHECK в БД | **PASS** | `treatmentProgramEvents.ts` и миграция `0028_*` — типы в enum. |
| Запись из сервиса | **PASS** | `instance-service.ts` `doctorDisableInstanceStageItem` / `doctorEnableInstanceStageItem` — при наличии `events` вызывают **`patchInstanceStageItemWithEvent`** (PATCH + событие атомарно в PG), `targetType: "stage_item"`, `payload` с `stageId`, `itemType`, `itemRefId`. |
| `reason` | **PASS** | `event-recording.ts` — обязательный `reason` только для `stage_skipped` и `item_removed`; для `item_disabled` / `item_enabled` не требуется. |
| Идемпотентность | **PASS** | Повторный disable при уже `disabled` — ранний `return item` без второго события; аналогично enable. |
| Тесты | **PASS** | `treatment-program-events.test.ts` — наличие `item_disabled` в ленте. |
| Атомарность PATCH + event | **PASS** | `patchInstanceStageItemWithEvent` в PG — одна транзакция; in-memory — единое замыкание. Сервис: disable/enable при `events` используют этот путь. |

### 2.5 Нет hard delete instance items

| Критерий | Статус | Доказательство |
|---|---|---|
| Порт инстанса | **PASS** | `ports.ts` — метода `removeInstanceStageItem` нет. |
| PG in-memory | **PASS** | `pgTreatmentProgramInstance.ts` / `inMemoryTreatmentProgramInstance.ts` — нет `delete` по строке элемента экземпляра; удаление этапа каскадом БД — отдельная операция структуры, не «удалить item врачом». |
| Doctor API | **PASS** | В `.../stage-items/[itemId]/route.ts` нет обработчика `DELETE` (файл только `PATCH`). |
| Шаблонные stage-items | **Out of scope A2** | `deleteStageItem` в `treatment-program-templates` — **шаблон**, не экземпляр; не нарушает критерий A2. |

---

## 3. Architecture / rules (A2-релевантно)

- [x] `is_actionable` только на instance item (O4); каталог рекомендаций не расширялся `default_is_actionable`.
- [x] `modules/treatment-program/*` без новых прямых импортов `@/infra/db/*` / `@/infra/repos/*` для этой фичи.
- [x] Route handlers: Zod + `buildAppDeps()` + вызовы сервиса; бизнес-логика в `instance-service` / `progress-service`.
- [x] Новые колонки и изменение CHECK событий — через Drizzle schema + миграция.

---

## 4. Регрессии / замечания

| ID | Серьёзность | Описание |
|---|---|---|
| **A2-READ-01** | — | **Закрыт** (см. §1b). |
| **A2-TXN-01** | — | **Закрыт** (см. §1b). |
| **A2-LEGACY-01** | Info | **Defer:** контент/структура шаблонов; см. §1b и `LOG.md`. |

---

## 5. Рекомендованные проверки (повторный прогон)

Из записи A2 в [`LOG.md`](LOG.md):

```bash
rg "is_actionable|item_disabled|item_enabled|isStageZero|isPersistentRecommendation|patchInstanceStageItem|patchInstanceStageItemWithEvent|omitDisabledInstanceStageItemsForPatientApi" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/stage-semantics.test.ts src/modules/treatment-program/progress-service.test.ts src/modules/treatment-program/instance-service.test.ts src/modules/treatment-program/treatment-program-events.test.ts src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx
pnpm --dir apps/webapp exec tsc --noEmit
```

---

## 6. MANDATORY FIX INSTRUCTIONS

Любой **FIX** по замечаниям A2, регрессиям в этой области или закрытию пунктов §4 — выполнять **только** с соблюдением правил ниже. Нарушение считается некорректным закрытием задачи.

### 6.1 Данные и миграции

1. **Не удалять** колонки `is_actionable`, `status` с `treatment_program_instance_stage_items` и не ослаблять CHECK `treatment_program_instance_stage_items_status_check` без продуктового решения и миграции совместимости.
2. **Не возвращать** публичный **doctor** `DELETE` на `.../treatment-program-instances/.../stage-items/[itemId]` для физического удаления строки элемента экземпляра; отключение только через **`status: "disabled"`** и включение через **`"active"`**.
3. Расширение схемы событий: типы **`item_disabled`** / **`item_enabled`** остаются в CHECK `treatment_program_events`; новые типы событий — только через Drizzle schema + миграция (как в `0028_*`).
4. **O4:** не добавлять `default_is_actionable` (или аналог) в каталог рекомендаций в рамках исправлений A2; флаг только на **`treatment_program_instance_stage_items`**.

### 6.2 Сервисы и прогресс

5. **`maybeCompleteStageFromItems`** обязан: (a) игнорировать этап с `isStageZero`; (b) считать «требуется выполнение» только через **`isCompletableForStageProgress`** (исключая `disabled` и persistent recommendation).
6. **Пациентские мутации** (`patientCompleteSimpleItem`, `patientEnsureTestAttempt`, `patientSubmitTestResult`) обязаны отклонять **`disabled`** элементы и **persistent** recommendation для ручного complete (как сейчас в `progress-service.ts`).
7. **`assignTemplateToPatient`:** сохранять правило стартовых статусов этапов (Этап 0 + первый FSM-этап + locked для прочих с `sort_order > 0`) и дефолты **`isActionable`/`status`** для новых instance items. После правок — **обновить** `instance-service.test.ts`.

### 6.3 События

8. **`item_disabled` / `item_enabled`:** писать только из **`doctorDisableInstanceStageItem` / `doctorEnableInstanceStageItem`** (или их будущих преемников в том же сервисном слое), с **`buildAppendEventInput`** / эквивалентной нормализацией `reason`. Не требовать `reason` для этих типов (см. `event-recording.ts`).
9. **A2-TXN-01 (закрыт):** `item_disabled` / `item_enabled` в PG — через **`patchInstanceStageItemWithEvent`** на порте инстанса (одна `db.transaction`); дублировать `appendEvent` в route запрещено; **`instance-service`** — единая точка вызова.

### 6.4 API и контракты

10. Любое изменение тела **`PATCH .../stage-items/[itemId]`** — одновременно обновить **`apps/webapp/src/app/api/api.md`**.
11. **A2-READ-01 (закрыт):** `disabled` исключены из **`stages[].items`** в patient **`GET`** и RSC страницы программы (`omitDisabledInstanceStageItemsForPatientApi` + `api.md`). Врачебный **`GET`** экземпляра без фильтра.

### 6.5 UI

12. **Врач:** только примитивы из `STAGE_A2_PLAN.md` §5 / `MASTER_PLAN.md` §6.1 (`Button`, `Select`, `Dialog`, `Badge`, …); классы `flex flex-wrap items-center gap-2`, `opacity-60` для отключённого блока.
13. **Пациент:** только `patientVisual.ts` для блока «Общие рекомендации» и списков; **запрещён** импорт из `app/app/patient/home/*`. Скрытие **`disabled`** в списке обязательно сохранять при правках.

### 6.6 Контур файлов

14. Исправления A2 — в зонах: `apps/webapp/src/modules/treatment-program/**` (включая `stage-semantics.ts`), `apps/webapp/src/infra/repos/*TreatmentProgram*Instance*`, `apps/webapp/db/schema/treatmentProgramInstances.ts`, `treatmentProgramEvents.ts`, `apps/webapp/db/drizzle-migrations/**`, `apps/webapp/src/app/api/doctor/treatment-program-instances/**`, `apps/webapp/src/app/api/patient/treatment-program-instances/**`, `apps/webapp/src/app/app/doctor/**/treatment-program*/**`, `apps/webapp/src/app/app/patient/treatment-programs/**`, соответствующие тесты. **Не** расширять scope на courses / каталог B4 без отдельной задачи.

---

## 7. Ссылки на код (ключевые точки)

- Семантика этапа 0 / persistent / disabled: `apps/webapp/src/modules/treatment-program/stage-semantics.ts`
- FSM завершения этапа: `apps/webapp/src/modules/treatment-program/progress-service.ts` (`maybeCompleteStageFromItems`, `assertStageAccessibleForPatient`)
- Disable / enable / `isActionable`: `apps/webapp/src/modules/treatment-program/instance-service.ts`
- Patient **`GET`** read model: `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/route.ts`
- Транзакция PATCH+event: `patchInstanceStageItemWithEvent` в `pgTreatmentProgramInstance.ts` / `inMemoryTreatmentProgramInstance.ts`
- Patient UI: `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx`
- Doctor UI: `apps/webapp/src/app/app/doctor/clients/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx`
