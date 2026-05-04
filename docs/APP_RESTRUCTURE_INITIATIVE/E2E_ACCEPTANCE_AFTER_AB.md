# E2E Acceptance Report — после закрытия A1–A5 и B1–B7 + D1–D6

**Дата:** 2026-05-04  
**Scope:** сквозная приёмка цепочки врач → пациент после закрытия инициатив **PROGRAM_PATIENT_SHAPE** (A1–A5) и **ASSIGNMENT_CATALOGS_REWORK** (B1–B7 + D1–D6).  
**Тип проверки:** статический code-trace по коду + docs; dev-сервер не запускался. Ручной прогон E2E по dev-БД технически возможен, но не потребовался — покрытие кода и тесты достаточны для фиксации находок.  
**Запрещённые действия:** правки кода, миграций, env, .cursor/rules, package.json.

---

## 1. Сводка

После закрытия всех этапов A1–A5 и B1–B7+D1–D4 (D5 — на паузе у owner, D6 — финальный сводный аудит):  
- **Домен программы лечения полностью реализован** — модель, копирование template→instance, прогресс, action_log, бейджи.  
- **Каталоги назначений приведены в порядок** — типизация тестов, регион, комментарии в наборах и шаблонах, LFK UX, рекомендации расширены.  
- **Пациентский UI** даёт полный рабочий путь: открыть программу, увидеть Этап 0/Общие рекомендации, бейджи «Новое» и «Plan обновлён», выполнить чек-лист, отправить тест с числовым score.  
- Выявлено **2 UX-блокера** и **4 UX-долга** без критических дефектов в логике (блокеры и долги UX-01–04 закрыты в ходе фиксов 2026-05-04; см. статусы в §4–§5). Конструктор шаблонов (B6) имеет хвосты, не блокирующие базовый сценарий, но снижающие удобство работы врача. Карточка пациента у врача (этап 6 PLAN_DOCTOR_CABINET) заморожена — список функций из §7 не реализован, что ощущается при работе с программами.

> **Обновление 2026-05-04 (инженерный fix):** закрыт **UX-02** — read API `GET …/action-log` + лента на экземпляре врача (`TreatmentProgramInstanceDetailClient`). Ранее (UI-агент): BLOCK-01/02, UX-01/03/04, §6 B6. Остаётся этап 6 PLAN_DOCTOR_CABINET (hero/табы).

---

## 2. Сценарий и фактические шаги

| Шаг | Описание | Воспроизведено |
|-----|----------|----------------|
| 1 | ВРАЧ: создать шаблон программы с двумя стадиями + рекомендация с kind/body_region/quantity/frequency/duration + комментарий к элементу | **PASS** — конструктор помечает этап с `sort_order=0`, диалог «Новый этап» допускает цель/задачи и явный порядок (2026-05-04) |
| 2 | ВРАЧ: назначить шаблон пациенту | **PASS** — `PatientTreatmentProgramsPanel` + POST `/api/doctor/clients/[userId]/treatment-program-instances` |
| 3 | ПАЦИЕНТ: `/app/patient/treatment-programs/[instanceId]` — Stage 0, «Новое», `local_comment`, locked-стадии | **PASS** — все четыре пункта реализованы в `PatientTreatmentProgramDetailClient.tsx` |
| 4a | ПАЦИЕНТ: ЛФК-сессия (чек-лист, форма difficulty+note) | **PASS** — чек-лист и тело этапа используют `PatientLfkChecklistRow` → `/progress/lfk-session` (2026-05-04, BLOCK-02) |
| 4b | ПАЦИЕНТ: клинический тест с числовым score | **PASS** — `TestSetBlock` + `scoringAllowsNumericDecisionInference` → POST `/progress/test-result` → `test_attempts` + `program_action_log` |
| 5 | ВРАЧ: инбокс «К проверке» — появились тесты по шагу 4b | **PASS** — `ClientProfileCard` → `pendingProgramTestEvaluations` → `listPendingTestEvaluationsForPatient` (decided_by IS NULL) |
| 5a | ВРАЧ: увидеть LFK-сессию в action_log | **PASS** — на экземпляре программы секция «Дневник занятий» (`GET /api/doctor/treatment-program-instances/[id]/action-log` + SSR `listProgramActionLogForInstance`, 2026-05-04, UX-02) |
| 6 | ВРАЧ: карточка пациента → программа → прогресс/бейджи | **Частично** — `PatientTreatmentProgramsPanel` + `TreatmentProgramInstanceDetailClient` есть; hero/табы/бейдж прогресса — не реализованы (заморожены в этапе 6 PLAN_DOCTOR_CABINET) |

