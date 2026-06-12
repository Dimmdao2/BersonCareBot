# COMMUNICATIONS_MD_V2 — Execution Log

## Этап 1 (A0) — порядок вкладок + каркас скролла

**Дата:** 2026-06-12

### Что сделано

1. **Порядок вкладок изменён** на `Чаты → Комментарии → Заявки → Рассылки`:
   - `doctorCommunicationsTabs.ts` — `COMMUNICATIONS_TABS` переставлен в порядок `chats, comments, intake, broadcasts`.
   - `communicationsTabRegistry.ts` — `COMMUNICATIONS_TAB_REGISTRY` приведён к тому же порядку.
   - `doctorCommunicationsTabs.test.ts` — имя теста и ожидаемый массив обновлены на `["chats","comments","intake","broadcasts"]`.
   - `communicationsTabRegistry.test.ts` — не трогался: тест сравнивает реестр с `COMMUNICATIONS_TABS` динамически, а не хардкодит порядок.
   - `DoctorCommunicationsShell.test.tsx` — не трогался: vi.mock полностью переопределяет реестр, порядок реального файла не влияет на тесты шелла.

2. **Каркас независимого скролла** (структурная подготовка):
   - `DoctorCommunicationsShell.tsx` — обёртке активного таба (`<div hidden=...>`) добавлены классы `flex-1 min-h-0`.
   - `<main>` в `DoctorAppShell` уже `flex flex-col` — добавленные классы позволят активному пейну таба растянуться на оставшуюся высоту контейнера, когда табы этапов 2–5 реализуют внутренний скролл через `CatalogSplitLayout`.
   - Скрытые табы (`hidden` = `display:none`) не участвуют в flex-раскладке — на layout не влияют.
   - Паттерн keepMounted и URL-sync (history.replaceState/popstate) не затронуты.

### Проверки

- `npx tsc --noEmit` — 0 ошибок (нет вывода).
- `npx vitest run` по 3 тест-файлам — **19 passed (3 files)**.
- `npx eslint` по изменённым файлам — 0 ошибок (нет вывода).

### Сознательно не сделано

- Редиректы старых URL — не менялись (вне scope этапа 1).
- Deep-link ключи — не менялись (не трогаем контракт).
- Левое навигационное меню (`doctorNavLinks.ts`) — не трогается (чужая зона).
- Переверстка конкретных табов под независимый скролл — это этапы 2–5.
- Визуальный split конкретных пейнов (CatalogSplitLayout внутри ChatsTab/IntakeTab/CommentsTab/BroadcastsTab) — этапы 2–5.

### Развилки

- **Высота контейнера коммуникаций.** `DoctorAppShell` использует `DOCTOR_PAGE_CONTAINER_CLASS` (`mx-auto w-full max-w-7xl px-3 pt-3 pb-6`) без явного `h-full` или `min-h-0`. Когда табы (этапы 2–5) начнут применять `CatalogSplitLayout` с высотами типа `DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE`, контейнер будет использовать `dvh`-вычисления относительно viewport — это поведение идентично упражнениям. Проверить при реализации первого таба со split-layout (этап 2), что высоты работают корректно и не нужно дополнительно передавать `h-full` через `DoctorAppShell`.
- **`gap-3` в `<main>`.** Пространство между таб-навом и контентом таба — `gap-3` из `<main className="flex flex-col gap-3">`. При применении split-layout в табах нужно убедиться, что `gap-3` не создаёт лишних отступов между таб-баром и областью контента. Если потребуется убрать зазор — нужна будет аддитивная правка `DoctorAppShell` или передача класса через проп (с сохранением обратной совместимости).
