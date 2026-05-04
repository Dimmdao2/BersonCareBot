# LOG — ASSIGNMENT_CATALOGS_REWORK_INITIATIVE

Формат: дата, этап (B1…B7), что сделано, проверки, решения, вне scope.

Используйте [`LOG_TEMPLATE.md`](LOG_TEMPLATE.md) для новых записей.

---

## 2026-05-04 — Stage D4 (Q2 qualitative в инстансе программы)

**Контекст:** [`STAGE_D4_PLAN.md`](STAGE_D4_PLAN.md), [`AUDIT_STAGE_D4.md`](AUDIT_STAGE_D4.md).

**Сделано:**

- Подтверждён общий путь `patientSubmitTestResult` → `maybeCompleteStageFromItems` без отдельной ветки по `qualitative` в `progress-service`.
- **`scoringAllowsNumericDecisionInference`** в [`progress-scoring.ts`](../../apps/webapp/src/modules/treatment-program/progress-scoring.ts) — единый критерий «можно ли вывести итог из числового score» (те же пороги, что и `inferNormalizedDecisionFromScoring`).
- Снимок набора: [`testSetSnapshotView.ts`](../../apps/webapp/src/modules/treatment-program/testSetSnapshotView.ts) — в разбор строк добавлен **`scoringConfig`** для UI.
- Пациентский UI [`PatientTreatmentProgramDetailClient.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx): для тестов без числовых порогов — обязательный выбор итога (`Select`) + опциональный комментарий; для порогов — прежний ввод `score`.
- Тесты [`progress-service.test.ts`](../../apps/webapp/src/modules/treatment-program/progress-service.test.ts) (qualitative → результат → `completedAt` → завершение этапа; два qualitative в одном наборе; отказ без `normalizedDecision`); [`testSetSnapshotView.test.ts`](../../apps/webapp/src/modules/treatment-program/testSetSnapshotView.test.ts).
- Док: [`api.md`](../../apps/webapp/src/app/api/api.md) (Q2 в описании `test-result`).

**Проверки:** `pnpm --dir apps/webapp exec eslint` (изменённые ts/tsx), `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts src/modules/treatment-program/testSetSnapshotView.test.ts`, `pnpm --dir apps/webapp exec tsc --noEmit`.

---

**Контекст:** убрать хардкод пяти кодов в фильтре/форме; выровнять `reference_items` категории `load_type` с CHECK `lfk_exercises.load_type`. Канон плана и пост-аудит: [`EXERCISE_LOAD_TYPE_FROM_REFS_PLAN.md`](EXERCISE_LOAD_TYPE_FROM_REFS_PLAN.md); копия в [`.cursor/plans/exercise_load_from_refs_bb4eba2e.plan.md`](../../.cursor/plans/exercise_load_from_refs_bb4eba2e.plan.md).

**Сделано:**

- Миграция [`0041_exercise_load_type_reference_align.sql`](../../apps/webapp/db/drizzle-migrations/0041_exercise_load_type_reference_align.sql) + journal; in-memory строки в [`inMemoryReferences.ts`](../../apps/webapp/src/infra/repos/inMemoryReferences.ts).
- Модуль [`exerciseLoadTypeReference.ts`](../../apps/webapp/src/modules/lfk-exercises/exerciseLoadTypeReference.ts), паритет [`exerciseLoadTypeSeedParity.test.ts`](../../apps/webapp/src/modules/lfk-exercises/exerciseLoadTypeSeedParity.test.ts).
- UI: [`DoctorCatalogFiltersForm.tsx`](../../apps/webapp/src/shared/ui/doctor/DoctorCatalogFiltersForm.tsx), [`ExerciseForm.tsx`](../../apps/webapp/src/app/app/doctor/exercises/ExerciseForm.tsx) — `categoryCode=load_type`.
- RSC: [`exercises/page.tsx`](../../apps/webapp/src/app/app/doctor/exercises/page.tsx), [`lfk-templates/page.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/page.tsx); preserve/client: [`lfkTemplatesListPreserveQuery.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/lfkTemplatesListPreserveQuery.ts), [`doctorCatalogClientUrlSync.ts`](../../apps/webapp/src/shared/lib/doctorCatalogClientUrlSync.ts), [`clinicalTestsListPreserveParams.ts`](../../apps/webapp/src/app/app/doctor/clinical-tests/clinicalTestsListPreserveParams.ts).
- Сохранение: [`actionsShared.ts`](../../apps/webapp/src/app/app/doctor/exercises/actionsShared.ts) (`saveDoctorExerciseCore`).
- [`exerciseLoadTypeOptions.ts`](../../apps/webapp/src/modules/lfk-exercises/exerciseLoadTypeOptions.ts) — лейблы от сида; `EXERCISE_LOAD_TYPE_OPTIONS` помечен deprecated, производный от сида.

**Пост-аудит (код):** из типа `searchParams` [`treatment-program-templates/page.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/page.tsx) убран неиспользуемый `load` (каталог шаблонов программ фильтр по нагрузке не использует).

**Вне темы плана (стабильность тестов):** [`patient-program-actions.test.ts`](../../apps/webapp/src/modules/treatment-program/patient-program-actions.test.ts) — fake timers вокруг toggle чек-листа (`inMemoryProgramActionLog` использует реальный `Date` для `createdAt`).

**Проверки:** `pnpm --dir apps/webapp exec vitest run` (целевые файлы load type / preserve / filters), `pnpm --dir apps/webapp exec tsc --noEmit`.

---

## 2026-05-03 (defer-closure code) — DROP `scoring_config`, UX B1/B4/B6

**B1 (колонка):** миграция [`0040_drop_tests_scoring_config.sql`](../../apps/webapp/db/drizzle-migrations/0040_drop_tests_scoring_config.sql), обновлены Drizzle-схема и слой приложения без `scoring_config` на `tests`; снимок набора в программе по-прежнему кладёт в JSON ключа `scoringConfig` значение из колонки **`scoring`** (`pgTreatmentProgramItemSnapshot`) для `progress-service`.

**C (аудиты):** toast при явно невалидных `?arch=` / `?pub=` — [`DoctorCatalogInvalidPubArchToast.tsx`](../../apps/webapp/src/shared/ui/doctor/DoctorCatalogInvalidPubArchToast.tsx) + LFK / test-sets / шаблоны программ; standalone рекомендации — preserve фильтров каталога в redirect после save/archive/unarchive и на `/recommendations/[id]` через query + [`appendRecommendationsCatalogFiltersToSearchParams`](../../apps/webapp/src/app/app/doctor/recommendations/recommendationsListPreserveParams.ts); список шаблонов программ — поле **`listPreviewMedia`** (первый item по порядку этапов; SQL в `pgTreatmentProgram.listTemplates`).

