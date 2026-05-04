# AUDIT — Stage A1 (PROGRAM_PATIENT_SHAPE)

**Дата:** 2026-05-03  
**Scope:** Stage A1 — цели / задачи / срок этапа (`goals`, `objectives`, `expected_duration_days`, `expected_duration_text`) на `template_stage` и `instance_stage`, цепочка до API и UI.  
**Источники:** [`STAGE_A1_PLAN.md`](STAGE_A1_PLAN.md), [`MASTER_PLAN.md`](MASTER_PLAN.md), [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md).

---

## 1. Verdict

- **Status:** **PASS**
- **Summary:** Миграция только additive nullable колонки; поля присутствуют в Drizzle на обеих таблицах этапов; копирование template→instance проходит через `assignTemplateToPatient` → `createInstanceTree` с явной передачей четырёх полей; врач редактирует через PATCH шаблона и PATCH этапа инстанса; пациентский UI скрывает пустые блоки и подзаголовки. Изменения runtime-кода сосредоточены в treatment-program контуре webapp; затронута продуктовая документация инициативы (ожидаемо).

---

## 2. Проверки по запросу аудита

### 2.1 Миграции additive и backward-compatible

| Критерий | Статус | Доказательство |
|---|---|---|
| Только `ADD COLUMN`, без `NOT NULL` без DEFAULT | **PASS** | `apps/webapp/db/drizzle-migrations/0025_treatment_program_stage_goals_objectives_duration.sql` — восемь `ALTER TABLE ... ADD COLUMN`; типы `text` / `integer` без `NOT NULL` → существующие строки получают `NULL`. |
| Нет удаления/переименования таблиц и критичных CHECK | **PASS** | В файле миграции только добавление колонок. |
| Откат по коду | Совместимо со `STAGE_A1_PLAN.md` §8 | Старый код после деплоя БД с новыми колонками продолжит работать; обратный порядок (откат кода при живых колонках) — колонки остаются неиспользуемыми до отдельного DROP. |

### 2.2 Поля на template и instance stage

| Критерий | Статус | Доказательство |
|---|---|---|
| Template stage | **PASS** | `apps/webapp/db/schema/treatmentProgramTemplates.ts` — `treatmentProgramTemplateStages`: `goals`, `objectives`, `expectedDurationDays`, `expectedDurationText`. |
| Instance stage | **PASS** | `apps/webapp/db/schema/treatmentProgramInstances.ts` — `treatmentProgramInstanceStages`: те же четыре поля. |
| Типы модуля | **PASS** | `apps/webapp/src/modules/treatment-program/types.ts` — `TreatmentProgramStage`, `TreatmentProgramInstanceStageRow`, входы create/update/copy. |

### 2.3 Template → instance copy

| Критерий | Статус | Доказательство |
|---|---|---|
| Сервис копирует значения с этапа шаблона | **PASS** | `instance-service.ts`: в `stageInputs.push` передаются `goals`, `objectives`, `expectedDurationDays`, `expectedDurationText` из `st` (строки 93–96). |
| Репозиторий сохраняет в БД-дерево | **PASS** | `pgTreatmentProgramInstance.ts` `createInstanceTree`: `.values({ ... goals: st.goals, objectives: st.objectives, ... })` (строки 146–149). |
| In-memory порт согласован | **PASS** | `inMemoryTreatmentProgramInstance.ts` — те же поля при создании stage из `input.stages`. |
| Регрессионный тест | **PASS** | `instance-service.test.ts` — кейс «deep copy: goals, objectives, expected duration…» проверяет непустые и `null` на втором этапе. |

### 2.4 UI врача / пациента

