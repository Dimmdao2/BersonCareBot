# Doctor CMS: поиск и фильтрация в каталогах

Цель — не смешивать модели без необходимости.

## Синхронизация выбора в master-detail

Повторяющийся сценарий «после фильтрации списка — оставить выбранный id или первый элемент, сброс при пустом списке, опционально мобильный sheet» вынесен в `useDoctorCatalogMasterSelectionSync` ([`useDoctorCatalogMasterSelectionSync.ts`](../../hooks/useDoctorCatalogMasterSelectionSync.ts) в `src/shared/hooks`).

## Клиентская фильтрация по строке поиска

На страницах списков ниже данные загружаются целиком на сервере (RSC), затем фильтруются в браузере через `normalizeRuSearchString` + `useMemo`:

- Клинические тесты — `ClinicalTestsPageClient`
- Наборы тестов — `TestSetsPageClient`
- Рекомендации — `RecommendationsPageClient`
- Шаблоны программ лечения — `TreatmentProgramTemplatesPageClient`
- Шаблоны ЛФК — `LfkTemplatesPageClient`

Поиск в диалогах выбора элементов (конструктор программы, редактор шаблона ЛФК) также клиентский по уже загруженным спискам.

## Серверная фильтрация

- **Упражнения ЛФК** — параметр `q` и др. уходят в `listExercises` через GET-форму (`ExercisesFiltersForm`), запрос при отправке формы («Применить»), не при каждом символе.
- **Шаблоны ЛФК (статус)** — параметр `status` в URL; перезагрузка списка с сервера при смене статуса (`lfk-templates/page.tsx` + `router.replace` в клиенте).

API вроде `GET /api/doctor/clinical-tests?q=…` может существовать для других сценариев, но экраны каталогов CMS при необходимости больших объёмов данных следует переводить на серверный поиск осознанно и единообразно по UX.
