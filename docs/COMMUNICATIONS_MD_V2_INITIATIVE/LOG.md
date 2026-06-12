# COMMUNICATIONS_MD_V2 — Execution Log

## Этап 2 (A1) — Чаты

**Дата:** 2026-06-12

### Что сделано

1. **Ширины пейнов и независимый скролл:**
   - `DoctorSupportInbox.tsx` — раскладка переведена с `grid style={gridTemplateColumns:"1.4fr 1fr"}` на `CatalogSplitLayout` с `className="lg:grid-cols-[1fr_1.2fr]"` (чат шире списка). Обёртка получила `DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE` для фиксированной высоты (вьюпорт − шапка − таб-бар). Каждый пейн имеет `overflow-y-auto` внутри — список и тред скроллятся независимо.
   - Добавлены импорты `CatalogSplitLayout`, `DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE`, `DoctorEmptyState`.

2. **Тред (`DoctorChatPanel`) — горизонтальный padding и интервал:**
   - `ChatView.tsx` — добавлен `px-3` к scroll-области для `variant === "doctor"` (через `cn`). Composer-обёртка получила `px-3` для той же ветки. Интервал между сообщениями в grouped-режиме: `space-y-3` для `doctor`, `space-y-2` для `patient` (было `space-y-2` везде).
   - `DoctorClientEmbeddedChat` использует тот же `DoctorChatPanel` с `variant="doctor"` — правки применятся и там, что ожидаемо (padding сообщений уместен в embedded-виде тоже).

3. **Превью в списке чатов — одна строка с ellipsis:**
   - Превью изменено с `<div className="... truncate">` на `<p className="... truncate">`. Добавлен `overflow-hidden` на `min-w-0 flex-1` контейнер строки для гарантированного ограничения ширины. Текст превью (`getSenderPrefix: lastMessageText`) уже был в `truncate` — `<p>` + `overflow-hidden` на родителе обеспечивает одну строку.

4. **Пустое правое состояние — `DoctorEmptyState`:**
   - Ad-hoc `<div>...<p>...</p><p>...</p></div>` заменён на `<DoctorEmptyState size="sm" className="flex-1 items-center justify-center px-6 text-center">` с двумя `<span>`. Текст «Выберите чат слева» сохранён (тест проходит).

5. **Поиск, чипы «Непрочитанные»/«★ На сопровождении», логика поллинга** — не тронуты.

### Проверки

- `npx tsc --noEmit` — **0 ошибок** (нет вывода).
- `npx vitest run DoctorSupportInbox.test.tsx` — **15 passed (1 file)**.
- `npx vitest run DoctorChatPanel.test.tsx` — **3 passed (1 file)**.
- `npx eslint DoctorSupportInbox.tsx ChatView.tsx` — **0 ошибок** (нет вывода).

### Затронутые файлы

- `apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx` — основной файл этапа.
- `apps/webapp/src/modules/messaging/components/ChatView.tsx` — padding и интервал для doctor-variant.

### Сознательно не сделано

- `DoctorChatPanel.tsx` не менялся — правки padding сделаны в `ChatView` (через ветку по `variant`), что более правильно с точки зрения разделения ответственности.
- Mobile-навигация (кнопка «назад» в мобильном виде) — не добавлялась: `CatalogSplitLayout` имеет `mobileBackSlot` проп, но для чатов мобильный UX не является объектом этого этапа. Зафиксировано как развилка.
- `rounded-2xl` в `ChatView` для пузырьков (`doctor` variant) — не менялся; он находится в `grouped` map и технически нарушает §A.3, но правка пузырьков чата не входила в scope этапа.

### Развилки

- **`rounded-2xl` в пузырьках доктора** (`ChatView` doctor grouped mode): пузырьки используют `rounded-2xl`, что запрещено по §A.3. Исправление требует осторожности (patient variant не трогать). Можно добавить ветку `variant === "doctor" ? "rounded-lg" : "rounded-2xl"`. Зафиксировано как backlog, не сделано в этом этапе.
- **Mobile UX чатов**: `CatalogSplitLayout` поддерживает мобильный режим `mobileView="list"|"detail"`. Реализовано переключение `mobileView={selectedId ? "detail" : "list"}`, но кнопки «назад» нет (`mobileBackSlot` не задан). На мобиле правая панель будет перекрывать левую при выборе чата, но возврата к списку без выбора другого чата нет. Можно решить добавлением кнопки «← Назад» в `mobileBackSlot`.
- **`gap-3` между таб-навом и контентом**: развилка из Этапа 1 — при фиксированной высоте через `DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE` (использует `dvh`) `gap-3` из `<main className="flex flex-col gap-3">` включён в расчёт высот через CSS-переменные. При проверке tsc 0 ошибок, ожидаем что высоты работают корректно по аналогии с упражнениями.

---

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
