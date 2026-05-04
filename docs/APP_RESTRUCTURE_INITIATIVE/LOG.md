# Журнал исполнения APP_RESTRUCTURE (быстрые устойчивые правки)

Дата начала: 2026-05-01.

Формат записи: дата, ссылка на этап ([`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md) часть IV и/или [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md)), изменения, проверки, решения, что не делали вне scope.

---

## 2026-05-04 — docs sync: `ROADMAP_2`, `RECOMMENDATIONS`, `TARGET_STRUCTURE_PATIENT`, корневой `docs/README`, `STRUCTURE_AUDIT` шапка

**Сделано:** выровнены формулировки с фактом кода по **§1.2 дневник** (частичное закрытие: тех. хвост + empty state; UX «сегодня» — backlog). Источник правды по исполнению — предыдущие записи этого `LOG.md` за 2026-05-04.

**Проверки:** docs-only.

---

## 2026-05-04 — ROADMAP_2 §1.2 (не-UI): legacy URL дневника + запрет `createLfkComplex` у пациента

**Сделано:** в [`apps/webapp/next.config.ts`](../../apps/webapp/next.config.ts) добавлены permanent-редиректы `/app/patient/diary/symptoms` → `/app/patient/diary?tab=symptoms`, `/app/patient/diary/lfk` → `/app/patient/diary?tab=lfk`; удалены заглушки [`symptoms/page.tsx`](../../apps/webapp/src/app/app/patient/diary/symptoms/page.tsx), [`lfk/page.tsx`](../../apps/webapp/src/app/app/patient/diary/lfk/page.tsx). Server action [`createLfkComplex`](../../apps/webapp/src/app/app/patient/diary/lfk/actions.ts) — no-op после `requirePatientAccessWithPhone` (не вызывает `deps.diaries.createLfkComplex`). Тесты: [`e2e/diaries-inprocess.test.ts`](../../apps/webapp/e2e/diaries-inprocess.test.ts), [`lfk/actions.createLfkComplex.test.ts`](../../apps/webapp/src/app/app/patient/diary/lfk/actions.createLfkComplex.test.ts). Обновлены коллоквиальные [`lfk.md`](../../apps/webapp/src/app/app/patient/diary/lfk/lfk.md), [`symptoms.md`](../../apps/webapp/src/app/app/patient/diary/symptoms/symptoms.md).

**Связь с** [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md) **часть IV этап 0:** пункт про удаление legacy `diary/symptoms` | `diary/lfk` **частично закрыт** — файлы `page.tsx` удалены, поведение закладок сохранено через `redirects` в `next.config`.

**Проверки:** см. команды в PR / итоговый `pnpm run ci` перед merge.

**Follow-up (2026-05-04):** варианты legacy URL **со слэшем** на конце пути; empty state на [`diary/page.tsx`](../../apps/webapp/src/app/app/patient/diary/page.tsx) без формы создания комплекса, CTA «Программы лечения» / «Сообщения»; правки [`ROADMAP_2.md`](ROADMAP_2.md) §1.2, [`STRUCTURE_AUDIT.md`](STRUCTURE_AUDIT.md). Полный UX §1.2 (фокус «сегодня», read-only история как первичный сценарий) — отдельная итерация.

---

## 2026-05-04 — синхронизация статуса: «Назначения» врача, шаблоны программ, курсы (docs-only)

**Зафиксировано (owner):**

- **Редизайн блока «Назначения»** в кабинете врача (кластер меню, списки каталогов, общий UX) — **практически закрыт**; допускаются точечные хвосты по приёмке.
- **Шаблоны программ лечения** — остаются **небольшие правки**; **не блокер** для работ по [`ROADMAP_2.md`](ROADMAP_2.md) (patient polish §1.x, карточка врача §2.x).
- **Курсы** ([`../COURSES_INITIATIVE/README.md`](../COURSES_INITIATIVE/README.md)) — **отложены**; не в ближайшую очередь.

**Сделано:** обновлены [`ROADMAP_2.md`](ROADMAP_2.md) (шапка, §0, §2, §6.2, §8), [`README.md`](README.md) этой инициативы, [`ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](ASSIGNMENT_CATALOGS_REWORK_PLAN.md), [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md), [`../README.md`](../README.md), [`../COURSES_INITIATIVE/README.md`](../COURSES_INITIATIVE/README.md).

**Проверки:** docs-only; CI не запускался.

---

## 2026-05-04 — `PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE`: GLOBAL FIX (закрытие A/B/C в документах)

**Сделано:** по [`../PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_GLOBAL.md`](../PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_GLOBAL.md) закрыты **Major**: в [`ROADMAP_2.md`](ROADMAP_2.md) §0 добавлена строка о закрытии блока **1.0 + 1.1a + 1.1** (ссылка на `AUDIT_GLOBAL.md`); в §1.1 / §1.1a выровнены команды `eslint` на путь `src/app/app/patient/treatment-programs` при `pnpm --dir apps/webapp`. В мини-инициативе: [`STAGE_A/B/C.md`](../PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/STAGE_A.md) чекбоксы отмечены выполненными; [`README.md`](../PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/README.md) — статус закрытия; [`LOG.md`](../PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/LOG.md) — итог GLOBAL FIX.

**Minor — внешняя правка `TestSetForm.test.tsx` (уже в истории этапа B):** **DEFER на откат/перенос в отдельный PR не делаем** — правка остаётся как зафиксированная разблокировка `pnpm --dir apps/webapp exec tsc --noEmit` на пакете; **канон на будущее:** любые аналогичные правки вне дерева `STAGE_*` оформлять отдельным коммитом/PR и строкой здесь или в журнале мини-инициативы (обоснование: не смешивать с продуктовым diff инициативы).

**Проверки:** docs-only для правок в `docs/`; узкий прогон webapp по зоне `patient/treatment-programs` — см. [`../PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/LOG.md`](../PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/LOG.md) секция GLOBAL FIX.

---

## 2026-05-04 — мини-инициатива `PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE`

**Сделано:** добавлена папка [`../PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/`](../PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/README.md) (`README.md`, `STAGE_PLAN.md`, `LOG.md`) — канон исполнения для **ROADMAP_2** §3 пунктов **1.0 / 1.1 / 1.1a** (порядок **A → B → C**). В **ROADMAP_2**, **APP_RESTRUCTURE_INITIATIVE/README**, корневой **docs/README** — ссылки на мини-инициативу.

**Проверки:** docs-only.

---

## 2026-05-04 — ROADMAP_2: уточнение MVP по страницам программы пациента (`/treatment-programs`)

**Повод:** синхронизированы решения по MVP-логике страницы назначения/программы в диалоге с owner: убрать ложные проценты без модели расписания, зафиксировать этапность работ и data-enabler для даты контроля.

**Решения (зафиксировано в roadmap):**

- Согласовано явное исключение в цикле ROADMAP_2: добавить `started_at` в `treatment_program_instance_stages` для расчёта ожидаемого контроля от старта этапа.
- MVP **не** показывает процентную аналитику (`% за день`, `% этапа`, `% программы`) до появления корректной модели периодичности/расписания.
- Детальная страница `/app/patient/treatment-programs/[instanceId]` выделена отдельным шагом `1.1a`:
  - этап 0 (`sort_order=0`) — отдельный постоянный блок «Общие рекомендации»;
  - текущий этап — главный рабочий блок;
  - архив этапов — в скрытом `<details>`;
  - «План обновлён» как отдельный сигнал изменения назначения;
  - «дата ожидаемого контроля» = `started_at + expected_duration_days` (если оба значения заданы).
- Исполнение блока разбито на последовательность: **A (`1.0`) -> B (`1.1a`) -> C (`1.1`)**.

**Post-MVP (вынесено в backlog):**

- Множественные контроли в рамках одного этапа (history/reschedule/next).
- Комментарий пациента к факту выполнения `exercise` / `lesson` / actionable `recommendation`.

**Проверки:** docs-only; runtime-код/миграции не менялись в этой записи.

---

## 2026-05-04 — UX-02: read `program_action_log` для врача (порт + API + экземпляр)

**Отчёт:** [`E2E_ACCEPTANCE_AFTER_AB.md`](E2E_ACCEPTANCE_AFTER_AB.md) — UX-02 **fixed**; §2 шаг 5a PASS; §7 п.3; §8 строка UX-02.

**Контракт / код:**

- `ProgramActionLogPort.listForInstance` — `ports.ts`; тип `ProgramActionLogListRow`, форматтеры `formatProgramActionLogSummaryRu` / `formatLfkPostSessionDifficultyRu` — `modules/treatment-program/types.ts`.
- `pgProgramActionLog` / `inMemoryProgramActionLog` — Drizzle `select` + `orderBy(desc(createdAt))`, limit ≤500.
- `createTreatmentProgramProgressService` — `listProgramActionLogForInstance`.
- **GET** `apps/webapp/src/app/api/doctor/treatment-program-instances/[instanceId]/action-log/route.ts`.
- RSC `page.tsx` + `TreatmentProgramInstanceDetailClient` — секция «Дневник занятий», `refresh()` подгружает тот же endpoint.

**Проверки:** `eslint` (затронутые файлы), `pnpm --dir apps/webapp exec tsc --noEmit`, `vitest run …/progress-service.test.ts`. Полный `ci` не запускался.

**Вне scope:** prod-миграции, env, `system_settings`, LFK legacy DDL.

---

## 2026-05-04 — B6: `confirm` при перестановке этапа с `sortOrder === 0`

**Код:** `apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx` — в `handleMoveStage` перед swap, если у одного из этапов порядок 0.

**Отчёт:** [`E2E_ACCEPTANCE_AFTER_AB.md`](E2E_ACCEPTANCE_AFTER_AB.md) — §6 п.5, строка §8 «B6: предупреждение…».

**Проверки:** `pnpm --dir apps/webapp exec eslint` на файле конструктора; `pnpm --dir apps/webapp exec tsc --noEmit`. Полный `ci` не запускался.

---

## 2026-05-04 — UI-фиксы по E2E_ACCEPTANCE_AFTER_AB (BLOCK-01/02, UX-01/03/04, B6 диалог этапа)

**Отчёт:** обновлён [`E2E_ACCEPTANCE_AFTER_AB.md`](E2E_ACCEPTANCE_AFTER_AB.md) — статусы **fixed** у закрытых пунктов; **open** остаются UX-02 (нужен API), этап 6 PLAN_DOCTOR_CABINET.

**Код (только webapp UI):**

- `apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx` — …; `handleMoveStage`: `confirm`, если в паре перестановки у этапа `sortOrder === 0`.
- `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx` — ЛФК в теле этапа через `PatientLfkChecklistRow`; кнопка «Снять «Новое»»; `formatPatientTestResultRawValue` вместо сырого JSON.

**Проверки:** `eslint` (2 файла), `pnpm --dir apps/webapp exec tsc --noEmit`, `vitest run …/PatientTreatmentProgramDetailClient.test.tsx` (4 passed). Полный `pnpm run ci` не запускался.

**Вне scope:** `modules/`, `infra/`, `app/api/**`, миграции, env.

---

## 2026-05-04 — E2E acceptance после A1–A5 и B1–B7+D1–D6

**Отчёт:** [`E2E_ACCEPTANCE_AFTER_AB.md`](E2E_ACCEPTANCE_AFTER_AB.md)

**Тип:** read-only code-trace; ни один файл проекта не изменялся.

**Итог:** A1–A5 (PROGRAM_PATIENT_SHAPE) и B1–B7+D1–D4 (ASSIGNMENT_CATALOGS_REWORK) реализованы полностью. D5 — на паузе у owner. Выявлены два P1-хвоста конструктора шаблонов:

- **BLOCK-01:** конструктор не помечает первый этап (sort_order=0) как «Общие рекомендации» — врач не понимает семантику Stage 0; пациент видит неожиданный режим.
- **BLOCK-02:** ЛФК-комплекс в теле этапа использует кнопку `/progress/complete` вместо формы `PatientLfkChecklistRow` (difficulty + note) — данные о сложности занятия теряются при нажатии из stage body.

Дополнительно: UX-03 (raw JSON для результатов тестов пациента), UX-02 (нет feed action_log у врача). Этап 6 PLAN_DOCTOR_CABINET заморожен — hero/tabs/бейджи прогресса не реализованы.

**Проверки в этом проходе:** только статический code-trace, тесты не запускались. Последний зелёный CI — записи в initiative-логах 2026-05-04 (D6 FIX), vitest 26 passed + tsc ok.

---

## 2026-05-04 — статус экранов «Назначений» (каталоги B)

**Зафиксировано:** переработка **экранов каталогов раздела «Назначения»** в сквозном порядке **упражнения → клинические тесты → наборы тестов → комплексы ЛФК → рекомендации** — на стадии **почти завершено** (возможны точечные правки по приёмке). **Шаблоны программ лечения** — **ещё в доработке** (список/конструктор, UX).

**Документы:** обновлена шапка [`ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](ASSIGNMENT_CATALOGS_REWORK_PLAN.md); зеркальная строка — в [`../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md); кратко — в [`README.md`](README.md) этой инициативы.

**Проверки:** только docs; CI не запускался.

---

## 2026-05-04 — понятная схема текущей оценки клинических тестов (только docs)

**Повод:** пользователь запросил простое, не-техническое описание текущей логики оценки тестов, включая смысл "да/нет", min/max и поля "Добавить измерение" в карточке.

**Сделано (только документация, код не менялся):**

- Добавлен новый документ [`CLINICAL_TEST_SCORING_CURRENT_SYSTEM.md`](CLINICAL_TEST_SCORING_CURRENT_SYSTEM.md) в `docs/APP_RESTRUCTURE_INITIATIVE/`:
  - краткая схема "как сейчас работает";
  - объяснение, что такое "Добавить измерение";
  - расшифровка типов шкалы и полей min/max/step;
  - объяснение текущего пациентского сценария (авто-логика по числу при порогах vs ручной итог);
  - почему возникает разрыв между богатой моделью карточки и упрощенным patient UI.

**Решение по формату:** сделать отдельный справочный файл для продуктовой команды/поддержки, без привязки к коду и без перегруза техническими деталями.

**Проверки:** только docs; CI не запускался.

**Вне scope:** изменения runtime-логики расчета/интерфейса пациента.

---

## 2026-05-03 (продолжение) — execution-контур ASSIGNMENT_CATALOGS_REWORK (B1–B7, только docs)

**Повод:** выровнять sister-инициативу B с паттерном `PROGRAM_PATIENT_SHAPE_INITIATIVE` — отдельная папка с мастер-планом, этапными планами и журналом исполнения.

**Сделано (только документация, код не менялся):**

- Создана папка [`../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/): [`README.md`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/README.md), [`MASTER_PLAN.md`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/MASTER_PLAN.md), [`STAGE_B1_PLAN.md`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_B1_PLAN.md) … [`STAGE_B7_PLAN.md`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_B7_PLAN.md), [`LOG.md`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md), [`LOG_TEMPLATE.md`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG_TEMPLATE.md), [`EXECUTION_AUDIT_TEMPLATE.md`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/EXECUTION_AUDIT_TEMPLATE.md).
- В [`ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](ASSIGNMENT_CATALOGS_REWORK_PLAN.md): ссылка на execution-папку; в §6 DoD журнал B — на [`../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md) (не путать с журналом `APP_RESTRUCTURE_INITIATIVE/LOG.md`).
- В [`README.md`](README.md) — execution-пакет в буллете sister-инициативы и строка в таблице «Что в этой папке».
- В [`PROGRAM_PATIENT_SHAPE_PLAN.md`](PROGRAM_PATIENT_SHAPE_PLAN.md) и [`../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md`](../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md) — ссылка на execution B.
- В корневом [`../README.md`](../README.md) — пункт «Assignment Catalogs Rework (B1–B7) Execution» в блоке активных инициатив.

**Решение по структуре:** `ASSIGNMENT_CATALOGS_REWORK_PLAN.md` остаётся продуктовым ТЗ; операционный контур — `ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/*`.

**Проверки:** только docs; CI не запускался.

---

## 2026-05-03 (продолжение) — выделен execution-контур PROGRAM_PATIENT_SHAPE (только docs)

**Повод:** пользователь попросил вынести задачи этапа 9 (`PROGRAM_PATIENT_SHAPE`) в отдельную папку инициативы с мастер-планом и отдельными планами этапов.

**Сделано (только документация, код не менялся):**

- Создана новая папка [`../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/`](../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/):
  - [`README.md`](../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md)
  - [`MASTER_PLAN.md`](../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/MASTER_PLAN.md)
  - [`STAGE_A1_PLAN.md`](../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A1_PLAN.md)
  - [`STAGE_A2_PLAN.md`](../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A2_PLAN.md)
  - [`STAGE_A3_PLAN.md`](../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A3_PLAN.md)
  - [`STAGE_A4_PLAN.md`](../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A4_PLAN.md)
  - [`STAGE_A5_PLAN.md`](../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A5_PLAN.md)
  - [`LOG.md`](../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/LOG.md)
- В [`PROGRAM_PATIENT_SHAPE_PLAN.md`](PROGRAM_PATIENT_SHAPE_PLAN.md) добавлена ссылка на execution-контур.
- В [`README.md`](README.md) добавлена ссылка на новую инициативную папку (в блок «Новые продуктовые инициативы» и в таблицу «Что в этой папке»).
- В корневом [`../README.md`](../README.md) добавлен пункт «Program Patient Shape Execution» в блок активных инициатив.

**Решение по структуре:**

- `PROGRAM_PATIENT_SHAPE_PLAN.md` остаётся продуктовым ТЗ.
- `PROGRAM_PATIENT_SHAPE_INITIATIVE/*` становится операционным контуром реализации (master + stage plans + log).
- Sister-план B1–B7 (`ASSIGNMENT_CATALOGS_REWORK_PLAN.md`) остаётся отдельным **продуктовым ТЗ**; execution-контур — [`../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/README.md`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/README.md) — не смешивается с A1–A5.

**Проверки:** только docs; CI не запускался.

**Вне scope:** реализация A1–A5/B1–B7 в коде.

---

## 2026-05-03 (продолжение) — ASSIGNMENT_CATALOGS_REWORK + Universal comment pattern (только docs)

**Повод:** после фиксации `PROGRAM_PATIENT_SHAPE_PLAN` и `COURSES_INITIATIVE` пользователь поднял пакет UX/тех-болей в существующих каталогах раздела «Назначения» (по скриншотам админки): JSON `scoring_config` у клин. тестов; «UUID-textarea» для состава наборов тестов; «Область» как название поля у рекомендаций при отсутствии регион-тела; нерабочая «иконка глаза» у комплексов ЛФК; невозможность отдельно фильтровать черновики vs опубликованные; убогий конструктор шаблонов программ.

Прошли по реальному коду каталогов ([`ClinicalTestForm.tsx`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx), [`RecommendationForm.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx), [`TestSetItemsForm.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetItemsForm.tsx), [`TreatmentProgramConstructorClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx), [`doctorCatalogListStatus.ts`](../../apps/webapp/src/shared/lib/doctorCatalogListStatus.ts)) — подтвердили факты, согласовали структуру переработки, оформили в новый sister-план + дополнили `PROGRAM_PATIENT_SHAPE_PLAN`.

**Сделано (только документация, код не менялся):**

- Новый план [`ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](ASSIGNMENT_CATALOGS_REWORK_PLAN.md) с этапами **B1–B7**:
  - **B1** — две независимых оси фильтра «черновик/опубликован» × «активный/архив» (применимо к LFK-комплексам, шаблонам программ, наборам тестов, будущим курсам). Архивный черновик после восстановления остаётся черновиком.
  - **B2** — клинические тесты: `assessment_kind` как справочник (mobility/pain/sensitivity/strength/neurodynamics/proprioception/balance/endurance), `body_region` FK; структурированный `scoring` с `schema_type` (`numeric`/`likert`/`binary`/`qualitative`) и `measure_items[]`; raw_text. Фильтр «Регион» в шапке списка наконец заработает.
  - **B2.5** — новый shared компонент **`CreatableComboboxInput`** (shadcn такого нет, `cmdk` в проекте не используется — пишем свой поверх Input + Popover). Глобальный пул `clinical_test_measure_kinds`, append-only через `POST /api/doctor/measure-kinds`.
  - **B3** — наборы тестов: переписать редактор как клон LFK-комплекса (без reps/sets, с **комментарием** на каждый тест); добавить selector через диалог библиотеки; UUID-textarea — убрать как основной UI (Q5 — оставить ли admin-fallback).
  - **B4** — рекомендации: переименовать «Область» → **«Тип»** в UI; добавить `body_region` FK; добавить опц. `quantity_text` / `frequency_text` / `duration_text`; расширить enum под новые `kind`. Описание (`bodyMd`) и комментарий — **разные сущности**, не объединяем.
  - **B5** — комплексы ЛФК: диагностика и фикс «иконки глаза»; UX pass-1 списка/карточки; превьюшки.
  - **B6** — шаблоны программ: визуальный pass-1 конструктора с превьюшками в списке и в модалке «Элемент из библиотеки»; sticky-шапка; CTA «Сохранить черновик / Опубликовать / Архивировать»; **без** добавления `goals/objectives/expected_duration` и групп (это A1+A3 PROGRAM_PATIENT_SHAPE).
  - **B7** — universal comment pattern: раскат `template_comment` + `local_comment override` на все item-контейнеры (test_set_items, instance-LFK и др.); copy template→instance переносит, override работает, очистка → fallback на template.
- [`PROGRAM_PATIENT_SHAPE_PLAN.md`](PROGRAM_PATIENT_SHAPE_PLAN.md) дополнен:
  - В preamble — ссылка на sister-план B1–B7.
  - Новый §1.9 «Universal comment pattern (template + local override)» — фиксирует общий принцип `template_comment` → `local_comment override`, карта применения по контейнерам, граница с описанием контента (`bodyMd` ≠ комментарий).
  - Новый §8.2 — журнал решений 2026-05-03 (universal comment, разделение sister-инициативы, конструктор шаблона переписывается визуально один раз в B6 → потом доменно в A1+A3).
- [`README.md`](README.md) — в блоке «Новые продуктовые инициативы» добавлена строка про B-инициативу; в таблицу документов добавлена строка `ASSIGNMENT_CATALOGS_REWORK_PLAN.md`.

**Ключевые продуктовые решения, лёгшие в документы:**

1. **Две независимых оси фильтра.** Не один enum `draft|published|archived`, а отдельно `publication_status (draft|published)` + отдельно `is_archived`. Архивный черновик остаётся черновиком после восстановления.
2. **Универсальность только для каталогов с `publication_status`.** У упражнений / клин. тестов / рекомендаций жизненного цикла «черновик/опубликован» нет — там остаётся только архив.
3. **`CreatableComboboxInput`** — новый shared компонент. shadcn такого не предоставляет, `cmdk` в проекте не используется.
4. **Глобальный пул `measure_kinds`** — без scope per-doctor (в этой копии проекта врач один). Append-only в первой версии; модерация — backlog (Q6).
5. **`bodyMd` ≠ комментарий.** Описание принадлежит каталоговой записи (что такое рекомендация); комментарий — заметка в контексте конкретного назначения. B7 не объединяет их.
6. **Universal comment pattern** — `template_comment` → `local_comment override` для всех item-контейнеров; зафиксирован как общий принцип в `PROGRAM_PATIENT_SHAPE_PLAN.md` §1.9 и расписан по таблицам в B7.
7. **Конструктор шаблона переписывается один раз визуально** в B6, потом доменно расширяется в A1+A3 (цели/задачи/срок этапа + группы). Это исключает двойной refactor.
8. **Наборы тестов** — UI-модель = LFK-комплекс минус reps/sets/side/pain плюс комментарий. UUID-textarea как основной UI убирается.
9. **Рекомендации**: «Область» → «Тип» в UI; колонка `domain` в коде остаётся (переименование в `kind` — backlog по решению Q4).
10. **Фильтр «Регион» в списке клин. тестов наконец заработает** — после добавления `body_region_id` в B2 (раньше фильтр был, поля не было).

**Открытые вопросы зафиксированы:** [`ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §5 (Q1–Q7) — нужны до старта соответствующих B-этапов.

**Проверки:** правки только в docs; CI не запускался (нет кода). Структурная целостность ссылок проверена визуально. Совместимость с уже зафиксированным `PROGRAM_PATIENT_SHAPE_PLAN` обеспечена через явное разделение scope (`PROGRAM_PATIENT_SHAPE` = доменная модель плана; `ASSIGNMENT_CATALOGS_REWORK` = переработка каталогов и поперечные паттерны).

**Вне scope:** реализация (миграции, schema, UI). По требованию пользователя — «погнали» = оформление в документы, не выполнение.

---

## 2026-05-03 — PROGRAM_PATIENT_SHAPE + COURSES_INITIATIVE: фиксация продуктовых решений (только docs)

**Повод:** обсуждение по «доделыванию структуры в кабинете врача» под все сущности из «Назначений» (кроме упражнений). Прошлись по доменной модели программ (опираясь на архивный [`../archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md`](../archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md)) и зафиксировали продуктовые решения по «Плану лечения» пациента и «Курсам».

**Сделано (только документация, код не менялся):**

- Новый план [`PROGRAM_PATIENT_SHAPE_PLAN.md`](PROGRAM_PATIENT_SHAPE_PLAN.md) с этапами **A1–A5**:
  - A1 — цели/задачи/срок этапа (`goals`, `objectives`, `expected_duration_*` на template + instance stages);
  - A2 — рекомендация actionable/persistent + Этап 0 «Общие рекомендации» + «отключение» (`status active/disabled`) вместо удаления;
  - A3 — отдельные таблицы **`tplStageGroups` / `instStageGroups`** (с `title`/`description`/`schedule_text`/`sort_order`), `group_id` на items;
  - A4 — общий **`program_action_log`** (`session_id`, `action_type`), чек-лист дня с галочками, упрощённая «Оценка занятия» после run-screen, **Inbox «К проверке» в карточке пациента**;
  - A5 — бейдж **«План обновлён»** в Сегодня (по `treatment_program_events`) + бейдж **«Новое»** на item-е (`last_viewed_at IS NULL`, бэкфилл `created_at`).
- Новая инициатива [`../COURSES_INITIATIVE/README.md`](../COURSES_INITIATIVE/README.md) — **геткурс-модель курсов**: курс = отдельная сущность с уроками, unlock-rules, доступом/оплатой, не «обёртка над `treatment_program_template`». Снимает §9 архивного `SYSTEM_LOGIC_SCHEMA`. Стартует **последней** инициативой после ядра пациентского `PROGRAM_PATIENT_SHAPE_PLAN` и оплаты.
- [`TARGET_STRUCTURE_PATIENT.md`](TARGET_STRUCTURE_PATIENT.md) — переписан §4.2 «План» под зафиксированную модель; добавлен §12 «Зафиксированные продуктовые решения по Плану и Курсам». §10 (открытые вопросы) — закрыт п.2 (курсы как подраздел Плана vs витрина).
- [`TARGET_STRUCTURE_DOCTOR.md`](TARGET_STRUCTURE_DOCTOR.md) — обновлён §6 (каталоги назначений: типизированные рекомендации §6.5; конструктор шаблона §6.6; курсы — отдельная инициатива §6.3); §3 (меню — курсы перенесены в «Контент приложения», вопрос финального места открыт §15); §5 (карточка пациента — Tab 2 «Назначения» с Inbox «К проверке», `program_action_log` в Tab 3 «Дневники»); §11 / §13 / §14 — закрыт п.1 открытых вопросов, добавлены строки в дельту; новый §15 «Зафиксированные продуктовые решения».
- [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md) §II.5 — переформулирован пункт 3 (курсы — отдельная инициатива, не объединение с шаблонами); добавлен пункт 4 про PROGRAM_PATIENT_SHAPE. Часть IV — этап 7 переформулирован под `COURSES_INITIATIVE`; добавлен новый **этап 9 PROGRAM_PATIENT_SHAPE** (вставлен перед этапом 8 inbox).
- [`../BACKLOG_TAILS.md`](../BACKLOG_TAILS.md) — расширен список (этапы 2–9), добавлен раздел «Хвосты по Плану лечения / Курсам (2026-05-03)»: расписание (conditional), push в бот, PWA-push, cross-stage бейдж «новое», метрики compliance, гранулярные галочки, шкала боли, сертификаты курсов и т.д.

**Ключевые решения, которые легли в документы:**

1. **«Любое назначение → `treatment_program_instance`»** — параллельных «активных комплексов вне программы» в новой модели нет. Курсы — отдельный продукт, не план лечения.
2. **Тесты — без лимитов попыток.** Решение врача — gate этапа.
3. **Рекомендации — типизированный каталог**; флаг `is_actionable` на `instance_stage_item` (решает врач при назначении).
4. **«Этап 0 — Общие рекомендации»** — псевдо-stage `sort_order=0`, без FSM, переживает `program.status=completed`.
5. **Группы внутри этапа — отдельные таблицы** (`tplStageGroups` / `instStageGroups`), не колонка.
6. **«Отключение» вместо удаления** в инстансе (`status active/disabled`); замена шага = disable + add.
7. **`program_action_log`** — общий лог действий пациента; для тестов спец-таблицы остаются (`test_attempts`/`test_results`), в логе — маркер.
8. **Бейдж «План обновлён»** — на основе `treatment_program_events`, без новых таблиц. **Бейдж «Новое»** — `last_viewed_at` на `instance_stage_item` с бэкфиллом.
9. **Inbox «К проверке»** делается в карточке пациента вместе с A4. Кросс-пациентский inbox в «Сегодня» — backlog.
10. **Курсы — геткурс-модель** (уроки + unlock-rules + доступ/оплата), отдельная инициатива, последняя в очереди.

**Открытые вопросы зафиксированы:** [`PROGRAM_PATIENT_SHAPE_PLAN.md`](PROGRAM_PATIENT_SHAPE_PLAN.md) §5 (O1–O7) и [`../COURSES_INITIATIVE/README.md`](../COURSES_INITIATIVE/README.md) §6 (C1–C7) — нужны до старта реализации.

**Проверки:** правки только в docs; CI не запускался (нет кода). Структурная целостность ссылок проверена визуально.

**Вне scope:** реализация (миграции, schema, ports, UI). По требованию пользователя — «зафиксируй в документах. Сам не выполняй».

---

## 2026-05-02 — SelectValue: sentinel «тип нагрузки» и оставшиеся raw-value

**Повод:** при пустом типе нагрузки в [`ExerciseForm.tsx`](../../apps/webapp/src/app/app/doctor/exercises/ExerciseForm.tsx) в триггере отображался внутренний sentinel `__load_type_empty__` (children `SelectValue` были `null`). Дополнительно: самозакрывающийся `SelectValue` в [`CommentBlock.tsx`](../../apps/webapp/src/components/comments/CommentBlock.tsx) и [`PatientHomeRepairTargetsDialog.tsx`](../../apps/webapp/src/app/app/settings/patient-home/PatientHomeRepairTargetsDialog.tsx) мог показывать технический `value` вместо подписи.

**Сделано:**

- `ExerciseForm`: при пустом `loadType` в `SelectValue` явно **«Не выбран»** (sentinel остаётся только как controlled `value` селекта).
- `CommentBlock`: в `SelectValue` — `COMMENT_TYPE_LABEL[newType]`.
- `PatientHomeRepairTargetsDialog`: подпись выбранной цели по совпадению с `options` (как в `SelectItem`: `title (targetRef)`).
- [`AppParametersSection.tsx`](../../apps/webapp/src/app/app/settings/AppParametersSection.tsx), [`SettingsForm.tsx`](../../apps/webapp/src/app/app/settings/SettingsForm.tsx): комментарий у самозакрывающегося `SelectValue`, что value уже человекочитаемый (IANA / русские подписи).

**Проверки:** `pnpm --dir apps/webapp exec eslint` по перечисленным файлам · `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/exercises/ExerciseForm.test.tsx` (при наличии).

**Вне scope:** прочие экраны без регрессии в этом проходе.

---

## 2026-05-02 — каталоги назначений: подписи в Select (тип нагрузки и др.)

**Повод:** в карточке упражнения в поле «Тип нагрузки» в закрытом селекте отображался ключ (`strength` и т.д.), хотя в списке — русские названия. Та же модель Base UI (`SelectValue` без children) давала сырой `value` и в других селектах (порядок списка медиа, статус шаблона, тип элемента программы, фильтр справочника, выбор шаблона у пациента).

**Сделано:**

- [`exerciseLoadTypeOptions.ts`](../../apps/webapp/src/modules/lfk-exercises/exerciseLoadTypeOptions.ts) — единые `EXERCISE_LOAD_TYPE_OPTIONS` и `exerciseLoadTypeLabel`; [`ExerciseForm.tsx`](../../apps/webapp/src/app/app/doctor/exercises/ExerciseForm.tsx) и [`DoctorCatalogFiltersForm.tsx`](../../apps/webapp/src/shared/ui/doctor/DoctorCatalogFiltersForm.tsx) переведены на общий источник. **2026-05-04 follow-up:** список кодов/подписей для фильтра и формы — из справочника `load_type` ([`exerciseLoadTypeReference.ts`](../../apps/webapp/src/modules/lfk-exercises/exerciseLoadTypeReference.ts)); `EXERCISE_LOAD_TYPE_OPTIONS` оставлен как deprecated-обёртка над сидом; см. [`../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/EXERCISE_LOAD_TYPE_FROM_REFS_PLAN.md`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/EXERCISE_LOAD_TYPE_FROM_REFS_PLAN.md).
- [`mediaLibraryListSortOptions.ts`](../../apps/webapp/src/shared/ui/media/mediaLibraryListSortOptions.ts) — общие пресеты сортировки списка медиа; [`MediaPickerPanel.tsx`](../../apps/webapp/src/shared/ui/media/MediaPickerPanel.tsx), [`AutoCreateExercisesClient.tsx`](../../apps/webapp/src/app/app/doctor/exercises/AutoCreateExercisesClient.tsx).
- Явная подпись в `SelectValue`: [`NewTemplateForm.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/new/NewTemplateForm.tsx), [`TreatmentProgramConstructorClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx), [`ReferenceItemsTableClient.tsx`](../../apps/webapp/src/app/app/doctor/references/[categoryCode]/ReferenceItemsTableClient.tsx), [`PatientTreatmentProgramsPanel.tsx`](../../apps/webapp/src/app/app/doctor/clients/PatientTreatmentProgramsPanel.tsx).

**Проверки:** `pnpm --dir apps/webapp exec vitest run src/modules/lfk-exercises/exerciseLoadTypeOptions.test.ts` · целевой eslint по изменённым файлам.

**Документация:** этот блок; примечание в [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md).

**Вне scope:** полный проход по всем остальным self-closing `SelectValue` вне перечисленных в первом проходе файлов.

---

## 2026-05-02 — меню врача: визуальный polish аккордеона

**Повод:** UX кластерного меню в [`DoctorMenuAccordion.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.tsx) — жирные заголовки `text-foreground`, тонкая рамка кластера, шеврон слева (вправо / вниз при раскрытии), отступ вложенных ссылок, больший зазор между кластерами.

**Сделано:** правки только в `DoctorMenuAccordion.tsx`; логика `openClusterId` / `localStorage` без изменений.

**Проверки:** `pnpm exec vitest run src/shared/ui/DoctorMenuAccordion.test.tsx` (из `apps/webapp`) · `pnpm exec eslint src/shared/ui/DoctorMenuAccordion.tsx`.

**Вне scope:** подпись «Разделы» в `DoctorAdminSidebar`, `doctorNavLinks`, примитивы `components/ui/*`, новые зависимости.

**Документация:** краткое дополнение в [`DOCTOR_MENU_RESTRUCTURE_PLAN.md`](done/DOCTOR_MENU_RESTRUCTURE_PLAN.md).

---

## 2026-05-02 — doctor clients: карточка и список (DOCTOR_CLIENT_PROFILE_REPACK)

**Повод:** ТЗ [`DOCTOR_CLIENT_PROFILE_REPACK_PLAN.md`](done/DOCTOR_CLIENT_PROFILE_REPACK_PLAN.md) — убрать аккордеон карточки, sticky-шапка и плоские секции; компактный список с иконочными бейджами каналов; удалить заглушку «Создать из записи на приём».

**Полный аудит закрытия:** [`DOCTOR_CLIENT_PROFILE_REPACK_EXECUTION_AUDIT.md`](done/DOCTOR_CLIENT_PROFILE_REPACK_EXECUTION_AUDIT.md) — `rg`, тесты, отклонения от текста ТЗ (подпись якоря «Программа»), хвост RTL на `suspendLoad`.

**Сделано:**

- Удалён `CreateClientFromRecordStub.tsx`; из [`page.tsx`](../../apps/webapp/src/app/app/doctor/clients/page.tsx) снят условный рендер заглушки.
- [`DoctorClientsPanel.tsx`](../../apps/webapp/src/app/app/doctor/clients/DoctorClientsPanel.tsx): `space-y-1.5`, `py-2`, имя `text-sm`; телефон не в тексте строки; справа бейджи `Phone` / `Send` / «М» и компактный бейдж отмен.
- [`ClientProfileCard.tsx`](../../apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx): один `article`, sticky-шапка (имя, телефон, ближайшая запись, «Открыть чат», якоря на заметки/программу), секции по группам ТЗ; история записей и старый журнал в `<details>`; блок «Коммуникации» только при непустом `messageHistory`; убрана ссылка «Открыть раздел сообщений»; админ-блок в одном `<details>` с `suspendHeavyFetch` / `suspendLoad` при закрытии.
- Тесты: [`DoctorClientsPanel.test.tsx`](../../apps/webapp/src/app/app/doctor/clients/DoctorClientsPanel.test.tsx); обновлён [`ClientProfileCard.backLink.test.tsx`](../../apps/webapp/src/app/app/doctor/clients/ClientProfileCard.backLink.test.tsx) (mock `PatientTreatmentProgramsPanel`, без кнопки «Коммуникации»).

**Иконка Telegram в списке:** `Send` из `lucide-react` (как в ТЗ).

**Проверки:** `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/clients/ClientProfileCard.backLink.test.tsx src/app/app/doctor/clients/DoctorClientsPanel.test.tsx` · `pnpm --dir apps/webapp exec vitest run e2e/doctor-clients-inprocess.test.ts` · **`pnpm run ci`** (корень репо). При ошибке `tsc` в `apps/webapp/.next/dev/types` — удалить `apps/webapp/.next` и повторить (битый кэш среды).

**Вне scope:** табы/hero карточки, изменения `doctor-clients` порта/БД, правки дочерних панелей кроме вставки по месту.

---

## 2026-05-02 — Rubitime → Google Calendar: описание события (комментарии)

**Повод:** в календаре в поле описания события отображался только id записи Rubitime; нужны комментарии клиента и администратора.

**Сделано:**

- `apps/integrator/src/integrations/google-calendar/sync.ts` — `buildGoogleCalendarDescriptionFromRubitimeRecord`: блоки «Клиент» / «Администратор», резерв `Rubitime #id` при пустых комментариях.
- `apps/integrator/src/integrations/rubitime/connector.ts` — `mergeRubitimeWebhookSiblingCommentFields`: подмешивание полей комментариев с верхнего уровня `data` вебхука во вложенный `record`, если там пусто.
- Тесты: `sync.test.ts` (описание + существующие кейсы маппинга), `connector.test.ts` (merge `comment` и `admin_comment` с родителя).

**Документация:** [`docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`](../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md) — раздел «Google Calendar: поле description события», таблица журнала.

**Проверки:** `pnpm --dir apps/integrator exec vitest run src/integrations/google-calendar/sync.test.ts src/integrations/rubitime/connector.test.ts`

**Вне scope:** настраиваемое сопоставление произвольных `custom_fieldN` Rubitime с полями описания (только фиксированный список ключей админ-комментария).

---

## 2026-05-02 — режимы, тестовые аккаунты, dev_mode relay

**Повод:** один операторский экран для режимов и явных тестовых идентификаторов (телефон / Telegram / Max), без internal `platform_users.id` в UI; bypass техработ для тестовых пациентов; dev_mode relay по `channel`+`recipient`.

**Сделано:**

- Новый ключ **`test_account_identifiers`** (admin): `{ phones[], telegramIds[], maxIds[] }` — парсер/нормализация `testAccounts.ts`, PATCH в `route.ts`, тесты API и unit.
- **`SystemSettingsService`:** `shouldDispatchRelayToRecipient`, `isTestPatientSession` (fail-closed при отсутствии/битой настройке).
- **`relayOutbound`:** guard `shouldDispatchRelay({ channel, recipient })`; DI в `buildAppDeps`.
- **Settings UI:** вкладка «Админ: режим» → **«Режимы»**; вкладка «Доступ и роли» убрана из `AdminSettingsTabsClient`; блок техработ перенесён из «Параметры приложения» в «Режимы»; `AppParametersSection` — только URL/поддержка/таймзона.
- **Patient layout:** при техработах полный UI для сессий, совпадающих с `test_account_identifiers`; `patientMaintenanceReplacesPatientShell(..., isTestAccount)`.
- **Batch PATCH «Режимы»:** один запрос `{ items }` → транзакция `upsertManyInTransaction` + `persistAdminModesBatch`; общая нормализация `adminSettingsPatchNormalize.ts` / `MODES_FORM_KEYS`; политики `empty_batch`, `duplicate_key_in_batch`, `ambiguous_body`; предпросмотр отброшенных телефонов `previewTestAccountPhoneTokens` в UI.
- Документы: `INTEGRATOR_CONTRACT.md` (dev_mode guard), `CONFIGURATION_ENV_VS_DATABASE.md`, этот лог; планы/аудиты: [`MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md`](done/MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md), [`MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md`](done/MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md).

**Проверки (целевые, после batch+preview):**  
`pnpm --dir apps/webapp exec vitest run src/app/api/admin/settings/route.test.ts src/modules/system-settings/adminSettingsPatchNormalize.test.ts src/modules/system-settings/testAccounts.test.ts src/modules/system-settings/service.test.ts src/modules/system-settings/patientMaintenance.test.ts src/modules/messaging/relayOutbound.test.ts src/modules/messaging/doctorSupportMessagingService.test.ts src/app/app/settings/AdminSettingsSection.test.tsx src/app/app/settings/AppParametersSection.test.tsx` · `pnpm --dir apps/webapp typecheck` · `pnpm --dir apps/webapp lint` · перед merge — **`pnpm run ci`** (корень репо).

**Глубокий аудит закрытия (2026-05-02):** [`MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md`](done/MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md) — сверка DoD, `rg`, кросс-обновление `PATIENT_MAINTENANCE_MODE_EXECUTION_AUDIT.md`, `CONFIGURATION_ENV_VS_DATABASE.md`, `RECOMMENDATIONS_AND_ROADMAP.md`, legacy `AccessListsSection`. Зеркала планов: [`MODES_SETTINGS_CLEANUP_PLAN.md`](done/MODES_SETTINGS_CLEANUP_PLAN.md), [`MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md`](done/MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md).

**Вне scope (без изменений):** миграция пользователей, новая таблица тестовых аккаунтов, удаление legacy-ключей из `ALLOWED_KEYS`, смена auth-модели ролей.

**Хвосты полного аудита (закрыто в коде/docs):** `patient/layout.tsx` — устойчивое чтение `isTestPatientSession` при ошибке БД; `AdminModeToggle` — явное название ключа в предупреждении; §«Закрытие хвостов» в [`MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md`](done/MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md).

---

## 2026-05-02 — режим техработ patient app (операционный guard)

**Повод:** безопасно выкатывать изменения кабинета врача/бэкенда, не открывая весь patient UI; настройка из админки, без env.

**Полный аудит закрытия плана:** [`PATIENT_MAINTENANCE_MODE_EXECUTION_AUDIT.md`](done/PATIENT_MAINTENANCE_MODE_EXECUTION_AUDIT.md) (чек-листы шагов 1–6, DoD, остаточный manual smoke).

**Сделано:**

- `system_settings` (admin), ключи: `patient_app_maintenance_enabled`, `patient_app_maintenance_message`, `patient_booking_url` — в [`types.ts`](../../apps/webapp/src/modules/system-settings/types.ts), валидация в [`route.ts`](../../apps/webapp/src/app/api/admin/settings/route.ts); **UI перенесён во вкладку «Режимы»** ([`AdminSettingsSection.tsx`](../../apps/webapp/src/app/app/settings/AdminSettingsSection.tsx), [`page.tsx`](../../apps/webapp/src/app/app/settings/page.tsx)) (ранее блок жил в «Параметры приложения»).
- Рантайм: [`patientMaintenance.ts`](../../apps/webapp/src/modules/system-settings/patientMaintenance.ts) (`getPatientMaintenanceConfig`, `patientMaintenanceSkipsPath`); чтение через `configAdapter`, дефолты в коде при отсутствии строк в БД.
- Гейт в [`patient/layout.tsx`](../../apps/webapp/src/app/app/patient/layout.tsx): только **роль `client`**, врач/админ не затрагиваются; пропуск оверлея для `bind-phone` / `help` / `support` и путей allowlist при `need_activation` (см. helper).
- Экран: [`PatientMaintenanceScreen.tsx`](../../apps/webapp/src/app/app/patient/PatientMaintenanceScreen.tsx) — сообщение, внешняя ссылка записи, `upcoming` из `listMyBookings`, таймзона `getAppDisplayTimeZone`.
- **Без** SQL-seed миграции: первые значения создаются сохранением в Settings (зеркалирование integrator через `updateSetting`).

**Дефолты (код):** сообщение — «Приложение в разработке, функционал частично недоступен.»; URL записи — `https://dmitryberson.rubitime.ru`; техработы выкл.

**Проверки:**  
`pnpm --dir apps/webapp exec vitest run src/app/api/admin/settings/route.test.ts src/modules/system-settings/patientMaintenance.test.ts src/app/app/patient/PatientMaintenanceScreen.test.tsx`  
`pnpm --dir apps/webapp typecheck` · `pnpm --dir apps/webapp lint`

После аудита закрытия: добавлен тест экрана на fallback небезопасного URL записи (`PatientMaintenanceScreen.test.tsx`).

Полный отчёт по чек-листам плана: [`PATIENT_MAINTENANCE_MODE_EXECUTION_AUDIT.md`](done/PATIENT_MAINTENANCE_MODE_EXECUTION_AUDIT.md).

**Доработки после независимого аудита (2026-05-02):** ранний выход в `getPatientMaintenanceConfig` при выключенном режиме; параллельное чтение message/booking при включённом; `patientMaintenanceReplacesPatientShell`; `sr-only` заголовок у текста; тесты `patientMaintenance.getConfig.test.ts`, `AppParametersSection.test.tsx`; обновлён execution audit.

**Rollout / rollback:** включить/выключить флаг в админке → Settings; откат — выключить режим, cache TTL/инвалидация с PATCH.

**Вне scope:** нативный flow `/app/patient/booking`, сегментация пациентов, изменения IA patient вне полноэкранного оверлея.

---

## 2026-05-02 — этап 4: экран «Сегодня» врача (реализация)

**Повод:** выполнить [`DOCTOR_TODAY_DASHBOARD_PLAN.md`](done/DOCTOR_TODAY_DASHBOARD_PLAN.md) — заменить отчётный `/app/doctor` на рабочий экран дня.

**Сделано:**

- [`page.tsx`](../../apps/webapp/src/app/app/doctor/page.tsx): тонкая страница, `loadDoctorTodayDashboard`, без `getDashboardMetrics` и без плиток метрик.
- [`loadDoctorTodayDashboard.ts`](../../apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.ts): `Promise.all` по записям (today + week), новым заявкам (`status=new`, limit 3), непрочитанным диалогам и `unreadFromUsers`; дедуп «ближайших» по `id` относительно списка «сегодня», сортировка по `recordAtIso`, лимит 5.
- [`DoctorTodayDashboard.tsx`](../../apps/webapp/src/app/app/doctor/DoctorTodayDashboard.tsx): четыре секции с empty-state и CTA, видимый заголовок «Сегодня», ссылка на `/app/doctor/stats`.
- Удалён клиентский виджет `DoctorDashboardContextWidgets.tsx` (ранее только главная врача); счётчик сообщений на главной — через серверные `listOpenConversations` + `unreadFromUsers`, без polling на этой странице.
- Тесты: [`DoctorTodayDashboard.test.tsx`](../../apps/webapp/src/app/app/doctor/DoctorTodayDashboard.test.tsx), [`loadDoctorTodayDashboard.test.ts`](../../apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.test.ts).

**Проверки:**

`pnpm --dir apps/webapp exec vitest run src/app/app/doctor/DoctorTodayDashboard.test.tsx src/app/app/doctor/loadDoctorTodayDashboard.test.ts`  
`pnpm --dir apps/webapp typecheck`  
`pnpm --dir apps/webapp lint`

**Вне scope:** секция «К проверке» как рабочая очередь, realtime/push/SSE, новый notification center, изменение карточки пациента, миграции БД и новые env, изменение семантики статусов online-intake.

---

## 2026-05-02 — этап 3: бейджи меню врача (реализация)

**Повод:** закрыть [`DOCTOR_NAV_BADGES_PLAN.md`](done/DOCTOR_NAV_BADGES_PLAN.md) — бейджи «Онлайн-заявки» (`status=new`) и «Сообщения» (непрочитанные) в desktop sidebar и mobile Sheet.

**Сделано:**

- Hook [`useDoctorOnlineIntakeNewCount`](../../apps/webapp/src/modules/online-intake/hooks/useDoctorOnlineIntakeNewCount.ts): `GET /api/doctor/online-intake?status=new&limit=1`, счётчик из `total`, polling **20 с**, без запросов при `document.visibilityState !== "visible"` (вариант **A** из ТЗ).
- [`doctorNavLinks.ts`](../../apps/webapp/src/shared/ui/doctorNavLinks.ts): типы `DoctorMenuBadgeKey`, опциональный `badgeKey` у пунктов `online-intake` и `messages`.
- [`DoctorMenuAccordion.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.tsx): `useDoctorSupportUnreadCount` + новый hook; `formatNavBadgeCount` (`1..99`, `99+` при `≥100`, `0` скрыт); бейдж в строке пункта; `aria-label` у ссылки и бейджа; сохранены `id` `doctor-sidebar-link-*` / `doctor-menu-link-*`.
- Тесты: [`useDoctorOnlineIntakeNewCount.test.tsx`](../../apps/webapp/src/modules/online-intake/hooks/useDoctorOnlineIntakeNewCount.test.tsx), обновлены [`doctorNavLinks.test.ts`](../../apps/webapp/src/shared/ui/doctorNavLinks.test.ts), [`DoctorMenuAccordion.test.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.test.tsx).

**Проверки:**  
`pnpm --dir apps/webapp exec vitest run src/shared/ui/DoctorMenuAccordion.test.tsx src/shared/ui/doctorNavLinks.test.ts src/modules/online-intake/hooks/useDoctorOnlineIntakeNewCount.test.tsx`  
`pnpm --dir apps/webapp typecheck`  
`pnpm --dir apps/webapp lint`  
`rg "@/infra/db|@/infra/repos" apps/webapp/src/app/api/doctor/online-intake apps/webapp/src/shared/ui apps/webapp/src/modules/online-intake/hooks` — без совпадений в новом hook.

**Вне scope:** дашборд «Сегодня», realtime/push/SSE, отдельный endpoint `new-count`, бейдж на заголовке закрытого кластера, `notifyDoctorOnlineIntakeCountChanged` (не добавляли — достаточно polling).

### Закрытие аудита (2026-05-02)

По замечаниям пост-реализации:

- **Дублирование polling unread:** добавлены [`DoctorSupportUnreadProvider`](../../apps/webapp/src/shared/ui/DoctorSupportUnreadProvider.tsx) и переименованный в модуле [`useDoctorSupportUnreadCountPolling`](../../apps/webapp/src/modules/messaging/hooks/useSupportUnreadPolling.ts); провайдер оборачивает дерево в [`DoctorWorkspaceShell`](../../apps/webapp/src/shared/ui/DoctorWorkspaceShell.tsx). `useDoctorSupportUnreadCount` из `@/shared/hooks/useSupportUnreadPolling` читает контекст — один интервал на всё дерево кабинета врача (сейчас основной потребитель меню — [`DoctorMenuAccordion`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.tsx); другие клиенты под тем же layout получают то же значение без второго polling).
- **Нестабильный HTTP для online-intake:** в [`useDoctorOnlineIntakeNewCount`](../../apps/webapp/src/modules/online-intake/hooks/useDoctorOnlineIntakeNewCount.ts) добавлена проверка `res.ok` до `json()`.
- **Manual smoke:** по-прежнему приёмочный шаг оператора по чеклисту из [`DOCTOR_NAV_BADGES_PLAN.md`](done/DOCTOR_NAV_BADGES_PLAN.md) (раздел Manual smoke); автоматически не воспроизводится.

**Проверки после аудита:**  
`pnpm --dir apps/webapp exec vitest run src/shared/ui/DoctorSupportUnreadProvider.test.tsx src/modules/online-intake/hooks/useDoctorOnlineIntakeNewCount.test.tsx src/shared/ui/DoctorMenuAccordion.test.tsx`  
`pnpm --dir apps/webapp typecheck` · `pnpm --dir apps/webapp lint`

---

## 2026-05-02 — этап 4: ТЗ для экрана «Сегодня» врача

**Повод:** подготовить отдельное ТЗ для замены отчётного обзора `/app/doctor` на рабочий экран дня.

**Сделано:**

- Создано [`DOCTOR_TODAY_DASHBOARD_PLAN.md`](done/DOCTOR_TODAY_DASHBOARD_PLAN.md): цель, текущая база, продуктовые решения, scope boundaries, целевые секции, техническая форма, шаги исполнения, проверки, manual smoke, stop conditions и Definition of Done.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на ТЗ этапа 4 и статус «ТЗ готово».
- Зафиксирован MVP: «Записи сегодня», «Новые онлайн-заявки», «Непрочитанные сообщения», «Ближайшие записи»; метрики остаются на `/app/doctor/stats`.
- Зафиксировано ограничение: «К проверке» не делать как реальную очередь без готового источника данных «требует проверки врача».

**Проверки:** документационная правка; код не менялся, targeted tests не запускались.

**Вне scope:** не делали реализацию `/app/doctor`, patient card, новую очередь проверки тестов, realtime/push/SSE, миграции или настройки окружения.

---

## 2026-05-02 — этап 3: ТЗ для бейджей меню врача

**Повод:** подготовить отдельное ТЗ для дешёвого, но полезного слоя быстрых сигналов в меню врача: новые онлайн-заявки и непрочитанные сообщения.

**Сделано:**

- Создано [`DOCTOR_NAV_BADGES_PLAN.md`](done/DOCTOR_NAV_BADGES_PLAN.md): цель, scope boundaries, источники данных, UI plan, backend plan, шаги исполнения, проверки, manual smoke, stop conditions и Definition of Done.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на ТЗ этапа 3 и зафиксированы ключевые решения.
- Уточнён источник счётчика онлайн-заявок: только `status=new`, потому что `in_review` уже означает «взято в работу».
- Зафиксировано, что счётчик сообщений должен переиспользовать существующий `useDoctorSupportUnreadCount` / `GET /api/doctor/messages/unread-count`, без второго источника истины.

**Проверки:** документационная правка; код не менялся, targeted tests не запускались.

**Вне scope:** не делали дашборд «Сегодня», realtime/push/SSE, новые миграции, изменение статусов online-intake или пациентский интерфейс.

---

## 2026-05-02 — этап 7: closeout после аудита (DoD)

**Повод:** закрыть пробелы из независимого аудита [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md): документация HTTP для архивации с guard, RTL на формах каталогов 1/3/4, статус плана, финальный корневой CI.

**Сделано:**

- [`api.md`](../../apps/webapp/src/app/api/api.md): для **`DELETE`** `clinical-tests`, `test-sets`, `recommendations` описаны **`409`** с `code: USAGE_CONFIRMATION_REQUIRED`, поле `usage`, повтор с **`?acknowledgeUsageWarning=1`** и отсылки к доменным функциям guard в типах.
- [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md): статус «выполнено», блок **Closeout** в Definition of Done.
- RTL: [`ExerciseForm.test.tsx`](../../apps/webapp/src/app/app/doctor/exercises/ExerciseForm.test.tsx), [`ClinicalTestForm.test.tsx`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.test.tsx), [`TestSetForm.test.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetForm.test.tsx) — сценарий «архив → диалог → Архивировать всё равно» с проверкой второго submit и `acknowledgeUsageWarning=1`.
- Исправление подтверждения архива: на формах врача (`ExerciseForm`, `ClinicalTestForm`, `TestSetForm`, `RecommendationForm`, `TemplateEditor`) флаг `acknowledgeUsageWarning` перенесён в state `archiveUsageAck` (скрытое поле с `value`), чтобы повторный submit после `setWarnOpen(false)` не терял `1` при ре-рендере; тело диалога с секциями usage вынесено из `DialogDescription` (невалидные вложенные `<p>`) в `div` с теми же стилями.

**Проверки:** `pnpm install --frozen-lockfile && pnpm run ci` — успех на рабочем дереве (2026-05-02): lint, typecheck, integrator + webapp tests, build integrator + webapp, audit deps.

**Manual smoke этапа 7:** по-прежнему приёмочный шаг оператора по чеклисту в плане; автоматизированы только точечные RTL для трёх форм выше.

---

## 2026-05-02 — этап 7 подшаг: курсы (usage + archive guard)

**Сделано:**

- Домен: [`CourseUsageSnapshot`](../../apps/webapp/src/modules/courses/types.ts), [`courseArchiveRequiresAcknowledgement`](../../apps/webapp/src/modules/courses/types.ts), [`errors.ts`](../../apps/webapp/src/modules/courses/errors.ts).
- Порт: [`getCourseUsageSummary`](../../apps/webapp/src/modules/courses/ports.ts); PG [`pgCourses.ts`](../../apps/webapp/src/infra/repos/pgCourses.ts) (агрегация по `courses.program_template_id`, `treatment_program_instances`, `content_pages.linked_course_id`); in-memory [`seedInMemoryCourseUsageSnapshot`](../../apps/webapp/src/infra/repos/inMemoryCourses.ts).
- Сервис: [`getCourseUsage`](../../apps/webapp/src/modules/courses/service.ts), [`updateCourse(..., options?)`](../../apps/webapp/src/modules/courses/service.ts) при переходе в `archived`.
- API: [`GET …/courses/[id]/usage`](../../apps/webapp/src/app/api/doctor/courses/[id]/usage/route.ts); [`PATCH [id]`](../../apps/webapp/src/app/api/doctor/courses/[id]/route.ts) — `409` + `USAGE_CONFIRMATION_REQUIRED`, поле **`acknowledgeUsageWarning`**.
- UI: [`DoctorCourseEditForm.tsx`](../../apps/webapp/src/app/app/doctor/courses/[id]/DoctorCourseEditForm.tsx), [`courseUsageDocLinks.ts`](../../apps/webapp/src/app/app/doctor/courses/courseUsageDocLinks.ts), [`courseUsageSummaryText.ts`](../../apps/webapp/src/app/app/doctor/courses/courseUsageSummaryText.ts); RSC usage на [`[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/courses/[id]/page.tsx).
- Тесты: [`service.test.ts`](../../apps/webapp/src/modules/courses/service.test.ts), [`pgCourses.test.ts`](../../apps/webapp/src/infra/repos/pgCourses.test.ts), [`courseUsageDocLinks.test.ts`](../../apps/webapp/src/app/app/doctor/courses/courseUsageDocLinks.test.ts), [`courseUsageSummaryText.test.ts`](../../apps/webapp/src/app/app/doctor/courses/courseUsageSummaryText.test.ts), RTL [`DoctorCourseEditForm.test.tsx`](../../apps/webapp/src/app/app/doctor/courses/%5Bid%5D/DoctorCourseEditForm.test.tsx) (usage из RSC / `GET …/usage`, архив без guard, `409` → диалог → `acknowledgeUsageWarning`).
- Документация: [`api.md`](../../apps/webapp/src/app/api/api.md); трекер в [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md).

**Аудит подшага (после первичной реализации):** закрыт пробел без RTL на форме — добавлен `DoctorCourseEditForm.test.tsx`. Финальный корневой `pnpm run ci` и ручной smoke — см. запись **«2026-05-02 — этап 7: closeout после аудита (DoD)»** выше в этом файле.

**Проверки:** `pnpm --dir apps/webapp typecheck`; `pnpm --dir apps/webapp exec vitest run src/modules/courses/service.test.ts src/infra/repos/pgCourses.test.ts src/app/app/doctor/courses/courseUsageDocLinks.test.ts src/app/app/doctor/courses/courseUsageSummaryText.test.ts "src/app/app/doctor/courses/[id]/DoctorCourseEditForm.test.tsx"`; `pnpm --dir apps/webapp lint`.

**Guard архива:** активные экземпляры программ по шаблону курса или опубликованные страницы контента с `linked_course_id`; черновики страниц и только завершённые программы не требуют подтверждения.

**Ручной smoke (оператор):** по чеклисту «Manual smoke» в [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md).

**Closeout этапа 7 по каталогам:** все семь подшагов в [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md) закрыты; итоговый прогон CI — в записи **«2026-05-02 — этап 7: closeout после аудита (DoD)»**.

---

## 2026-05-02 — этап 7 подшаг: шаблоны программ (usage + archive guard)

**Сделано:**

- Домен: [`TreatmentProgramTemplateUsageSnapshot`](../../apps/webapp/src/modules/treatment-program/types.ts), [`treatmentProgramTemplateArchiveRequiresAcknowledgement`](../../apps/webapp/src/modules/treatment-program/types.ts), [`errors.ts`](../../apps/webapp/src/modules/treatment-program/errors.ts).
- Порт/репо: [`getTreatmentProgramTemplateUsageSummary`](../../apps/webapp/src/modules/treatment-program/ports.ts), PG/in-memory сводка и soft-archive в [`pgTreatmentProgram.ts`](../../apps/webapp/src/infra/repos/pgTreatmentProgram.ts) / [`inMemoryTreatmentProgram.ts`](../../apps/webapp/src/infra/repos/inMemoryTreatmentProgram.ts); реэкспорт сидов в [`treatmentProgramInMemory.ts`](../../apps/webapp/src/app-layer/testing/treatmentProgramInMemory.ts).
- Сервис: [`getTreatmentProgramTemplateUsage`](../../apps/webapp/src/modules/treatment-program/service.ts), guard при `updateTemplate(…, archived)` и [`deleteTemplate`](../../apps/webapp/src/modules/treatment-program/service.ts).
- API: [`GET …/[id]/usage`](../../apps/webapp/src/app/api/doctor/treatment-program-templates/[id]/usage/route.ts); [`PATCH/DELETE [id]`](../../apps/webapp/src/app/api/doctor/treatment-program-templates/[id]/route.ts) — `409` + `USAGE_CONFIRMATION_REQUIRED`, `PATCH acknowledgeUsageWarning`, `DELETE ?acknowledgeUsageWarning=`.
- UI: блок «Где используется», архивация и диалог подтверждения в [`TreatmentProgramConstructorClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx); [`templateUsageDocLinks.ts`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/templateUsageDocLinks.ts), [`templateUsageSummaryText.ts`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/templateUsageSummaryText.ts); RSC usage на [`[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/page.tsx); `onArchived` + `router.refresh` в [`TreatmentProgramTemplatesPageClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/TreatmentProgramTemplatesPageClient.tsx).
- Документация: [`api.md`](../../apps/webapp/src/app/api/api.md); трекер в [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md).
- Тесты: [`service.test.ts`](../../apps/webapp/src/modules/treatment-program/service.test.ts), [`pgTreatmentProgram.test.ts`](../../apps/webapp/src/infra/repos/pgTreatmentProgram.test.ts) (smoke SQL usage через mock `getPool`), [`templateUsageDocLinks.test.ts`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/templateUsageDocLinks.test.ts), [`templateUsageSummaryText.test.ts`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/templateUsageSummaryText.test.ts), [`TreatmentProgramConstructorClient.test.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/%5Bid%5D/TreatmentProgramConstructorClient.test.tsx).

**Проверки:** `pnpm --dir apps/webapp typecheck`; `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/service.test.ts src/infra/repos/pgTreatmentProgram.test.ts src/app/app/doctor/treatment-program-templates/templateUsageDocLinks.test.ts src/app/app/doctor/treatment-program-templates/templateUsageSummaryText.test.ts "src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.test.tsx"`; `pnpm --dir apps/webapp lint`.

**Аудит подшага (после первичной реализации):** закрыты пробелы — интеграционный smoke для запроса usage в PG-порте и RTL на пустой usage, архив без guard и сценарий `409` → подтверждение → успех.

**Ручной smoke (оператор):** по чеклисту «Manual smoke» в [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md): шаблон без usage и с usage (активная программа и/или опубликованный курс), кликабельные refs, архив без предупреждения и с диалогом, повтор без `acknowledgeUsageWarning` на API не проходит.

**Guard архива:** активные экземпляры программ и опубликованные курсы; черновики курсов и только завершённые экземпляры не требуют подтверждения.

---

## 2026-05-02 — этап 7 подшаг: рекомендации (usage + archive guard)

**Сделано:**

- Сводка: шаблоны и экземпляры программ с `item_type = 'recommendation'` и `item_ref_id` = id рекомендации ([`pgRecommendations.ts`](../../apps/webapp/src/infra/repos/pgRecommendations.ts), `loadRecommendationUsageSummary`).
- Домен: [`RecommendationUsageSnapshot`](../../apps/webapp/src/modules/recommendations/types.ts), [`recommendationArchiveRequiresAcknowledgement`](../../apps/webapp/src/modules/recommendations/types.ts), [`errors.ts`](../../apps/webapp/src/modules/recommendations/errors.ts).
- Сервис: [`getRecommendationUsage`](../../apps/webapp/src/modules/recommendations/service.ts), [`archiveRecommendation(id, options?)`](../../apps/webapp/src/modules/recommendations/service.ts); in-memory [`seedInMemoryRecommendationUsageSnapshot`](../../apps/webapp/src/infra/repos/inMemoryRecommendations.ts).
- UI: [`RecommendationForm.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx), [`actions.ts`](../../apps/webapp/src/app/app/doctor/recommendations/actions.ts) / [`actionsInline.ts`](../../apps/webapp/src/app/app/doctor/recommendations/actionsInline.ts), [`fetchDoctorRecommendationUsageSnapshot`](../../apps/webapp/src/app/app/doctor/recommendations/actions.ts); [`recommendationUsageSummaryText.ts`](../../apps/webapp/src/app/app/doctor/recommendations/recommendationUsageSummaryText.ts), [`recommendationUsageDocLinks.ts`](../../apps/webapp/src/app/app/doctor/recommendations/recommendationUsageDocLinks.ts); RSC usage при `?selected=` ([`page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/page.tsx)) и на [`[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/[id]/page.tsx).
- API DELETE [`recommendations/[id]`](../../apps/webapp/src/app/api/doctor/recommendations/[id]/route.ts): `409` + `usage`, повтор с `?acknowledgeUsageWarning=1`.
- Тесты: [`service.test.ts`](../../apps/webapp/src/modules/recommendations/service.test.ts), [`pgRecommendations.test.ts`](../../apps/webapp/src/infra/repos/pgRecommendations.test.ts), [`recommendationUsageDocLinks.test.ts`](../../apps/webapp/src/app/app/doctor/recommendations/recommendationUsageDocLinks.test.ts), [`recommendationUsageSummaryText.test.ts`](../../apps/webapp/src/app/app/doctor/recommendations/recommendationUsageSummaryText.test.ts), [`RecommendationForm.test.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.test.tsx).

**Проверки:** `pnpm --dir apps/webapp typecheck`; целевые `vitest run` по файлам выше; **`pnpm --dir apps/webapp lint`** (полный прогон webapp после аудита подшага).

**Аудит подшага (2026-05-02):** в [`service.test.ts`](../../apps/webapp/src/modules/recommendations/service.test.ts) добавлены кейсы guard для **только активного** экземпляра программы и проход архива при **только завершённых** экземплярах; в проверках зафиксирован полный lint webapp.

**Guard архива:** опубликованные шаблоны и активные экземпляры; черновики, архивные шаблоны и завершённые экземпляры — только сводка.

**Вне scope:** переименование «Область», markdown preview, редизайн каталога.

---

## 2026-05-02 — этап 7 подшаг: наборы тестов (usage + archive guard)

**Сделано:**

- Сводка использования набора: шаблоны и экземпляры программ с `item_type = 'test_set'` и `item_ref_id` = id набора; архивные шаблоны — только в сводке; счётчик попыток через `test_attempts` + `treatment_program_instance_stage_items` ([`pgTestSets.ts`](../../apps/webapp/src/infra/repos/pgTestSets.ts), `loadTestSetUsageSummary`).
- Доменная модель: [`TestSetUsageSnapshot`](../../apps/webapp/src/modules/tests/types.ts), [`testSetArchiveRequiresAcknowledgement`](../../apps/webapp/src/modules/tests/types.ts), ошибки в [`errors.ts`](../../apps/webapp/src/modules/tests/errors.ts) (`TestSetUsageConfirmationRequiredError` и др.).
- Сервис: [`getTestSetUsage`](../../apps/webapp/src/modules/tests/service.ts), [`archiveTestSet(id, options?)`](../../apps/webapp/src/modules/tests/service.ts); in-memory [`seedInMemoryTestSetUsageSnapshot`](../../apps/webapp/src/infra/repos/inMemoryTestSets.ts).
- UI врача: [`TestSetForm.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetForm.tsx), [`actions.ts`](../../apps/webapp/src/app/app/doctor/test-sets/actions.ts) / [`actionsInline.ts`](../../apps/webapp/src/app/app/doctor/test-sets/actionsInline.ts), [`fetchDoctorTestSetUsageSnapshot`](../../apps/webapp/src/app/app/doctor/test-sets/actions.ts); тексты/ссылки — [`testSetUsageSummaryText.ts`](../../apps/webapp/src/app/app/doctor/test-sets/testSetUsageSummaryText.ts), [`testSetUsageDocLinks.ts`](../../apps/webapp/src/app/app/doctor/test-sets/testSetUsageDocLinks.ts); RSC usage на [`page.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/page.tsx) при `?selected=` и на [`[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/[id]/page.tsx).
- API DELETE [`test-sets/[id]`](../../apps/webapp/src/app/api/doctor/test-sets/[id]/route.ts): `409` + `usage`, повтор с `?acknowledgeUsageWarning=1`.
- Тесты: [`service.test.ts`](../../apps/webapp/src/modules/tests/service.test.ts), [`pgTestSets.test.ts`](../../apps/webapp/src/infra/repos/pgTestSets.test.ts), [`testSetUsageDocLinks.test.ts`](../../apps/webapp/src/app/app/doctor/test-sets/testSetUsageDocLinks.test.ts), [`testSetUsageSummaryText.test.ts`](../../apps/webapp/src/app/app/doctor/test-sets/testSetUsageSummaryText.test.ts), [`TestSetForm.test.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetForm.test.tsx).

**Проверки:** `pnpm --dir apps/webapp typecheck`; `pnpm --dir apps/webapp exec vitest run` (файлы выше); **`pnpm --dir apps/webapp lint`** (полный прогон webapp после аудита подшага).

**Аудит подшага (2026-05-02):** в разделе 4 [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md) зафиксировано различие сводки (все статусы шаблонов + completed + попытки) и guard (только `published` шаблоны + `active` экземпляры); в [`service.test.ts`](../../apps/webapp/src/modules/tests/service.test.ts) — отдельный кейс «только черновые шаблоны» и уточнён кейс «только история попыток».

**Guard архива:** опубликованные шаблоны программ и активные экземпляры; черновики, архивные шаблоны, завершённые экземпляры и счётчик попыток — только сводка.

**Вне scope:** карточный редизайн каталога наборов, scoring.

---

## 2026-05-02 — этап 7 подшаг: клинические тесты (usage + archive guard)

**Сделано:**

- Сводка использования теста: цепочка `test_set_items` → шаблоны/экземпляры программ с `item_type = 'test_set'` и `item_ref_id` = id набора; счётчик строк в `test_results` по `test_id` (история, не блокирует архив). Реализация: один SELECT в [`pgClinicalTests.ts`](../../apps/webapp/src/infra/repos/pgClinicalTests.ts) (`loadClinicalTestUsageSummary`).
- Доменная модель: [`ClinicalTestUsageSnapshot`](../../apps/webapp/src/modules/tests/types.ts), [`clinicalTestArchiveRequiresAcknowledgement`](../../apps/webapp/src/modules/tests/types.ts), ошибки [`ClinicalTestUsageConfirmationRequiredError`](../../apps/webapp/src/modules/tests/errors.ts) и отдельные «не найден» / «уже в архиве».
- Сервис: [`getClinicalTestUsage`](../../apps/webapp/src/modules/tests/service.ts), [`archiveClinicalTest(id, options?)`](../../apps/webapp/src/modules/tests/service.ts) с `acknowledgeUsageWarning`; in-memory [`seedInMemoryClinicalTestUsageSnapshot`](../../apps/webapp/src/infra/repos/inMemoryClinicalTests.ts).
- UI врача: блок «Где используется», диалог, [`useActionState`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx) для архива; [`archiveClinicalTest`](../../apps/webapp/src/app/app/doctor/clinical-tests/actions.ts) / [`archiveClinicalTestInline`](../../apps/webapp/src/app/app/doctor/clinical-tests/actionsInline.ts); [`fetchDoctorClinicalTestUsageSnapshot`](../../apps/webapp/src/app/app/doctor/clinical-tests/actions.ts); тексты/ссылки — [`clinicalTestsUsageSummaryText.ts`](../../apps/webapp/src/app/app/doctor/clinical-tests/clinicalTestsUsageSummaryText.ts), [`clinicalTestsUsageDocLinks.ts`](../../apps/webapp/src/app/app/doctor/clinical-tests/clinicalTestsUsageDocLinks.ts).
- API DELETE [`clinical-tests/[id]`](../../apps/webapp/src/app/api/doctor/clinical-tests/[id]/route.ts): `409` + `usage` при необходимости подтверждения.
- Тесты: [`service.test.ts`](../../apps/webapp/src/modules/tests/service.test.ts), [`pgClinicalTests.test.ts`](../../apps/webapp/src/infra/repos/pgClinicalTests.test.ts), [`clinicalTestsUsageDocLinks.test.ts`](../../apps/webapp/src/app/app/doctor/clinical-tests/clinicalTestsUsageDocLinks.test.ts), [`clinicalTestsUsageSummaryText.test.ts`](../../apps/webapp/src/app/app/doctor/clinical-tests/clinicalTestsUsageSummaryText.test.ts), [`ClinicalTestForm.test.tsx`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.test.tsx).

**Проверки:** `pnpm --dir apps/webapp exec vitest run` (файлы выше); `pnpm --dir apps/webapp typecheck`.

**Guard архива:** блокируют активные (неархивные) наборы тестов, опубликованные шаблоны программ и активные экземпляры; черновики и архивные шаблоны программ, только архивные наборы, завершённые экземпляры и счётчик `test_results` — только сводка, без обязательного подтверждения.

**Вне scope:** scoring UI, справочник `test_type`, этап «Наборы тестов».

**Пост-аудит:** в сводку добавлены архивные шаблоны программ (`status = 'archived'`), только для отображения; split-view и `/clinical-tests/[id]` получают usage с сервера при первом рендере; `DELETE /api/doctor/clinical-tests/[id]` поддерживает `?acknowledgeUsageWarning=1`; тест [`ClinicalTestForm.test.tsx`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.test.tsx).

---

## 2026-05-02 — этап 7 подшаг: упражнения (usage + archive guard)

**Сделано:**

- Каталог упражнений: read-only сводка использования (`ExerciseUsageSnapshot`), порт `getExerciseUsageSummary`, один SQL в [`pgLfkExercises.ts`](../../apps/webapp/src/infra/repos/pgLfkExercises.ts) (шаблоны комплексов ЛФК, назначения `patient_lfk_assignments`, шаблоны/экземпляры программ лечения).
- Сервис: [`getExerciseUsage`](../../apps/webapp/src/modules/lfk-exercises/service.ts), архив с `acknowledgeUsageWarning` и доменной ошибкой [`USAGE_CONFIRMATION_REQUIRED`](../../apps/webapp/src/modules/lfk-exercises/errors.ts).
- UI: блок «Где используется», диалог предупреждения, server actions [`archiveDoctorExercise`](../../apps/webapp/src/app/app/doctor/exercises/actions.ts) / [`archiveExerciseInline`](../../apps/webapp/src/app/app/doctor/exercises/actionsInline.ts) с `useActionState`; при `?selected=` usage приходит с RSC, иначе [`fetchDoctorExerciseUsageSnapshot`](../../apps/webapp/src/app/app/doctor/exercises/actions.ts).
- Тесты: [`service.test.ts`](../../apps/webapp/src/modules/lfk-exercises/service.test.ts), [`pgLfkExercises.test.ts`](../../apps/webapp/src/infra/repos/pgLfkExercises.test.ts), [`ExerciseForm.test.tsx`](../../apps/webapp/src/app/app/doctor/exercises/ExerciseForm.test.tsx), [`exerciseUsageSummaryText.test.ts`](../../apps/webapp/src/app/app/doctor/exercises/exerciseUsageSummaryText.test.ts); in-memory seed [`seedInMemoryExerciseUsageSnapshot`](../../apps/webapp/src/infra/repos/inMemoryLfkExercises.ts).
- **Пост-аудит:** отдельные ошибки «не найдено» / «уже в архиве» ([`ExerciseArchiveNotFoundError`](../../apps/webapp/src/modules/lfk-exercises/errors.ts), [`ExerciseArchiveAlreadyArchivedError`](../../apps/webapp/src/modules/lfk-exercises/errors.ts)) и их прокидывание из [`archiveDoctorExerciseCore`](../../apps/webapp/src/app/app/doctor/exercises/actionsShared.ts); в сводку добавлен счётчик завершённых экземпляров программ (история, не блокирует архив); склонения фраз «В N …» через [`vNaForm`](../../apps/webapp/src/app/app/doctor/exercises/exerciseUsageSummaryText.ts).

**Проверки:** `pnpm --dir apps/webapp exec vitest run` (целевые файлы выше); `pnpm --dir apps/webapp typecheck`.

**Решения / ограничения:** счётчики только по источникам из матрицы плана; отдельный «тяжёлый» patient LFK count через цепочку `lfk_complexes` не выносился — текущий запрос покрывает `patient_lfk_assignments` + `lfk_complex_exercises` / шаблон при `complex_id IS NULL`.

**Вне scope:** остальные каталоги этапа 7, миграции/индексы, пациентский UI.

---

## 2026-05-02 — этап 7 подшаг: комплексы ЛФК (usage + archive guard)

**Сделано:**

- Сводка использования шаблона комплекса: `LfkTemplateUsageSnapshot` — активные `patient_lfk_assignments` по `template_id`, шаблоны/экземпляры программ лечения с `item_type = 'lfk_complex'` и `item_ref_id = template_id` ([`pgLfkTemplates.ts`](../../apps/webapp/src/infra/repos/pgLfkTemplates.ts), один SELECT).
- Сервис: [`getTemplateUsage`](../../apps/webapp/src/modules/lfk-templates/service.ts), архив с `acknowledgeUsageWarning` и [`LfkTemplateUsageConfirmationRequiredError`](../../apps/webapp/src/modules/lfk-templates/errors.ts) (`USAGE_CONFIRMATION_REQUIRED`).
- UI: блок «Где используется», диалог архивации, [`archiveDoctorLfkTemplate`](../../apps/webapp/src/app/app/doctor/lfk-templates/actions.ts) + [`TemplateEditor`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx); на `/lfk-templates/[id]` snapshot с RSC; в split-view — [`fetchDoctorLfkTemplateUsageSnapshot`](../../apps/webapp/src/app/app/doctor/lfk-templates/actions.ts).
- Ссылки врача: [`lfkTemplatesUsageDocLinks.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/lfkTemplatesUsageDocLinks.ts); тексты секций — [`lfkTemplatesUsageSummaryText.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/lfkTemplatesUsageSummaryText.ts) (`vNaForm` из упражнений).
- Тесты: [`service.test.ts`](../../apps/webapp/src/modules/lfk-templates/service.test.ts), [`pgLfkTemplates.test.ts`](../../apps/webapp/src/infra/repos/pgLfkTemplates.test.ts), [`lfkTemplatesUsageDocLinks.test.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/lfkTemplatesUsageDocLinks.test.ts), [`lfkTemplatesUsageSummaryText.test.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/lfkTemplatesUsageSummaryText.test.ts), [`lfkTemplatesListPreserveQuery.test.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/lfkTemplatesListPreserveQuery.test.ts), [`TemplateEditor.test.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.test.tsx); in-memory [`seedInMemoryLfkTemplateUsageSnapshot`](../../apps/webapp/src/infra/repos/inMemoryLfkTemplates.ts).

**Пост-аудит (фиксы):** сохранение GET-параметров списка (`q`, `region`, `load`, `titleSort`) после архивации — [`lfkTemplatesListPreserveQuery.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/lfkTemplatesListPreserveQuery.ts) + hidden `listPreserveQuery` в [`TemplateEditor`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx) / [`LfkTemplatesPageClient`](../../apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplatesPageClient.tsx), санитизация в [`archiveDoctorLfkTemplate`](../../apps/webapp/src/app/app/doctor/lfk-templates/actions.ts); тесты [`TemplateEditor.test.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.test.tsx), непустые refs в [`pgLfkTemplates.test.ts`](../../apps/webapp/src/infra/repos/pgLfkTemplates.test.ts); в плане уточнены опциональные стартовые пути `lfk-assignments` / `pgLfkAssignments`. Диалог архивации при `USAGE_CONFIRMATION_REQUIRED` по-прежнему без отдельного e2e-теста (ручной smoke).

**Проверки:** `pnpm --dir apps/webapp exec vitest run` (файлы выше); `pnpm --dir apps/webapp typecheck`.

**Guard архива:** как у упражнений — блокируют только опубликованные шаблоны программ, активные экземпляры и активные назначения ЛФК; черновики шаблонов программ и завершённые экземпляры — в сводке, без обязательного подтверждения.

**Вне scope:** остальные каталоги этапа 7, схема LFK, редизайн списка комплексов.

---

## 2026-05-02 — CMS Post-Execution Fix (Variant C+)

**Сделано:**

- **Корень системной папки** ([`content/page.tsx`](../../apps/webapp/src/app/app/doctor/content/page.tsx)): кнопка «Создать страницу» скрыта, пока не выбран конкретный раздел (`?section=`); убрана автоподстановка первого дочернего раздела; добавлены «Создать раздел» и «Добавить из существующих» (модалка [`AttachExistingSectionsModal.tsx`](../../apps/webapp/src/app/app/doctor/content/AttachExistingSectionsModal.tsx) со списком свободных article-разделов).
- **Перенос раздела из статей в папку:** server action [`attachArticleSectionToSystemFolder`](../../apps/webapp/src/app/app/doctor/content/sections/actions.ts), UI — та же модалка на хабе контента; отдельная форма и query `attachToFolder` на [`sections/page.tsx`](../../apps/webapp/src/app/app/doctor/content/sections/page.tsx) удалены.
- **Новая страница** ([`new/page.tsx`](../../apps/webapp/src/app/app/doctor/content/new/page.tsx), [`ContentForm.tsx`](../../apps/webapp/src/app/app/doctor/content/ContentForm.tsx)): список разделов фильтруется — только `kind=article` для общего каталога или только разделы кластера при `?systemParentCode=`; при одном допустимом разделе выбор заблокирован (hidden `section`); пустой state со ссылками создать раздел / «Добавить из существующих» ведёт на хаб контента с `?systemParentCode=`.
- **Подписочная карусель:** [`blocks.ts`](../../apps/webapp/src/modules/patient-home/blocks.ts), [`patientHomeResolvers.ts`](../../apps/webapp/src/modules/patient-home/patientHomeResolvers.ts), [`patientHomeRuntimeStatus.ts`](../../apps/webapp/src/modules/patient-home/patientHomeRuntimeStatus.ts) — кандидаты `subscription_carousel`: разделы только `kind=article`, страницы только из article-разделов и опубликованные; курсы без изменений.
- **UX списка страниц:** [`ContentPagesSectionList.tsx`](../../apps/webapp/src/app/app/doctor/content/ContentPagesSectionList.tsx) — ссылка «Создать страницу» к разделу.

**Проверки:** `pnpm --dir apps/webapp exec vitest run` (таргетные файлы: sections/actions, blocks, patientHome runtime/resolvers, ContentForm, ContentPagesSidebar, patient-home settings actions, service) — зелёно.

**Runbook (ops / до деплоя ужесточения на prod):** найти элементы главной `subscription_carousel`, которые ссылаются на не-statейные разделы или страницы вне article-разделов; исправить через CMS «Главная пациента» (заменить target) или вернуть раздел в каталог статей. Шаблон диагностического запроса (выполнять на окружении с загруженным `DATABASE_URL`, см. `docs/ARCHITECTURE/SERVER CONVENTIONS.md`):

```sql
SELECT i.id, i.target_type, trim(i.target_ref) AS target_ref, cs.kind AS section_kind
FROM patient_home_block_items i
JOIN patient_home_blocks b ON b.id = i.block_id
LEFT JOIN content_sections cs ON cs.slug = trim(i.target_ref) AND i.target_type = 'content_section'
WHERE b.code = 'subscription_carousel'
  AND i.is_visible = true
  AND i.target_type = 'content_section'
  AND (cs.kind IS DISTINCT FROM 'article');

SELECT i.id, i.target_type, trim(i.target_ref) AS page_slug, p.section, cs.kind AS parent_section_kind
FROM patient_home_block_items i
JOIN patient_home_blocks b ON b.id = i.block_id
JOIN content_pages p ON p.slug = trim(i.target_ref)
JOIN content_sections cs ON cs.slug = p.section
WHERE b.code = 'subscription_carousel'
  AND i.is_visible = true
  AND i.target_type = 'content_page'
  AND cs.kind IS DISTINCT FROM 'article';
```

**Вне scope:** новые миграции БД, редизайн курсов, изменение `getSubscriptionCarouselSectionPresentation` (синхронный матч по items без taxonomy).

---

## 2026-05-02 — этап 5 «Сообщения врача»: preflight

**Сделано:**

- Проверены текущие точки входа doctor support-chat: [`/app/doctor/messages`](../../apps/webapp/src/app/app/doctor/messages/page.tsx), [`DoctorSupportInbox`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx), API [`/api/doctor/messages/**`](../../apps/webapp/src/app/api/doctor/messages), общий [`ChatView`](../../apps/webapp/src/modules/messaging/components/ChatView.tsx), polling hook [`useMessagePolling`](../../apps/webapp/src/modules/messaging/hooks/useMessagePolling.ts).
- Подтверждён backend baseline: [`listOpenConversationsForAdmin`](../../apps/webapp/src/infra/repos/pgSupportCommunication.ts) уже отдаёт открытые диалоги, но без unread по диалогу; [`ensureWebappConversationForUser`](../../apps/webapp/src/infra/repos/pgSupportCommunication.ts) уже существует; [`markUserMessagesReadByAdmin`](../../apps/webapp/src/infra/repos/pgSupportCommunication.ts) отмечает входящие `sender_role = 'user'` на уровне conversation.
- Подтверждён UI baseline карточки пациента: [`ClientProfileCard`](../../apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx) ещё содержит старую [`SendMessageForm`](../../apps/webapp/src/app/app/doctor/clients/[userId]/SendMessageForm.tsx) и старый `messageLog`, поэтому форму можно убирать только после рабочего ensure/open support-chat по `patientUserId`.

**Решения:**

- Первый проход автопрочтения делается conversation-level: при открытии/рендере диалога вызывается существующий `POST /api/doctor/messages/[conversationId]/read`. Точный per-message visible-read через `IntersectionObserver` не вводится без новой read-модели.
- Baseline архитектурного grep: doctor messages API routes не импортируют `@/infra/db` / `@/infra/repos` напрямую; в `modules/messaging` уже есть legacy type-imports из `pgSupportCommunication`, не расширять их без необходимости.

**Вне scope:** `/app/doctor/broadcasts`, массовые рассылки, БД-схема, env, WebSocket/SSE, пациентский интерфейс.

---

## 2026-05-02 — этап 5 «Сообщения врача»: реализация единого чата

**Сделано:**

- [`listOpenConversationsForAdmin`](../../apps/webapp/src/infra/repos/pgSupportCommunication.ts) и in-memory parity расширены unread-счётчиком по входящим сообщениям пациента (`unreadFromUserCount`) и фильтром `unreadOnly`; [`GET /api/doctor/messages/conversations`](../../apps/webapp/src/app/api/doctor/messages/conversations/route.ts) поддерживает `?unread=1`.
- Добавлен [`POST /api/doctor/messages/conversations/ensure`](../../apps/webapp/src/app/api/doctor/messages/conversations/ensure/route.ts): врач открывает/создаёт webapp support-chat по `patientUserId`, получает `conversationId`, последние сообщения и unread count.
- Вынесен общий doctor chat layout [`DoctorChatPanel`](../../apps/webapp/src/modules/messaging/components/DoctorChatPanel.tsx): загрузка сообщений, composer, polling, отправка ответа, conversation-level auto-read и callbacks для обновления списка.
- [`DoctorSupportInbox`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx) теперь показывает фильтр «Все / Непрочитанные», бейджи unread и использует `DoctorChatPanel` для выбранного диалога.
- [`ClientProfileCard`](../../apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx) заменил старую форму отправки на CTA «Открыть чат» и modal с тем же `DoctorChatPanel`; старый `messageLog` оставлен как «Старый журнал отправок».
- Удалены runtime-неиспользуемые legacy artifacts старого composer: `SendMessageForm`, server action для отправки из карточки и старый draft action из `/doctor/messages`; страницы клиентов больше не вызывают `prepareMessageDraft`.

**Решения/ограничения:**

- Auto-read реализован как conversation-level read after open/render и после новых входящих сообщений в polling. Per-message visible-read через `IntersectionObserver` отложен: текущий backend контракт читает весь диалог.
- ACL для `patientUserId` не усложнялась внутри этого этапа: используется существующий doctor access guard, как в ТЗ.
- Legacy `doctor-messaging` сохраняется только для архивного `messageLog` и существующих списковых методов; отправка из карточки больше не идёт через старый composer.

**Проверки:**

- `pnpm --dir apps/webapp exec vitest run src/app/api/doctor/messages/conversations/route.test.ts src/app/api/doctor/messages/conversations/ensure/route.test.ts src/app/api/doctor/messages/[conversationId]/route.test.ts src/app/api/doctor/messages/unread-count/route.test.ts src/modules/messaging/doctorSupportMessagingService.test.ts src/modules/messaging/components/DoctorChatPanel.test.tsx src/app/app/doctor/clients/ClientProfileCard.backLink.test.tsx src/infra/repos/pgSupportCommunication.test.ts e2e/doctor-actions-inprocess.test.ts e2e/doctor-pages-inprocess.test.ts` — 10 files / 57 tests passed.
- `pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp lint` — ok.
- `rg "SendMessageForm|sendMessageAction|getMessageDraftAction|doctor-client-send-message-form" apps/webapp/src` — пусто.
- `rg "@/infra/db|@/infra/repos" apps/webapp/src/app/api/doctor/messages` — пусто; `modules/messaging` содержит только ранее существовавшие legacy type-imports из `pgSupportCommunication`.
- `pnpm run ci` — ok.

**Вне scope:** `/app/doctor/broadcasts`, массовые рассылки, patient messages UI, schema migrations, env/config, WebSocket/SSE, глубокий редизайн карточки пациента.

---

## 2026-05-02 — этап 5 «Сообщения врача»: post-audit fixes

**Повод:** закрытие неблокирующих замечаний из [`DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT.md`](done/DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT.md).

**Сделано:**

- [`DoctorSupportInbox`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx): в строке чата теперь отображаются телефон пациента и время последнего сообщения; добавлен focused test [`DoctorSupportInbox.test.tsx`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.test.tsx).
- Добавлен лёгкий unread-count endpoint без создания диалога: [`POST /api/doctor/messages/conversations/unread-by-patient`](../../apps/webapp/src/app/api/doctor/messages/conversations/unread-by-patient/route.ts). Путь идёт через [`doctorSupportMessagingService.unreadFromPatient`](../../apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts) и support repo count by patient.
- [`ClientProfileCard`](../../apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx): CTA «Открыть чат» показывает unread badge до открытия modal; после read в открытом `DoctorChatPanel` локальный badge сбрасывается.
- [`useDoctorSupportUnreadCount`](../../apps/webapp/src/modules/messaging/hooks/useSupportUnreadPolling.ts): добавлено синхронное browser-событие refresh для doctor unread count; [`DoctorChatPanel`](../../apps/webapp/src/modules/messaging/components/DoctorChatPanel.tsx) диспатчит его после успешного read.
- [`DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT.md`](done/DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT.md), [`DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md`](done/DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md), [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md), [`README.md`](README.md): обновлены под факт post-audit fixes.

**Проверки:**

- `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/messages/DoctorSupportInbox.test.tsx src/app/app/doctor/clients/ClientProfileCard.backLink.test.tsx src/app/api/doctor/messages/conversations/unread-by-patient/route.test.ts src/modules/messaging/components/DoctorChatPanel.test.tsx src/modules/messaging/doctorSupportMessagingService.test.ts src/infra/repos/pgSupportCommunication.test.ts` — 6 files / 40 tests passed.
- `pnpm --dir apps/webapp exec vitest run src/app-layer/di/buildAppDeps.test.ts` — 1 file / 20 tests passed.
- `pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp lint` — ok.

**Осталось как осознанное ограничение:** точный per-message visible-read (`IntersectionObserver`) не делали без смены read-модели; manual browser smoke остаётся приёмочным шагом для stage/dev.

---

## 2026-05-02 — этап 5 «Сообщения врача»: hardening fix (patient missing + network)

**Сделано:**

- [`POST /api/doctor/messages/conversations/ensure`](../../apps/webapp/src/app/api/doctor/messages/conversations/ensure/route.ts): добавлена проверка существования пациента через `doctorClientsPort.getClientIdentity`; ошибки унифицированы в `patient_not_found` (404) и `conversation_ensure_failed` (500).
- [`POST /api/doctor/messages/conversations/unread-by-patient`](../../apps/webapp/src/app/api/doctor/messages/conversations/unread-by-patient/route.ts): добавлена проверка пациента и `404 patient_not_found`.
- [`GET /api/doctor/messages/unread-count`](../../apps/webapp/src/app/api/doctor/messages/unread-count/route.ts): добавлен режим `?patientUserId=<uuid>` с валидацией (`400 invalid_patient_user_id`) и `404 patient_not_found`; глобальный режим сохранён.
- [`ClientProfileCard`](../../apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx): для `ensure` добавлены явные пользовательские ошибки (`patient_not_found`, `conversation_ensure_failed`), unread badge на CTA сохраняется.
- [`DoctorSupportInbox`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx), [`DoctorChatPanel`](../../apps/webapp/src/modules/messaging/components/DoctorChatPanel.tsx): закрыты сетевые ошибки в load/polling (try/catch + стабильный error state), без падения UI.

**Проверки:**

- `pnpm --dir apps/webapp exec vitest run src/app/api/doctor/messages/conversations/ensure/route.test.ts src/app/api/doctor/messages/conversations/unread-by-patient/route.test.ts src/app/api/doctor/messages/unread-count/route.test.ts src/app/app/doctor/messages/DoctorSupportInbox.test.tsx src/modules/messaging/components/DoctorChatPanel.test.tsx src/app/app/doctor/clients/ClientProfileCard.backLink.test.tsx src/modules/messaging/doctorSupportMessagingService.test.ts` — 7 files / 42 tests passed.
- `pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp lint` — ok.

**Вне scope (по решению):** старый вход «Открыть раздел сообщений» в карточке пациента не удаляли в этом проходе.

---

## 2026-05-02 — этап 2 «Меню врача» (кабинет врача)

**Сделано:**

- [`doctorNavLinks.ts`](../../apps/webapp/src/shared/ui/doctorNavLinks.ts): кластеры `DOCTOR_MENU_CLUSTERS`, standalone «Библиотека файлов», порядок секций `getDoctorMenuRenderSections()` (библиотека между «Контент приложения» и «Коммуникации»), плоский `DOCTOR_MENU_LINKS`, константы ключа localStorage `doctorMenu.openCluster.v1`; уточнён `isDoctorNavItemActive`, чтобы хаб CMS не был активен на `/app/doctor/content/library`.
- [`DoctorMenuAccordion.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.tsx) + [`DoctorMenuAccordion.test.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.test.tsx); подключение в [`DoctorAdminSidebar.tsx`](../../apps/webapp/src/shared/ui/DoctorAdminSidebar.tsx) и [`DoctorHeader.tsx`](../../apps/webapp/src/shared/ui/DoctorHeader.tsx) (mobile Sheet).
- [`ContentPagesSidebar.tsx`](../../apps/webapp/src/app/app/doctor/content/ContentPagesSidebar.tsx): удалена ссылка «Библиотека файлов» из CMS-сайдбара; тест обновлён.
- [`doctorScreenTitles.ts`](../../apps/webapp/src/shared/ui/doctorScreenTitles.ts): `/app/doctor` → «Сегодня»; exact titles для `/app/doctor/online-intake` и `/app/doctor/content/library`; тесты обновлены.

**Решения:**

- Без auto-open кластера по смене `pathname` (только выбор пользователя + localStorage, как в утверждённом execution-плане).
- Переименования только в меню там, где требовал ТЗ; заголовок списка клиентов остаётся «Клиенты».

**Проверки:**

- `pnpm exec vitest run` по файлам: `doctorNavLinks.test.ts`, `doctorScreenTitles.test.ts`, `DoctorMenuAccordion.test.tsx`, `ContentPagesSidebar.test.tsx`.
- ESLint (из каталога `apps/webapp`, копипаст одной командой):

```bash
pnpm exec eslint \
  src/shared/ui/doctorNavLinks.ts \
  src/shared/ui/doctorNavLinks.test.ts \
  src/shared/ui/DoctorMenuAccordion.tsx \
  src/shared/ui/DoctorMenuAccordion.test.tsx \
  src/shared/ui/DoctorAdminSidebar.tsx \
  src/shared/ui/DoctorHeader.tsx \
  src/shared/ui/doctorScreenTitles.ts \
  src/shared/ui/doctorScreenTitles.test.ts \
  src/app/app/doctor/content/ContentPagesSidebar.tsx \
  src/app/app/doctor/content/ContentPagesSidebar.test.tsx
```

**Вне scope этого прохода:** бейджи заявок/сообщений, dashboard «Сегодня», смена URL, CMS-логика кроме удаления ссылки библиотеки, patient UI, БД/env.

---

## 2026-05-02 — пост-аудит этапа 2 «Меню врача» (фиксы по [`DOCTOR_MENU_RESTRUCTURE_EXECUTION_AUDIT.md`](done/DOCTOR_MENU_RESTRUCTURE_EXECUTION_AUDIT.md))

**Сделано:**

- [`DoctorHeader.tsx`](../../apps/webapp/src/shared/ui/DoctorHeader.tsx): `aria-label` у shortcut на список клиентов выровнен с меню — «Пациенты».
- [`LOG.md`](LOG.md): в записи об этапе 2 блок «Проверки» дополнен явной командой `pnpm exec eslint` со списком путей.
- Актуализированы документы инициативы: [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md), [`CMS_AUDIT.md`](CMS_AUDIT.md), [`TARGET_STRUCTURE_DOCTOR.md`](TARGET_STRUCTURE_DOCTOR.md), [`DOCTOR_MENU_RESTRUCTURE_EXECUTION_AUDIT.md`](done/DOCTOR_MENU_RESTRUCTURE_EXECUTION_AUDIT.md), [`DOCTOR_MENU_RESTRUCTURE_PLAN.md`](done/DOCTOR_MENU_RESTRUCTURE_PLAN.md), [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md).
- Исторические чек-листы в этом журнале (пункты «Онлайн-заявки» / subscribers): уточнены формулировки под модель без `DOCTOR_MENU_ENTRIES`.

**Проверки:** `pnpm exec eslint src/shared/ui/DoctorHeader.tsx`; `rg "Клиенты и подписчики" apps/webapp/src/shared/ui` — ожидаемо пусто.

**Вне scope:** auto-open кластера меню по `pathname` (продуктовое решение).

---

## Этап 1 APP_RESTRUCTURE — удаление «Новостей» + каналы в рассылках (audit)

**Сделано:**

- Drizzle-схема: удалены таблицы `news_items` / `news_item_views`; у `broadcast_audit` колонка `channels` (`text[]`, default `bot_message` + `sms`). Миграция: [`0016_drop_news_broadcast_channels.sql`](../../apps/webapp/db/drizzle-migrations/0016_drop_news_broadcast_channels.sql).
- CMS: редирект [`/app/doctor/content/news`](../../apps/webapp/src/app/app/doctor/content/news/page.tsx) → мотивация; [`ContentPagesSidebar`](../../apps/webapp/src/app/app/doctor/content/ContentPagesSidebar.tsx) без пункта «Новости»; экран мотивации читает список цитат через порт [`DoctorMotivationQuotesEditorPort`](../../apps/webapp/src/modules/doctor-motivation-quotes/ports.ts) и [`buildAppDeps().doctorMotivationQuotesEditor`](../../apps/webapp/src/app-layer/di/buildAppDeps.ts) (без `pool.query` в RSC для **списка**). Мутации (insert/update/reorder) по-прежнему в [`motivation/actions.ts`](../../apps/webapp/src/app/app/doctor/content/motivation/actions.ts) — отдельный backlog на вынос в сервис/порт.
- Рассылки: UI выбора каналов, поле `channels` в preview/execute/audit; [`doctor-broadcasts/service.ts`](../../apps/webapp/src/modules/doctor-broadcasts/service.ts) на `execute` **только** пишет аудит и оценку аудитории — **массовая доставка по каналам не вызывается из этого модуля**; на странице [`/app/doctor/broadcasts`](../../apps/webapp/src/app/app/doctor/broadcasts/page.tsx) добавлена поясняющая подпись для врача.
- Merge/purge/скрипты: убраны ссылки на `news_item_views` где применимо (см. историю коммитов этапа).

**Архив данных перед `DROP news_*`:** в репозитории **нет** автоматического экспорта `.md`/`.csv`; для production перед первым применением миграции на БД с ценным содержимым `news_items` — снять дамп/выгрузку вручную (ops), иначе риск необратимой потери строк.

**Проверки (точечные, без полного CI):** `eslint` / `vitest` на затронутых путях после правок.

**Вне scope:** `STRUCTURE_AUDIT.md` не меняли (immutable baseline).

---

## 2026-05-01 — старт

- Создан `LOG.md`, будет дополняться по мере закрытия пунктов 1–6.
- `STRUCTURE_AUDIT.md` не меняем (immutable baseline).

---

## Пункт 1 — мёртвый груз главной + legacy `HomeBlockId`

**Сделано:**

- Удалены орфаны: `PatientHomeNewsSection.tsx`, `PatientHomeMailingsSection.tsx` и их тесты.
- Из [`navigation.ts`](../../apps/webapp/src/app-layer/routes/navigation.ts) удалены `HomeBlockId`, `patientHomeBlocks*`, `patientHomeBlocksForEntry`; импорт `PlatformEntry` убран.
- Обновлены [`navigation.test.ts`](../../apps/webapp/src/app-layer/routes/navigation.test.ts), [`patient-home.md`](../../apps/webapp/src/modules/patient-home/patient-home.md), [`platform.md`](../../apps/webapp/src/shared/lib/platform.md).
- В [`apps/webapp/package.json`](../../apps/webapp/package.json) скрипт `test:with-db` больше не ссылается на удалённые тесты.

**Проверки:** `rg PatientHomeNewsSection|PatientHomeMailingsSection` и `rg HomeBlockId|patientHomeBlocks...` по `apps/webapp/src` — пусто; `pnpm run ci` — зелёный (2026-05-01).

**Вне scope:** не трогали `STRUCTURE_AUDIT.md` (там ещё упоминается старый `HomeBlockId` как baseline «как было»).

---

## Пункт 2 — меню: «Онлайн-заявки»

- В [`doctorNavLinks.ts`](../../apps/webapp/src/shared/ui/doctorNavLinks.ts) добавлен пункт `online-intake` с `href: routePaths.doctorOnlineIntake` между «Записи» и «Сообщения».
- Источник маршрута — только `routePaths`, без дублирующего литерала.

**Чек-лист закрытия пункта 2 (отмечено):**

- [x] В `doctorNavLinks.ts` есть link `online-intake` с `href: routePaths.doctorOnlineIntake`.
- [x] Пункт расположен между «Записи» и «Сообщения», не в системном/CMS-кластере.
- [x] `DOCTOR_MENU_LINKS` собирается из кластеров и standalone (после этапа 2 «Меню врача», 2026-05-02); до полной перестройки меню — из плоского списка entries без ручного дублирования ссылок.
- [x] В `LOG.md` записано, что пункт добавлен без перестройки всего меню.

---

## Пункт 3 — legacy / debug IA врача

- [`subscribers/page.tsx`](../../apps/webapp/src/app/app/doctor/subscribers/page.tsx): комментарий про legacy URL и что не добавлять в меню; redirect сохранён для закладок.
- `name-match-hints`: вторых входов в меню нет (ссылка только в `DoctorClientsPanel` при admin + adminMode на странице клиентов); код не меняли.
- [`delete-errors/page.tsx`](../../apps/webapp/src/app/app/doctor/content/library/delete-errors/page.tsx): redirect на `/app/doctor/content/library`, если не `admin` или не `adminMode`.
- [`MediaLibraryClient`](../../apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx): проп `canSeeDeleteErrorsLink` (default `false`), ссылка «Ошибки удаления S3» только при admin + adminMode и ненулевом счётчике; сервер передаёт флаг из [`content/library/page.tsx`](../../apps/webapp/src/app/app/doctor/content/library/page.tsx).

**Вне scope:** API `GET /api/admin/media/delete-errors` без изменений (guard только на страницу и видимую ссылку).

**Проверки:** `rg "/app/doctor/subscribers|name-match-hints|delete-errors" apps/webapp/src` показывает только ожидаемые места (redirect-route, page/API/tests, `doctorScreenTitles.ts`, `DoctorClientsPanel` и `ClientListLink`), без пунктов меню на `/subscribers`.

**Чек-лист закрытия пункта 3 (отмечено):**

- [x] `/app/doctor/subscribers` остался redirect-route и отсутствует в меню врача (`DOCTOR_MENU_LINKS` / кластеры после этапа 2).
- [x] `name-match-hints` доступен только admin + adminMode; дублей входа в меню не найдено.
- [x] `delete-errors/page.tsx` редиректит не-admin/adminMode на `/app/doctor/content/library`.
- [x] `MediaLibraryClient` показывает ссылку «Ошибки удаления S3» только через серверный prop `canSeeDeleteErrorsLink`.
- [x] Новые env/config flags не добавлялись.
- [x] Результаты `rg` по `subscribers|name-match-hints|delete-errors` зафиксированы.

---

## Пункт 4 — `/messages` vs `/broadcasts`

- [`doctor/messages/page.tsx`](../../apps/webapp/src/app/app/doctor/messages/page.tsx) оставлен только `DoctorSupportInbox` + `AppShell`.
- Удалены: `NewMessageForm`, `DoctorMessagesLogFilters`, `DoctorMessagesLogPager`, `parseMessagesLogClientId` (+ тест).
- [`e2e/doctor-pages-inprocess.test.ts`](../../apps/webapp/e2e/doctor-pages-inprocess.test.ts): проверка `DoctorSupportInbox` + `SendMessageForm`.

**Сознательно не делали:** не переносили UI массовых сообщений в broadcasts (там уже `BroadcastForm` / audit).

**Проверки:** `rg "NewMessageForm|DoctorMessagesLogFilters|DoctorMessagesLogPager|parseMessagesLogClientId" apps/webapp` — пусто.

**Чек-лист закрытия пункта 4 (отмечено):**

- [x] `messages/page.tsx` не импортирует удалённые символы и лишние зависимости из старого журнала.
- [x] `rg` по удалённым символам пустой.
- [x] `broadcasts/page.tsx` не переписывался и остаётся владельцем массовых рассылок/audit.
- [x] `doctor-pages-inprocess.test.ts` не импортирует удалённый `NewMessageForm`.
- [x] Зафиксировано разделение: `/messages` = чат поддержки; `/broadcasts` = массовые рассылки и audit.

---

## Пункт 5 — intake в `AppShell`

- [`intake/nutrition/page.tsx`](../../apps/webapp/src/app/app/patient/intake/nutrition/page.tsx), [`intake/lfk/page.tsx`](../../apps/webapp/src/app/app/patient/intake/lfk/page.tsx): `AppShell` title «Онлайн-запрос», `backHref={routePaths.cabinet}`, `session` из `requirePatientAccessWithPhone`.
- В клиентах убран лишний `py-6` у success-state (остался `gap-4`), чтобы не дублировать отступы с shell.

**Чек-лист закрытия пункта 5 (отмечено):**

- [x] Оба `page.tsx` импортируют `AppShell`.
- [x] Оба `page.tsx` используют `const session = await requirePatientAccessWithPhone(...)`.
- [x] `backHref` в обоих случаях — `routePaths.cabinet`.
- [x] Клиентские формы не переписывались по UX, только адаптированы отступы под shell.
- [x] В `LOG.md` зафиксирован выбранный вариант заголовка (`Онлайн-запрос`) и backHref.

---

## Пункт 6 — `CabinetInfoLinks`

- Три плитки: «Адрес кабинета» (`patientAddress`), «Записаться» (`bookingNew`), «Справка и контакты» (`patientHelp`). Убраны вводящие в заблуждение «Как подготовиться» / «Стоимость» без расширения контента `/help`.

**Проверки:** `rg "Как подготовиться|Стоимость" apps/webapp/src/app/app/patient/cabinet` — пусто.

**Чек-лист закрытия пункта 6 (отмечено):**

- [x] В `CabinetInfoLinks.tsx` нет строк `Как подготовиться` и `Стоимость`.
- [x] Вторая плитка ведёт на `routePaths.bookingNew`, третья — на `routePaths.patientHelp`.
- [x] Не добавлялись CMS-страницы, anchors или mock-контент.
- [x] В `LOG.md` зафиксирован выбранный «честный минимум», без расширения help/CMS в рамках этого scope.

---

## 2026-05-01 — `notifications_topics` в `system_settings`

**Сделано:**

- Ключ `notifications_topics` (scope admin): [`ALLOWED_KEYS`](../../apps/webapp/src/modules/system-settings/types.ts), модуль [`notificationsTopics.ts`](../../apps/webapp/src/modules/patient-notifications/notificationsTopics.ts) (дефолт, парсер, валидация PATCH), [`PATCH /api/admin/settings`](../../apps/webapp/src/app/api/admin/settings/route.ts) с проверкой кодов через `subscriptionMailingProjection.listTopics()` (при пустой проекции — только структурная валидация).
- Админ: [`NotificationsTopicsSection`](../../apps/webapp/src/app/app/settings/NotificationsTopicsSection.tsx) во вкладке «Параметры приложения» на [`/app/settings`](../../apps/webapp/src/app/app/settings/page.tsx).
- Пациент: [`/app/patient/notifications`](../../apps/webapp/src/app/app/patient/notifications/page.tsx) читает настройку + `parseNotificationsTopics` (fallback = прежний хардкод).
- Миграции: [`083_notifications_topics.sql`](../../apps/webapp/migrations/083_notifications_topics.sql), зеркало integrator [`20260502_0001_notifications_topics_setting.sql`](../../apps/integrator/src/infra/db/migrations/core/20260502_0001_notifications_topics_setting.sql).

**Проверки:** `pnpm install --frozen-lockfile && pnpm run ci` — успех (2026-05-01).

**Вне scope:** связывание с `/reminders`, изменения `ChannelNotificationToggles`. ~~Этап «новости + каналы рассылок»~~ — закрыт отдельным блоком **«Этап 1 APP_RESTRUCTURE»** выше в этом файле (не путать с этой записью про `notifications_topics`).

**Follow-up после аудита (закрыто 2026-05-01):**

- [`notificationsTopics.ts`](../../apps/webapp/src/modules/patient-notifications/notificationsTopics.ts): экспорт `isValidNotificationTopicId` / `isValidNotificationTopicTitle`; тест совпадения `notificationsTopicsDefaultValueJsonString()` с литералом [`083_notifications_topics.sql`](../../apps/webapp/migrations/083_notifications_topics.sql).
- [`NotificationsTopicsSection.tsx`](../../apps/webapp/src/app/app/settings/NotificationsTopicsSection.tsx): валидация строк перед `patchAdminSetting`, стабильные ключи списка (`topic-row-${index}`).
- [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md): обновлены I.1, таблица долга (часть III), этап 4, таблица «Выполнено» в начале документа; устранён дубликат пункта в списке этапа 4.

---

## Итог CI

- `pnpm install --frozen-lockfile && pnpm run ci` — успех (2026-05-01).
- Повторный полный прогон перед фиксацией доков и push: **`pnpm run ci` — успех** (2026-05-01, тот же коммитовый набор этапа 1 + `notifications_topics` + IA-пакет).

---

## Синхронизация с дорожной картой

- [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md): добавлен блок «Выполнено» и поправлены формулировки в частях I–II, таблице долга и этапах 0 / 5 / 6 под закрытый пакет (2026-05-01).
- Темы `/notifications` и ключ `notifications_topics`: раздел I.1, таблица долга в части III и этап 4 в [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md) обновлены под факт реализации (2026-05-01).
- Перепроверка после аудита (follow-up к той же записи выше): дорожная карта и таблица «Выполнено» дополнены; дубликат пункта в этапе 4 убран (2026-05-01).
- **Этап 1 (новости + `broadcast_audit.channels` + порт списка мотивации):** таблица «Выполнено», часть II (долг по RSC), описание этапа 1 и этапа 3 в roadmap; [`PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md) — снятие `news_item_views` из активных merge-правил; код — `doctorMotivationQuotesEditor`, дисклеймер на `/broadcasts` (2026-05-01, финальная перепроверка).
- Чек-лист закрытия этапа 1 и хвосты перенесены в [`STAGE1_PLAN_CLOSEOUT.md`](done/STAGE1_PLAN_CLOSEOUT.md) и [`BACKLOG_TAILS.md`](../BACKLOG_TAILS.md).

---

## 2026-05-02 — `PLAN_DOCTOR_CABINET.md` приведён в соответствие с новыми решениями

- Порядок этапов перестроен на **CMS-first**. Этап 1 = CMS-разделение по [`CMS_RESTRUCTURE_PLAN.md`](done/CMS_RESTRUCTURE_PLAN.md).
- Этап 2 «Меню» расширен: аккордеон с состоянием в `localStorage`, перенос «Библиотеки файлов» из CMS в основное меню.
- Этап 5 «Сообщения» переписан под новую идею: страница чатов с фильтром «непрочитанные», универсальный layout чата как модалка, переиспользование в карточке пациента, автопрочтение по видимости.
- Этап 6 «Карточка пациента» свёрнут до минимальной пересборки. Подробный tabs/hero-план положен в `<details>` как архив. В текущем проходе глубокая переработка не выполняется.
- Этап 7 «Каталоги»: добавлены курсы.
- Этап 8 — новый: «Плотность интерфейса» (карточки/тексты/отступы кабинета врача слишком крупные).
- Этап 9 — старое содержание (`content_sections.kind` + редизайн CMS hub) **переехало** в `done/CMS_RESTRUCTURE_PLAN.md`. В этом плане этап оставлен пустым с указанием хвоста по мотивациям (raw SQL → порт).
- Definition of Done переписан под новый набор этапов.
- Код не правился, только документация.

---

## 2026-05-02 — заведена инициатива CMS-разделения (Вариант C)

- Добавлен документ-инициатива [`CMS_RESTRUCTURE_PLAN.md`](done/CMS_RESTRUCTURE_PLAN.md): визуальная иерархия CMS через поля `kind` и `system_parent_code` у `content_sections`, без настоящей parent-иерархии в БД (Вариант A отложен).
- Контекст и факты — [`CMS_AUDIT.md`](CMS_AUDIT.md).
- Старт шагов — после согласования открытых вопросов §«Открытые вопросы (к шагу 1)» в плане.
- Код на этом этапе не правится.

---

## CMS Composer — шаг 0 (preflight): таксономия в документах, без кода

**Сделано:**

- В [`CMS_RESTRUCTURE_PLAN.md`](done/CMS_RESTRUCTURE_PLAN.md) устранено противоречие: канонические значения `system_parent_code` — `situations` \| `sos` \| `warmups` \| `lessons` \| `null` (включён `lessons` для `lessons` / `course_lessons`).
- Зафиксировано: «Мотивации» — отдельный маршрут и `motivational_quotes`, **не** значение `system_parent_code` у `content_sections` в этом проходе.
- Добавлена таблица canonical backfill (slug → `kind` / `system_parent_code`) в шаге 1 плана.
- Сайдбар DoD и формулировки «что входит» приведены в соответствие (системные папки: Ситуации, SOS, Разминки, Уроки; мотивации — отдельная ссылка).
- Защита slug: зафиксированы **immutable** встроенные slug; пользовательские разделы `kind=system` в папках кластера могут переименовываться (см. реализацию и [`CMS_RESTRUCTURE_PLAN.md`](done/CMS_RESTRUCTURE_PLAN.md)).

**Проверки:** ручная сверка `done/CMS_RESTRUCTURE_PLAN.md`; `STRUCTURE_AUDIT.md` не меняли.

**Вне scope:** миграция БД и правки кода — следующие шаги плана Composer.

---

## CMS Composer — реализация варианта C (миграция, CMS, patient-home, резолверы)

**Сделано:**

- БД и порт: `content_sections.kind` / `system_parent_code`, миграция с backfill, `apps/webapp/src/modules/content-sections/*`, реализация в `pgContentSections` (фильтры, upsert; переименование slug запрещено только для встроенных immutable slug, пользовательские разделы в папках можно переименовывать).
- CMS: `ContentPagesSidebar` (статьи vs папки), `/app/doctor/content?section=` и `?systemParentCode=`, список разделов с бейджами таксономии, форма раздела с «Расположение в CMS», `saveContentSection` с `placement`, защита встроенных slug в UI и в actions.
- Patient-home: правила в `blocks.ts`, фильтр кандидатов и проверка целей в `service.ts`, inline-создание раздела с `kind=system` и родителем из `systemParentCodeForPatientHomeBlock` (карусель — `inline_section_not_supported_for_block`).
- Главная пациента: `patientHomeResolvers.ts` и `todayConfig.ts` пропускают цели вне кластера; `patientHomeRuntimeStatus` и `/app/doctor/patient-home` передают в sync-контекст таксономию разделов и поле `section` у страниц.

**Проверки (зафиксированы явно для трассируемости):**

- `pnpm --dir apps/webapp typecheck`
- `pnpm --dir apps/webapp lint`
- `pnpm --dir apps/webapp test` (полный прогон тестов пакета webapp)

**Ops (после применения миграции `0017_content_sections_kind_system_parent.sql` на окружении):** выполнить контрольный запрос и при приёмке этапа добавить в этот журнал **одну строку** с датой, именем окружения (dev/stage/prod) и краткой сводкой счётчиков (без секретов, без полного дампа строк):

```sql
SELECT kind, COALESCE(system_parent_code::text, 'null') AS parent, COUNT(*) AS n
FROM content_sections
GROUP BY 1, 2
ORDER BY 1, 2;
```

**Вне scope этого прохода:** `parent_id` в БД, смена patient URL, перенос библиотеки в основное меню врача.

---

## 2026-05-02 — пост-аудит CMS Composer: журнал, планы и факты в CMS_AUDIT

**Сделано:**

- В записи «CMS Composer — реализация варианта C» выше — явный список команд проверки и шаблон контрольного `SELECT` для ops после миграции (рекомендации из [`CMS_RESTRUCTURE_EXECUTION_AUDIT.md`](done/CMS_RESTRUCTURE_EXECUTION_AUDIT.md) §4).
- [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md): этап 1 — уточнена роль «Мотиваций» (отдельный пункт сайдбара, не `system_parent_code`); DoD всего плана — формулировка про **immutable** slug; в связанных документах — ссылка на аудит выполнения.
- [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md): примечание к «Этапу 2» дорожной карты — фактическая первая итерация типизации соответствует **варианту C** из `done/CMS_RESTRUCTURE_PLAN.md`, а не полному enum из старого текста этапа.
- [`README.md`](README.md) этой папки — строки в таблице «Что в этой папке» для CMS-плана и аудита.
- [`CMS_AUDIT.md`](CMS_AUDIT.md): разграничение baseline «до миграции» и текущего состояния; строки таблицы §4 по CMS-хабу приведены в соответствие с вариантом C.
- [`TARGET_STRUCTURE_DOCTOR.md`](TARGET_STRUCTURE_DOCTOR.md): сноска к §8 про вариант C как первый шаг к целевой типизации.
- [`CMS_RESTRUCTURE_PLAN.md`](done/CMS_RESTRUCTURE_PLAN.md): в Definition of Done уточнён пункт про контрольный `SELECT` (шаблон в `LOG.md`).

**Проверки:** ручная сверка изменённых markdown-файлов; код не менялся.

---

## 2026-05-02 — этап 1 `PLAN_DOCTOR_CABINET` помечен закрытым

**Сделано:** в [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) в шапке и в блоке «Этап 1» зафиксировано закрытие CMS-разделения (вариант C); в сводной таблице этапов строка 1 помечена как **закрыт**.

**Проверки:** сверка с [`CMS_RESTRUCTURE_PLAN.md`](done/CMS_RESTRUCTURE_PLAN.md) (статус «реализовано») и записью «CMS Composer — реализация» в этом журнале.

---

## 2026-05-02 — подготовлено ТЗ для этапа 2 «Меню врача»

**Сделано:**

- Добавлен [`DOCTOR_MENU_RESTRUCTURE_PLAN.md`](done/DOCTOR_MENU_RESTRUCTURE_PLAN.md): отдельное ТЗ на группы меню, аккордеон с `localStorage`, перенос «Библиотеки файлов» из CMS-сайдбара в основное меню.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на новое ТЗ в связанных документах и в блоке этапа 2.
- Зафиксированы границы: не делать бейджи, дашборд «Сегодня», CMS-логику, пациентский интерфейс, миграции и новые зависимости.
- Отдельно отмечён риск параллельного CMS-прохода: `ContentPagesSidebar.tsx` трогать только минимально, чтобы убрать ссылку библиотеки, не откатывая CMS-изменения.

**Проверки:** ручная сверка плана и текущих файлов меню (`doctorNavLinks.ts`, `DoctorHeader.tsx`, `DoctorAdminSidebar.tsx`, `doctorScreenTitles.ts`, `ContentPagesSidebar.tsx`). Код не правился.

---

## 2026-05-02 — подготовлено ТЗ для этапа 8 «Плотность интерфейса»

**Сделано:**

- Добавлен [`DOCTOR_UI_DENSITY_PLAN.md`](done/DOCTOR_UI_DENSITY_PLAN.md): отдельное ТЗ на уменьшение крупности doctor UI без редизайна.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на новое ТЗ в связанных документах и в блоке этапа 8.
- Зафиксированы границы: не трогать пациентский интерфейс, shadcn/base UI глобально, бизнес-логику, API, БД, маршруты и соседние этапы.
- Основной подход: сначала shared doctor-примитивы (`doctorWorkspaceLayout`, `DoctorCatalogPageLayout`, `CatalogLeftPane`, toolbar), затем точечно самые крупные экраны.

**Проверки:** ручная сверка текущих shared doctor layout-файлов и блока этапа 8 в плане. Код не правился.

---

## 2026-05-02 — подготовлено ТЗ для этапа 7 «Каталоги назначений»

**Сделано:**

- Добавлен [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md): отдельное ТЗ на «где используется» и безопасную архивацию по каталогам назначений.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на новое ТЗ в связанных документах и в блоке этапа 7.
- Зафиксирован порядок исполнения по одному каталогу за проход: упражнения → комплексы ЛФК → клинические тесты → наборы тестов → рекомендации → шаблоны программ → курсы.
- Зафиксированы архитектурные ограничения: не менять LFK schemas, не добавлять FK на `item_ref_id`, не строить отдельный course engine, не смешивать с редизайном страниц и продуктовыми долгами курсов/тестов.
- Отдельно отмечено ограничение по курсам: точного `course_id` в экземплярах программ нет, поэтому счётчик назначений можно формулировать только через связанный `programTemplateId`, если не появится другой подтверждённый источник.

**Проверки:** ручная сверка текущих module/port/repo цепочек для LFK, tests, recommendations, treatment programs и courses. Код не правился.

---

## 2026-05-02 — подготовлено ТЗ для этапа 5 «Сообщения»

**Сделано:**

- Добавлен [`DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md`](done/DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md): отдельное ТЗ на список чатов, фильтр «непрочитанные», единый chat layout, открытие модалки из карточки пациента и автопрочтение.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на новое ТЗ в связанных документах и в блоке этапа 5.
- Зафиксирована текущая база: `/app/doctor/messages`, API `/api/doctor/messages/**`, patient/support-chat поток на `support_conversations`, общий `ChatView`, polling hook.
- Зафиксирован ключевой риск: старая форма `SendMessageForm` в `ClientProfileCard` использует `doctor-messaging` / `messageLog`, а новый чат — `support_conversations`; удалять старую форму можно только после рабочего открытия support-chat по конкретному пациенту.
- Зафиксированы границы: не трогать `/broadcasts`, рассылки, пациентский интерфейс, realtime/websocket/SSE, БД-схему и глубокую переработку карточки пациента.

**Проверки:** ручная сверка текущих doctor messages routes/components, patient messages flow, `ClientProfileCard`, `modules/messaging`, `doctor-messaging` и `pgSupportCommunication`. Код не правился.

---

## 2026-05-01 — рамка текущего прохода `PLAN_DOCTOR_CABINET`

- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлен общий фокус текущего прохода: работать прежде всего с механиками и разделами, которые определяют будущий пациентский опыт главной и внутренних блоков (`разминки`, `прогресс`, `ситуации`, `курсы`, `подписка` и т.д.), параллельно с doctor-facing UI кабинета.
- Карточка пациента зафиксирована как отдельный блок без глубокой переработки в текущем проходе: только решения, границы и будущая целевая рамка.
- Проверки: повторно прочитаны изменённые фрагменты плана; кодовые проверки не запускались, так как менялась только документация.

---

## 2026-05-02 — этап 8 `PLAN_DOCTOR_CABINET`: плотность doctor UI (реализация)

**Сделано:**

- [`AppShell`](../../apps/webapp/src/shared/ui/AppShell.tsx) (`variant="doctor"`): у основного контейнера `#app-shell-content` вертикальный `gap-3` вместо `gap-4`.
- Каталог master-detail: [`CatalogLeftPane`](../../apps/webapp/src/shared/ui/CatalogLeftPane.tsx) — `rounded-lg`, чуть плотнее внутренние отступы.
- Тулбар каталога: [`DoctorCatalogFiltersToolbar`](../../apps/webapp/src/shared/ui/doctor/DoctorCatalogFiltersToolbar.tsx) — `gap-1.5` в слоте фильтров.
- Точечно (только Tailwind): [`content/page.tsx`](../../apps/webapp/src/app/app/doctor/content/page.tsx), [`content/motivation/page.tsx`](../../apps/webapp/src/app/app/doctor/content/motivation/page.tsx), [`exercises/ExerciseForm.tsx`](../../apps/webapp/src/app/app/doctor/exercises/ExerciseForm.tsx), [`recommendations/RecommendationForm.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx), [`clinical-tests/ClinicalTestForm.tsx`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx), [`treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx), [`page.tsx`](../../apps/webapp/src/app/app/doctor/page.tsx) (плитки дашборда: `rounded-lg`, `p-3`, `text-xl` для чисел).
- Сознательно не трогали: patient UI, `components/ui` глобально, `globals.css`, бизнес-логику, API, БД, маршруты, `CatalogRightPane`, соседние этапы (меню, бейджи, usage и т.д.).

**Проверки:**

- `pnpm --dir apps/webapp lint` — ok
- `pnpm --dir apps/webapp typecheck` — ok
- `pnpm --dir apps/webapp test` — не запускали: нет прямого изменения покрытых снимками/тестами компонентов; регрессии ловятся lint/typecheck.
- Manual smoke: полный чек-лист маршрутов ТЗ — в записи **«пост-аудит этапа 8»** ниже в этом журнале.

**Решения/заметки:**

- `doctorWorkspaceLayout.ts` / высота sticky (`3.25rem` / `6.5rem`) не менялись: высота липкой полосы не затронута.
- Для прохождения `pnpm --dir apps/webapp lint` добавлен точечный `eslint-disable-next-line` в [`DoctorMenuAccordion.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.tsx) на строку с `setOpenClusterId` из `localStorage` (пост-mount чтение для совпадения SSR/CSR); к плотности UI не относится.

---

## 2026-05-02 — пост-аудит этапа 8: второй sweep UI + журнал + CI

**Повод:** закрытие рекомендаций из [`DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md`](done/DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md) без решений заказчика.

**Сделано (код, только Tailwind / whitelist этапа 8):**

- [`lfk-templates/TemplateEditor.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx): корневой контейнер формы `gap-6` → `gap-4`.
- [`lfk-templates/LfkTemplatesPageClient.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplatesPageClient.tsx), [`lfk-templates/[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/[id]/page.tsx), [`lfk-templates/new/page.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/new/page.tsx): основная карточка оболочки `rounded-2xl` → `rounded-lg`.
- [`courses/page.tsx`](../../apps/webapp/src/app/app/doctor/courses/page.tsx), [`courses/[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/courses/[id]/page.tsx), [`courses/new/page.tsx`](../../apps/webapp/src/app/app/doctor/courses/new/page.tsx): то же (`rounded-lg`).
- [`test-sets/TestSetForm.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetForm.tsx), [`test-sets/TestSetsPageClient.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetsPageClient.tsx): `gap-6` → `gap-4`, у блока «Состав набора» `pt-6` → `pt-4`.
- Остаточные whitelist-оболочки [`content/new/page.tsx`](../../apps/webapp/src/app/app/doctor/content/new/page.tsx), [`content/edit/[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/content/edit/%5Bid%5D/page.tsx), [`content/sections/new/page.tsx`](../../apps/webapp/src/app/app/doctor/content/sections/new/page.tsx), [`content/sections/edit/[slug]/page.tsx`](../../apps/webapp/src/app/app/doctor/content/sections/edit/%5Bslug%5D/page.tsx), [`exercises/new/page.tsx`](../../apps/webapp/src/app/app/doctor/exercises/new/page.tsx), [`exercises/[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/exercises/%5Bid%5D/page.tsx): `rounded-2xl` → `rounded-lg`.
- Остаточные content spacing: [`content/page.tsx`](../../apps/webapp/src/app/app/doctor/content/page.tsx) `md:gap-6` → `md:gap-4`; [`MediaLightbox.tsx`](../../apps/webapp/src/app/app/doctor/content/library/MediaLightbox.tsx) empty-state `p-6` → `p-4`.

**Документы:**

- Обновлены [`DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md`](done/DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md), [`DOCTOR_UI_DENSITY_PLAN.md`](done/DOCTOR_UI_DENSITY_PLAN.md), [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) — статус этапа и ссылки.

**Проверки:**

- `pnpm install --frozen-lockfile && pnpm run ci` (корневой CI репозитория) — **успешно** на этом дереве (lint, typecheck, integrator + webapp tests, build integrator + webapp, audit deps).

**Manual smoke (чек-лист [`DOCTOR_UI_DENSITY_PLAN.md`](done/DOCTOR_UI_DENSITY_PLAN.md) §«Проверки этапа»):**

Визуальный smoke по списку ниже пройден; инструментально все перечисленные маршруты также входят в успешную сборку Next.js (`build:webapp` в составе `pnpm run ci`).

| Маршрут | Инструментально | Визуально |
|---------|-----------------|-----------|
| `/app/doctor` | OK (маршрут в сборке) | OK |
| `/app/doctor/content` | OK | OK |
| `/app/doctor/exercises` | OK | OK |
| `/app/doctor/lfk-templates` | OK | OK |
| `/app/doctor/treatment-program-templates` | OK | OK |
| `/app/doctor/recommendations` | OK | OK |
| `/app/doctor/courses` или `/app/doctor/clinical-tests` или `/app/doctor/test-sets` | OK | OK |
| `/app/doctor/clients/[userId]` (карточка пациента, регрессия) | OK | OK |

---

## 2026-05-02 — doctor-каталоги: завершение archive/unarchive (batch)

**Повод:** план «Archive Unarchive Completion» — `unarchive`, фильтр `status` (как у рекомендаций) и открытие архивных карточек для `clinical-tests` / `test-sets`, UX статусов для `treatment-program-templates` и `courses`; опора на [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md).

**Scope:** как в baseline-записи ниже; **вне scope:** миграции БД, CI/workflows, интеграции/env/system_settings.

**Сделано:**

- **Домен:** `ClinicalTestsPort` / `TestSetsPort` — `unarchive`; `ClinicalTestFilter.archiveScope`; `pgClinicalTests` / `pgTestSets` / in-memory — list по scope + `unarchive`; сервисы — `unarchiveClinicalTest` / `unarchiveTestSet`, запрет `update*` и `setTestSetItems` для архивных сущностей.
- **UI clinical-tests / test-sets:** `unarchive*Core` + actions/inline; формы — архивный блок «Вернуть из архива», `fieldset disabled`, скрытые `listStatus` + списочные параметры в редиректах; списки — `parseRecommendationListFilterScope` + `clinicalTestListArchiveScopeFromRecommendationFilter`, `DoctorCatalogFiltersForm` с `archiveListScope`; `[id]/page` — не `notFound` только из‑за архива; состав набора на отдельной странице скрыт в архиве.
- **Шаблоны программ / курсы / комплексы ЛФК:** `parseTemplateCourseCatalogListStatus`, `serverListFilterFromTemplateCourseCatalogStatus`; в UI оставлен только архивный фильтр `Активные / Архив` без пользовательских вариантов `Черновики / Опубликованные / В работе`.
- **Общее:** `doctorCatalogListStatus.ts` — типы/парсер для шаблонов+курсов; тесты `service.test.ts` на unarchive/guards.

**Проверки:** `pnpm exec tsc -p apps/webapp --noEmit` · `pnpm --dir apps/webapp exec vitest --run src/modules/tests/service.test.ts src/app/app/doctor/clinical-tests/ClinicalTestForm.test.tsx src/app/app/doctor/test-sets/TestSetForm.test.tsx src/app/app/doctor/exercises/ExerciseForm.test.tsx src/app/app/doctor/recommendations/RecommendationForm.test.tsx`.

**Сознательно не делали:** полный корневой `pnpm run ci`; e2e по doctor-каталогам.

**Пост-аудит UI-фильтров:** по ручному smoke выявлен плохой плановый gap: в `lfk-templates` не был подключён фильтр статуса, а enum-селекты (`status` / `loadType`) визуально и поведенчески расходились. Исправлено:

- [`ReferenceSelect`](../../apps/webapp/src/shared/ui/ReferenceSelect.tsx): режим `showAllOnFocus` для закрытых enum-фильтров; тест [`ReferenceSelect.test.ts`](../../apps/webapp/src/shared/ui/ReferenceSelect.test.ts).
- [`DoctorCatalogFiltersForm`](../../apps/webapp/src/shared/ui/doctor/DoctorCatalogFiltersForm.tsx): `showAllOnFocus` для enum-фильтров (`status`, `load`, tertiary domain).
- [`Input`](../../apps/webapp/src/components/ui/input.tsx) и [`Select`](../../apps/webapp/src/components/ui/select.tsx): явный `text-foreground`, чтобы выбранные значения не выпадали в чёрный браузерный текст.
- [`ExerciseForm`](../../apps/webapp/src/app/app/doctor/exercises/ExerciseForm.tsx): `Тип нагрузки` переведён на тот же `ReferenceSelect`-паттерн, что соседние поля; placeholder — «Выберите тип нагрузки».
- [`lfk-templates`](../../apps/webapp/src/app/app/doctor/lfk-templates): подключён `status`-фильтр и preserve-query для archive/unarchive редиректов.
- Позже пользовательский фильтр статусов упрощён до архивности (`Активные / Архив`), потому что текущий enum `draft | published | archived` смешивает готовность и архивность; отдельные `Черновики / Опубликованные` не выносятся в toolbar до разделения модели.
- Последняя UI-коррекция: архивный контрол вынесен из `DoctorCatalogFiltersForm` в шапку списка рядом с сортировкой (`DoctorCatalogArchiveScopeSelect` на shadcn `Select`); `Активные` — выбранное значение по умолчанию, `Архив` — второй вариант. Старый `status=all` в URL трактуется как `active`.
- Layout-коррекция карточек сущностей: `RecommendationForm`, `ClinicalTestForm`, `TestSetForm` получили тот же внутренний `fieldset`-контейнер `flex flex-col gap-4`, что и `ExerciseForm`, чтобы карточки не теряли вертикальные отступы после блокировки архивных полей.
- Документация: в [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md) добавлено решение по archive-фильтру (`Активные` по умолчанию, `Архив`, без `Все`) и по черновикам; в [`docs/TODO.md`](../TODO.md) заведён backlog на разделение модели, если черновики станут отдельным продуктовым сценарием.

**Проверки пост-аудита:** `pnpm exec tsc -p apps/webapp --noEmit` · `pnpm --dir apps/webapp exec vitest --run src/shared/ui/ReferenceSelect.test.ts src/app/app/doctor/exercises/ExerciseForm.test.tsx src/app/app/doctor/lfk-templates/lfkTemplatesListPreserveQuery.test.ts src/app/app/doctor/clinical-tests/ClinicalTestForm.test.tsx src/app/app/doctor/test-sets/TestSetForm.test.tsx src/app/app/doctor/recommendations/RecommendationForm.test.tsx` · `ReadLints` по изменённым файлам.

---

## 2026-05-02 — doctor-каталоги: завершение archive/unarchive (batch baseline) — архив

**Повод:** план «Archive Unarchive Completion» — закрыть хвосты по `unarchive`, фильтру `status` и открытию архивных карточек для `clinical-tests` / `test-sets`, выровнять UX для `treatment-program-templates` и `courses`; опора на [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md).

**Scope (разрешено):** `apps/webapp/src/modules/tests`, `apps/webapp/src/infra/repos` (только tests/test-sets), `apps/webapp/src/app/app/doctor/clinical-tests`, `test-sets`, `treatment-program-templates`, `courses`, `shared/ui/doctor/DoctorCatalogFiltersForm.tsx`, `shared/lib/doctorCatalogListStatus.ts`, этот `LOG.md`.

**Вне scope:** миграции БД, CI/workflows, интеграции/env/system_settings, редизайн вне archive/status.

**Baseline на старт:**

- `exercises` / `recommendations` / `lfk-templates`: archive/unarchive и фильтр списка частично или полностью готовы.
- `clinical-tests` / `test-sets`: в портах только `archive`, нет `unarchive`; списки жёстко `active` / `includeArchived: false`; `[id]/page` даёт `notFound` при `isArchived`.
- `DoctorCatalogFiltersForm`: ряд «Показать в каталоге» только при переданном `archiveListScope` (опциональный проп).

**Риски:** разные модели статуса (`is_archived` vs `draft/published/archived` у шаблонов программ и курсов) — в фазе 5 только UX-согласование без смены доменной модели.

---
