# AUDIT — Фаза 9 (гибкие правки экземпляра + интеграторная проекция)

**Дата аудита:** 2026-04-18.  
**Эталон:** `docs/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md` **§ 8** (история изменений, в т.ч. `stages_reordered` / `stage_items_reordered`), **§ 11** (LFK, `lfk_complex`, snapshot, проекция для интегратора).  
**Scope:** `src/modules/treatment-program/instance-service.ts` (`doctorReorderStages`, `doctorReorderStageItems`, guard’ы, `listTreatmentProgramLfkBlocksForIntegratorPatient`); `ports.ts`; `infra/repos/pgTreatmentProgramInstance.ts`, `inMemoryTreatmentProgramInstance.ts`, `pgTreatmentProgramTestAttempts.ts`; `buildAppDeps` (подключение `testAttempts` к instance service); API doctor `.../stages/reorder`, `.../stages/[stageId]/items/reorder`; API integrator `app/api/integrator/diary/lfk-complexes/route.ts`; тесты `treatment-program-events.test.ts`, `integrator/diary/lfk-complexes/route.test.ts`, прочие `src/modules/treatment-program/**/*.test.ts`.  

**Вне scope:** полный прогон CI монорепозитория (по запросу — только файлы фазы / см. рекомендуемые команды в конце).

---

## 1) Мутации после начала прохождения (replace / add / remove / reorder) и защита завершённых результатов

### Verdict: **PASS**

| Мутация | Реализация | Защита «живых» данных |
|---------|------------|----------------------|
| **replace** | `doctorReplaceStageItem` | `assertStageItemAllowsStructuralChange`: запрет при непустом `completed_at` **или** при `hasAnyAttemptForStageItem` |
| **remove item** | `doctorRemoveStageItem` | То же **до** удаления строки |
| **remove stage** | `doctorRemoveStage` | Для **каждого** элемента этапа — та же проверка |
| **add stage / add item** | `doctorAddStage`, `doctorAddStageItem` | Новые строки; snapshot через `buildSnapshot` — не затирают чужие `completed_at` / попытки |
| **reorder** | `doctorReorderStages`, `doctorReorderStageItems` | Обновление только `sort_order`; **id** элементов/этапов не пересоздаются |

**Оговорка:** гарантии действуют при вызовах через **`createTreatmentProgramInstanceService`**. Прямой вызов write-методов порта в обход сервиса может обойти guard’ы и события (**см. informational в MANDATORY**).

**Сверка § 8 (текст схемы):** удаление/замена при «живых» данных с историей — запрещены; реализация согласована.

---

## 2) Любая мутация пишет событие в `treatment_program_events` (без пропусков на штатных путях)

### Verdict: **PASS with documented exceptions**

| Путь (структурные / reorder, фаза 9) | Событие § 8 |
|--------------------------------------|-------------|
| `doctorAddStage` | `stage_added` |
| `doctorRemoveStage` | `stage_removed` |
| `doctorAddStageItem` | `item_added` |
| `doctorRemoveStageItem` | `item_removed` + `reason` |
| `doctorReplaceStageItem` | `item_replaced` |
| `doctorReorderStages` | `status_changed`, `payload.scope`: `stages_reordered` |
| `doctorReorderStageItems` | `status_changed`, `payload.scope`: `stage_items_reordered` |

**Условие:** запись через `appendEvent` → `buildAppendEventInput`; если порт **`events`** не передан в фабрику сервиса, события **не** пишутся (допустимо в части unit-тестов). В **production** `buildAppDeps` подключает порт событий.

**Не «мутация структуры экземпляра» в узком смысле фазы 9:** `updateInstance` только с **сменой `title`** без смены `status` — событие **не** создаётся (в § 8 нет типа «переименование») — **informational**.

**Вне строгой формулировки «любая мутация»:** `doctorOverrideTestResult` обновляет строку результата **без** новой строки в `treatment_program_events` — в § 8 отдельного типа нет (**informational**).

---

