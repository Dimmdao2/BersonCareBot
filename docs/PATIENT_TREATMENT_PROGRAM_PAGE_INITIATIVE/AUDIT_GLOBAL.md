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
| A | ✅ verify (`startedAt` pre-existing) | ✅ `AUDIT_STAGE_A.md` — PASS, 0 findings | ✅ нет исправлений | ⚠️ см. M1 |
| B | ✅ verify (detail MVP pre-existing) | ✅ `AUDIT_STAGE_B.md` — PASS, 0 findings | ✅ нет исправлений | ✅ `25469bd7` |
| C | ✅ implement C1–C10 | ✅ `AUDIT_STAGE_C.md` — PASS, 4 minor → все закрыты | ✅ M1–M4 applied | ✅ `ac219941` |
| D | ✅ verify + D1 polish | ✅ `AUDIT_STAGE_D.md` — PASS, 1 minor → defer | ✅ M1 deferred | ✅ `ea97f5c7` |

### Детали по Stage A — COMMIT (M1)

`STAGE_PLAN.md` требует изолированный `COMMIT` после каждого этапа. Для Stage A нет отдельного коммита — документация Stage A (`AUDIT_STAGE_A.md`, все `STAGE_*.md`, `STAGE_PLAN.md`, `PROMPTS_COPYPASTE.md`, `README.md`) была закоммичена в рамках Stage B context-коммита `41c4c91a`. Запись «Stage A closed + commit» отсутствует в `LOG.md`.

**Риск:** нулевой (Stage A — верификационный, code diff пустой). Информационный разрыв в трейле — всё остальное корректно задокументировано.

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
| `LOG.md` — «X closed + commit» | ✅ B, C, D; ⚠️ A — отсутствует |
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
| M1 | Minor | Stage A не имеет изолированного commit; «Stage A closed + commit» отсутствует в `LOG.md`. Документация Stage A была объединена в коммит `41c4c91a` с Stage B context. Риск нулевой (code diff пустой в A). | Добавить retroactive-запись в `LOG.md` — 1 строка |

**Вердикт: PASS** — инвариантов не нарушено, scope выдержан, MVP-условия выполнены.

---

## MANDATORY FIX INSTRUCTIONS

### Critical — нет.

### Major — нет.

### Minor M1 — LOG.md: добавить «Stage A closed + commit» запись

**Файл:** `docs/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/LOG.md`  
**Действие:** Добавить одну строку после «Stage A A5» записи:

```
- **Stage A closed + commit.** (Stage A — верификационный, code diff пустой; документация закоммичена в `41c4c91a` совместно с инициализацией Stage B-docs.)
```

**Приоритет:** низкий — исключительно для трейловой полноты.  
**Блокирует PREPUSH:** нет.
