# AUDIT_GLOBAL — PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE

**Дата:** 2026-05-05  
**Scope:** этапы A → B → C → D (все четыре)  
**Baseline:** `STAGE_PLAN.md`, `ROADMAP_2.md §1.0 / §1.1a / §1.1b / §1.1`

---

## Метод

1. Анализ `LOG.md` — последовательность и полнота записей по каждому этапу.
2. Анализ `git log` + `git diff da3278a9..ea97f5c7 --name-only` — состав изменений.
3. Прочтение каждого `AUDIT_STAGE_*.md` (A/B/C/D) — итоги поэтапных аудитов.
4. Прямая проверка MVP-инвариантов в исходном коде.
5. Проверка scope-ограничений: DB/schema/migrations/module/ports не затронуты.

---

## 1. EXEC → AUDIT → FIX → COMMIT по каждому этапу

| Этап | EXEC | AUDIT | FIX | COMMIT |
|------|------|-------|-----|--------|
| A | ✅ verify (`startedAt` pre-existing) | ✅ `AUDIT_STAGE_A.md` — PASS, 0 findings | ✅ нет исправлений | ✅ trail закрыт в Global FIX (запись в `LOG.md`, см. «Детали по Stage A — COMMIT (M1)» ниже) |
| B | ✅ verify (detail MVP pre-existing) | ✅ `AUDIT_STAGE_B.md` — PASS, 0 findings | ✅ нет исправлений | ✅ `25469bd7` |
| C | ✅ implement C1–C10 | ✅ `AUDIT_STAGE_C.md` — PASS, 4 minor → все закрыты | ✅ M1–M4 applied | ✅ `ac219941` |
| D | ✅ verify + D1 polish | ✅ `AUDIT_STAGE_D.md` — PASS, 1 minor → defer | ✅ M1 deferred | ✅ `ea97f5c7` |

### Детали по Stage A — COMMIT (M1)

`STAGE_PLAN.md` требует изолированный `COMMIT` после каждого этапа. Для Stage A нет отдельного **кодового** коммита — документация Stage A (`AUDIT_STAGE_A.md`, все `STAGE_*.md`, `STAGE_PLAN.md`, `PROMPTS_COPYPASTE.md`, `README.md`) была закоммичена в рамках Stage B context-коммита `41c4c91a`. Изначально в `LOG.md` не было строки «Stage A closed + commit».

**Global FIX (2026-05-05):** в `LOG.md` добавлена ретроактивная запись; трейл этапа A по конвейеру закрыт.

**Риск:** нулевой (Stage A — верификационный, code diff пустой).

---

## 2. Порядок A → B → C → D

Проверено через предусловия в LOG.md и git history:

| Переход | Подтверждение в LOG | Commit |
|---------|---------------------|--------|
| start → A | Stage A gate: правила прочитаны | `41c4c91a` |
| A → B | «Подтверждено предусловие `STAGE_B.md`: Stage A закрыт» | `25469bd7` |
| B → C | «Подтверждено предусловие `STAGE_C.md`: Stage B закрыт» | `ac219941` |
| C → D | «Подтверждено предусловие `STAGE_D.md`: Stage C закрыт и закоммичен (`ac219941`)» | `ea97f5c7` |

✅ Порядок соблюдён. Каждый gate явно ссылается на закрытие предыдущего.

---

## 3. MVP-инварианты

### 3.1 Этап 0 рендерится отдельно от текущего рабочего этапа

`PatientTreatmentProgramDetailClient.tsx` использует `splitPatientProgramStagesForDetailUi(detail.stages)` → `{ stageZero, pipeline, archive }`.

- `stageZero` → `stageZeroStages` → рендерится в `Collapsible` с поверхностью `patientSurfaceSuccessClass` (C3). ✅
- `currentWorkingStage` (из `pipeline`) → превью-карточка C4 и CTA «Открыть этап». ✅
- Этап 0 не участвует в подсчёте `pipelineLength` (badge «Этап X из Y»). ✅

### 3.2 Нет процентной аналитики прогресса в UI

Grep `%|percent|progress` в обоих ключевых файлах:

| Файл | Совпадения | Характер |
|------|-----------|---------|
| `PatientTreatmentProgramDetailClient.tsx` | 7 | Исключительно пути API (`/progress/complete`, `/progress/lfk-session`, `/progress/test-attempt`, `/progress/test-result`) — URL-строки в `fetch()`, не UI-текст |
| `PatientTreatmentProgramsListClient.tsx` | 0 | — |
| `[instanceId]/stages/[stageId]/page.tsx` | 0 | — |
| `PatientTreatmentProgramStagePageClient.tsx` | 0 | — |

Никаких `%` прогресса, `% этапа`, `% программы` в UI-тексте нет. ✅

### 3.3 Дата контроля считается от `started_at + expected_duration_days`

