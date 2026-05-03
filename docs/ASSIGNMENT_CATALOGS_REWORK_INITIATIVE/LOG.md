# LOG — ASSIGNMENT_CATALOGS_REWORK_INITIATIVE

Формат: дата, этап (B1…B7), что сделано, проверки, решения, вне scope.

Используйте [`LOG_TEMPLATE.md`](LOG_TEMPLATE.md) для новых записей.

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

- Модуль [`recommendationCatalogSsrQuery.ts`](../../apps/webapp/src/modules/recommendations/recommendationCatalogSsrQuery.ts): невалидный `domain` / не-UUID `region` не передаются в `listRecommendations`; флаги `invalidDomainQuery` / `invalidRegionQuery`.
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