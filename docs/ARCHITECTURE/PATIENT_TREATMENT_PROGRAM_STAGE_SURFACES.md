# Пациентский UI программы лечения: поверхности этапа и видимость элементов

Каноническая логика видимости элементов этапа находится в модуле `apps/webapp/src/modules/treatment-program/stage-semantics.ts`.

**Видео и медиа по UUID:** UI программы показывает только данные, полученные через `getInstanceForPatient` (инстанс привязан к `userId`). Это **не** заменяет проверку прав на уровне `GET /api/media/[id]` / `/playback`: при прямом запросе с валидной сессией действует общая модель из [`MEDIA_HTTP_ACCESS_AUTHORIZATION.md`](MEDIA_HTTP_ACCESS_AUTHORIZATION.md).

## Два фильтра

| Функция | Назначение |
|--------|------------|
| `isInstanceStageItemShownOnPatientProgramSurfaces` | Экраны программы пациента: карточка плана, список пунктов этапа, модалка выбранного пункта (`PatientProgramStageItemModal`). Показываются все активные типы элементов, включая `test_set`. Скрыты только элементы со статусом `disabled`. |
| `isInstanceStageItemShownInPatientCompositionModal` | Модалка «Состав этапа» (timeline): активные элементы, но **без** `test_set`, чтобы не дублировать набор тестов в компактном таймлайне. Дополнительно **исключаются** элементы, чей `group_id` указывает на системную группу экземпляра (`system_kind` «Рекомендации» / «Тесты»), чтобы не смешивать их с блоком «упражнения» — у рекомендаций и тестов отдельные блоки UI. Наборы тестов остаются доступны на основных поверхностях программы (см. строку выше). |

Инвариант: исключение `test_set` из composition modal **не** означает, что наборы тестов «только на отдельной странице» — они перечисляются в контенте этапа и открываются в универсальной модалке пункта.

## Страница инстанса `/app/patient/treatment/[instanceId]` (вкладка «Программа»)

Контент этапа рендерится через **`PatientTreatmentProgramStagePageClient`** в режиме **`embedded`** (вкладка «Программа» на детали программы). Отдельного пациентского маршрута **`…/stages/[stageId]`** нет: старые URL **`/app/patient/treatment-programs/...`** перенаправляются на **`/app/patient/treatment/...`** (`next.config.ts`).

Для **активного** этапа (`patientTreatmentProgramStageScreenVariant` → `interactive`) блок **«Программа этапа»** (`PatientTreatmentProgramStagePageProgramSection.tsx`) показывает только **`exercise`** и **исполняемые** `recommendation` (не `isPersistentRecommendation`), плюс фильтр `isInstanceStageItemShownOnPatientProgramSurfaces`. Постоянные рекомендации — во вкладке **«Рекомендации»** (`PatientTreatmentTabRecommendations.tsx`).

В ветках **`pastReadOnly`** / **`futureLocked`** по-прежнему используется полный список/тело из `PatientInstanceStageBody` там, где это задано планом (архив и замок); узкий состав «только упражнения + actionable recommendation» относится **только** к интерактивной секции «Программа этапа».

Общие хелперы превью и «последней активности» по элементу: `apps/webapp/src/app/app/patient/treatment/stageItemSnapshot.ts` (импортируются с экрана программы пациента).

## Снимок `test_set` и идентификаторы тестов

Разбор JSON-снимка элемента типа `test_set` и список `testId` для навигации к прохождению тестов:

- `parseTestSetSnapshotTests`, `testIdsFromTestSetSnapshot` — `apps/webapp/src/modules/treatment-program/testSetSnapshotView.ts`.

Сервис прогресса реэкспортирует `testIdsFromTestSetSnapshot` для обратной совместимости (`progress-service.ts`); клиентские компоненты программы предпочитают импорт из `testSetSnapshotView`, чтобы не тянуть тяжёлый модуль прогресса ради одной утилиты.

## Навигация «Пропустить» в модалке пункта

В `PatientProgramStageItemModal` вторичная кнопка «Пропустить» переводит к следующему видимому пункту этапа в порядке списка (тот же порядок, что и на странице этапа), без закрытия оболочки модалки при переходе между пунктами. Стили кнопки — `patientButtonSkipClass` в `apps/webapp/src/shared/ui/patientVisual.ts`.
