# Media Library Picker: архитектура поиска (миграция 2026-04-16)

## Сравнение вариантов

| Аспект | Было: debounced server `q` | Стало: initial fetch + local filter |
|--------|----------------------------|--------------------------------------|
| Цикл ввода | После debounce менялся `listUrl` → новый `GET /api/admin/media?q=…` | `listUrl` стабилен при фиксированных `kind`/`folderId`; ввод только меняет локальный `query` |
| Фильтрация | SQL `ILIKE` в `s3MediaStorage.list` | `filterMediaLibraryPickerItemsByQuery`: подстрока в `filename` и `displayName` (ru locale lower) |
| Debounce / Abort / requestId | Уменьшали шум запросов и гонки, но не убирали сеть из typing | Abort/requestId остаются для смены `listUrl` (например другая папка), не для каждого символа поиска |
| Лимит 200 | Тот же риск «не всё в выборке» | Тот же: локальный поиск только по уже загруженным до 200 строкам |

## Решение для этого экрана

**Picker (выбор в упражнение / Markdown / форма):** основной механизм — **локальный** поиск по уже загруженному списку. Сервер — **initial** `GET /api/admin/media` без `q` в цикле ввода.

**Экран библиотеки** (`MediaLibraryClient`): остаётся **серверный** поиск с `q`, пагинация, сортировка — это сценарий large dataset / global media UI, не смешивается с picker typing.

## Риски и edge-cases

- Файлы за пределами первых 200 по сортировке «по дате» не попадут в picker и не найдутся локальным поиском — см. отдельный долг пагинации в picker при необходимости.
- Семантика подстроки на клиенте ≈ прежнему UX (часть имени); полный паритет с SQL `ILIKE` для краевых Unicode-кейсов не гарантирован без тестов на данных.
- Тяжёлый список карточек с превью — отдельная тема (lazy video и т.д.).

## Файлы

- Хук и фильтр: `apps/webapp/src/shared/ui/media/useMediaLibraryPickerItems.ts`
- Диалоги: `MediaLibraryPickerDialog.tsx` (внутр. `MediaLibraryPickerOpenPanel`), `MediaLibraryInsertDialog.tsx` (внутр. `MediaLibraryInsertOpenBody`)
- Журнал: `docs/REPORTS/AGENT_LOG_2026-04-16-local-media-picker-search.md`

## Проверка и сопутствующие правки

- Реализация пикера: коммит **`2b383f1`**; изоляция ререндеров при вводе в поиск: **`3b104e6`**.
- Повторный прогон **`pnpm run ci`**: зелёный; для прохождения **`pnpm run audit`** (registry bulk) подняты корневые overrides: **`dompurify >=3.4.0`** (GHSA-39q2-94rc-95cp, транзитивно через `isomorphic-dompurify`) и **`hono >=4.12.14`** (GHSA-458j-xx4x-4375). Детали — в `pnpm.overrides` корневого `package.json` и в [`AGENT_LOG_2026-04-16-local-media-picker-search.md`](./AGENT_LOG_2026-04-16-local-media-picker-search.md).