| Критерий | Статус | Доказательство |
|---|---|---|
| Врач: шаблон, редактирование + сохранение | **PASS** | `TreatmentProgramConstructorClient.tsx` — черновики, `PATCH` на `/api/doctor/treatment-program-templates/stages/:id`, поля по `STAGE_A1_PLAN.md` §5 (Label, Textarea, Input, Button, обёртка border/muted). |
| Врач: инстанс | **PASS** | `TreatmentProgramInstanceDetailClient.tsx` — `InstanceStageMetadataForm`, `PATCH` на `.../treatment-program-instances/.../stages/:stageId` только с метаданными. |
| Пациент: только непустые | **PASS** | `PatientTreatmentProgramDetailClient.tsx` — `patientStageHasHeaderFields` возвращает `false` если все поля пусты/пробелы; заголовки «Цель» / «Задачи» / «Ожидаемый срок» только при наличии содержимого; `PatientStageHeaderFields` при полном отсутствии данных — `null`. |
| Тест пациентского UI | **PASS** | `PatientTreatmentProgramDetailClient.test.tsx` — наличие текста при заполненных полях и отсутствие заголовков при всех `null`. |

### 2.5 Контур treatment-program (не выход за scope)

| Критерий | Статус | Доказательство |
|---|---|---|
| Код `.ts`/`.tsx`/`.sql` с символами полей A1 | **PASS (выборочно)** | Поиск по репозиторию: вхождения `goals` / `objectives` / `expectedDurationDays` / `expected_duration` ограничены `apps/webapp` (модули `treatment-program`, repos `*TreatmentProgram*`, API `doctor/treatment-program-*`, UI `doctor/.../treatment-program-*`, `patient/treatment-programs/*`), схемой Drizzle и миграцией `0025_*.sql`. Код курсов под эти символы не затронут. |
| Документация | Ожидаемо | Изменения в `docs/archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/*` и строка §3.3 в `PROGRAM_PATIENT_SHAPE_PLAN.md` — в рамках инициативы. |

---

## 3. Architecture / rules (A1-релевантно)

- [x] `modules/treatment-program/*` не импортирует новых `@/infra/repos/*` / `@/infra/db/*` для этой фичи.
- [x] Route handlers: Zod + `buildAppDeps()` + вызов сервиса/прогресса; бизнес-нормализация длин/дней в `service` / `instance-service`.
- [x] Новые колонки — через Drizzle schema + сгенерированная миграция.
- [x] Порт `updateInstanceStageMetadata` объявлен в `modules/treatment-program/ports.ts`, реализация в `infra/repos/pgTreatmentProgramInstance.ts` и in-memory.

---

## 4. Регрессии / замечания (не блокируют PASS)

| ID | Серьёзность | Статус после FIX (2026-05-03) |
|---|---|---|
| A1-DOC-01 | Low | **Закрыто.** В `apps/webapp/src/app/api/api.md` задокументированы: A1-поля на `POST/PATCH` шаблонных этапов; `PATCH .../treatment-program-instances/.../stages/[stageId]` — опциональные `status` и/или мета (`goals`, `objectives`, `expectedDurationDays`, `expectedDurationText`), правило «нужен хотя бы один блок», `skipped` + `reason`, разделение вызовов сервиса; `GET` инстанса — A1-поля в объектах `stages`; `POST` создания инстанса — явное упоминание deep copy A1 с шаблона. |
| A1-DOC-02 | Low | **Закрыто.** В `STAGE_A1_PLAN.md` §6 все атомарные пункты отмечены `[x]` в соответствии с фактом реализации A1. |

**Post-FIX:** критических и major-замечаний по аудиту не было; minor (документация) устранены правками `api.md` + `STAGE_A1_PLAN.md` §6; повторные целевые проверки A1 — см. §5 и запись в [`LOG.md`](LOG.md).

---

## 5. Рекомендованные проверки (повторный прогон)

Из [`LOG.md`](LOG.md) записи A1:

```bash
rg "goals|objectives|expected_duration" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec eslint <затронутые-файлы>
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/instance-service.test.ts src/modules/treatment-program/progress-service.test.ts src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx
pnpm --dir apps/webapp exec tsc --noEmit
```