**Аудит follow-up (доки + мелкий код):** синхронизированы [`AUDIT_STAGE_B1.md`](AUDIT_STAGE_B1.md), [`AUDIT_STAGE_B4.md`](AUDIT_STAGE_B4.md), [`AUDIT_STAGE_B6.md`](AUDIT_STAGE_B6.md), уточнение §B6 в [`ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md); standalone `saveRecommendation` редирект с list-preserve query; при ошибке archive без id — redirect на список с preserve.

**Проверки:** `pnpm --dir apps/webapp exec vitest run` (целевые наборы + каталог шаблонов), `pnpm --dir apps/webapp exec tsc --noEmit`.

---

## 2026-05-04 (V) — FILTER URL: решения владельца, preserve unit-тесты, план закрыт

**Решения (зафиксировано):** каталог **шаблонов программ** не трогать; **историю коммитов** не переписывать; **рефакторинг имён `regionRefId`** не делать — в URL/query-layer только **`region`** (код).

**Сделано:**

- Pure helpers + vitest: **`recommendationsListPreserveParams.ts`** / **`.test.ts`**, **`clinicalTestsListPreserveParams.ts`** / **`.test.ts`**; `actionsInline` переведены на вызов этих функций (как у test-sets).
- **[`FILTER_URL_CONTRACT_FIX_PLAN.md`](FILTER_URL_CONTRACT_FIX_PLAN.md):** статус **завершён**, чеклисты Steps 1–6 отмечены `[x]`, сноска по исключению **`load`** у test-sets в Step 5.
- **[`AUDIT_FILTER_URL_CONTRACT_FIX.md`](AUDIT_FILTER_URL_CONTRACT_FIX.md):** residual (TP, m4, backlog preserve) приведён к решениям владельца; §7 mapping обновлён.

**Проверки:** `pnpm --dir apps/webapp exec vitest run` (7 файлов, **23** теста), `eslint` на новых/changed ts, `pnpm --dir apps/webapp exec tsc --noEmit`.

---

## 2026-05-04 (IV) — FILTER URL: пост-аудит, синхронизация стадийных доков

**Контекст:** закрытие хвостов независимого аудита против [`FILTER_URL_CONTRACT_FIX_PLAN.md`](FILTER_URL_CONTRACT_FIX_PLAN.md) — устаревшие упоминания `invalidRegionQuery`/баннера региона в стадийных AUDIT; дополнение residual в [`AUDIT_FILTER_URL_CONTRACT_FIX.md`](AUDIT_FILTER_URL_CONTRACT_FIX.md).

**Сделано (docs-only):**

- [`AUDIT_STAGE_D3.md`](AUDIT_STAGE_D3.md): §1 summary, §3 таблица `region`, оговорки паритета, §5 регрессия B4 (две строки: `domain` / `region`), §9 Final DoD.
- [`AUDIT_STAGE_B4.md`](AUDIT_STAGE_B4.md): §1, §2 evidence SSR, §9 smoke, §10 medium, §13 таблица FIX (уточнение по баннеру региона), новый §**15** про док-синхронизацию.
- [`AUDIT_FILTER_URL_CONTRACT_FIX.md`](AUDIT_FILTER_URL_CONTRACT_FIX.md): §Residual — барьер **полного CI** перед push; строка про синхронизацию B4/D3; backlog optional preserve-тестов для rec/clinical.

**Код не менялся.**

---

## 2026-05-04 (III) — FILTER URL tails (region unify + test-sets `load`)

**Контекст:** план «FILTER URL tails fix» — без отдельного UX для UUID/мусора в `?region=`; убрать мёртвую ось `load` у **test-sets**; усилить тесты и синхронизировать [`AUDIT_FILTER_URL_CONTRACT_FIX.md`](AUDIT_FILTER_URL_CONTRACT_FIX.md).

**Сделано:**

- **`parseDoctorCatalogRegionQueryParam`:** только `{ regionCode }`; lower-case + sanity-токен; UUID и невалидный токен → `undefined` (как «Все регионы»), без **`invalidRegionQuery`**.
- **`doctorCatalogClientUrlSync` / `useDoctorCatalogClientFilterMerge` / `parseRecommendationCatalogSsrQuery`:** убран флаг и поле **`invalidRegionQuery`**; баннеры региона удалены из клиентов каталогов (exercises, recommendations, clinical-tests, lfk-templates, test-sets) и из SSR props.
- **test-sets:** убраны `load` из `page` searchParams, `filters`, preserve (**`TestSetForm`** hidden `listLoad`), **`actionsInline`**; вынесено **`appendTestSetsListPreserveToSearchParams`** (`testSetsListPreserveParams.ts`) + **`testSetsListPreserveParams.test.ts`**.
- **Тесты:** обновлены region/SSR/sync; **`DoctorCatalogFiltersForm.test.tsx`** — mock `ReferenceSelect` с `onChange`, assert `region=spine` + `load=strength`; spy на **`replaceState`** без noop (jsdom накапливает query).

**Проверки:** `pnpm --dir apps/webapp exec eslint` (перечень в аудите III), `vitest run` (5 файлов, 19 тестов), `pnpm --dir apps/webapp exec tsc --noEmit`. **Корневой `pnpm run ci` не запускался.**

**Доки:** [`AUDIT_FILTER_URL_CONTRACT_FIX.md`](AUDIT_FILTER_URL_CONTRACT_FIX.md) — закрыты minor m2/m3/m5, блок **Tails fix verification**.

---

## 2026-05-04 — Решения владельца: DROP `scoring_config`, пауза D5, D4/E2E

**Контекст:** зафиксировать последние продуктовые/инженерные решения в канонических документах.

**Решения:**

1. **`clinical_tests.scoring_config`:** колонка **не нужна** — планируется миграция `DROP` + удаление fallback в коде (см. [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §7, §8.2).
2. **D5 (`recommendations.domain` → `kind`):** этап **отложен** (owner pause); см. [`STAGE_D5_PLAN.md`](STAGE_D5_PLAN.md), [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §7/§8.2.
3. **D4 (qualitative в инстансе программы):** **продуктового выбора не требуется** — канон Q2 в ТЗ §8.2; D4 остаётся техпроверкой/UI/API/тестами; см. [`STAGE_D4_PLAN.md`](STAGE_D4_PLAN.md) §0.
4. **E2E:** расширение обязательного Playwright/CI **не** планируется; приёмка — ручной smoke; автотесты e2e — только для стабилизированного UI по отдельному решению (см. [`DEFER_CLOSURE_MASTER_PLAN.md`](DEFER_CLOSURE_MASTER_PLAN.md) §2 out of scope, продуктовый план §8.2).

**Сделано (docs):** обновлены [`DEFER_CLOSURE_MASTER_PLAN.md`](DEFER_CLOSURE_MASTER_PLAN.md), [`STAGE_D4_PLAN.md`](STAGE_D4_PLAN.md), [`STAGE_D5_PLAN.md`](STAGE_D5_PLAN.md), [`STAGE_D6_PLAN.md`](STAGE_D6_PLAN.md), [`PROMPTS_DEFER_CLOSURE_STAGES.md`](PROMPTS_DEFER_CLOSURE_STAGES.md), [`../BACKLOG_TAILS.md`](../BACKLOG_TAILS.md), продуктовое ТЗ §7/§8.2.

**Код не менялся.**

---

## 2026-05-04 — Defer docs sync (D1–D3 completion)

**Контекст:** синхронизация документов defer-wave после подтверждения завершённых этапов `D1`/`D2`/`D3` (аудиты `PASS`) и устранение рассинхрона checklist/backlog.

**Сделано (docs-only):**

- [`STAGE_D3_PLAN.md`](STAGE_D3_PLAN.md) §5: checklist переведён в `[x]` по факту закрытия этапа.
- [`DEFER_CLOSURE_MASTER_PLAN.md`](DEFER_CLOSURE_MASTER_PLAN.md): добавлен статус-срез `D1–D6` (`D1–D3 done`, `D4–D6 pending`).
- Продуктовый план [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §7: три defer-пункта отмечены как **сделано** с ссылками на `STAGE_D1/D2/D3` и `AUDIT_STAGE_D1/D2/D3`.

**Проверки:** `rg`-сверка ссылок/статусов в обновлённых документах.

**Код не менялся.**

---

## 2026-05-04 (II) — FILTER URL CONTRACT FIX — closure M1/M2

**Контекст:** закрытие Major из [`AUDIT_FILTER_URL_CONTRACT_FIX.md`](AUDIT_FILTER_URL_CONTRACT_FIX.md).

**Сделано:**

- **`DoctorCatalogFiltersForm`:** вместо `router.replace` — `history.replaceState` + `dispatchDoctorCatalogUrlSync` (`doctorcatalog:urlsync`).
- **`doctorCatalogClientUrlSync.ts`:** чтение клиентского среза URL; **`appendRegionParamFromListPreserve`** для preserve redirect (UUID → не писать `region`).
- **`useDoctorCatalogClientFilterMerge`:** объединение server scope (`listStatus`, invalid flags, pub/arch) с актуальными q/region/load/titleSort/domain/assessment из `window.location`.
- **Страницы SSR:** `recommendations/page.tsx` и `clinical-tests/page.tsx` — полный список по archive без server-side `domain` / `assessmentKind`; фильтрация этих осей на клиенте через расширение **`useDoctorCatalogDisplayList`** (`tertiaryCode` / `getItemTertiaryCode`).
- **Клиенты каталогов:** подключён merge-hook (exercises, recommendations, clinical-tests, lfk-templates, test-sets, treatment-program-templates).
- **Inline actions:** recommendations / clinical-tests / test-sets — preserve региона через **`appendRegionParamFromListPreserve`**.
- **Тесты:** `doctorCatalogClientUrlSync.test.ts`; доп. кейс tertiary в `useDoctorCatalogDisplayList.test.ts`; `DoctorCatalogFiltersForm.test.tsx` переведён на assert по `history.replaceState`.

**Проверки:** `pnpm --dir apps/webapp exec eslint` (изменённые файлы), `vitest run` (три целевых файла, 9 тестов), `pnpm --dir apps/webapp exec tsc --noEmit`. **Корневой `pnpm run ci` не запускался.**

**Residual:** Minor m1–m4 как в обновлённом аудите; TP без region/load в панели — без изменений.

---

## 2026-05-04 — FILTER URL CONTRACT FIX (doctor catalog list)

**Контекст:** [`FILTER_URL_CONTRACT_FIX_PLAN.md`](FILTER_URL_CONTRACT_FIX_PLAN.md) — `?region=` только как `reference_items.code`; без UUID fallback и без `regionRefId` в query; `q` / `region` / `load` / `titleSort` не передаются в server `list*`; `view` — только UI-state.

**Сделано:**

- **`parseDoctorCatalogRegionQueryParam`** (`shared/lib/doctorCatalogRegionQuery.ts`) + unit-тест.
- **`parseRecommendationCatalogSsrQuery`:** убран `regionRefIdForList`; `regionCodeForCatalog` для клиента (на 2026-05-04 III: без отдельного флага `invalidRegionQuery` — см. запись III в этом логе).
- **Страницы SSR:** exercises, recommendations, clinical-tests, lfk-templates, test-sets — list-вызовы без `search`/`regionRefId`/`loadType` где применимо; `body_region` → `bodyRegionIdToCode` для клиента.
- **`useDoctorCatalogDisplayList`:** опции `regionCode` + `loadType` + резолверы; unit-тест.
- **`DoctorCatalogFiltersForm`:** `regionCode`, `ReferenceSelect` с `valueMatch="code"`; `showRegionFilter` / `showLoadFilter` (test-sets без load; treatment program без region/load в панели).
- **Клиенты:** client-side фильтрация по региону из URL (на 2026-05-04 III: без баннера при UUID/мусоре в `region` — см. запись III).
- **Treatment program templates:** убрана серверная трактовка `region`/`load` для списка; панель — только поиск + `titleSort` + pub/arch через `catalogPubArch`.
- **Preserve:** `listRegion` в формах — **код** (`regionCode`); `lfkTemplatesListPreserveQuery` — `regionCode`, sanitize отсекает UUID.
- **`pgTestSets` / in-memory:** вложенный `test` включает `bodyRegionId` для клиентского фильтра по региону.

**Проверки (целевые):** `pnpm --dir apps/webapp exec eslint` (изменённые файлы), `vitest run` (целевые тесты), `pnpm --dir apps/webapp exec tsc --noEmit`.

**Residual risks:** каталог шаблонов программ не фильтрует по `region`/`load` (в списке нет состава элементов); `GET /api/doctor/recommendations` и др. API по-прежнему могут ожидать UUID для `region` — контракт только для **страниц** каталога врача.

**Вне scope:** patient UI, assignment runtime, миграции БД, create/edit FK форм (кроме hidden preserve `listRegion`).

---

## 2026-05-03 — Stage D2 — FIX (`AUDIT_STAGE_D2` MANDATORY)

**Контекст:** закрытие обязательных пунктов [`AUDIT_STAGE_D2.md`](AUDIT_STAGE_D2.md) после аудита D2.

**Сделано:**

- **FIX-D2-M1:** `updateClinicalTest` — если `assessmentKind` после trim совпадает с уже сохранённым в строке, проверка по справочнику не выполняется (read tolerant + сохранение без принудительной смены legacy). Тесты в `service.test.ts`. Подсказка под селектом в `ClinicalTestForm.tsx`.
- **FIX-D2-M2:** комментарий «три файла» в `clinicalTestAssessmentKind.ts` + vitest `clinicalAssessmentKindSeedParity.test.ts` (SQL `0038` ↔ `CLINICAL_ASSESSMENT_KIND_SEED_V1` ↔ in-memory).
- **FIX-D2-M3:** `POST /api/doctor/clinical-tests` — опциональный `assessmentKind` в Zod и теле `createClinicalTest`; `route.test.ts`; `api.md`.
- **Документация:** `AUDIT_STAGE_D2.md` (verdict PASS, §9–10 closure), `STAGE_D2_PLAN.md` §5 чеклист `[x]`.

**Проверки (целевые):** vitest (список в `AUDIT_STAGE_D2.md` §11), eslint по затронутым файлам, `pnpm run typecheck` в `apps/webapp`.

**Вне scope:** полный корневой `pnpm run ci`.

---

## 2026-05-03 — Stage D2 — `assessmentKind` как системный справочник БД (Q1)

**Сделано:**

- **Миграция `0038_clinical_assessment_kind_reference`:** категория `clinical_assessment_kind` + сид 8 кодов v1 в `reference_items` (`ON CONFLICT DO NOTHING`).
- **In-memory:** та же категория и строки в `inMemoryReferencesPort` для Vitest/dev.
- **Домен:** `clinicalTestAssessmentKind.ts` — `assessmentKindWriteAllowSet`, DTO для фильтра, `buildClinicalAssessmentKindSelectOptions` (read tolerant для legacy-кода), `assessmentKindDisplayTitle`.
- **`createClinicalTestsService(port, references)`:** асинхронная валидация `assessmentKind` при create/update по справочнику; `buildAppDeps` передаёт `referencesPort`.
- **UI:** страница каталога, split-form, `new`/`[id]` — опции из БД; фильтр `?assessment=` и API `GET` — строгая проверка по allowlist.
- **actionsShared:** дублирующая проверка enum убрана (источник правды — сервис).
- **Документация:** `apps/webapp/src/app/api/api.md`.
- **Тесты:** `clinicalTestAssessmentKind.test.ts`, доп. кейсы в `service.test.ts`.

**Проверки (целевые):** `pnpm exec eslint …`, `pnpm exec vitest --run` (указанные файлы), `pnpm exec tsc --noEmit` в `apps/webapp` — см. выполнение в сессии.

**Вне scope:** полный корневой `pnpm run ci`; UI управления справочником в админке (reuse общего контура references при необходимости позже).

---

## 2026-05-03 — Stage D1 — FIX (`AUDIT_STAGE_D1`)

**Контекст:** артефакт [`AUDIT_STAGE_D1.md`](AUDIT_STAGE_D1.md) отсутствовал в дереве до FIX; независимая сверка с [`STAGE_D1_PLAN.md`](STAGE_D1_PLAN.md) показала незакрытый объём D1 в коде.

**Сделано:**

- **API:** `PATCH /api/doctor/measure-kinds` — полное сохранение `{ items: [{ id, label, sortOrder }] }`; валидация Zod; ошибки домена **`422`** (как у `POST`).
- **Домен:** `saveMeasureKindsOrderAndLabels` в сервисе + порт; реализации **pg** (транзакция `UPDATE`) и **in-memory**.
- **UI врача:** `/app/doctor/references/measure-kinds` — DnD + правка подписей + «Добавить» через `POST`; ссылка в сайдбаре справочников (`ReferencesSidebar` + `layout`).
- **Форма клин. теста:** порядок опций combobox по **`sortOrder`** с API; подписка на `MEASURE_KINDS_CATALOG_CHANGED_EVENT` + refetch после сохранения каталога / локального `POST` create.
- **Документация:** [`api.md`](../../apps/webapp/src/app/api/api.md); создан **[`AUDIT_STAGE_D1.md`](AUDIT_STAGE_D1.md)** (verdict **PASS**, minor deferred §5).
- **Тесты:** [`measureKindsService.test.ts`](../../apps/webapp/src/modules/tests/measureKindsService.test.ts).

**Проверки (целевые, без полного `pnpm run ci`):** команды — §6 в [`AUDIT_STAGE_D1.md`](AUDIT_STAGE_D1.md).

**Результат:** vitest (`measureKindsService.test.ts`) / eslint (список в AUDIT §6) / `tsc --noEmit` — **PASS**.

**Вне scope:** merge/dedup; колонка `is_active` для `measure_kinds`; полный CI перед push.

---

## 2026-05-03 — Stage D1 — FIX follow-up (MANDATORY `AUDIT_STAGE_D1`)

**Контекст:** закрытие инструкций **§9 MANDATORY** в [`AUDIT_STAGE_D1.md`](AUDIT_STAGE_D1.md) после аудита по [`STAGE_D1_PLAN.md`](STAGE_D1_PLAN.md).

**Сделано:**

- **`MeasureKindsTableClient`:** безопасный разбор ответа `readMeasureKindsJsonBody` (текст + JSON; не-JSON при ошибке не маскируется как «сбой сети»); флаги **`saveBusy` / `addBusy`** для блокировки кнопок и полей на время мутации и `router.refresh`.
- **UI smoke:** [`MeasureKindsTableClient.test.tsx`](../../apps/webapp/src/app/app/doctor/references/measure-kinds/MeasureKindsTableClient.test.tsx) — пустая подпись без `PATCH`, `422` с телом JSON, `502` с plain text, успешный `PATCH` + `dispatchEvent` + `router.refresh`.
- **Unit:** идемпотентный `createMeasureKindFromLabel` при совпадении нормализованного `code` в [`measureKindsService.test.ts`](../../apps/webapp/src/modules/tests/measureKindsService.test.ts).
- **Docs:** [`STAGE_D1_PLAN.md`](STAGE_D1_PLAN.md) §5 — чеклист `[x]`; [`AUDIT_STAGE_D1.md`](AUDIT_STAGE_D1.md) — **PASS**, §10 FIX closure, defer E2E / cross-combobox в §7.

**Проверки (целевые):** см. §8 в [`AUDIT_STAGE_D1.md`](AUDIT_STAGE_D1.md) — **vitest / eslint / tsc: PASS**.

**Вне scope:** полный `pnpm run ci`; Playwright E2E.

---

## 2026-05-03 — Defer closure planning wave (Q1/Q2/Q3/Q4/Q6)

**Контекст:** после независимого аудита пользователь зафиксировал дополнительные продуктовые решения по defer-хвостам.

**Сделано (docs):**

- Продуктовый план [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md):
  - обновлены §5 (статусы Q1–Q7),
  - обновлён §7 backlog с учётом решений «не делаем»,
  - добавлен журнал решений §8.2.
- [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md): добавлены уточнения Q1/Q2/Q6, обновлены формулировки Q3/Q4, переработан блок открытых инженерных подтверждений.
- Добавлен отдельный контур планирования defer-wave:
  - [`DEFER_CLOSURE_MASTER_PLAN.md`](DEFER_CLOSURE_MASTER_PLAN.md),
  - [`STAGE_D1_PLAN.md`](STAGE_D1_PLAN.md) … [`STAGE_D6_PLAN.md`](STAGE_D6_PLAN.md),
  - [`PROMPTS_DEFER_CLOSURE_STAGES.md`](PROMPTS_DEFER_CLOSURE_STAGES.md) с раздельными prompt-блоками `EXEC` / `AUDIT` / `FIX` по каждому этапу.
- [`README.md`](README.md) инициативы синхронизирован с новыми D-артефактами.

**Код не менялся.**

---

## 2026-05-03 — Документация: закрытие замечаний независимого аудита

**Контекст:** расхождения между планами/ТЗ и фактом выполнения; незакоммиченные `AUDIT_GLOBAL.md` / `AUDIT_PREPUSH_POSTFIX.md`.

**Сделано:**

- Чеклисты §6 закрыты в [`STAGE_B1_PLAN.md`](STAGE_B1_PLAN.md), [`STAGE_B2_PLAN.md`](STAGE_B2_PLAN.md), [`STAGE_B3_PLAN.md`](STAGE_B3_PLAN.md).
- Продуктовое ТЗ [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §4: строка B1 — миграция `test_sets.publication_status` + shared lib/UI.
- [`README.md`](README.md), [`MASTER_PLAN.md`](MASTER_PLAN.md) §7, [`EXECUTION_AUDIT_TEMPLATE.md`](EXECUTION_AUDIT_TEMPLATE.md), [`PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`](PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md), [`../README.md`](../README.md) — канон итогового аудита: [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md), pre-push: [`AUDIT_PREPUSH_POSTFIX.md`](AUDIT_PREPUSH_POSTFIX.md).
- [`AUDIT_STAGE_B6.md`](AUDIT_STAGE_B6.md) §11 DoD: пункт про полный CI согласован с записью в `AUDIT_PREPUSH_POSTFIX.md` §1.

**Код не менялся.**

---

## 2026-05-03 — Bootstrap

Создан execution-контур: [`README.md`](README.md), [`MASTER_PLAN.md`](MASTER_PLAN.md), [`STAGE_B1_PLAN.md`](STAGE_B1_PLAN.md) … [`STAGE_B7_PLAN.md`](STAGE_B7_PLAN.md), шаблоны лога и аудита. Код не менялся.

Синхронизация ссылок: [`../APP_RESTRUCTURE_INITIATIVE/README.md`](../APP_RESTRUCTURE_INITIATIVE/README.md), [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §6, [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md), [`../PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md`](../PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md), [`../README.md`](../README.md), [`../APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md`](../APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md) §«Этап 9»; запись в [`../APP_RESTRUCTURE_INITIATIVE/LOG.md`](../APP_RESTRUCTURE_INITIATIVE/LOG.md).

---

## 2026-05-03 — Планы + промпты (Git/CI дисциплина)

- Во все `STAGE_B1`…`B7` добавлен единый блок дисциплины (коммит после EXEC/FIX; пуш пачками после **B3, B6, B7**; CI — см. `MASTER_PLAN` §9).
- `MASTER_PLAN.md` §9: коммиты, ритм пуша, step/phase CI, **запрет** `pnpm run ci` на каждый коммит; перед пушем полный CI; при падении — `ci:resume:*` (ссылки на `.cursor/rules/test-execution-policy.md`, `pre-push-ci.mdc`).
- Этапные планы уточнены под `PRE_IMPLEMENTATION_DECISIONS` (B1 `status`/test_sets, B2 Q*, B3 Q5+dnd-kit, B4 Q3/Q4, B5 «глаз», B7 `lfk_complex_exercises.local_comment`).
- Новый [`PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`](PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md); обновлён [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md) (ссылка на промпты и §9).
- `LOG_TEMPLATE.md`: контекст Git/CI, чекбокс коммита, правка формулировки B6.

---

## 2026-05-03 — Корректировка решений (B1/test_sets, B6 vs A, Q5)

- По решению пользователя обновлено: **B1** сразу включает публикационный статус для `test_sets` + два соседних фильтра в UI (`active/archived` и `all/draft/published`).
- **Q5** закрыт в сторону удаления UUID-textarea без fallback.
- **B6**: добавлен обязательный pre-check текущего состояния конструктора после завершения фазы A перед EXEC B6.
- Документы синхронизированы: `PRE_IMPLEMENTATION_DECISIONS.md`, `MASTER_PLAN.md`, `STAGE_B1_PLAN.md`, `STAGE_B3_PLAN.md`, `STAGE_B6_PLAN.md`, `PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`, и продуктовое ТЗ `../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`.

---

## 2026-05-03 — Detail pass: планы, чек-листы, промпты

- Углублены этапные планы `STAGE_B2_PLAN.md`, `STAGE_B4_PLAN.md`, `STAGE_B5_PLAN.md`, `STAGE_B7_PLAN.md`: добавлены контракты данных, декомпозиция реализации, negative-path проверки, расширенный DoD.
- В `LOG_TEMPLATE.md` добавлен блок stage-specific completeness checks и явная фиксация smoke-результатов.
- `PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md` синхронизирован с детализацией этапов (B2/B4/B5/B7), чтобы агент не пропускал критические проверки в AUDIT/FIX.

---

## 2026-05-03 — Stage B1 — EXEC (публикация × архив, test_sets)

**Контекст:** `STAGE_B1_PLAN.md`, `PRE_IMPLEMENTATION_DECISIONS.md`, продуктовое ТЗ §3 B1.

**Сделано:**

- Drizzle `0033_test_sets_publication_status`: колонка `publication_status` (`draft`|`published`), CHECK, индекс `(is_archived, publication_status)`; схема `db/schema/clinicalTests.ts`.
- Парсинг query `arch` × `pub` + legacy `status`/`scope`: `doctorCatalogListStatus.ts`; билдеры фильтров для ЛФК, шаблонов программ, наборов тестов.
- UI `CatalogStatusFilters` + `DoctorCatalogListSortHeader` (`catalogPubArch`); подключено к спискам ЛФК, шаблонов программ, наборов тестов.
- Репозитории: `pgTestSets` / `inMemoryTestSets` — фильтр `publicationScope`, CRUD `publicationStatus`; `pgLfkTemplates` — `statusIn` для «все кроме архива».
- Форма набора: выбор публикации, preserve `listArch`/`listPub` в редиректах (`actionsInline` / `actionsShared`).
- `lfkTemplatesListPreserveQuery` переведён на `listPubArch`; тесты парсера/билдеров/preserve.

**Проверки:** `eslint` по затронутым файлам; `vitest run` на `doctorCatalogListStatus.test.ts`, `lfkTemplatesListPreserveQuery.test.ts`, `TestSetForm.test.tsx`; `pnpm exec tsc --noEmit` в `apps/webapp`.

**Вне scope:** курсы (`courses/page.tsx`) — прежний одноосевый `status`; клинические тесты / рекомендации / упражнения — без оси публикации.

---

## 2026-05-03 — Stage B1 — FIX (AUDIT_STAGE_B1)

**Контекст:** [`AUDIT_STAGE_B1.md`](AUDIT_STAGE_B1.md) (critical: GET-форма теряла `arch`/`pub`; major: picker шаблона программ и `GET /api/doctor/test-sets` без публикации; minor: терминология + deferred toast для мусорных query).

**Сделано:**

- `DoctorCatalogFiltersForm`: hidden `arch`/`pub` при ненулевых осях; проп `catalogPubArch` с трёх `*PageClient`.
- `treatment-program-templates/page.tsx`: `listTestSets({ archiveScope: "active", publicationScope: "published" })` для библиотеки наборов.
- `GET /api/doctor/test-sets`: query `arch`, `publicationScope` (+ legacy `includeArchived`); `testSetListFilterFromDoctorApiGetQuery` в `doctorCatalogListStatus.ts`; `api.md`.
- Доки: `PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`, `STAGE_B1_PLAN.md` (`publication_status`); AUDIT обновлён до **PASS**, §13 FIX, mandatory помечены выполненными.

**Проверки (целевые B1, не полный `ci`):**

```bash
cd apps/webapp && pnpm exec eslint \
  src/shared/ui/doctor/DoctorCatalogFiltersForm.tsx \
  src/shared/ui/doctor/DoctorCatalogFiltersForm.test.tsx \
  src/app/app/doctor/lfk-templates/LfkTemplatesPageClient.tsx \
  src/app/app/doctor/treatment-program-templates/TreatmentProgramTemplatesPageClient.tsx \
  src/app/app/doctor/test-sets/TestSetsPageClient.tsx \
  src/app/app/doctor/treatment-program-templates/page.tsx \
  src/app/api/doctor/test-sets/route.ts \
  src/shared/lib/doctorCatalogListStatus.ts \
  src/shared/lib/doctorCatalogListStatus.test.ts
pnpm exec vitest run \
  src/shared/lib/doctorCatalogListStatus.test.ts \
  src/app/app/doctor/lfk-templates/lfkTemplatesListPreserveQuery.test.ts \
  src/app/app/doctor/test-sets/TestSetForm.test.tsx \
  src/shared/ui/doctor/DoctorCatalogFiltersForm.test.tsx
pnpm exec tsc --noEmit
```

**Результат:** eslint / vitest / tsc — **PASS** (после stub `fetch` в `DoctorCatalogFiltersForm.test.tsx` для `ReferenceSelect` / `body_region`).

---

## 2026-05-03 — Stage B2 + B2.5 — EXEC (clinical tests scoring, measure kinds, catalog UX)

**Контекст:** `STAGE_B2_PLAN.md`, `PRE_IMPLEMENTATION_DECISIONS.md`, продуктовое ТЗ §3 B2; Q2 — только каталог (qualitative в схеме, без инстансного UX).

**Сделано:**

- Drizzle **`0034_clinical_tests_b2_scoring_measure_kinds`**: таблица `clinical_test_measure_kinds`; на `tests` — `assessment_kind`, `body_region_id`, `scoring`, `raw_text` (legacy `scoring_config` сохранён); FK на `reference_items`; backfill `scoring` + `raw_text` из невалидного к новому формату.
- Домен: `clinicalTestScoring.ts` (Zod discriminated union по `schema_type`, `migrateLegacyScoringConfig`, нормализация порядка измерений), `clinicalTestAssessmentKind.ts`, коды видов измерений + `measureKindsService` / ports / `pg` + in-memory репозитории.
- Модуль tests: расширенные типы/фильтры, валидация записи в `service.ts`; `pgClinicalTests` / `inMemoryClinicalTests`.
- **`GET`/`POST /api/doctor/measure-kinds`**; DI `buildAppDeps().measureKinds`.
- UI: **`CreatableComboboxInput`**, **`ClinicalTestMeasureRowsEditor`** (dnd-kit + combobox), **`ClinicalTestForm`** (assessment, регион тела, JSON vs structured scoring, ветки по `schema_type`, `rawText`); список каталога — фильтр по виду оценки (`DoctorCatalogFiltersForm` tertiary), preserve `listAssessment`; `page.tsx` / `actionsInline` / `actionsShared`.
- Контракт scoring зафиксирован в типах + Zod; legacy → `qualitative` + перенос в `raw_text`.
- Документация API: `apps/webapp/src/app/api/api.md` (`doctor/clinical-tests` items B2, новый `doctor/measure-kinds`).

**Проверки (целевые, без полного `pnpm run ci`):**

```bash
cd apps/webapp && pnpm exec eslint \
  db/schema/clinicalTests.ts db/schema/relations.ts \
  src/app-layer/di/buildAppDeps.ts \
  src/app/app/doctor/clinical-tests/ClinicalTestForm.test.tsx \
  src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx \
  src/app/app/doctor/clinical-tests/ClinicalTestMeasureRowsEditor.tsx \
  src/app/app/doctor/clinical-tests/ClinicalTestsPageClient.tsx \
  src/app/app/doctor/clinical-tests/actionsInline.ts \
  src/app/app/doctor/clinical-tests/actionsShared.ts \
  src/app/app/doctor/clinical-tests/page.tsx \
  src/app/api/doctor/measure-kinds/route.ts \
  src/infra/repos/inMemoryClinicalTests.ts \
  src/infra/repos/inMemoryClinicalTestMeasureKinds.ts \
  src/infra/repos/pgClinicalTests.ts \
  src/infra/repos/pgClinicalTestMeasureKinds.ts \
  src/modules/tests/service.ts src/modules/tests/types.ts \
  src/modules/tests/clinicalTestAssessmentKind.ts \
  src/modules/tests/clinicalTestScoring.ts \
  src/modules/tests/clinicalTestScoring.test.ts \
  src/modules/tests/measureKindCode.ts \
  src/modules/tests/measureKindsPorts.ts \
  src/modules/tests/measureKindsService.ts \
  src/shared/ui/CreatableComboboxInput.tsx
pnpm exec vitest run \
  src/modules/tests/clinicalTestScoring.test.ts \
  src/app/app/doctor/clinical-tests/ClinicalTestForm.test.tsx
pnpm exec tsc --noEmit
```

**Вне scope:** инстансный qualitative UX; полный `pnpm run ci` на этапе EXEC/FIX не требовался по запросу.

---

## 2026-05-03 — Stage B2 — FIX (`AUDIT_STAGE_B2`)

**Контекст:** [`AUDIT_STAGE_B2.md`](AUDIT_STAGE_B2.md) M1–M3 + low (невалидный `assessment` в URL).

**Сделано:**

- `ClinicalTestMeasureRowsEditor`: состояние ошибки загрузки справочника, кнопка «Повторить», корректная обработка не-JSON / `!ok` / HTTP error.
- `GET /api/doctor/clinical-tests`: query `region` (UUID), `assessment` (enum); `400` `invalid_query` + `field`; список через `listClinicalTests` с `regionRefId` / `assessmentKind`.
- Каталог: баннер при нераспознанном `?assessment=`.
- Тесты: `ClinicalTestMeasureRowsEditor.test.tsx`, `CreatableComboboxInput.test.tsx`.
- `api.md`, обновление `AUDIT_STAGE_B2.md` до **PASS**.

**Проверки (целевые, без `pnpm run ci`):**

```bash
cd apps/webapp && pnpm exec eslint \
  src/app/app/doctor/clinical-tests/ClinicalTestMeasureRowsEditor.tsx \
  src/app/app/doctor/clinical-tests/ClinicalTestMeasureRowsEditor.test.tsx \
  src/app/app/doctor/clinical-tests/ClinicalTestsPageClient.tsx \
  src/app/app/doctor/clinical-tests/page.tsx \
  src/app/api/doctor/clinical-tests/route.ts \
  src/shared/ui/CreatableComboboxInput.test.tsx
pnpm exec vitest run \
  src/modules/tests/clinicalTestScoring.test.ts \
  src/app/app/doctor/clinical-tests/ClinicalTestForm.test.tsx \
  src/app/app/doctor/clinical-tests/ClinicalTestMeasureRowsEditor.test.tsx \
  src/shared/ui/CreatableComboboxInput.test.tsx
pnpm exec tsc --noEmit
```

**Результат:** eslint / vitest / tsc — **PASS**.

---

## 2026-05-03 — Stage B3 — EXEC (редактор набора тестов, Q5)

**Контекст:** `STAGE_B3_PLAN.md`, `PRE_IMPLEMENTATION_DECISIONS.md` (Q5: без UUID-textarea).

**Сделано:**

- Миграция `0035_test_set_items_comment.sql`: колонка `test_set_items.comment` (nullable `text`); схема Drizzle `clinicalTests.ts`.
- Типы: `TestSetItemInput.comment`, `TestSetItemWithTest.comment`, у `test` — `previewMedia` (первое медиа теста для превью).
- `pgTestSets` / `inMemoryTestSets`: чтение/запись `comment` и превью; `setTestSetItems`: нормализация порядка, запрет дубликатов `testId`, комментарии trim/null.
- Сохранение состава: `itemsPayload` (JSON массива `{ testId, comment? }`, порядок = порядок в наборе), `parseTestSetItemsPayloadJson` + Zod в `actionsShared`; удалены `itemLines` / разбор UUID-строк.
- `PUT /api/doctor/test-sets/[id]/items`: в Zod добавлено опциональное `comment`.
- UI `TestSetItemsForm`: `@dnd-kit` (как `TemplateEditor`), карточки с превью, комментарий на строку, диалог библиотеки (`PickerSearchField` + список), кнопка добавления; скрытое поле `itemsPayload`; после успеха — `router.refresh()`.
- Каталог тестов для пикера: `clinicalTestLibraryRows.ts`, загрузка активных тестов на `page.tsx` (список) и `[id]/page.tsx` (деталь); подсказка про UUID на детальной странице заменена на сценарий с библиотекой.
- `saveDoctorTestSetItems`: `revalidatePath` также для списка наборов.
- Тесты: `service.test.ts` (комментарии, дубликаты), `actionsShared.test.ts` (парсер JSON).

**Проверки (целевые, без полного `ci`):**

```bash
cd apps/webapp && pnpm exec eslint \
  src/app/app/doctor/test-sets/TestSetItemsForm.tsx \
  src/app/app/doctor/test-sets/actionsShared.ts \
  src/app/app/doctor/test-sets/actionsShared.test.ts \
  src/app/app/doctor/test-sets/clinicalTestLibraryRows.ts \
  src/app/app/doctor/test-sets/page.tsx \
  src/app/app/doctor/test-sets/[id]/page.tsx \
  src/app/app/doctor/test-sets/TestSetsPageClient.tsx \
  src/infra/repos/pgTestSets.ts \
  src/infra/repos/inMemoryTestSets.ts \
  src/modules/tests/service.ts \
  src/modules/tests/types.ts \
  src/modules/tests/service.test.ts \
  src/app/api/doctor/test-sets/[id]/items/route.ts \
  db/schema/clinicalTests.ts
pnpm exec vitest run \
  src/modules/tests/service.test.ts \
  src/app/app/doctor/test-sets/actionsShared.test.ts
pnpm exec tsc --noEmit
```

**Вне scope:** полный `pnpm run ci` на этапе EXEC.

**Результат:** eslint / vitest / tsc — **PASS**.

---

## 2026-05-03 — Stage B3 — AUDIT + FIX (`AUDIT_STAGE_B3.md`)

**Контекст:** [`AUDIT_STAGE_B3.md`](AUDIT_STAGE_B3.md); Verdict **PASS** после FIX.

**Сделано:**

- Документ аудита с scope-матрицей, architecture/UI checks, MANDATORY FIX INSTRUCTIONS.
- **M1:** `itemsPayloadSchema` — `comment` с `z.string().max(10000)` (паритет с `PUT /api/doctor/test-sets/[id]/items`); unit-тест на длину 10001+.
- **M1b:** `api.md` — уточнён `GET` doctor/test-sets (`items[].comment`, `test.previewMedia`); у `PUT` зафиксирован лимит длины комментария.

**Проверки (целевые, без полного `ci`):**

```bash
cd apps/webapp && pnpm exec vitest run src/app/app/doctor/test-sets/actionsShared.test.ts
pnpm exec eslint src/app/app/doctor/test-sets/actionsShared.ts src/app/app/doctor/test-sets/actionsShared.test.ts
pnpm exec tsc --noEmit
```

**Пуш:** после закрытия B3 рекомендуется чекпоинт-пуш с полным `pnpm install --frozen-lockfile && pnpm run ci` перед `git push` ([`MASTER_PLAN.md`](MASTER_PLAN.md) §9).

**Результат:** vitest / eslint / tsc — **PASS**.

---

## 2026-05-03 — Stage B4 — EXEC (рекомендации: тип, регион, метрики текста)

**Контекст:** `STAGE_B4_PLAN.md`, `PRE_IMPLEMENTATION_DECISIONS.md` (Q3/Q4: колонка остаётся `domain`, UI «Тип»; без merge legacy→новые значения в одной миграции), продуктовое ТЗ §3 B4.

**Сделано:**

- Drizzle **`0036_recommendations_b4_body_region_metrics`**: `body_region_id` (FK `reference_items`), `quantity_text`, `frequency_text`, `duration_text`; индекс по региону; **без** `UPDATE` нормализации исторических `domain`.
- Домен: расширен список кодов типа (`regimen`, `device`, `self_procedure`, `external_therapy`, `lifestyle` + прежние); парсер без смены имени колонки БД.
- Репозитории `pg` / in-memory: маппинг полей, фильтр списка по `regionRefId` **и** `domain` (AND).
- Doctor UI: `RecommendationForm` — «Тип», `ReferenceSelect` региона тела, три коротких поля метрик; `RecommendationsPageClient` — подписи фильтра «Тип».
- `actionsShared` — парсинг `bodyRegionId` (UUID), лимит длины метрик 2000; сохранение в create/update.
- API `GET/POST` `/api/doctor/recommendations`, `PATCH` `[id]` — query `region`/`domain` и тело с B4-полями; `api.md`.
- Тесты: `recommendationDomain.test.ts`, `service.test` (пересечение фильтров, архив/разархив с сохранением B4-полей), `RecommendationForm.test` (лейбл «Тип» + stub `fetch` для `body_region`).

**Проверки (целевые, без полного `pnpm run ci`):**

```bash
cd apps/webapp && pnpm exec eslint \
  db/schema/recommendations.ts db/schema/relations.ts \
  src/modules/recommendations/recommendationDomain.ts src/modules/recommendations/recommendationDomain.test.ts \
  src/modules/recommendations/types.ts src/modules/recommendations/service.ts src/modules/recommendations/service.test.ts \
  src/infra/repos/pgRecommendations.ts src/infra/repos/inMemoryRecommendations.ts \
  src/app/app/doctor/recommendations/RecommendationForm.tsx src/app/app/doctor/recommendations/RecommendationForm.test.tsx \
  src/app/app/doctor/recommendations/RecommendationsPageClient.tsx \
  src/app/app/doctor/recommendations/actionsShared.ts \
  src/app/api/doctor/recommendations/route.ts src/app/api/doctor/recommendations/\[id\]/route.ts
pnpm exec vitest run \
  src/modules/recommendations/recommendationDomain.test.ts \
  src/modules/recommendations/service.test.ts \
  src/app/app/doctor/recommendations/RecommendationForm.test.tsx
pnpm exec tsc --noEmit
```

**Продуктовое:** в продуктовом ТЗ §3 B4 фигурирует имя колонки `kind`; по **PRE_IMPLEMENTATION** §1 B4/Q4 в коде и БД остаётся **`domain`**, в UI — **«Тип»**; переименование колонки — вне B4.

**Вне scope:** полный `pnpm run ci`; переименование `domain` → `kind` в БД.

**Результат:** eslint / vitest / tsc — **PASS**.

---

## 2026-05-03 — Stage B4 — FIX (`AUDIT_STAGE_B4.md`)

**Контекст:** [`AUDIT_STAGE_B4.md`](AUDIT_STAGE_B4.md) MANDATORY FIX (major: паритет SSR с `GET` API по `domain`/`region`; баннеры; minor: `api.md`).

**Сделано:**

- Модуль [`recommendationCatalogSsrQuery.ts`](../../apps/webapp/src/modules/recommendations/recommendationCatalogSsrQuery.ts): невалидный `domain` / невалидный `region` не передаются в `listRecommendations`; флаг **`invalidDomainQuery`**; для региона на 2026-05-04 III — без **`invalidRegionQuery`** (см. запись III в этом логе).
- [`recommendations/page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/page.tsx): список на SSR через парсер; проп фильтров в клиент.
- [`RecommendationsPageClient.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationsPageClient.tsx): баннеры (amber) при невалидных query, как у клинических тестов.
- [`recommendationCatalogSsrQuery.test.ts`](../../apps/webapp/src/modules/recommendations/recommendationCatalogSsrQuery.test.ts): unit на валидные/невалидные комбинации.
- [`api.md`](../../apps/webapp/src/app/api/api.md): явный `invalid_query` для GET; сериализация `domain` вне allowlist → `null` в ответах.
- [`AUDIT_STAGE_B4.md`](AUDIT_STAGE_B4.md): Verdict **PASS**, §13 FIX, MANDATORY отмечены выполненными; minor 4–5 defer с обоснованием.

**Проверки (целевые B4, без полного `pnpm run ci`):**

```bash
cd apps/webapp && pnpm exec eslint \
  src/modules/recommendations/recommendationCatalogSsrQuery.ts \
  src/modules/recommendations/recommendationCatalogSsrQuery.test.ts \
  src/app/app/doctor/recommendations/page.tsx \
  src/app/app/doctor/recommendations/RecommendationsPageClient.tsx
pnpm exec vitest run \
  src/modules/recommendations/recommendationCatalogSsrQuery.test.ts \
  src/modules/recommendations/recommendationDomain.test.ts \
  src/modules/recommendations/service.test.ts \
  src/app/app/doctor/recommendations/RecommendationForm.test.tsx
pnpm exec tsc --noEmit
```

**Вне scope:** полный `pnpm run ci` на этапе FIX.

**Результат:** eslint / vitest / tsc — **PASS**.

---

## 2026-05-03 — Stage B5 — EXEC (ЛФК: статус в списке/превью/редакторе, sync после action)

**Контекст:** `STAGE_B5_PLAN.md`, `PRE_IMPLEMENTATION_DECISIONS.md`, продуктовое ТЗ §3 B5, `MASTER_PLAN.md` §9.

**Классификация «глаза» (Eye/EyeOff в списке):** **UX-ожидание**, не state-bug. Иконка читалась как переключатель видимости; для `archived` и `draft` оба давали «закрытый глаз», без различия архива vs черновика. Реализация уже была **индикатором** публикации (`span` + `cursor-default`), не action.

**Сделано:**

- Общий [`LfkTemplateStatusBadge.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplateStatusBadge.tsx): явные подписи **Черновик / Опубликован / В архиве** (единый `TemplateStatus`).
- Список [`LfkTemplatesPageClient.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplatesPageClient.tsx): колонка статуса вместо Eye/EyeOff; фильтры B1 не менялись (уже `catalogPubArch` + preserve).
- Превью [`LfkTemplatePreviewPanel.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplatePreviewPanel.tsx): тот же бейдж у заголовка.
- Редактор [`TemplateEditor.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx): блок статуса + подсказки по состоянию; CTA «Сохранить черновик» → «Сохранить изменения» для опубликованного; «Опубликовать» disabled после публикации; после успешного **persist** и **publish** — `router.refresh()` для синхронизации RSC-списка и пропсов редактора с сервером сразу после action.
- Тесты: `LfkTemplateStatusBadge.test.tsx`; mock `useRouter` в `TemplateEditor.test.tsx`.

**Проверки (целевые B5, без полного `pnpm run ci`):**

```bash
cd apps/webapp && pnpm exec eslint \
  src/app/app/doctor/lfk-templates/LfkTemplatesPageClient.tsx \
  src/app/app/doctor/lfk-templates/LfkTemplatePreviewPanel.tsx \
  src/app/app/doctor/lfk-templates/LfkTemplateStatusBadge.tsx \
  src/app/app/doctor/lfk-templates/LfkTemplateStatusBadge.test.tsx \
  src/app/app/doctor/lfk-templates/TemplateEditor.tsx \
  src/app/app/doctor/lfk-templates/TemplateEditor.test.tsx
pnpm exec vitest run \
  src/app/app/doctor/lfk-templates/LfkTemplateStatusBadge.test.tsx \
  src/app/app/doctor/lfk-templates/TemplateEditor.test.tsx \
  src/app/app/doctor/lfk-templates/lfkTemplatesListPreserveQuery.test.ts
pnpm exec tsc --noEmit
```

**Вне scope:** полный `pnpm run ci`; отдельный AUDIT-документ B5.

**Результат:** eslint / vitest / tsc — **PASS**.

**Коммит:** `feat(doctor-catalogs): B5 LFK status badges and list-editor sync` (ветка `feature/app-restructure-initiative`).

---

## 2026-05-03 — Stage B5 — FIX (`AUDIT_STAGE_B5.md`)

**Контекст:** [`AUDIT_STAGE_B5.md`](AUDIT_STAGE_B5.md) MANDATORY FIX (critical/major — N/A; minor: toast, чеклист плана; defer теста `router.refresh()`).

**Сделано:**

- [`TemplateEditor.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx): после успешного `persist` — toast **«Изменения сохранены»** при `template.status === "published"`, иначе **«Черновик сохранён»**; зависимость `persist` от `template.status`.
- [`STAGE_B5_PLAN.md`](STAGE_B5_PLAN.md) §6: execution checklist закрыт (EXEC+FIX); пункты 4–5 помечены как ручной smoke / сверка по коду.
- [`AUDIT_STAGE_B5.md`](AUDIT_STAGE_B5.md): Verdict **PASS**; §12 MANDATORY — выполнено; minor 3 **deferred** с обоснованием + комментарий в [`TemplateEditor.test.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.test.tsx).

**Проверки (целевые B5, без полного `pnpm run ci`):**

```bash
cd apps/webapp && pnpm exec eslint \
  src/app/app/doctor/lfk-templates/TemplateEditor.tsx \
  src/app/app/doctor/lfk-templates/TemplateEditor.test.tsx
pnpm exec vitest run \
  src/app/app/doctor/lfk-templates/LfkTemplateStatusBadge.test.tsx \
  src/app/app/doctor/lfk-templates/TemplateEditor.test.tsx \
  src/app/app/doctor/lfk-templates/lfkTemplatesListPreserveQuery.test.ts
pnpm exec tsc --noEmit
```

**Вне scope:** полный `pnpm run ci` на этапе FIX.

**Результат:** eslint / vitest / tsc — **PASS**.

**Коммит:** `fix(doctor-catalogs): B5 audit toast checklist and audit closure` (ветка `feature/app-restructure-initiative`).

---

## 2026-05-03 — Stage B6 — EXEC (конструктор шаблонов программ: UX pass-1)

**Контекст:** `STAGE_B6_PLAN.md`, `PRE_IMPLEMENTATION_DECISIONS.md` (B6 vs A: pre-check после A), продуктовое ТЗ §3 B6, `MASTER_PLAN.md` §9.

### Pre-check (baseline после фазы A, перед правками B6)

По коду `TreatmentProgramConstructorClient.tsx` и связанным страницам:

- **A1 (этап):** в правой колонке у выбранного этапа присутствуют поля «Цель этапа», «Задачи этапа», «Ожидаемый срок» (дни + текст) и кнопка «Сохранить цели этапа» — доменный baseline, **не удалялся** в B6.
- **A3 (группы):** группы внутри этапа — создание/редактирование/удаление, порядок, привязка item к группе через `Select`, блок «Без группы» — **не удалялся** в B6.
- **Usage / архив:** секция «Где используется» + диалог 409 с подтверждением архивации — без смены доменной семантики.
- **`editLocked`:** `editLocked = busy || isArchived` — в черновике/опубликованном этапы и метаданные этапа **не** блокируются статусом публикации шаблона; блокировка только при `archived` или глобальном `busy`. Баг «этапы не правятся в черновике» по текущей формуле **не воспроизводится**; правок логики lock не вносилось.
- **Вне B6 (сознательно):** контракты PATCH этапов/items/groups, snapshot/assign — не трогались; добавлены только агрегаты списка шаблонов (`stageCount` / `itemCount`) и PATCH **уже существующего** `status` шаблона через UI.

### Сделано (UX)

- Список шаблонов (`TreatmentProgramTemplatesPageClient`): иконка-заглушка, **бейдж статуса** (`TreatmentProgramTemplateStatusBadge`), счётчики **этапов / элементов** с сервера.
- Конструктор: **sticky**-шапка с названием шаблона, бейджем статуса, CTA **«Сохранить черновик»** (из published → draft), **«Опубликовать»**, **«Архивировать»**; секция usage без дублирующей кнопки «В архив».
- Модалка «Элемент из библиотеки» и строки элементов этапа: **превью** (миниатюра или fallback по типу) + подзаголовок где доступно.
- Общая сборка библиотеки: `buildTreatmentProgramLibraryPickers.ts` (страница списка и `[id]/page`).
- Тип `TreatmentProgramTemplate`: поля **`stageCount`**, **`itemCount`**; `pgTreatmentProgram` / `inMemoryTreatmentProgram` — агрегаты для list и detail.

**Проверки (целевые B6, без полного `pnpm run ci`):**

```bash
cd apps/webapp && pnpm exec eslint \
  src/app/app/doctor/treatment-program-templates/page.tsx \
  src/app/app/doctor/treatment-program-templates/\[id\]/page.tsx \
  src/app/app/doctor/treatment-program-templates/buildTreatmentProgramLibraryPickers.ts \
  src/app/app/doctor/treatment-program-templates/TreatmentProgramTemplatesPageClient.tsx \
  src/app/app/doctor/treatment-program-templates/TreatmentProgramTemplateStatusBadge.tsx \
  src/app/app/doctor/treatment-program-templates/\[id\]/TreatmentProgramConstructorClient.tsx \
  src/app/app/doctor/treatment-program-templates/\[id\]/TreatmentProgramConstructorClient.test.tsx \
  src/infra/repos/pgTreatmentProgram.ts \
  src/infra/repos/inMemoryTreatmentProgram.ts \
  src/modules/treatment-program/types.ts
pnpm exec vitest run \
  src/app/app/doctor/treatment-program-templates/\[id\]/TreatmentProgramConstructorClient.test.tsx \
  src/modules/treatment-program/service.test.ts
pnpm exec tsc --noEmit
```

**Вне scope:** полный `pnpm run ci`; удаление/скрытие блоков A1/A3; смена item-types / snapshot.

**Результат:** eslint / vitest / tsc — **PASS**.

---

## 2026-05-03 — Stage B6 — FIX (`AUDIT_STAGE_B6`)

**Контекст:** [`AUDIT_STAGE_B6.md`](AUDIT_STAGE_B6.md) MANDATORY (major: паритет master-detail после `PATCH` статуса; minor: чеклист плана, тест, a11y счётчиков).

**Сделано:**

- [`TreatmentProgramConstructorClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx): после успешного `patchPublicationStatus` **всегда** `router.refresh()` (split-view со `onArchived` обновляет RSC-список слева).
- [`TreatmentProgramConstructorClient.test.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.test.tsx): тест «refresh после Опубликовать при переданном `onArchived`».
- [`TreatmentProgramTemplatesPageClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/TreatmentProgramTemplatesPageClient.tsx): `templateListCountsText` (нормальное русское число) + `aria-label` для строки счётчиков.
- [`AUDIT_STAGE_B6.md`](AUDIT_STAGE_B6.md): Verdict **PASS**, §12 MANDATORY закрыт; deferred: миниатюра в списке, E2E smoke §8, полный CI **перед push** (чекпоинт B6).
- [`STAGE_B6_PLAN.md`](STAGE_B6_PLAN.md): §5 execution checklist — `[x]`.

