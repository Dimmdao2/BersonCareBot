---
name: Doctor catalog regions UX
overview: КАНОН плана регионов каталога врача — только этот файл в репо (.cursor/plans/doctor_catalog_regions_ux.plan.md). Мультивыбор регионов (чипы + M2M), фильтр по региону на портах list и в useDoctorCatalogDisplayList, SSR list с regionRefId, ReferenceMultiSelect, подсказка overflow в ReferenceSelect; шаблоны ЛФК и наборы тестов. См. docs/ARCHITECTURE/DOCTOR_CATALOG_REGIONS_LOG.md.
todos:
  - id: hotfix-reference-select
    content: "Регион в формах — ReferenceMultiSelect (снят баг схлопывания); ReferenceSelect — onFocus/showAllOnFocus/overflow hint"
    status: completed
  - id: reference-select-scroll-hint
    content: "ReferenceSelect: overflow hint (измерение scrollHeight/clientHeight, нижний fade + иконка «ещё ниже»; скрывать у низа списка)"
    status: completed
  - id: db-m2m-migrations
    content: Drizzle schema + миграции M2M (lfk_exercise_regions, recommendation_regions, clinical_test_regions или согласованные имена); backfill из legacy FK; зафиксировать в PR политику legacy-колонок (dual-write vs read только M2M)
    status: completed
  - id: ports-list-filter
    content: "pgLfkExercises + pgRecommendations + pgClinicalTests + in-memory порты + domain types: фильтр regionRefId = совпадение по M2M или deprecated колонке до удаления"
    status: completed
  - id: catalog-display-list-region
    content: useDoctorCatalogDisplayList (getItemRegionCodes), клиенты каталогов + LfkTemplates/TestSets; SSR list с regionRefId; тесты
    status: completed
  - id: reference-multi-select-ui
    content: Shared ReferenceMultiSelect + формы (Exercise, Recommendation, ClinicalTest) + actionsShared парсинг массива UUID + скрытые поля без лишних UX-подписей
    status: completed
  - id: derivative-filters-client
    content: LfkTemplatesPageClient exerciseMetaById и TestSetsPageClient — соответствие мультирегионам при фильтре toolbar
    status: completed
  - id: tests-ci
    content: Vitest (сервисы, хук, формы при наличии), полный pnpm run ci перед merge крупного PR
    status: completed
isProject: false
---

**Канон:** единственный актуальный план задачи по регионам каталога врача — **этот файл** ([`.cursor/plans/doctor_catalog_regions_ux.plan.md`](.cursor/plans/doctor_catalog_regions_ux.plan.md)). Дубликаты вне репозитория не поддерживаются.

# План: регионы в каталоге врача — проверенная и улучшенная версия

## 0. Исправления относительно предыдущего черновика

- **Критично (сделано):** для мультив регионов контракт хука расширен до `getItemRegionCodes` и фильтра «код входит в набор» в [`useDoctorCatalogDisplayList`](apps/webapp/src/shared/hooks/useDoctorCatalogDisplayList.ts).
- **SSR list (сделано):** RSC каталоги трёх сущностей передают в `list*` [`resolveBodyRegionRefIdFromCatalogCode`](apps/webapp/src/shared/lib/doctorCatalogRegionQuery.ts) по `?region=` → `regionRefId`, чтобы сузить выдачу на сервере; клиентский хук сохраняет ту же семантику.
- Уточнён **периметр тестов**: [`useDoctorCatalogDisplayList.test.ts`](apps/webapp/src/shared/hooks/useDoctorCatalogDisplayList.test.ts) — обязательный апдейт/кейсы для множества регионов.
- **Шаблоны программ лечения:** в [`treatment-program-templates/page.tsx`](apps/webapp/src/app/app/doctor/treatment-program-templates/page.tsx) `region` в типе `searchParams` не пробрасывается в клиент — вынести в **отдельный backlog-эпик** (агрегация по библиотеке стадий), не смешивать с этим планом без оценки.

## 1. Контекст из кода (кратко)