В `PatientTreatmentProgramDetailClient.tsx`:
```
const controlIso = currentWorkingStage ? expectedStageControlDateIso(currentWorkingStage) : null;
```
`expectedStageControlDateIso` (из `stage-semantics.ts`) возвращает дату только при наличии обоих полей `startedAt` и `expectedDurationDays` — подтверждено в `AUDIT_STAGE_B.md` §5. ✅

### 3.4 Нет блока «Чек-лист на сегодня» в detail

Grep `Чек-лист на сегодня` → 0 UI-вхождений в JSX (2 совпадения — только API endpoint `/checklist-today` в `fetch()`, не заголовок). Удалён в рамках B5 (подтверждено тестом `does not show removed checklist section (1.1a)`). ✅

### 3.5 Маршрут `stages/[stageId]` создан и использует `patientTreatmentProgramStage`

- RSC `[instanceId]/stages/[stageId]/page.tsx` создан в Stage C. ✅
- `paths.ts` содержит `patientTreatmentProgramStage: (instanceId, stageId) => ...`. ✅
- Все ссылки на страницу этапа в `PatientTreatmentProgramDetailClient.tsx` и `PatientTreatmentProgramsListClient.tsx` используют `routePaths.patientTreatmentProgramStage(...)`. ✅

---

## 4. Scope — выход за пределы инициативы

`git diff da3278a9..ea97f5c7 --name-only` (полный диапазон A→D):

**Код (изменённые файлы):**
```
apps/webapp/public/patient/ui/play.svg                               ← Stage C, новый ассет
apps/webapp/src/app-layer/routes/paths.ts                            ← Stage C, additive (1 хелпер)
apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx
apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx
apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramStagePageClient.tsx  ← Stage C, новый
apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.tsx       ← Stage D
apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/stages/[stageId]/page.tsx      ← Stage C, новый
apps/webapp/src/shared/ui/patientVisual.ts                           ← Stage C, additive (2 токена)
```

**Не затронуто ни одним коммитом:**

| Зона | Статус |
|------|--------|
| `apps/webapp/db/schema/` | ✅ 0 изменений |
| `apps/webapp/db/drizzle-migrations/` | ✅ 0 изменений |
| `apps/webapp/src/modules/` | ✅ 0 изменений |
| `apps/webapp/src/infra/repos/` | ✅ 0 изменений |
| `apps/webapp/src/infra/ports/` | ✅ 0 изменений |
| doctor/admin маршруты | ✅ 0 изменений |
| Сторонние patient-страницы (`/home`, `/diary`, `/messages`) | ✅ 0 изменений |

Scope выдержан строго. ✅

---

## 5. Документация и LOG синхронизированы

| Артефакт | Статус |
|----------|--------|
| `LOG.md` — gate-записи A/B/C/D | ✅ все присутствуют |
| `LOG.md` — implementation-записи A1-A5, B1-B8, C1-C10, D1-D6 | ✅ |
| `LOG.md` — FIX-записи по всем этапам | ✅ |
| `LOG.md` — «X closed» по всем этапам | ✅ A, B, C, D |
| `LOG.md` — «X closed + commit» | ✅ A (retro), B, C, D |
| `AUDIT_STAGE_A.md` | ✅ присутствует |
| `AUDIT_STAGE_B.md` | ✅ присутствует |
| `AUDIT_STAGE_C.md` | ✅ присутствует |
| `AUDIT_STAGE_D.md` | ✅ присутствует |
| `STAGE_A/B/C/D.md`, `STAGE_PLAN.md` | ✅ присутствуют |
| `ROADMAP_2.md` — §1.0/§1.1/§1.1a/§1.1b обновлены | ✅ синхронизированы |

---

## 6. Итоговая таблица находок

