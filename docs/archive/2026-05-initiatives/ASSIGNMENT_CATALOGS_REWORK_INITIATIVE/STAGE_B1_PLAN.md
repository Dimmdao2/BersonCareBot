# STAGE B1 PLAN — Две оси фильтра: публикация × архив

> **Дисциплина:** коммит после каждого закрытого **EXEC** или **FIX**; пуш пачками после **B3, B6, B7** (не чаще одного пуша на три этапа в середине волны) или по явной команде пользователя — см. [`MASTER_PLAN.md`](MASTER_PLAN.md) §9. **CI между коммитами:** только таргетные `eslint` / `vitest` / `tsc` по области; **не** запускать `pnpm run ci` «на коммит»; полный CI — перед пушем; при падении полного CI — упавший шаг + `pnpm run ci:resume:*` (`.cursor/rules/test-execution-policy.md`, `.cursor/rules/pre-push-ci.mdc`). **Канон до кода:** [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md).

## 1. Цель этапа

Ввести независимые фильтры для каталогов с публикацией:

- архив: `active` / `archived`;
- публикация: `all` / `draft` / `published`.

В интерфейсе два поля стоят рядом.

Источник: [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §2.1, §3 B1.

## 2. Hard gates before coding

- Принципы §2.1 ТЗ: восстановление из архива не меняет публикационный статус.
- `test_sets` в B1 получают публикационный статус через миграцию (без откладывания на потом).
- Для сущностей без публикационного lifecycle (упражнения/клин. тесты/рекомендации) второй селект публикации не добавляется.

## 3. In scope / out of scope

### In scope

- `doctorCatalogListStatus.ts`: двухосевой парсинг `?arch=` + `?pub=`, legacy-маппинг старых `status=` ссылок.
- Shared UI `CatalogStatusFilters` с двумя селектами рядом.
- Миграция `test_sets`: добавить статус `draft|published` (default `draft`), check constraint, индекс.
- Подключение фильтров к спискам: LFK templates, treatment program templates, test sets.
- Unit/compose тесты парсинга и фильтрации.

### Out of scope

- Добавление публикационного статуса для упражнений / клин. тестов / рекомендаций.
- Изменение доменной логики назначения программ/этапов (вне фильтров каталогов).

## 4. Likely files

- `apps/webapp/src/shared/lib/doctorCatalogListStatus.ts`
- `apps/webapp/src/shared/ui/doctor/CatalogStatusFilters.tsx`
- `apps/webapp/src/app/app/doctor/lfk-templates/*Page*`
- `apps/webapp/src/app/app/doctor/treatment-program-templates/*Page*`
- `apps/webapp/src/app/app/doctor/test-sets/*Page*`
- `apps/webapp/db/schema/clinicalTests.ts` (таблица `test_sets`) + migration
- `apps/webapp/src/modules/tests/types.ts` / repo files test-sets

## 5. Декомпозиция реализации

1. **Schema**
   - добавить публикационный статус на `test_sets`;
   - миграция с backfill `draft`;
   - индексы/ограничения.
2. **Domain/Repo**
   - обновить `TestSetFilter` и map `pub/arch` -> repo filter;
   - сохранить совместимость со старыми ссылками.
3. **Shared parsing + UI**
   - двухосевой parser/query builder;
   - новый `CatalogStatusFilters` в общем doctor-контуре.
4. **Page integration**
   - LFK templates, program templates, test sets: единая модель фильтров;
   - сохранение query при навигации list/detail.
5. **Verification**
   - unit: parser + legacy + mapping;
   - smoke: `draft/published` × `active/archived` на всех трёх каталогах.

## 6. Execution checklist

1. [x] Миграция `test_sets.publication_status` (`draft|published`), default/backfill/index/check.
2. [x] `doctorCatalogListStatus` и helper-утилиты для двух осей.
3. [x] `CatalogStatusFilters` (два селекта рядом).
4. [x] Интеграция в 3 каталога (LFK/templates/test-sets).
5. [x] Unit/compose тесты + manual smoke.

## 7. Stage DoD

- Критерии ТЗ §6 для B1.
- Запись в [`LOG.md`](LOG.md).