**Проверки (целевые B6, без полного `pnpm run ci`):**

```bash
cd apps/webapp && pnpm exec eslint \
  src/app/app/doctor/treatment-program-templates/\[id\]/TreatmentProgramConstructorClient.tsx \
  src/app/app/doctor/treatment-program-templates/\[id\]/TreatmentProgramConstructorClient.test.tsx \
  src/app/app/doctor/treatment-program-templates/TreatmentProgramTemplatesPageClient.tsx
pnpm exec vitest run \
  src/app/app/doctor/treatment-program-templates/\[id\]/TreatmentProgramConstructorClient.test.tsx
pnpm exec tsc --noEmit
```

**Вне scope FIX:** полный `pnpm run ci` в сессии агента; перед **push** ветки — по [`MASTER_PLAN.md`](MASTER_PLAN.md) §9 выполнить `pnpm install --frozen-lockfile && pnpm run ci`.

**Результат:** eslint / vitest / tsc — **PASS** (после прогона команд выше).

---

## 2026-05-03 — Stage B7 — EXEC (universal comment pattern + LFK `local_comment`)

**Контекст:** `STAGE_B7_PLAN.md`, `PRE_IMPLEMENTATION_DECISIONS.md` (B7 ЛФК, Q7), продуктовое ТЗ §2.9 / §3 B7, `MASTER_PLAN.md` §9.

