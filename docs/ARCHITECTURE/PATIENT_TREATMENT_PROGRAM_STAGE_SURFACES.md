# Пациентский UI программы лечения: поверхности этапа и видимость элементов

Каноническая логика видимости элементов этапа находится в модуле `apps/webapp/src/modules/treatment-program/stage-semantics.ts`.

**Видео и медиа по UUID:** UI программы показывает только данные, полученные через `getInstanceForPatient` (инстанс привязан к `userId`). Это **не** заменяет проверку прав на уровне `GET /api/media/[id]` / `/playback`: при прямом запросе с валидной сессией действует общая модель из [`MEDIA_HTTP_ACCESS_AUTHORIZATION.md`](MEDIA_HTTP_ACCESS_AUTHORIZATION.md).

## FSM статуса этапа экземпляра (`treatment_program_instance_stages`)

- Пациент **не** переводит этап в `completed` и **не** закрывает этап автоматически при выполнении всех пунктов или завершении набора тестов (сервис `createTreatmentProgramProgressService` в `apps/webapp/src/modules/treatment-program/progress-service.ts`).
- Пациент может: выставлять `completed_at` по пунктам, отправлять результаты тестов; при первом действии по пункту этап может перейти **`available` → `in_progress`** (touch внутри того же сервиса).
- Переводы этапа в **`completed`** или **`skipped`** выполняет только врач (`doctorSetStageStatus` / UI кабинета врача).
- Возврат закрытого этапа в работу: кнопка **«Открыть заново»** на детали инстанса программы врача (`completed` или `skipped` → `in_progress`). Политика по «следующему» этапу, уже разблокированному при закрытии: см. [`LOG_DOCTOR_ONLY_STAGE_COMPLETION.md`](LOG_DOCTOR_ONLY_STAGE_COMPLETION.md) (v1 — без автоматического re-lock).
- После **«Открыть заново»** уже выставленные у пунктов `completed_at` и результаты тестов **не сбрасываются** автоматически; сценарии «врач открыл этап повторно при полном прогрессе пациента» — на усмотрение продукта/ops (backlog), не лечатся в этом изменении.

## Два фильтра

| Функция | Назначение |
|--------|------------|
| `isInstanceStageItemShownOnPatientProgramSurfaces` | Экраны программы пациента: карточка плана, список пунктов этапа, модалка выбранного пункта (`PatientProgramStageItemModal`). Показываются все активные типы элементов, включая **`clinical_test`**. Скрыты только элементы со статусом `disabled`. |
| `isInstanceStageItemShownInPatientCompositionModal` | Модалка «Состав этапа» (timeline): активные элементы, но **без** **`clinical_test`**, чтобы не дублировать тесты в компактном таймлайне. Дополнительно **исключаются** элементы, чей `group_id` указывает на системную группу экземпляра (`system_kind` «Рекомендации» / «Тесты»), чтобы не смешивать их с блоком «упражнения» — у рекомендаций и тестов отдельные блоки UI. Пункты **`clinical_test`** остаются на основных поверхностях программы (см. строку выше). |

Инвариант: исключение **`clinical_test`** из composition modal **не** означает, что тесты «только на отдельной странице» — они перечисляются в контенте этапа и открываются в универсальной модалке пункта / на странице прохождения.

## Страница инстанса `/app/patient/treatment/[instanceId]` (вкладка «Программа»)

Контент этапа рендерится через **`PatientTreatmentProgramStagePageClient`** в режиме **`embedded`** (вкладка «Программа» на детали программы). Отдельного пациентского маршрута **`…/stages/[stageId]`** нет: старые URL **`/app/patient/treatment-programs/...`** перенаправляются на **`/app/patient/treatment/...`** (`next.config.ts`).

Для **активного** этапа (`patientTreatmentProgramStageScreenVariant` → `interactive`) блок **«Программа этапа»** (`PatientTreatmentProgramStagePageProgramSection.tsx`) показывает только **`exercise`** и **исполняемые** `recommendation` (не `isPersistentRecommendation`), плюс фильтр `isInstanceStageItemShownOnPatientProgramSurfaces`. Постоянные рекомендации — во вкладке **«Рекомендации»** (`PatientTreatmentTabRecommendations.tsx`).