---

## 6. MANDATORY FIX INSTRUCTIONS

Ниже — обязательные правила для любого **FIX** по замечаниям A1 или регрессиям в этой области. Нарушение считается некорректным закрытием задачи.

### 6.1 Данные и миграции

1. **Не удалять и не переименовывать** колонки `goals`, `objectives`, `expected_duration_days`, `expected_duration_text` на `treatment_program_template_stages` / `treatment_program_instance_stages` без отдельного продуктового решения и миграции с обратной совместимостью.
2. Любые новые поля этапа — только через **Drizzle schema** + `drizzle-kit generate`; запрет на «ручной» raw SQL для новых фич в обход правил репозитория.
3. **`objectives` (O1):** только **TEXT** (markdown по смыслу). **Запрещено** вводить JSONB-чеклист вместо или «рядом» с `objectives` в рамках этой инициативы без явного снятия O1 в `MASTER_PLAN.md` / продуктовом ТЗ.

### 6.2 Копирование template → instance

4. При любом изменении пути назначения программы пациенту **обязательно** сохранять копирование четырёх полей этапа: `assignTemplateToPatient` (или преемник) → `CreateTreatmentProgramInstanceTreeInput.stages[]` → `createInstanceTree` (pg + in-memory). После правок — **расширить или добавить** тест в `instance-service.test.ts` на непустые и `NULL` значения.

### 6.3 API и контракты

5. Doctor **PATCH** `.../treatment-program-instances/.../stages/[stageId]` должен оставаться **совместимым**: допустимы (а) только статус, (б) только метаданные этапа, (в) оба; при `status === "skipped"` причина **обязательна** (Zod + сервис). Любое изменение тела запроса — обновить **`apps/webapp/src/app/api/api.md`** в той же правке.
6. Doctor **PATCH** шаблонных этапов — не ослаблять валидацию длин без согласования (DoS на большие тексты).

### 6.4 UI

7. **Врач:** только разрешённые примитивы из `STAGE_A1_PLAN.md` §5 / `MASTER_PLAN.md` §6.1 (`Button`, `Input`, `Label`, `Textarea`, …); блок метаданных этапа — **не внутри** списка элементов этапа (шаблон), для инстанса — отдельный блок рядом с управлением этапом.
8. **Пациент:** только классы из `@/shared/ui/patientVisual` для A1-блока; **запрещён** импорт из `app/app/patient/home/*`. Пустые строки после `trim` **не** показываются; при отсутствии любых данных — **не рендерить** обёртку шапки A1.

### 6.5 Контур репозитория

9. Исправления A1 выполнять **только** в зонах: `apps/webapp/src/modules/treatment-program/**`, `apps/webapp/src/infra/repos/*TreatmentProgram*`, `apps/webapp/db/schema/treatmentProgram*.ts`, `apps/webapp/db/drizzle-migrations/**`, `apps/webapp/src/app/api/doctor/treatment-program-*/**`, `apps/webapp/src/app/api/patient/treatment-program-*/**` (если когда-либо понадобится отдача), `apps/webapp/src/app/app/doctor/**/treatment-program*/**`, `apps/webapp/src/app/app/patient/treatment-programs/**`, соответствующие тесты. **Не** трогать courses и LFK schema tables из execution rules — см. `MASTER_PLAN.md` out-of-scope.

### 6.6 Закрытие FIX-задачи

10. После FIX: целевые **eslint + vitest + tsc** по затронутым путям; при изменении контракта API — **обновить `api.md`**; при смене поведения продукта — строка в [`LOG.md`](LOG.md) по [`LOG_TEMPLATE.md`](LOG_TEMPLATE.md).

---

## 7. Sign-off

Аудит выполнен по состоянию репозитория на дату в шапке документа. Критические нарушения по пяти пунктам запроса **не** выявлены.