### Матрица аудита контейнеров (template / local / copy / doctor UI / patient read)

| entity | template comment | instance `local_comment` | copy path | doctor template UI | doctor instance UI | patient read | B7 action |
|--------|-------------------|---------------------------|-----------|---------------------|-------------------|--------------|-----------|
| treatment_program_template_stage_items → instance_stage_items | `comment` | `local_comment` | `createInstanceTree`: `comment` + `localComment: null` | **Добавлено:** комментарий в конструкторе (`TemplateStageItemCommentBlock` + PATCH) | уже: override + «Из шаблона (заморожено)»; **исправлено:** draft override = только `localComment`, placeholder из шаблона | `effectiveInstanceStageItemComment` + `PatientTreatmentProgramDetailClient` | закрыто |
| test_set_items | `comment` | нет отдельной instance-таблицы; контекст — snapshot `tests[].comment` | `buildSnapshot` (PG) | `TestSetItemsForm` | экземпляр: блок каталога в [`TreatmentProgramInstanceDetailClient`](../../apps/webapp/src/app/app/doctor/clients/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx) | `TestSetBlock` + парсер [`testSetSnapshotView`](../../apps/webapp/src/modules/treatment-program/testSetSnapshotView.ts) | **закрыто в B7 FIX** |
| lfk_complex_template_exercises → lfk_complex_exercises | `comment` | **`local_comment`** (новая колонка) | `assignPublishedTemplateToPatient`: `comment` = шаблон, `local_comment` NULL | уже: `TemplateEditor` | **Добавлено:** `DoctorLfkComplexExerciseOverridesPanel` + `PATCH .../lfk-complex-exercises/[id]` | **Добавлено:** `listLfkComplexExerciseLinesForUser` + карточка дневника | закрыто |
| recommendation / catalog | Q7: без отдельного template comment каталога | — | — | — | — | `body_md` не смешивался с `comment` | вне scope |