## 3) Инварианты snapshot / history после серии правок

### Verdict: **PASS**

| Инвариант | Подтверждение |
|-----------|----------------|
| Стабильный `id` `instance_stage_item` при reorder | Меняется только `sort_order` |
| Запрещённые операции при `completed_at` / попытках теста | Тесты `treatment-program-events.test.ts` |
| После разрешённого `replace` — обновлённые `item_ref_id` и `snapshot` | Логика репозитория + сервис |
| Серия add → replace → reorder | Тест **«AUDIT_PHASE_9 FIX 9-M-2»** / цепочка в `treatment-program-events.test.ts`: id, snapshot, события |

---

## 4) Интеграторная проекция `GET /api/integrator/diary/lfk-complexes`

### Verdict: **PASS**

| Требование § 11 | Реализация |
|-----------------|------------|
| Расширение существующего GET | Query `includeTreatmentPrograms=true` → поле **`treatmentProgramLfkBlocks`** (иначе поле не добавляется) |
| Элементы **`lfk_complex`** из активных экземпляров | `listTreatmentProgramLfkBlocksForIntegratorPatient`: `summ.status === "active"`, фильтр `itemType === "lfk_complex"` |
| Заголовок из **snapshot** | `lfkComplexTitle` из `snapshot.title` (trim), иначе `null` |
| Согласованность с legacy `complexes` | Массив `complexes` из `diaries.listLfkComplexes` и `treatmentProgramLfkBlocks` **независимы** — разные источники; идентификаторы различаются (`stageItemId`, `instanceId`) |

**HTTP:** `route.test.ts` — мок `buildAppDeps`, кейсы с/без `includeTreatmentPrograms` (**закрытие minor 9-M-1** в кодовой базе).

**Оговорка (продукт):** полный JSON snapshot (например полный список упражнений) в ответ интегратора **не** отдаётся целиком — только выбранные поля (**informational**).

---

## 5) Тесты: мутации, event recording, интегратор

### Verdict: **PASS**

| Область | Файл / примечание |
|---------|-------------------|
| Reorder + события `stages_reordered` / `stage_items_reordered` | `treatment-program-events.test.ts` |
| Блокировки remove/replace/remove stage при `completed_at` и попытках | Там же |
| Проекция ЛФК (active → скрытие после `completed` экземпляра) | Там же (`фаза 9–11`) |
| Цепочка add → replace → reorder + события | Там же (**9-M-2**) |
| HTTP integrator + флаг | `lfk-complexes/route.test.ts` (**9-M-1**) |

**Рекомендуемый scope (локально, на дату верификации FIX 2026-04-18):**  
`pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/ src/app/api/integrator/diary/lfk-complexes/route.test.ts` → **6** files, **49** tests **PASS**.

---

## Сверка с `SYSTEM_LOGIC_SCHEMA.md` § 8 и § 11 (итог)

| Пункт эталона | Статус |
|----------------|--------|
| § 8 события для переупорядочивания (`payload.scope`) | OK |
| § 8 запись через сервис, не триггеры | OK для штатных путей |
| § 8 `reason` для `item_removed` | OK (фаза 7/8, используется здесь же) |
| § 11 проекция `lfk_complex` из экземпляра, snapshot | OK |
| § 11 опциональное расширение GET | OK |

---

## Gate (фаза 9, аудит 2026-04-18)

| Критерий | Статус |
|----------|--------|
| Мутации + защита истории | OK |
| События на структурных путях и reorder | OK (при подключённом `events`) |
| Инварианты snapshot / цепочка правок | OK |
| Интегратор `lfk-complexes` + флаг | OK |
| Тесты модуля + HTTP | OK |

**Gate verdict:** **PASS**

---

## MANDATORY FIX INSTRUCTIONS

### Critical / Major