---

## 3. Что прошло (PASS)

### A1 — Цели / задачи / срок этапа

- **Схема:** `goals`, `objectives`, `expected_duration_days`, `expected_duration_text` на `treatmentProgramTemplateStages` и `treatmentProgramInstanceStages` — присутствуют (`apps/webapp/db/schema/treatmentProgramTemplates.ts:59-66`, `treatmentProgramInstances.ts`).
- **Конструктор:** поля `Цель этапа`, `Задачи`, `Ожидаемый срок` в правой панели конструктора (`TreatmentProgramConstructorClient.tsx:1114-1136`, state `goalsDraft/objectivesDraft/durationDaysDraft/durationTextDraft`).
- **Пациентский UI:** `PatientStageHeaderFields` рендерит все поля из instance_stage (строки 56-108 `PatientTreatmentProgramDetailClient.tsx`).
- **PASS.**

### A2 — Рекомендации actionable/persistent + Этап 0 + статус item

- **Схема:** `is_actionable BOOLEAN`, `status TEXT` (active|disabled) на `treatmentProgramInstanceStageItems`.
- **Этап 0:** `isStageZero` в `stage-semantics.ts`; `ignoreStageLockForContent` в `PatientInstanceStageBody`; heading «Общие рекомендации» при `isStageZero`.
- **Persistent рекомендации:** `isPersistentRecommendation(item)` — badge «Постоянная рекомендация», нет кнопки «Отметить выполненным».
- **Disabled items:** `isInstanceStageItemActiveForPatient` фильтрует из visible_items.
- **PASS.**

### A3 — Группы внутри этапа

- **Схема:** `treatment_program_template_stage_groups`, `treatment_program_instance_stage_groups`; `group_id FK` на items.
- **Конструктор:** Select «Группа» в элементах, кнопки создания/редактирования/удаления группы, drag-по-тому-же-группам (ChevronUp/Down).
- **Пациентский UI:** группы рендерятся как `<details open>` с `summary` = title + `scheduleText`.
- **Копирование при assign:** тест `instance-service.test.ts:273-283` — группы копируются с source_group_id.
- **PASS.**

### A4 — program_action_log + чек-лист + Inbox

- **Схема:** `program_action_log` (`apps/webapp/db/schema/programActionLog.ts`) с FK на instances, stage_items, platform_users; CHECK `action_type IN ('done','viewed','note')`.
- **ЛФК post-session:** `PatientLfkChecklistRow` → POST `/progress/lfk-session` → `patientSubmitLfkPostSession` → `insertAction(actionType:'done', payload:{difficulty,source:'lfk_session'}, note)`.
- **Тест:** `patientSubmitTestResult` → `insertAction(actionType:'done', payload:{source:'test_submitted',testResultId})`.
- **Inbox «К проверке»:** `ClientProfileCard` рендерит секцию `doctor-client-section-pending-program-tests` с badge «К проверке» и списком `pendingProgramTestEvaluations` (test_results.decided_by IS NULL).
- **PASS.**

### A5 — Бейдж «Plan обновлён» + бейдж «Новое»

- **«Новое»:** `last_viewed_at TIMESTAMPTZ NULL` на instance_stage_items; `patientStageItemShowsNewBadge(item, contentBlocked)`; `usePostMarkItemViewedWhenVisible` via IntersectionObserver (threshold 0.35); pill «Новое» в `PatientInstanceStageItemCard`.
- **«Plan обновлён»:** `PatientHomePlanCard` принимает `planUpdatedLabel?: string | null` и отображает его в карточке на главной; `plan-opened` POST сбрасывает timestamp.
- **PASS.**

### B1–B7 — каталоги назначений