### Сделано

- Drizzle **`0037_lfk_complex_exercises_local_comment.sql`** + `lfkComplexExercises.localComment` в схеме.
- `effectiveLfkComplexExerciseComment` + unit-тесты; `LfkDiaryPort`: list/update для строк комплекса; `pgLfkDiary` / in-memory; `buildAppDeps.diaries.*`.
- Назначение ЛФК: INSERT с явным `local_comment` NULL и копией `comment` из шаблона.
- Doctor: API `PATCH /api/doctor/clients/[userId]/lfk-complex-exercises/[exerciseRowId]`; панель на карточке клиента; конструктор программ — комментарий элемента этапа; instance программы — корректный override UX.
- Patient: дневник ЛФК — подсказки по упражнениям с `effectiveComment` на `LfkComplexCard` (без крупного редизайна).

**Проверки (целевые B7, без полного `pnpm run ci`):**

```bash
cd apps/webapp && pnpm exec eslint \
  src/modules/diaries/lfkComplexExerciseComment.ts \
  src/modules/diaries/lfkComplexExerciseComment.test.ts \
  src/modules/diaries/types.ts \
  src/modules/diaries/ports.ts \
  src/modules/diaries/lfk-service.ts \
  src/infra/repos/lfkDiary.ts \
  src/infra/repos/pgLfkDiary.ts \
  src/infra/repos/pgLfkAssignments.ts \
  src/infra/repos/pgLfkAssignments.test.ts \
  src/app-layer/di/buildAppDeps.ts \
  src/app/api/doctor/clients/\[userId\]/lfk-complex-exercises/\[exerciseRowId\]/route.ts \
  src/app/app/doctor/clients/DoctorLfkComplexExerciseOverridesPanel.tsx \
  src/app/app/doctor/clients/ClientProfileCard.tsx \
  src/app/app/doctor/clients/ClientProfileCard.backLink.test.tsx \
  src/app/app/doctor/clients/\[userId\]/page.tsx \
  src/app/app/doctor/treatment-program-templates/\[id\]/TreatmentProgramConstructorClient.tsx \
  src/app/app/doctor/clients/treatment-programs/\[instanceId\]/TreatmentProgramInstanceDetailClient.tsx \
  src/app/app/patient/diary/lfk/LfkComplexCard.tsx \
  src/app/app/patient/diary/lfk/LfkDiarySectionClient.tsx \
  src/app/app/patient/diary/page.tsx \
  db/schema/schema.ts
pnpm exec vitest run \
  src/modules/diaries/lfkComplexExerciseComment.test.ts \
  src/infra/repos/pgLfkAssignments.test.ts
pnpm exec tsc --noEmit
```