**На момент аудита блокирующих отклонений от § 8 / § 11 по фазе 9 **не выявлено**.**  
При изменении guard’ов `assertStageItemAllowsStructuralChange`, reorder в репозитории, проекции `listTreatmentProgramLfkBlocksForIntegratorPatient` или контракта ответа integrator — перезапустить чек-лист § 1–5 и тесты `treatment-program-events.test.ts`, `lfk-complexes/route.test.ts`.

### Minor (закрыты в кодовой базе до/в ходе FIX 2026-04-18)

| ID | Описание | Статус |
|----|----------|--------|
| **9-M-1** | HTTP-тесты `lfk-complexes` с моком `buildAppDeps` и `includeTreatmentPrograms` | **Закрыто** — `route.test.ts` |
| **9-M-2** | Регрессия цепочки add → replace → reorder + события | **Закрыто** — `treatment-program-events.test.ts` |

### Informational (defer)

| ID | Тема | Комментарий |
|----|------|-------------|
| **9-I-1** | Полнота DTO проекции § 11 | Расширение ответа (например фрагмент snapshot с упражнениями) — по необходимости бота |
| **9-I-2** | Только смена `title` экземпляра | Событие в § 8 не описано |
| **9-I-3** | Опциональные порты `events` / `testAttempts` в фабрике | Упрощают тесты; production передаёт порты |
| **9-I-4** | Обход сервиса при прямом вызове порта | Дисциплина слоёв / restricted imports |
| **9-I-5** | Override результата теста без строки в events | § 8 не задаёт тип |
| **9-I-6** | Атомарность reorder + insert события | Два шага; усиление — транзакция/outbox при необходимости |

---

## Рекомендуемые проверки (scope фазы)

```bash
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/ \
  src/app/api/integrator/diary/lfk-complexes/route.test.ts
pnpm --dir apps/webapp run typecheck
```

Полный `pnpm run ci` — по политике репозитория перед пушем, не как обязательный шаг каждого аудита.

---

## AUDIT_PHASE_9 FIX — верификация (2026-04-18)

**Статус MANDATORY FIX INSTRUCTIONS**

| Блок | Результат |
|------|-----------|
| Critical / Major | **N/A** — в аудите не заводились; формально закрыто. |
| Minor **9-M-1**, **9-M-2** | **Закрыты** — см. таблицу «Minor» выше. |
| Informational **9-I-1 … 9-I-6** | **Defer** — см. таблицу «Informational» выше. |

**Step / phase проверки (фактический прогон)**

| Шаг | Команда | Результат |
|-----|---------|-----------|
| Vitest (scope фазы 9) | `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/ src/app/api/integrator/diary/lfk-complexes/route.test.ts` | **PASS** — **6** files, **49** tests |
| Typecheck | `pnpm --dir apps/webapp run typecheck` | **PASS** |
| Lint | `pnpm --dir apps/webapp run lint` | **PASS** |
| Production build (webapp) | `pnpm --dir apps/webapp run build` | **PASS** |
| Pre-deploy audit | `pnpm run audit` | **FAIL** — известный класс для репозитория (`esbuild`, `drizzle-orm` advisories); не трактуется как регрессия фазы 9 |

**Подтверждения по требованиям FIX**

1. **Мутации после старта прохождения:** guard’ы `assertStageItemAllowsStructuralChange` и тесты блокировок / цепочки **9-M-2** подтверждают отсутствие потери завершённых результатов на штатном пути через сервис (§ 1).
2. **Запись в `treatment_program_events`:** для структурных мутаций и reorder — события из таблицы § 2 через `appendEvent` при подключённом порте `events` (`buildAppDeps` в production).
3. **Интегратор** `GET /api/integrator/diary/lfk-complexes`: поведение с `includeTreatmentPrograms` и полем `treatmentProgramLfkBlocks` зафиксировано в `route.test.ts` (§ 4).

**Gate verdict (AUDIT_PHASE_9 FIX):** **PASS**.

---

## История документа

- 2026-04-18: аудит и блок **AUDIT_PHASE_9 FIX — верификация**; minor **9-M-1** / **9-M-2** закрыты в кодовой базе; informational — defer с обоснованием.
