# Журнал: упражнения ЛФК — автоподстановка названия из медиа и автосоздание

**Дата:** 2026-04-16  
**Область:** webapp, экран врача `/app/doctor/exercises`

## Реализовано

### 1) Название из медиа при выборе в карточке упражнения

- В [`MediaLibraryPickerDialog.tsx`](../../apps/webapp/src/app/app/doctor/content/MediaLibraryPickerDialog.tsx) тип `MediaLibraryPickMeta` дополнен полем `displayName`; при выборе файла оно передаётся в `onChange`.
- В [`ExerciseForm.tsx`](../../apps/webapp/src/app/app/doctor/exercises/ExerciseForm.tsx) поле «Название» переведено на controlled state; при выборе медиа, если название **пустое**, подставляется `displayName` или имя файла без расширения (хелперы в [`exerciseMediaFromLibrary.ts`](../../apps/webapp/src/app/app/doctor/exercises/exerciseMediaFromLibrary.ts): `exerciseTitleFromPickMeta`, `stripFilenameExtension`, `exerciseTitleFromLibraryItem`).
- Если пользователь уже ввёл текст названия, выбор медиа **не перезаписывает** его.

### 2) Кнопка «Автосоздание» и страница массового создания

- В [`ExercisesPageClient.tsx`](../../apps/webapp/src/app/app/doctor/exercises/ExercisesPageClient.tsx) в верхней строке с фильтрами справа добавлена ссылка **Автосоздание** → `/app/doctor/exercises/auto-create`.
- Новая страница [`auto-create/page.tsx`](../../apps/webapp/src/app/app/doctor/exercises/auto-create/page.tsx) и клиент [`AutoCreateExercisesClient.tsx`](../../apps/webapp/src/app/app/doctor/exercises/AutoCreateExercisesClient.tsx):
  - слева: список **только видео** из библиотеки, папки, поиск, переключатель «все / только новые» (по умолчанию **только новые** = не привязанные к упражнению), индикаторы привязки как в пикере, кнопки **Выбрать все** / **Снять выбор**, по карточке — **Выбрать** / **Снять выбор** (зелёная кнопка у выбранных);
  - справа: список выбранных имён и кнопка **Создать упражнения (N)**;
  - выбор сохраняется при смене папки/поиска/фильтра (хранится `Map` id → элемент).
- Серверное действие [`bulkCreateExercisesFromMedia`](../../apps/webapp/src/app/app/doctor/exercises/actions.ts) + ядро [`bulkCreateExercisesFromMediaCore`](../../apps/webapp/src/app/app/doctor/exercises/actionsShared.ts):
  - вход: до 100 элементов `{ title, mediaUrl, mediaType }`, zod-валидация;
  - дедупликация по `mediaUrl` в одном запросе;
  - повторная проверка привязки через `pgListExerciseUsageForMediaIds` (в in-memory режиме — по списку упражнений и `mediaUrl`);
  - для массового создания требуется URL вида `/api/media/{uuid}` (иначе элемент считается ошибочным);
  - после успеха — `revalidatePath` на список упражнений.

### Логирование

- В `actionsShared` при bulk-create пишутся события `lfk_exercises_bulk_auto_create_start` / `lfk_exercises_bulk_auto_create_finish` (userId, счётчики, `createdIds`, размер входа), при ошибке элемента — `lfk_exercises_bulk_auto_create_item_failed`; при невалидном теле — `lfk_exercises_bulk_auto_create_invalid_input` в `actions.ts`.

## Ограничения и UX

- Список автосоздания по умолчанию — **видео** и режим **только новые**; переключатель «все» показывает все видео в выбранной области (в т.ч. уже привязанные), но сервер не создаст дубликат для уже привязанного файла.
- При `created > 0` клиент выполняет переход на `/app/doctor/exercises`; если всё было пропущено/ошибки — остаёмся на странице, показывается краткая сводка.

## Ручной QA (чек-лист)

| # | Проверка | Результат |
|---|-----------|-----------|
| 1 | Пустое название + выбор медиа → название заполнилось из displayName/filename | ☐ |
| 2 | Название уже введено → смена медиа не меняет название | ☐ |
| 3 | Автосоздание: по умолчанию только непривязанные видео | ☐ |
| 4 | Выбрать все / снять выбор / переключение по карточке | ☐ |
| 5 | Создание: по одному упражнению на файл, заголовок = имя медиа | ☐ |
| 6 | Уже привязанное видео не создаётся повторно (сервер) | ☐ |
| 7 | Регрессия: сохранение одного упражнения, пикер медиа в других местах | ☐ |

Агент: отметьте галочки после прогона в браузере.