**Вне scope:** полный `pnpm run ci`; отдельный patient UI для комментариев строк `test_set` вне контекста программы.

**Результат:** eslint / vitest / tsc — **PASS** (`lfkComplexExerciseComment`, `pgLfkAssignments`, `ClientProfileCard.backLink`, `TreatmentProgramConstructorClient`).

**Smoke (ручной):** назначить опубликованный шаблон ЛФК с комментариями в строках → карточка клиента (override) + дневник пациента (строки под комплексом).

---

## 2026-05-03 — Stage B7 — FIX (`AUDIT_STAGE_B7`)

**Контекст:** [`AUDIT_STAGE_B7.md`](AUDIT_STAGE_B7.md) major **B7-M1**; minor — defer в AUDIT §8 с обоснованием.

**Сделано:**

- Снимок элемента программы `test_set`: в `tests[]` добавлено поле **`comment`** из `test_set_items` ([`pgTreatmentProgramItemSnapshot.ts`](../../apps/webapp/src/infra/repos/pgTreatmentProgramItemSnapshot.ts)).
- Общий парсер снимка [`testSetSnapshotView.ts`](../../apps/webapp/src/modules/treatment-program/testSetSnapshotView.ts) + [`testSetSnapshotView.test.ts`](../../apps/webapp/src/modules/treatment-program/testSetSnapshotView.test.ts) (legacy без ключа `comment`).
- Пациент: [`PatientTreatmentProgramDetailClient.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx) `TestSetBlock` — строка «Комментарий к позиции» при непустом `comment`; витест в [`PatientTreatmentProgramDetailClient.test.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx).
- Врач: [`TreatmentProgramInstanceDetailClient.tsx`](../../apps/webapp/src/app/app/doctor/clients/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx) — блок «Набор тестов (каталог)» для `item.itemType === "test_set"`.
- AUDIT: Verdict **PASS**, §9 MANDATORY FIX — выполнено; minor **deferred** (нет E2E-контура в репо; in-memory dev — by design).