| ID | Уровень | Описание | Рекомендация |
|----|---------|----------|--------------|
| M1 | Minor (**закрыто**) | Изначально не было строки «Stage A closed + commit» в `LOG.md` при верификационном Stage A. | Выполнено в Global FIX: retro-запись в `LOG.md`. |
| M2 | Minor | `README.md` инициативы всё ещё со статусом «в работе / планирование», тогда как `LOG.md` фиксирует закрытие A–D, PREPUSH и PUSH. | Обновить шапку статуса в `README.md` под факт закрытия (без секретов). |
| M3 | Minor | `ROADMAP_2.md` §1.0 в блоке «Файлы» перечисляет `progress-service.ts`; фактическая реализация `started_at` — в репозитории (`pg` / `inMemory`), в `progress-service.ts` нет логики поля. | Уточнить в roadmap формулировку «ожидаемые места», чтобы не вводить агентов в заблуждение. |
| M4 | Minor / спека | Тексты и IA `STAGE_B.md` B1 (CTA «Открыть текущий этап», ссылка «Архив этапов») и B4 (архив в `<details>`) после Stage C заменены hero + «Открыть план» (якорь), секцией «Предыдущие этапы» и компактным списком (C6). Поведение соответствует §1.1b / `STAGE_C.md`, но не дословно раннему B. | Зафиксировать в доках как намеренную эволюцию B → C; при продуктовой необходимости выровнять копирайт под §1.1a. |
| M5 | Minor / покрытие | `pgTreatmentProgramInstance.startedAt.contract.test.ts` проверяет наличие подстрок в исходнике репозитория, а не прогон против БД. | Достаточно для верификационного A; при усилении — добавить интеграционный тест с реальной БД (отдельная задача). |
| M6 | Minor / зафиксировано | `STAGE_C.md` C6: дата в архиве при `completedAt`; в `TreatmentProgramInstanceStageRow` поля нет — даты в компактном списке не показываются (как в `LOG.md` Stage C). | Оставить до появления поля в модели; не считать дефектом текущей инициативы. |
| M7 | Minor (**defer**, из `AUDIT_STAGE_D.md`) | `PatientTreatmentProgramsListClient.tsx`: суффикс `Client` в имени файла при отсутствии `"use client"` (компонент фактически RSC, хуков нет). | Defer: переименование/директива — отдельный tech-debt; см. `AUDIT_STAGE_D.md` M1 и follow-up в backlog. |

**Вердикт: PASS** — инвариантов не нарушено, scope выдержан, MVP-условия выполнены.

---

## MANDATORY FIX INSTRUCTIONS

### Critical — нет.

### Major — нет.

### Minor M1 — LOG.md: «Stage A closed + commit» (**выполнено**)

**Статус:** выполнено в Global FIX (2026-05-05), см. `LOG.md`. Отдельный изолированный git-коммит для кода Stage A по-прежнему отсутствует (верификация, пустой diff) — это ожидаемо.

### Minor M2 — README.md: статус инициативы

**Файл:** `docs/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/README.md`  
**Действие:** заменить строку статуса «в работе / планирование» на отражение фактического закрытия (ссылка на `LOG.md` / дату закрытия).  
**Блокирует PREPUSH:** нет.

### Minor M3 — ROADMAP_2.md §1.0: список файлов vs реализация

**Файл:** `docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md` (§1.0, блок «Файлы»)  
**Действие:** уточнить, что установка `started_at` при переходе в `in_progress` реализована в слое репозитория, а не обязательно в `progress-service.ts`.  
**Блокирует PREPUSH:** нет.

### Minor M4 — STAGE_B vs финальный UI (документирование)

**Файлы:** при желании `STAGE_B.md` примечание «после C тексты/архив отличаются» или запись в `LOG.md`.  
**Действие:** явно пометить, что B1/B4 дословно заменены дизайном Stage C; дефекта кода нет.  
**Блокирует PREPUSH:** нет.

### Minor M5 — contract test `startedAt` (усиление покрытия, опционально)

**Файл:** `apps/webapp/src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts`  
**Действие:** при будущем рефакторинге репо — не полагаться только на grep по исходнику; рассмотреть интеграционный тест.  
**Блокирует PREPUSH:** нет.

### Minor M6 — `completedAt` в архивном списке (ожидание модели)

**Действие:** нет до появления поля в `TreatmentProgramInstanceStageRow` / схеме.  
**Блокирует PREPUSH:** нет.

### Minor M7 — `PatientTreatmentProgramsListClient` vs `"use client"` (**defer**)

**Источник:** `AUDIT_STAGE_D.md` §6 Minor M1.  
**Суть:** имя файла с суффиксом `Client` без директивы `"use client"`; компонент корректен как RSC.  
**Действие:** не менять в рамках инициативы; при желании — отдельный тикет на переименование + правки импортов (см. `AUDIT_STAGE_D.md` MANDATORY FIX).  
**Блокирует PREPUSH:** нет.

---

## 7. Дополнение — независимый повторный аудит (код + тесты)

Проверка после первоначального GLOBAL: прогон `vitest` по `src/app/app/patient/treatment-programs`, `pgTreatmentProgramInstance.startedAt.contract.test.ts`, `stage-semantics.test.ts` — **30 passed** (локально на дереве на момент проверки).

**Дополнительно к таблице §6 (уже учтено в M2–M6):**

- **§1.1 empty state и `/messages`:** в коде используется `messagesHref={routePaths.patientMessages}` из `page.tsx` — каноничный путь приложения; расхождения с литералом `/messages` в тексте roadmap нет по смыслу.
- **Отсутствие `%` в UI:** узкий grep по `*.tsx` в `treatment-programs` — без символа `%` в разметке (согласуется с §3.2 выше и D4).

Иных находок **critical/major** повторный аудит не выявил.