- Баг «пропадают варианты» для **региона** снят переходом на [`ReferenceMultiSelect`](apps/webapp/src/shared/ui/ReferenceMultiSelect.tsx) в формах трёх сущностей; в [`ReferenceSelect`](apps/webapp/src/shared/ui/ReferenceSelect.tsx) остаётся улучшенный `onFocus` для `showAllOnFocus` / `searchable={false}` и подсказка overflow.
- Toolbar: [`DoctorCatalogFiltersForm`](apps/webapp/src/shared/ui/doctor/DoctorCatalogFiltersForm.tsx) — single-select по **коду** в `?region=`; **не менять** контракт URL.
- Порты list: M2M `EXISTS` **или** legacy-колонка ([`pgLfkExercises`](apps/webapp/src/infra/repos/pgLfkExercises.ts), [`pgRecommendations`](apps/webapp/src/infra/repos/pgRecommendations.ts), [`pgClinicalTests`](apps/webapp/src/infra/repos/pgClinicalTests.ts)).
- Производные: [`LfkTemplatesPageClient`](apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplatesPageClient.tsx), [`TestSetsPageClient`](apps/webapp/src/app/app/doctor/test-sets/TestSetsPageClient.tsx) — фильтр по множеству регионов / `bodyRegionIds`.

## 2. Границы scope

**В scope**

- `apps/webapp/db/schema/*`, Drizzle-миграции, порты `pg*` / `inMemory*`, модули `lfk-exercises`, `recommendations`, `tests`, server actions `actionsShared` врача для трёх сущностей.
- [`ReferenceSelect`](apps/webapp/src/shared/ui/ReferenceSelect.tsx), новый multi-компонент в `shared/ui`, [`useDoctorCatalogDisplayList`](apps/webapp/src/shared/hooks/useDoctorCatalogDisplayList.ts), страницы клиентов каталогов врача под перечисленные сущности.
- Отображение регионов в списках каталога: компактно (не раздувать подписи; см. [.cursor/rules/ui-copy-no-excess-labels.mdc](.cursor/rules/ui-copy-no-excess-labels.mdc)).

**Вне scope (без отдельного решения)**

- Пациентский кабинет и напоминания (терминология «ЛФК» — по [patient-lfk-means-rehab-program.mdc](.cursor/rules/patient-lfk-means-rehab-program.mdc); схема может меняться без смены patient UX-текста).
- Фильтр `region` для списка **шаблонов программ** (см. §0).
- Массовый рефакторинг всех выпадающих списков проекта под scroll-hint — только `ReferenceSelect` в DoD, остальное по желанию через общий хук позже.

## 3. Данные: M2M и миграция

Три таблицы связей, FK на `reference_items.id`, уникальность пары `(entity_id, region_id)`:

| Домен | Предложение таблицы | Примечание |
|-------|---------------------|------------|
| Упражнения | `lfk_exercise_regions` | `(exercise_id, region_ref_id)` |
| Рекомендации | `recommendation_regions` | после [`recommendations`](apps/webapp/db/schema/recommendations.ts) |
| Клинические тесты (`tests`) | например `clinical_test_regions` | `(clinical_test_id, body_region_id)` — имя согласовать с `tests`/`clinicalTests` в Drizzle |

**Семантика пустого набора:** как сейчас при отсутствии региона — элемент **не** попадает под активный фильтр по региону (строгость сохранять).

Опционально колонка `sort_order` в M2M для стабильного порядка чипов — только если нужен явный порядок, не «как попало из БД».

**Legacy-колонки** `lfk_exercises.region_ref_id`, `recommendations.body_region_id`, `tests.body_region_id`: в PR зафиксировать одну стратегию — **dual-write** (запись первого/всех — задать) на один релиз, либо **только M2M** после backfill и единовременное чтение из M2M; второй PR на `DROP COLUMN` допустим для снижения риска.

**Индексы:** btree по `region_ref_id` / `body_region_id` в M2M для условий `EXISTS … AND region = $id`.

## 4. Порты и фильтр list

- Условие при переданном `filter.regionRefId` (uuid): строка попадает в выдачу, если `EXISTS (SELECT 1 FROM m2m WHERE parent_id = … AND region_id = :uuid)` **или** (на переходном этапе) совпадение с legacy столбцом, если колонка ещё используется.
- [`pgLfkExercises`](apps/webapp/src/infra/repos/pgLfkExercises.ts): правка сырого SQL.
- Recommendations / clinical tests: Drizzle-query в соответствующих repo.
- In-memory реализации — та же семантика для тестов модулей.

**Оптимизация (сделано):** `regionRefId` с RSC передаётся в `listExercises` / `listRecommendations` / `listClinicalTests` через [`resolveBodyRegionRefIdFromCatalogCode`](apps/webapp/src/shared/lib/doctorCatalogRegionQuery.ts). Клиентский фильтр по региону сохранён для согласованной семантики и `q`/остальных фильтров без изменения URL.