**Проверки (целевые B7 FIX, без полного `pnpm run ci`):**

```bash
cd apps/webapp && pnpm exec vitest run \
  src/modules/treatment-program/testSetSnapshotView.test.ts \
  src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx
pnpm exec eslint \
  src/modules/treatment-program/testSetSnapshotView.ts \
  src/modules/treatment-program/testSetSnapshotView.test.ts \
  src/infra/repos/pgTreatmentProgramItemSnapshot.ts \
  src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx \
  src/app/app/doctor/clients/treatment-programs/\[instanceId\]/TreatmentProgramInstanceDetailClient.tsx
pnpm exec tsc --noEmit
```

**Результат:** vitest / eslint / tsc — **PASS**.

**Пуш ветки:** только после полного `pnpm install --frozen-lockfile && pnpm run ci` ([`MASTER_PLAN.md`](MASTER_PLAN.md) §9) — в этой сессии **не** выполнялся.

---

## 2026-05-03 — Stage D3 — типы рекомендаций в БД-справочник (`STAGE_D3_PLAN.md`)

**Контекст:** [`STAGE_D3_PLAN.md`](STAGE_D3_PLAN.md) — категория `recommendation_type`, сид v1, форма/SSR/API на справочник, read tolerant чтение `recommendations.domain`, write strict.