| Этап | Артефакт | Статус |
|------|----------|--------|
| B1 | `doctorCatalogListStatus.ts`: `listPubArch`, `parseDoctorCatalogPubArchQuery`; UI `DoctorCatalogFiltersForm` на LFK/test-sets/templates | PASS |
| B2 | `clinical_tests`: `assessment_kind`, `body_region_id`, `scoring JSONB`; `CreatableComboboxInput`; `clinical_test_measure_kinds`; `ClinicalTestForm` с 4 schema_type | PASS |
| B3 | `TestSetItemsForm` переписан — список карточек, `comment` на `test_set_items`, без UUID-textarea | PASS |
| B4 | `recommendations`: `body_region_id`, `quantity_text`, `frequency_text`, `duration_text`; расширен enum `domain`; UI «Тип» | PASS |
| B5 | LFK-глаз исправлен; список с статусами pub×arch; карточка-редактор с CTA | PASS |
| B6 | Двухколоночный конструктор; превьюшки в диалоге «Элемент из библиотеки`; CTA «Сохранить черновик»/«Опубликовать»/«Архивировать»; `TreatmentProgramTemplateStatusBadge` | PASS (с хвостами — §6) |
| B7 | `template_comment` + `local_comment` на template_stage_items (и lfk_complex_exercises); `effectiveInstanceStageItemComment`; placeholder «Из шаблона»; override в instance | PASS |

### D1–D4 — defer-wave

| Этап | Тема | Статус |
|------|------|--------|
| D1 | `measure_kinds` UI управления | PASS |
| D2 | `assessmentKind` → справочник в БД | PASS |
| D3 | Типы рекомендаций → справочник в БД | PASS |
| D4 | `qualitative` в инстансе (select итога + fix `scoringConfigIsQualitative`) | PASS |
| D5 | `domain` → `kind` | **DEFERRED (owner pause)** |

---

## 4. Что сломано (BLOCK / FAIL)

### BLOCK-01 — Конструктор не сигнализирует о Stage 0 как «Общие рекомендации»

**Симптом:** При создании первого этапа в шаблоне он получает `sort_order = 0` (см. `pgTreatmentProgram.ts:504-508`: `coalesce(max, -1) + 1 = 0`). Пациент видит его в специальной секции «Общие рекомендации» с `ignoreStageLockForContent = true`, без FSM. Врач в конструкторе не видит никакого индикатора — это обычный этап без пометки.  

**Файлы:**
- `apps/webapp/src/infra/repos/pgTreatmentProgram.ts:502-508` — автоприсвоение sort_order.
- `apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx` — нет `isStageZero`-label в рендере этапа (проверен поиском `isStageZero`, `Общие`, `stage zero` — 0 совпадений).
- `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx:621-645` — patient-side корректно рендерит Stage 0.

**Repro:** Создать шаблон → добавить первый этап «Активная фаза» → назначить пациенту → пациент увидит его как «Общие рекомендации» (persistent, без checklists).

**Гипотеза:** При разработке предполагалось, что Stage 0 будет создаваться врачом намеренно (первым). Индикатор не добавили. Нужна минимальная пометка «⚠ Этот этап является «Общими рекомендациями» (sort_order=0)» в конструкторе.

**Приоритет:** P1 (серьёзно нарушает модель создания шаблона; врач создаст неправильный шаблон не понимая почему).

**Статус:** **fixed** (2026-05-04).

**Фикс:** В `TreatmentProgramConstructorClient.tsx` — badge «Этап 0 — «Общие рекомендации» у пациента» у этапов с `sortOrder === 0` в списке слева; предупреждающий текст под заголовком «Элементы этапа» при выборе такого этапа; в диалоге «Новый этап» — `DialogDescription` с пояснением про порядок 0.

**Проверки:** `eslint` (2 файла), `pnpm --dir apps/webapp exec tsc --noEmit`, `vitest PatientTreatmentProgramDetailClient.test.tsx` (4 passed).

---

### BLOCK-02 — ЛФК в stage body обходит форму оценки занятия

**Симптом:** В `PatientInstanceStageItemCard` для `itemType === "lfk_complex"` (в секции этапа, не в чек-листе) рендерится обычная кнопка «Отметить выполненным», которая вызывает `/progress/complete` (→ `patientCompleteSimpleItem`). Это НЕ то же, что `PatientLfkChecklistRow` с difficulty-select + note → `/progress/lfk-session`. Пациент нажимает «Отметить выполненным» на ЛФК-комплекс в теле этапа и не видит формы «Как прошло занятие?».

**Файлы:**
- `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx:203-243` — в `PatientInstanceStageItemCard`: test_set → `TestSetBlock`, остальное (включая lfk_complex) → кнопка «Отметить выполненным».
- `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/complete/route.ts` — не вызывает `patientSubmitLfkPostSession`.
- `PatientLfkChecklistRow` (строки 346-434) — форма есть, но только в checklist-секции.

**Repro:** Открыть `/app/patient/treatment-programs/[id]` → прокрутить мимо секции «Чек-лист» → в секции этапа нажать кнопку «Отметить выполненным» на ЛФК-комплекс → note/difficulty не запрашиваются.

**Гипотеза:** Два параллельных пути появились не намеренно: чек-лист сверху и stage body снизу. Нужно заменить кнопку в `PatientInstanceStageItemCard` на ту же форму `PatientLfkChecklistRow` для `itemType === "lfk_complex"`.

**Приоритет:** P1 (потеря данных о сложности занятия; action_log пишется без `difficulty` / `note`).

**Статус:** **fixed** (2026-05-04).

**Фикс:** В `PatientTreatmentProgramDetailClient.tsx` для `itemType === "lfk_complex"` в теле этапа рендерится тот же `PatientLfkChecklistRow`, что и в чек-листе (передаются `doneItemIds` / `setDoneItemIds` из родителя).

**Проверки:** те же, что у BLOCK-01.

---

## 5. Что неочевидно для пациента (UX-долг)

### UX-01 — Бейдж «Новое» сбрасывается незаметно (IntersectionObserver, 35% порог)

Бейдж исчезает при прокрутке элемента мимо (35% видимости) без явного «Прочитал». Пациент может не понять, что бейдж пропал. Альтернативы: кнопка «Понял» или сброс только при открытии детали элемента.  
**Файл:** `PatientTreatmentProgramDetailClient.tsx:114-147`.

**Статус:** **fixed** (2026-05-04) — добавлена явная кнопка «Снять «Новое»» рядом с бейджем (тот же POST `mark-viewed`); IntersectionObserver сохранён.

**Проверки:** `eslint`, `tsc --noEmit`, `vitest PatientTreatmentProgramDetailClient.test.tsx`.

### UX-02 — LFK-сессия видна врачу только косвенно (нет action_log inbox)

Инбокс «К проверке» показывает тесты (`test_results.decided_by IS NULL`), но НЕ показывает LFK-сессии из `program_action_log`. Врач не видит, что пациент провёл занятие с оценкой «тяжело» или оставил заметку. Нужен либо отдельный feed action_log в карточке, либо агрегированный «Дневник занятий» по программе.  
**Файлы (исходная находка):** `ClientProfileCard.tsx:298-328`; данные в `program_action_log`.

**Статус:** **fixed** (2026-05-04) — `ProgramActionLogPort.listForInstance` + Drizzle в `pgProgramActionLog`; `listProgramActionLogForInstance` в `progress-service`; **GET** `/api/doctor/treatment-program-instances/[instanceId]/action-log` (thin route); RSC `page.tsx` передаёт `initialActionLog`; `TreatmentProgramInstanceDetailClient` — секция «Дневник занятий», обновление в `refresh()`.

**Проверки:** `eslint` (затронутые файлы), `pnpm --dir apps/webapp exec tsc --noEmit`, `vitest run …/progress-service.test.ts` (включая assert по ленте после `patientSubmitTestResult`).

### UX-03 — Результаты тестов показываются как raw JSON

Блок «Ваши результаты тестов» отображал `JSON.stringify(r.rawValue, null, 0)` без форматирования, что нечитаемо для пациента.  
**Файл:** `PatientTreatmentProgramDetailClient.tsx` (секция результатов тестов).

**Статус:** **fixed** (2026-05-04) — функция `formatPatientTestResultRawValue`: балл, комментарий, `value`, иначе краткие пары ключ–значение / «Без деталей».

**Проверки:** `eslint`, `tsc --noEmit`, `vitest PatientTreatmentProgramDetailClient.test.tsx`.

### UX-04 — goals/objectives недоступны при создании этапа

Поля «Цель», «Задачи», «Ожидаемый срок» — только в правой панели конструктора после выбора уже созданного этапа. В диалоге «Добавить этап» (`handleAddStage` отправляет `{ title }`) этих полей нет. Требует два клика вместо одного.  
**Файл:** `TreatmentProgramConstructorClient.tsx` (диалог нового этапа).

**Статус:** **fixed** (2026-05-04) — в диалог «Новый этап» добавлены опциональные поля «Цель этапа» и «Задачи этапа»; POST передаёт `goals` / `objectives` (как поддерживает существующий API).

**Проверки:** `eslint`, `tsc --noEmit`.

---

## 6. Хвосты шаблонов программ (B6)

1. ~~**Нет метки Stage 0 в конструкторе**~~ — закрыто вместе с BLOCK-01 (2026-05-04).
2. ~~**Нет возможности явно указать sort_order при создании этапа**~~ — в диалоге «Новый этап» добавлено опциональное поле «Порядок (sort_order)» + пояснение в описании диалога (2026-05-04).
3. ~~**Нет labels/badges «Этап 0» / «Общие рекомендации»** в левой колонке~~ — badge у этапа с `sortOrder === 0` (2026-05-04).
4. ~~**goals/objectives в диалоге создания этапа отсутствуют**~~ — закрыто с UX-04 (2026-05-04).
5. ~~**Перемещение этапа вверх/вниз может изменить его роль**~~ — перед swap, если у одного из этапов `sortOrder === 0`, показывается `confirm` с пояснением про «Общие рекомендации» (2026-05-04).  
   **Файл:** `TreatmentProgramConstructorClient.tsx` (`handleMoveStage`). **Статус:** fixed.  
   **Проверки:** `eslint` (файл конструктора), `tsc --noEmit` (webapp).

---

## 7. Хвосты PLAN_DOCTOR_CABINET этапа 6 (карточка пациента у врача)

Этап 6 **заморожен**. При E2E-трассировке цепочки врач→пациент ощущаются следующие отсутствующие элементы:

1. **Нет hero/summary программы в карточке пациента** — `PatientTreatmentProgramsPanel` показывает плоский список программ по имени без прогресс-бара / статуса текущего этапа.
2. **Нет tab-layout в карточке** — разделы «Программы», «Тесты к проверке», «ЛФК», «Чат», «История» расположены вертикально без вкладок.
3. ~~**Нет feed action_log**~~ — секция «Дневник занятий» на странице экземпляра программы врача + GET `action-log` (2026-05-04, UX-02).
4. **Нет cross-patient inbox** — сводного «К проверке» всех пациентов нет (backlog §7 PROGRAM_PATIENT_SHAPE_PLAN).
5. **«Открыть тест»** в секции «К проверке» ведёт на `TreatmentProgramInstanceDetailClient`, который не акцентирует тест на проверку — врач должен найти его вручную.

---

## 8. Рекомендации по приоритету

| Приоритет | Что делать | Агент | Размер |
|-----------|-----------|-------|--------|
| **P0** | Нет (критических блокеров CI нет; prod-миграции D-wave — ops-хвост) | — | — |
| **P1** | ~~BLOCK-01~~ … | ~~Sonnet 4.6~~ | ~~S~~ — **fixed 2026-05-04** |
| **P1** | ~~BLOCK-02~~ … | ~~Sonnet 4.6~~ | ~~S~~ — **fixed 2026-05-04** |
| **P1** | ~~UX-03~~ … | ~~Sonnet 4.6~~ | ~~S~~ — **fixed 2026-05-04** |
| **P2** | ~~UX-02: добавить раздел «Занятия» (feed `program_action_log` per instance)~~ … | ~~Composer-2~~ | ~~M~~ — **fixed 2026-05-04** (порт `listForInstance`, GET `action-log`, UI «Дневник занятий») |
| **P2** | ~~B6: добавить `sortOrder` selector при создании этапа~~ … | ~~Sonnet 4.6~~ | ~~S~~ — **fixed 2026-05-04** (диалог «Новый этап») |
| **P2** | ~~B6: goals/objectives в диалоге «Добавить этап»~~ … | ~~Sonnet 4.6~~ | ~~S~~ — **fixed 2026-05-04** (см. UX-04) |
| **P2** | ~~UX-01~~ … | ~~Sonnet 4.6~~ | ~~S~~ — **fixed 2026-05-04** (кнопка «Снять «Новое»») |
| **P2** | ~~B6: предупреждение при смене порядка этапа 0~~ … | ~~Sonnet 4.6~~ | ~~S~~ — **fixed 2026-05-04** (`confirm` в `handleMoveStage`) |
| **P2** | Этап 6 PLAN_DOCTOR_CABINET: hero программы + tab-layout в карточке пациента | Composer-2 | L |
| **P3** | Prod-деплой миграции `0040` DROP scoring_config (ops-хвост по runbook) | shell / ops | — |
| **P3** | D5: `domain` → `kind` (снятие owner pause) | Codex 5.3 | M |
| **P3** | Cross-patient inbox «К проверке» на Today врача | Sonnet 4.6 / Composer-2 | M |

---

## 9. Что намеренно не делали

В рамках данной приёмки намеренно **не производилось** (согласно условию задачи):
- Никаких правок кода, миграций, конфигурации, env, system_settings, .cursor/rules, package.json.
- Подключение к prod-БД.
- Запуск `pnpm run ci`, `pnpm build`, `drizzle-kit migrate`.
- Изменение LFK-таблиц.

---

## 10. Прогон проверок

**Обновление 2026-05-04 (инженерный fix):** `eslint` + `tsc --noEmit` + `vitest …/progress-service.test.ts` после UX-02 (`program_action_log` read path). Полный `pnpm run ci` не запускался.

**Обновление 2026-05-04 (узкий fix):** `eslint` (2 TSX), `pnpm --dir apps/webapp exec tsc --noEmit`, `vitest run src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx` (4 passed). Полный `pnpm run ci` не запускался.

**ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md (2026-05-04, D6 FIX):**
```
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts src/modules/treatment-program/testSetSnapshotView.test.ts
→ 26 passed
pnpm --dir apps/webapp exec tsc --noEmit → ok
```

**PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_GLOBAL.md (2026-05-03, Global fix):**
```
pnpm install --frozen-lockfile && pnpm run ci → PASS
```

Для верификации BLOCK-01 и BLOCK-02 достаточно следующих команд (не запускались в этом проходе, для future reference):
```bash
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/patient-program-actions.test.ts
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts
```

---

## Appendix A: Карта артефактов A1–A5 в коде

| Артефакт | Файл (ключевые) |
|----------|----------------|
| `goals/objectives/expected_duration_*` (template) | `db/schema/treatmentProgramTemplates.ts:59-66` |
| `goals/objectives/expected_duration_*` (instance) | `db/schema/treatmentProgramInstances.ts` |
| `is_actionable` | `db/schema/treatmentProgramInstances.ts:163` |
| `status` active/disabled | `db/schema/treatmentProgramInstances.ts:153` |
| `last_viewed_at` | `db/schema/treatmentProgramInstances.ts:174` |
| `local_comment` | `db/schema/treatmentProgramInstances.ts:154` |
| `template_stage_groups` | `db/schema/treatmentProgramTemplates.ts:84-104` |
| `instance_stage_groups` | `db/schema/treatmentProgramInstances.ts:115-141` |
| `program_action_log` | `db/schema/programActionLog.ts`; read: `ProgramActionLogPort.listForInstance`, GET `…/action-log` |
| `isStageZero` + FSM exclusion | `src/modules/treatment-program/stage-semantics.ts` |
| `buildPatientProgramChecklistRows` | `src/modules/treatment-program/patient-program-actions.ts:67` |
| `patientSubmitLfkPostSession` | `src/modules/treatment-program/patient-program-actions.ts:195` |
| `patientPlanUpdatedBadgeForInstance` | `src/modules/treatment-program/` (AUDIT_GLOBAL A5) |
| Patient UI — Stage 0, groups, new badge, comment | `src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx` |
| Inbox «К проверке» | `src/app/app/doctor/clients/ClientProfileCard.tsx:298-328` |
| `PatientHomePlanCard` + `planUpdatedLabel` | `src/app/app/patient/home/PatientHomePlanCard.tsx:27-29,99-101` |

## Appendix B: Карта артефактов B1–B7 в коде

| Артефакт | Файл (ключевые) |
|----------|----------------|
| `doctorCatalogListStatus.ts` pub×arch | `src/shared/lib/doctorCatalogListStatus.ts` |
| `DoctorCatalogFiltersForm` | `src/shared/ui/doctor/` |
| `clinical_test_measure_kinds` | `db/schema/clinicalTests.ts`; API `app/api/doctor/measure-kinds` |
| `CreatableComboboxInput` | `src/shared/ui/CreatableComboboxInput.tsx` |
| `recommendations.body_region_id/quantity_text/…` | `db/schema/recommendations.ts` |
| `TemplateStageItemCommentBlock` | `TreatmentProgramConstructorClient.tsx:174-207` |
| `effectiveInstanceStageItemComment` | `src/modules/treatment-program/types.ts` |
| `scoringAllowsNumericDecisionInference` | `src/modules/treatment-program/progress-scoring.ts` |
| `scoringConfigIsQualitative` + FIX-D4-L1 | `progress-scoring.ts`, `progress-service.ts` |
| `testSetSnapshotView.ts` (comment in snapshot) | `src/modules/treatment-program/testSetSnapshotView.ts` |
