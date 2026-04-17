# Exercises catalog performance primitives

Дата: 2026-04-17

## Цель

Зафиксировать переиспользуемые решения, внедрённые при оптимизации экрана упражнений, чтобы их можно было применять на других тяжелых каталогах (`Комплексы ЛФК`, будущие тесты и аналогичные страницы с detail-панелью).

## Что добавлено

### 1) `CatalogSplitLayout`

Файл: `apps/webapp/src/shared/ui/CatalogSplitLayout.tsx`

Назначение:

- общий split layout для схемы `list/catalog + detail`;
- SSR-стабильный CSS-first рендер без JS-ветвления по viewport;
- мобильный slide-over detail через `mobileView: "list" | "detail"`.

Ключевой контракт:

- `left: ReactNode`
- `right: ReactNode`
- `mobileView`
- `mobileBackSlot?`

### 2) `VirtualizedItemGrid<T>`

Файл: `apps/webapp/src/shared/ui/VirtualizedItemGrid.tsx`

Назначение:

- generic виртуализация карточек в сетке;
- поддержка `lanes` через `@tanstack/react-virtual`;
- отсутствие привязки к домену exercises.

Ключевой контракт:

- `items: T[]`
- `columns: number`
- `estimatedRowHeight: number`
- `overscan?: number`
- `renderItem(item, index)`
- `keyExtractor(item)`

## Как применено в Exercises

- `page.tsx` передаёт promise-пропсы в клиент.
- `ExercisesPageClient` использует `Suspense + use(...)` для данных.
- filters/header остаются вне Suspense для быстрого first paint.
- tiles переключены на `VirtualizedItemGrid`.
- detail/layout переключены на `CatalogSplitLayout`.

## Media section (variant B)

- `ExerciseForm` использует прямой импорт `MediaLibraryPickerDialog`.
- `MediaLibraryPickerDialog` лениво загружает только тяжёлые внутренние части:
  - `MediaPickerShell`
  - `MediaPickerPanel`
- превью и основные кнопки медиаблока отображаются сразу.

## Чек для повторного использования на другой странице

1. Данные списка и выбранной сущности передавать promise-пропсами и читать в клиенте через `use(...)` внутри Suspense.
2. Фильтры/верхний toolbar оставлять вне Suspense.
3. Для split-страницы использовать `CatalogSplitLayout` вместо viewport JS-ветвления.
4. Для карточек использовать `VirtualizedItemGrid<T>`, где `T` — доменный тип новой страницы.
5. Не импортировать доменные компоненты в `src/shared/ui/*`.

## Валидация

- `pnpm tsc --noEmit`
- `pnpm lint`
- профильный набор тестов страницы