**Сделано:**

- Миграция [`0039_recommendation_type_reference.sql`](../../apps/webapp/db/drizzle-migrations/0039_recommendation_type_reference.sql) + journal.
- Модуль [`recommendationDomain.ts`](../../apps/webapp/src/modules/recommendations/recommendationDomain.ts): `RECOMMENDATION_TYPE_*`, `recommendationDomainWriteAllowSet`, `parseRecommendationDomain(raw, refItems)`, `buildRecommendationDomainSelectOptions`, `recommendationDomainDisplayTitle` / `recommendationDomainTitle`.
- [`inMemoryReferences.ts`](../../apps/webapp/src/infra/repos/inMemoryReferences.ts): категория и 11 строк для Vitest.
- [`pgRecommendations.ts`](../../apps/webapp/src/infra/repos/pgRecommendations.ts): `mapRow` — `domain` как сырая строка (legacy не обнуляется).
- [`service.ts`](../../apps/webapp/src/modules/recommendations/service.ts): второй аргумент `ReferencesPort`, `RecommendationInvalidDomainError`, правило «unchanged legacy» при `PATCH`.
- SSR [`page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/page.tsx), [`recommendationCatalogSsrQuery.ts`](../../apps/webapp/src/modules/recommendations/recommendationCatalogSsrQuery.ts), клиент [`RecommendationsPageClient.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationsPageClient.tsx), форма [`RecommendationForm.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx), страницы [`new/page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/new/page.tsx) / [`[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/[id]/page.tsx), API [`route.ts`](../../apps/webapp/src/app/api/doctor/recommendations/route.ts) / [`[id]/route.ts`](../../apps/webapp/src/app/api/doctor/recommendations/[id]/route.ts), [`actionsShared.ts`](../../apps/webapp/src/app/app/doctor/recommendations/actionsShared.ts), [`actionsInline.ts`](../../apps/webapp/src/app/app/doctor/recommendations/actionsInline.ts), [`buildAppDeps.ts`](../../apps/webapp/src/app-layer/di/buildAppDeps.ts), e2e in-process.
- Документация: [`api.md`](../../apps/webapp/src/app/api/api.md), [`di.md`](../../apps/webapp/src/app-layer/di/di.md).
- Тесты: обновлены domain/catalog SSR/service/form; добавлен [`recommendationTypeSeedParity.test.ts`](../../apps/webapp/src/modules/recommendations/recommendationTypeSeedParity.test.ts).

**Проверки (целевые D3):**

```bash
cd apps/webapp && pnpm exec eslint \
  src/modules/recommendations/recommendationDomain.ts \
  src/modules/recommendations/recommendationCatalogSsrQuery.ts \
  src/modules/recommendations/service.ts \
  src/infra/repos/pgRecommendations.ts \
  src/app/api/doctor/recommendations/route.ts \
  src/app/api/doctor/recommendations/\[id\]/route.ts \
  src/app/app/doctor/recommendations/page.tsx \
  src/app/app/doctor/recommendations/RecommendationsPageClient.tsx \
  src/app/app/doctor/recommendations/RecommendationForm.tsx \
  src/infra/repos/inMemoryReferences.ts
pnpm exec vitest run \
  src/modules/recommendations/recommendationDomain.test.ts \
  src/modules/recommendations/recommendationCatalogSsrQuery.test.ts \
  src/modules/recommendations/recommendationTypeSeedParity.test.ts \
  src/modules/recommendations/service.test.ts \
  src/app/app/doctor/recommendations/RecommendationForm.test.tsx \
  e2e/treatment-program-blocks-inprocess.test.ts
pnpm exec tsc --noEmit
```

**Результат:** команды выше — **PASS** (зафиксировано после прогона в сессии).

**Коммит:** `feat(recommendations): D3 recommendation_type DB catalog` — только файлы D3 (остальные локальные правки вне коммита).

---

## 2026-05-03 — Stage D3 — FIX (`AUDIT_STAGE_D3.md`)

**Контекст:** [`AUDIT_STAGE_D3.md`](AUDIT_STAGE_D3.md) — закрыть critical/major (не применимо), low: JSDoc SSR vs REST, `GET region` → `field:"region"`, cross-link B4.

**Сделано:**

- [`recommendationCatalogSsrQuery.ts`](../../apps/webapp/src/modules/recommendations/recommendationCatalogSsrQuery.ts): JSDoc SSR vs REST; вход **`region`** (UUID); паритет с `GET ?region=` / `field:"region"`.
- [`recommendationCatalogSsrQuery.test.ts`](../../apps/webapp/src/modules/recommendations/recommendationCatalogSsrQuery.test.ts): вызовы с ключом `region`.
- [`page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/page.tsx): в парсер передаётся `region` из `?region=` или legacy `?regionRefId=` (`DOCTOR_CATALOG_FILTER_QS`).
- [`route.ts`](../../apps/webapp/src/app/api/doctor/recommendations/route.ts): `region` в list query как `string` + ручная проверка UUID до `buildAppDeps`; **`400`** `invalid_query` + **`field:"region"`** при не-UUID.
- [`route.test.ts`](../../apps/webapp/src/app/api/doctor/recommendations/route.test.ts): не-UUID `region`, невалидный `domain`, валидный список.
- [`AUDIT_STAGE_D3.md`](AUDIT_STAGE_D3.md): Verdict после FIX, §3/§6/MANDATORY low, §7 eslint список + vitest `route.test.ts`.
- [`AUDIT_STAGE_B4.md`](AUDIT_STAGE_B4.md): сноска §2 про read tolerant D3 вместо «`domain: null` в DTO».

**Проверки (целевые D3 FIX):**

```bash
cd apps/webapp && pnpm exec eslint \
  src/modules/recommendations/recommendationCatalogSsrQuery.ts \
  src/modules/recommendations/recommendationCatalogSsrQuery.test.ts \
  src/app/app/doctor/recommendations/page.tsx \
  src/app/api/doctor/recommendations/route.ts \
  src/app/api/doctor/recommendations/route.test.ts
pnpm exec vitest run \
  src/modules/recommendations/recommendationCatalogSsrQuery.test.ts \
  src/app/api/doctor/recommendations/route.test.ts
pnpm exec tsc --noEmit
```

**Результат:** команды выше — **PASS**.

**Коммит:** `fix(recommendations): D3 audit GET region field and SSR docs` (только файлы FIX).