В ветках **`pastReadOnly`** / **`futureLocked`** по-прежнему используется полный список/тело из `PatientInstanceStageBody` там, где это задано планом (архив и замок); узкий состав «только упражнения + actionable recommendation» относится **только** к интерактивной секции «Программа этапа».

Общие хелперы превью и «последней активности» по элементу: `apps/webapp/src/app/app/patient/treatment/stageItemSnapshot.ts` (импортируются с экрана программы пациента).

## Страница пункта `/app/patient/treatment/[instanceId]/item/[itemId]`

Отдельная страница пункта (не модалка) использует те же правила видимости элемента, что и остальной пациентский UI программы, и задаёт **контекст навигации** через query-параметры:

| Параметр | Назначение |
|----------|------------|
| `nav` | Режим списка для prev/next и допустимого состава: `default` (тело этапа), `program` (composition modal), **`exec`** (выполняемые пункты без **`clinical_test`** и без persistent-рекомендаций — как секция «Программа этапа»), **`rec-read`** (единый список persistent: рабочий этап, затем этап 0), `rec-stage` / `rec-zero` / `rec-persist`, **`tests`** (плоский обход тестов по всем активным **`clinical_test`** рабочего этапа). Разбор: `parsePatientProgramItemNavMode` в `patientProgramItemPageResolve.ts`. |
| `planTab` | Вкладка детали программы при возврате (`program` / `recommendations` / …): `parsePatientPlanTab`. |
| `testId` | Только при `nav=tests`: uuid теста из `snapshot.tests[]` снимка элемента **`clinical_test`** (один ожидаемый тест; при необходимости массив `tests[]` совместим с legacy). RSC при несовпадении с каноном **редиректит** на пару `(itemId, testId)` первого слота или найденного по `testId` (см. `item/[itemId]/page.tsx`). |

Единый источник порядка id/слотов для ссылок в UI и для серверного `resolvePatientProgramItemPage`: **`patientProgramItemNavLists.ts`** — `flatExecIds`, `flatRecReadIds`, `flatTestSlots`.

## Снимок теста (`clinical_test`) и идентификаторы тестов

Разбор JSON-снимка элемента типа **`clinical_test`** (и список `testId` для навигации к прохождению тестов):

- `parseTestSetSnapshotTests`, `testIdsFromTestSetSnapshot` — `apps/webapp/src/modules/treatment-program/testSetSnapshotView.ts`.

Жизненный цикл попыток и чеклиста: пациент заполняет результаты в **открытой** попытке (`submitted_at` null); после полного набора — **`submitted_at`** (повторная фиксация не перезаписывает дату); новая полная попытка — **`POST .../progress/start-new-test-attempt`** (после отправки предыдущей), атомарно сбрасывается **`completed_at`** пункта, **`accepted_*` на старых попытках не трогаются**; **`instance_stage_item.completed_at`** выставляется при **`POST .../test-attempts/[attemptId]/accept`** только для **актуальной** последней отправленной попытки. Снимок для UI: **`GET .../progress/test-set-snapshot`**; после submit / start new attempt / «Снять Новое» встроенная карточка перезагружает snapshot. На экране врача **`GET .../doctor/treatment-program-instances/[instanceId]/test-results`** возвращает **`attemptAcceptMap`** (`attemptId` → можно ли принять); кнопка «Принять попытку» активна только при **`attemptAcceptMap[attemptId] === true`**. Регрессия ключевых веток: `apps/webapp/src/modules/treatment-program/progress-service.test.ts` (кейсы `clinical_test: …`); журнал изменений — `docs/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/LOG.md` (2026-05-14).

Сервис прогресса реэкспортирует `testIdsFromTestSetSnapshot` для обратной совместимости (`progress-service.ts`); клиентские компоненты программы предпочитают импорт из `testSetSnapshotView`, чтобы не тянуть тяжёлый модуль прогресса ради одной утилиты.

## Навигация «Пропустить» в модалке пункта

В `PatientProgramStageItemModal` вторичная кнопка «Пропустить» переводит к следующему видимому пункту этапа в порядке списка (тот же порядок, что и на странице этапа), без закрытия оболочки модалки при переходе между пунктами. Стили кнопки — `patientButtonSkipClass` в `apps/webapp/src/shared/ui/patientVisual.ts`.
