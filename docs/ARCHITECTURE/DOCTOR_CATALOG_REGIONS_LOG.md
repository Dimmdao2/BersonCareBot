# Лог: регионы каталога врача (doctor catalog regions)

Закрытие инициативы по плану `.cursor/plans/doctor_catalog_regions_ux.plan.md`.

## Решения

- **M2M + legacy:** три таблицы связей (`lfk_exercise_regions`, `recommendation_regions`, `clinical_test_regions`), backfill из legacy FK в миграции `0063_catalog_body_region_m2m.sql`. Запись: dual-write — первая из выбранных id остаётся в legacy-колонке, полный набор в M2M.
- **Регион в формах:** `ReferenceMultiSelect` (чипы + список без полнотекстового поиска по полю) вместо точечного hotfix `ReferenceSelect` для поля региона; баг «схлопывания» списка устранён сменой паттерна UI.
- **ReferenceSelect:** подсказка вертикального overflow (fade + иконка внизу списка).

## SSR list по региону

На страницах `doctor/exercises`, `doctor/recommendations`, `doctor/clinical-tests` код `?region=` через `resolveBodyRegionRefIdFromCatalogCode` преобразуется в uuid и передаётся в `listExercises` / `listRecommendations` / `listClinicalTests` как `regionRefId`, чтобы снизить полезную нагрузку. Клиентский `useDoctorCatalogDisplayList` с `getItemRegionCodes` сохраняет ту же семантику фильтра.

## Вне scope плана

- Фильтр `region` для списка шаблонов программ лечения (`treatment-program-templates`) — отдельный backlog.

## Проверки при закрытии

- `vitest`: `apps/webapp/src/shared/lib/doctorCatalogRegionQuery.test.ts`, `useDoctorCatalogDisplayList.test.ts` и затронутые модули по необходимости.
- Перед merge в remote: полный `pnpm run ci` по правилам репозитория.
