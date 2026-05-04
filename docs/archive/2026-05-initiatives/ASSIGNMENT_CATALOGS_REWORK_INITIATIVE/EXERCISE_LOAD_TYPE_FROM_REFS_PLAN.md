# Тип нагрузки из справочников — план и закрытие (2026-05-04)

Каноническая копия плана после **пост-аудита** и синхронизации с кодом. Исходный черновик жил в Cursor plan; исполнение зафиксировано здесь и в [`LOG.md`](LOG.md).

## Статус: выполнено

## Цель

Подписи и допустимые коды для фильтра `load=` и поля `loadType` упражнения — из `reference_categories` / `reference_items` (`code = load_type`), а не из захардкоженного списка в UI. Модель рендера (RSC vs клиентский `ReferenceSelect`) **не менялась**.

## Реализация (факты в репозитории)

| Область | Файлы |
|---------|--------|
| Миграция БД | [`apps/webapp/db/drizzle-migrations/0041_exercise_load_type_reference_align.sql`](../../../../apps/webapp/db/drizzle-migrations/0041_exercise_load_type_reference_align.sql) — `DELETE` старых строк `load_type`, `INSERT` пяти кодов LFK. Номер **0041** (после занятого `0040_drop_tests_scoring_config`). Журнал: [`meta/_journal.json`](../../../../apps/webapp/db/drizzle-migrations/meta/_journal.json). |
| In-memory | [`inMemoryReferences.ts`](../../../../apps/webapp/src/infra/repos/inMemoryReferences.ts) — пять `ReferenceItem` для `rc-load_type`. |
| Домен + паритет | [`exerciseLoadTypeReference.ts`](../../../../apps/webapp/src/modules/lfk-exercises/exerciseLoadTypeReference.ts), [`exerciseLoadTypeSeedParity.test.ts`](../../../../apps/webapp/src/modules/lfk-exercises/exerciseLoadTypeSeedParity.test.ts). |
| UI | [`DoctorCatalogFiltersForm.tsx`](../../../../apps/webapp/src/shared/ui/doctor/DoctorCatalogFiltersForm.tsx), [`ExerciseForm.tsx`](../../../../apps/webapp/src/app/app/doctor/exercises/ExerciseForm.tsx) — `categoryCode={EXERCISE_LOAD_TYPE_CATEGORY_CODE}`. |
| RSC parse `load` | [`exercises/page.tsx`](../../../../apps/webapp/src/app/app/doctor/exercises/page.tsx), [`lfk-templates/page.tsx`](../../../../apps/webapp/src/app/app/doctor/lfk-templates/page.tsx) — `listActiveItemsByCategoryCode` + `exerciseLoadTypeWriteAllowSet` + `parseExerciseLoadQueryParam`. |
| Сохранение упражнения | [`actionsShared.ts`](../../../../apps/webapp/src/app/app/doctor/exercises/actionsShared.ts) — async allow set + `parseExerciseLoadFormValue`. |
| Preserve / клиент | [`clinicalTestsListPreserveParams.ts`](../../../../apps/webapp/src/app/app/doctor/clinical-tests/clinicalTestsListPreserveParams.ts), [`doctorCatalogClientUrlSync.ts`](../../../../apps/webapp/src/shared/lib/doctorCatalogClientUrlSync.ts) (клиент: `exerciseLoadTypeWriteAllowSet([])` = фоллбек на сид), [`lfkTemplatesListPreserveQuery.ts`](../../../../apps/webapp/src/app/app/doctor/lfk-templates/lfkTemplatesListPreserveQuery.ts) — `EXERCISE_LOAD_TYPE_SEED_CODES_ORDERED`. |
| Лейблы | [`exerciseLoadTypeOptions.ts`](../../../../apps/webapp/src/modules/lfk-exercises/exerciseLoadTypeOptions.ts) — `exerciseLoadTypeLabel` и устаревший `EXERCISE_LOAD_TYPE_OPTIONS` от `EXERCISE_LOAD_TYPE_SEED_V1`. |

## Пост-аудит: расхождения с первоначальным текстом плана

1. **`test-sets/page.tsx` и `TestSetForm` / `actionsInline` по `load`:** в продукте ось **`load` у каталога наборов тестов снята** (см. [`LOG.md`](LOG.md) запись 2026-05-04 (III) FILTER URL tails). Пункты плана про эти файлы **не применимы** — не баг исполнения.
2. **`treatment-program-templates/page.tsx`:** фильтр `load` в UI не используется; из типа `searchParams` удалён неиспользуемый `load?: string` (2026-05-04, follow-up аудита).
3. **Номер миграции:** в тексте плана фигурировал «0040 как пример» — фактически **`0041`** из-за существующей `0040_drop_tests_scoring_config`.

## Вне scope (сохранено)

- CHECK / колонка `lfk_exercises.load_type` — только пять кодов.
- [`buildTreatmentProgramLibraryPickers.ts`](../../../../apps/webapp/src/app/app/doctor/treatment-program-templates/buildTreatmentProgramLibraryPickers.ts) — карта `LOAD_SUBTITLE` не менялась (отдельный копирайт).

## Связанный тест (вне темы плана)

- [`patient-program-actions.test.ts`](../../../../apps/webapp/src/modules/treatment-program/patient-program-actions.test.ts) — `vi.useFakeTimers` вокруг сценария чек-листа: `inMemoryProgramActionLog` пишет `createdAt` через реальный `Date`, иначе тест дрейфует относительно окна «локальных суток».

## Проверки при закрытии

- Целевые vitest (load type parity, options, filters, preserve, clinical preserve).
- `pnpm --dir apps/webapp exec tsc --noEmit`.
- Полный `pnpm run ci` — по политике репозитория перед push, не на каждой итерации (см. `.cursor/rules/test-execution-policy.md`).