## 5. Клиентский каталожный хук

Расширить [`DoctorCatalogDisplayListOptions`](apps/webapp/src/shared/hooks/useDoctorCatalogDisplayList.ts):

- Вместо или вместе с `getItemRegionCode` ввести, например, **`getItemRegionCodes?: (item) => readonly string[]`** (коды из `bodyRegionIdToCode` для всех id региона сущности).
- Условие фильтра: `regionCode` задан → `codes.includes(regionCode)` (при отсутствии регионов у элемента — `false`).
- Обновить все call sites каталогов, где передаётся регион: упражнения, рекомендации, клинические тесты (+ проверить другие пользователи хука через `rg getItemRegionCode`).

## 6. UI

- **`ReferenceMultiSelect`:** справочник через `loadReferenceItems`, чипы с удалением, без отдельной строки «Выбрано: …», если информация уже в чипах.
- **`ExerciseForm`** / типы [`Exercise`](apps/webapp/src/modules/lfk-exercises/types.ts): массив id регионов; [`page.tsx`](apps/webapp/src/app/app/doctor/lfk-templates/page.tsx) уже строит `exerciseMetaById` — расширить под массив для фильтра шаблонов.
- **`RecommendationForm`**, **`ClinicalTestForm`**: заменить одиночный селект.
- Парсинг FormData в [`actionsShared`](apps/webapp/src/app/app/doctor/exercises/actionsShared.ts) и аналогах: массив UUID, Zod/валидация, отклонение неизвестных id.

**Опция (отдельный маленький PR):** изменить [`ReferenceSelect`](apps/webapp/src/shared/ui/ReferenceSelect.tsx) так, чтобы при `onFocus` для `searchable=true` не подставлять целиком `selectedLabel` в `query` (или по умолчанию очищать query) — снимает класс багов для всех форм; оценить влияние на сценарии «фильтровать список с клавиатуры».

## 7. Подсказка прокрутки

- Реализовать на контейнере списка в [`ReferenceSelect`](apps/webapp/src/shared/ui/ReferenceSelect.tsx) с `scroll` listener / `ResizeObserver`, не ломая `role="listbox"` и клики по пунктам.

## 8. Definition of Done (проверяемо)

- [x] Регион в формах трёх сущностей — `ReferenceMultiSelect`, список вариантов не «схлопывается»; в `ReferenceSelect` — подсказка overflow и улучшенный `onFocus` где применимо.
- [x] У трёх сущностей: мультивыбор в UI; M2M + backfill; dual-write legacy (первая id в колонке).
- [x] Фильтр toolbar по `region` (код): порт list (M2M ∪ legacy) + `getItemRegionCodes` в [`useDoctorCatalogDisplayList`](apps/webapp/src/shared/hooks/useDoctorCatalogDisplayList.ts); SSR передаёт `regionRefId` в list при разрешённом коде.
- [x] [`LfkTemplatesPageClient`](apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplatesPageClient.tsx) и [`TestSetsPageClient`](apps/webapp/src/app/app/doctor/test-sets/TestSetsPageClient.tsx) — семантика мультирегионов.
- [x] `ReferenceSelect`: визуальная подсказка при вертикальном overflow.
- [x] Vitest (в т.ч. региональный резолвер, хук); перед push в remote — `pnpm run ci` (см. `docs/ARCHITECTURE/DOCTOR_CATALOG_REGIONS_LOG.md`).

## 9. Порядок работ (рекомендуемый)

1. Hotfix форм региона (и при согласии — маленький фикс `ReferenceSelect`).
2. Scroll-hint в `ReferenceSelect`.
3. M2M миграции + типы + порты + сервисы + in-memory.
4. Хук `useDoctorCatalogDisplayList` + клиенты каталогов + производные фильтры.
5. `ReferenceMultiSelect` + формы + actions + отображение в списках.

```mermaid
flowchart LR
  URL["URL region code"]
  Map["bodyRegionIdToCode / SSR resolve uuid"]
  M2M[(M2M tables)]
  Port["Ports list EXISTS or legacy OR"]
  Hook["useDoctorCatalogDisplayList"]
  URL --> Map --> Port
  URL --> Hook
  M2M --> Port
  Forms["ReferenceMultiSelect"] --> M2M
```
