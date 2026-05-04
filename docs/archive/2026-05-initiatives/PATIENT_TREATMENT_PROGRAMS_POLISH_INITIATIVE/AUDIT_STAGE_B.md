# AUDIT — Stage B (`1.1a` detail `[instanceId]`)

**Дата аудита:** 2026-05-04  
**Дата FIX по аудиту:** 2026-05-04  
**Канон этапа:** [`STAGE_B.md`](STAGE_B.md) · дорожная карта: [`../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](../../../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §3 п. **1.1a** · журнал: [`LOG.md`](LOG.md).

---

## FIX closure — Critical / Major / Minor / INFO

| Уровень | Статус | Что сделано |
|---------|--------|-------------|
| **Critical** | **CLOSED** | На аудите **0** finding’ов. Сценарии MANDATORY §Critical (дата контроля не от этапа; этап 0 в pipeline; архив не в `<details>` / с `open`) — **не воспроизведены**; повторная верификация кода: `expectedStageControlDateIso(currentWorkingStage)` в [`PatientTreatmentProgramDetailClient.tsx`](../../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx); `splitPatientProgramStagesForDetailUi` / `selectCurrentWorkingStageForPatientDetail` в [`stage-semantics.ts`](../../../apps/webapp/src/modules/treatment-program/stage-semantics.ts); `#program-archive` без `open`. |
| **Major** | **CLOSED** | На аудите **0** finding’ов. Сценарии MANDATORY §Major (чек-лист UI; проценты; «План обновлён») — **не воспроизведены**; тест на отсутствие строки «Чек-лист на сегодня» в [`PatientTreatmentProgramDetailClient.test.tsx`](../../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx). |
| **Minor** | **CLOSED (верификация)** | В исходном аудите **0** finding’ов. Пункты MANDATORY §Minor (якорь CTA, `href`↔`id`, vitest 1.1a): **закрыты подтверждением** — `id="patient-program-current-stage"` + `ref={currentStageRef}` в обеих ветках текущего этапа; `href="#program-archive"` и `<details id="program-archive">`; тесты `stage-semantics.test.ts` + detail client (см. [`LOG.md`](LOG.md) post-FIX). |
| **INFO-1** | **DEFER** | Вызов `/checklist-today` на detail **без** UI-блока «Чек-лист на сегодня» оставлен для `doneItemIds` (отметки в карточках назначений). Сужение до «ноль запросов с detail» — **вне закрытия B** (нужен отдельный контракт read-model / согласование продукта); см. §5. |

---

## Сводка

| Область | Вердикт |
|---------|---------|
| Соответствие `STAGE_B.md` + ROADMAP §1.1a DoD | **PASS** |
| Этап 0 отделён от текущего рабочего этапа | **PASS** |
| Архив под `<details>`, по умолчанию закрыт | **PASS** |
| UI «Чек-лист на сегодня» на detail | **PASS** (блок отсутствует; API вызывается только для `doneItemIds` — см. INFO) |
| Нет процентной аналитики; контрольная дата от `started_at` этапа | **PASS** |

**Finding’и (первичный аудит):** Critical **0**, Major **0**, Minor **0**. INFO **1** — см. §6; по процедуре FIX: **INFO-1 → DEFER** (таблица в начале файла). **Post-FIX:** Critical / Major / Minor — **CLOSED** в той же таблице.

---

## 1) Detail vs `STAGE_B.md` и ROADMAP_2 §1.1a

### 1.1 Структура (STAGE_B §1, ROADMAP «Верхний блок»)

| Критерий | Статус | Доказательство |
|----------|--------|----------------|
| Название программы + номер/название текущего этапа | **PASS** | Hero-карточка: `detail.title`, строка «Текущий этап: этап {sortOrder} · {title}» при наличии `currentWorkingStage` — [`PatientTreatmentProgramDetailClient.tsx`](../../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx) ~659–676. |
| CTA «Открыть текущий этап» | **PASS** | Кнопка + `scrollIntoView` к `#patient-program-current-stage` — там же ~677–686. |
| Ссылка «Архив этапов» | **PASS** | Показывается при `archiveStages.length > 0`, `href="#program-archive"` — ~688–695. |
| Этап `sort_order = 0` отдельным блоком «Общие рекомендации» | **PASS** | `splitPatientProgramStagesForDetailUi` выделяет `stageZero`; рендер `PatientInstanceStageBody` с заголовком «Общие рекомендации» **до** основного рабочего блока — [`stage-semantics.ts`](../../../apps/webapp/src/modules/treatment-program/stage-semantics.ts) ~78–91; client ~703–729. |
| «План обновлён» (смысл как на Today) | **PASS** | RSC: `patientPlanUpdatedBadgeForInstance` + `formatBookingDateLongRu` → `planUpdatedLabel`; клиент рендерит при непустой строке — [`page.tsx`](../../../apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/page.tsx) ~49–57, ~72–76; client ~664–667. |

### 1.2 Рабочая часть и архив (STAGE_B §2, ROADMAP)

| Критерий | Статус | Доказательство |
|----------|--------|----------------|
| Текущий этап — основной рабочий блок | **PASS** | `selectCurrentWorkingStageForPatientDetail(pipeline)` без этапа 0 (`pipeline` = только `sortOrder !== 0` и не completed/skipped) — `stage-semantics.ts` ~94–103; тело этапа с `ring` и `PatientInstanceStageBody` — client ~617–640. |
| Архив `completed`/`skipped` в `<details>`, по умолчанию закрыт | **PASS** | `<details id="program-archive">` **без** атрибута `open` — client ~759–791. Внутри стадии группы используют отдельные `<details open>` для раскрытия **групп** назначений — это не архив этапов (см. client ~380–418). |
| Patient primitives / shadcn | **PASS** | `patientCardClass`, `patientSectionSurfaceClass`, `Button`, `buttonVariants` для ссылки на архив — client imports + hero. |

### 1.3 Сигналы и дата контроля (STAGE_B §3, ROADMAP DoD)

| Критерий | Статус | Доказательство |
|----------|--------|----------------|
| Контроль только при `started_at` и `expected_duration_days` | **PASS** | `expectedStageControlDateIso` возвращает `null`, если любое из полей отсутствует или дни невалидны — [`stage-semantics.ts`](../../../apps/webapp/src/modules/treatment-program/stage-semantics.ts) ~106–118. |
| База расчёта — `started_at` **этапа**, не программы | **PASS** | В UI: `expectedStageControlDateIso(currentWorkingStage)` — client ~613; реализация использует только `stage.startedAt` + `stage.expectedDurationDays`. Нет использования `detail.createdAt` для этой метки. |

### 1.4 UI-инварианты (STAGE_B §4, ROADMAP «Что НЕ делать»)

| Критерий | Статус | Доказательство |
|----------|--------|----------------|
| Нет `%` / «за сегодня» / `% этапа` / `% программы` на detail | **PASS** | `rg '%'` по [`PatientTreatmentProgramDetailClient.tsx`](../../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx) — совпадений нет; пользовательские формулировки процентов в UI detail не найдены. |

---

## 2) Проверки из запроса аудита (явный чек-лист)

### 2.1 Detail ↔ STAGE_B + ROADMAP §1.1a

**PASS** — таблица §1 покрывает чек-лист `STAGE_B.md` и блок ROADMAP **1.1a** (цель, список действий, DoD: этап 0 отдельно, текущий выделен условно через ring + якорь, архив скрыт по умолчанию, сигнал «План обновлён», дата контроля от полей этапа).

### 2.2 Этап 0 отделён от текущего этапа

**PASS** — логически: этап 0 только в `stageZero`, текущий рабочий — только из `pipeline` (`splitPatientProgramStagesForDetailUi` + `selectCurrentWorkingStageForPatientDetail`). Визуально: сначала блок(и) «Общие рекомендации», затем `#patient-program-current-stage` с «Назначения этапа».

### 2.3 Архив под `<details>`, закрыт по умолчанию

**PASS** — `#program-archive` без `open` (см. §1.2).

### 2.4 «Чек-лист на сегодня» отсутствует на detail

**PASS** для **видимого UI** — строка заголовка секции не рендерится; тест закрепляет отсутствие — [`PatientTreatmentProgramDetailClient.test.tsx`](../../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx) ~189–197.

### 2.5 Нет процентов; дата контроля от `started_at`

**PASS** — см. §1.3–1.4.

---

## 3) Целевые команды (`STAGE_B.md` / ROADMAP «узкие проверки»)

Зафиксировано в [`LOG.md`](LOG.md) (этап B): `rg`, `pnpm --dir apps/webapp lint …`, `tsc --noEmit`, `vitest` (detail + `stage-semantics`) — **PASS** на момент закрытия B в журнале.

Повторный аудит рекомендует прогнать:

```bash
rg "Чек-лист на сегодня|План обновлён" apps/webapp/src/app/app/patient/treatment-programs
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs src/modules/treatment-program/stage-semantics.test.ts
```

---

## 4) Исторический блок «FIX closure» (до post-FIX)

Ранее: «не применимо» при нуле finding’ов. После процедуры FIX см. таблицу **«FIX closure — Critical / Major / Minor / INFO»** в начале файла.

---

## 5) Наблюдения (INFO, не нарушение MVP)

**INFO-1 — `checklist-today` без UI-секции.** Клиент по-прежнему запрашивает `/checklist-today` для массива `doneItemIds` (отметки в карточках назначений внутри этапа). Требование этапа B — убрать **блок** «Чек-лист на сегодня» на detail; это выполнено. Если продукт позже потребует **ноль** сетевых обращений к checklist с detail — вынести обсуждение в отдельный шаг (возможна подпитка `doneItemIds` из другого read-path).

---

## 6) Finding’и по серьёзности

| Уровень | Кол-во | Комментарий |
|---------|--------|-------------|
| Critical | 0 | — |
| Major | 0 | — |
| Minor | 0 | — |
| INFO | 1 | INFO-1 выше |

---

## MANDATORY FIX INSTRUCTIONS

Инструкции на случай **регресса** или повторного аудита с отрицательным результатом. Исправления — в рамках scope [`STAGE_B.md`](STAGE_B.md) (`page.tsx`, `PatientTreatmentProgramDetailClient.tsx`, при необходимости [`stage-semantics.ts`](../../../apps/webapp/src/modules/treatment-program/stage-semantics.ts)); без процентов и без возврата MVP-чек-листа секцией, если канон не изменён.

### Critical (блокер соответствия 1.1a / вводит в заблуждение)

1. **Контрольная дата считается от даты программы, а не этапа.**  
   - Восстановить единственный источник: `expectedStageControlDateIso` только от **`currentWorkingStage.startedAt`** и **`currentWorkingStage.expectedDurationDays`**.  
   - Запретить подмешивание `detail.createdAt` / `detail.updatedAt` в эту метку на detail.  
   - Проверить [`stage-semantics.ts`](../../../apps/webapp/src/modules/treatment-program/stage-semantics.ts) `expectedStageControlDateIso` и вызов в [`PatientTreatmentProgramDetailClient.tsx`](../../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx).

2. **Этап 0 попал в выбор «текущего» рабочего этапа.**  
   - Убедиться, что `splitPatientProgramStagesForDetailUi` исключает `sortOrder === 0` из `pipeline` и что `selectCurrentWorkingStageForPatientDetail` вызывается **только** на `pipeline`.  
   - Не дублировать этап 0 в основном блоке с тем же содержимым, что и в «Общие рекомендации».

3. **Архив этапов не в `<details>` или открыт по умолчанию на уровне архива программы.**  
   - Элемент `#program-archive` должен быть `<details>` **без** `open`.  
   - Завершённые/пропущенные этапы рендерить только внутри этого блока (после `<summary>`).

### Major (нарушение STAGE_B / ROADMAP, но без «лживой» даты)

1. **Вернулся видимый блок «Чек-лист на сегодня» на detail.**  
   - Удалить секцию и любые заголовки с этой строкой; оставить тест `queryByText("Чек-лист на сегодня")` падающим при регрессе.

2. **Появились процентные метрики (`%`, «за сегодня» как прогресс %, «% этапа», «% программы»).**  
   - Удалить с detail согласно ROADMAP «Что НЕ делать»; прогнать `rg` по каталогу `treatment-programs`.

3. **«План обновлён» потерян или смешан с прогрессом.**  
   - Восстановить цепочку как на Today: RSC собирает `planUpdatedLabel` через `patientPlanUpdatedBadgeForInstance` + `formatBookingDateLongRu` в [`page.tsx`](../../../apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/page.tsx); клиент показывает отдельной строкой с `role="status"`.

### Minor (качество / согласованность)

1. **CTA «Открыть текущий этап» не скроллит к рабочему блоку.**  
   - Проверить `id="patient-program-current-stage"` и `ref={currentStageRef}` на контейнере текущего этапа (в т.ч. ветка «только заголовок» без `PatientInstanceStageBody`).

2. **Ссылка «Архив этапов» ведёт не на `#program-archive`.**  
   - Синхронизировать `href` и `id` архивного `<details>`.

3. **Тесты этапа B не покрывают новую логику.**  
   - Держать `vitest` для `splitPatientProgramStagesForDetailUi`, `selectCurrentWorkingStageForPatientDetail`, `expectedStageControlDateIso` и регресс «нет чек-листа» / «есть label плана» в [`PatientTreatmentProgramDetailClient.test.tsx`](../../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx).

### После любого FIX по этому списку

- Обновить [`LOG.md`](LOG.md) (что изменено, какие команды прогнаны).  
- Прогнать узкие проверки из §3; перед push — полный барьер из [`pre-push-ci.mdc`](../../../.cursor/rules/pre-push-ci.mdc).
