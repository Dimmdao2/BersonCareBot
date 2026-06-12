# COMMUNICATIONS_MD_V2 — Execution Log

## Этап 4a — бэкенд каналов рассылок

**Дата:** 2026-06-13

### Что сделано

1. **5-канальная модель (`broadcastChannels.ts`)**
   - Тип `BroadcastChannel` расширен: добавлены `"telegram"`, `"max"`, `"email"`.
   - `BROADCAST_ACTIVE_CHANNELS` → `["telegram","max","push","sms","email"]`.
   - Добавлен `BROADCAST_DEFAULT_CHANNELS = ["telegram","max","push"]` — используется при пустом вводе.
   - `normalizeBroadcastChannels`: пустой ввод → default-каналы; `"bot_message"` раскрывается в `["max","telegram"]` (backward compat).

2. **Перегейтирование delivery jobs (`deliveryJobs.ts`)**
   - Разделён `wantsBot` на `wantsTelegram` / `wantsMax` с поддержкой legacy-флага `legacyBotMessage`.
   - Telegram-job: `channels.includes("telegram") || legacyBotMessage`.
   - Max-job: `channels.includes("max") || legacyBotMessage`.
   - SMS — без изменений.

3. **Email fan-out (новый файл `fanOutBroadcastEmail.ts`)**
   - Отправка через `sendTransactionalSmtpEmail` по списку eligible-клиентов.
   - Адреса resolveтся через `BroadcastEmailRecipientsPort.getVerifiedEmailsForUserIds`.
   - SMTP-конфиг запрашивается lazy через `getSmtpValueJson: () => Promise<unknown>` — не блокирует инициализацию DI.
   - Полностью guarded: если `fanOutBroadcastEmailDeps` не задан — email-канал виден, счётчик реальный, но письма не отправляются.
   - Результат: `{ attempted, delivered, errors, skipped }`.

4. **Реальные счётчики каналов (`broadcastChannelCounts.ts`)**
   - Telegram: `COUNT(DISTINCT user_id) FROM user_channel_bindings WHERE channel_code = 'telegram'`.
   - Max: `COUNT(DISTINCT user_id) FROM user_channel_bindings WHERE channel_code = 'max'`.
   - Push: `COUNT(DISTINCT user_id) FROM user_web_push_subscriptions` (было hardcoded 0).
   - Email: `COUNT(*) FROM platform_users WHERE email_verified_at IS NOT NULL AND email_normalized IS NOT NULL AND merged_into_id IS NULL`.
   - SMS: `COUNT(*) FROM platform_users WHERE phone_normalized IS NOT NULL AND merged_into_id IS NULL`.
   - Поле `bot_message` = telegram (legacy alias).

5. **Инфраструктура email-recipients**
   - `pgBroadcastEmailRecipients.ts` — Drizzle реализация (запрос по `user_id ANY(::uuid[])`, только verified, не merged).
   - `inMemoryBroadcastEmailRecipients.ts` — in-memory stub для тестов.

6. **`BroadcastChannelCounts` (`draftPort.ts`)** — добавлены поля `telegram`, `max`, `email`.

7. **`BroadcastAudienceResolveResult` (`ports.ts`)** — добавлено опциональное `emailEligibleUserIds?: ReadonlySet<string>`.

8. **`broadcastEligible.ts`** — `filterEligibleBroadcastClients` принимает `emailEligibleUserIds`; `deriveBroadcastDeliveryPolicy` учитывает `wantsEmail`.

9. **DI wiring (`buildAppDeps.ts`)** — `createDoctorBroadcastsService` получает `fanOutBroadcastEmailDeps` с lazy getter `getSmtpValueJson`.

10. **UI-файлы (минимальные)**
    - `labels.ts` и `BroadcastForm.tsx` — добавлены метки для `telegram`, `max`, `email`.

### Тесты

- `broadcastChannels.test.ts` — обновлены ожидания для новых каналов по умолчанию и раскрытия `bot_message`.
- `deliveryJobs.test.ts` — 3 новых теста: явные `telegram`/`max`/`telegram+max` каналы.
- `service.test.ts` — исправлены ожидания каналов и policy kinds; добавлены тесты email fanout и guarded-режима.
- `broadcastEligible.test.ts` — добавлены тесты email-eligibility и channel-policy для telegram/max/email.
- `fanOutBroadcastEmail.test.ts` (новый) — 4 теста: отправка, skip без email, ошибки SMTP, reject resolver.
- `inMemoryBroadcastChannelCounts.test.ts` (новый) — 3 теста.

**Итог:** 8 test files, 65 tests — все GREEN.

### Гейт Phase15F

5/5 тестов GREEN. Все новые SQL — только через Drizzle `db.execute(sql\`...\`)`. pool.query/client.query не добавлялись.

### Не сделано (scope этапа 4b)

- UI изменения в `BroadcastForm.tsx` (тайлы каналов, UX email-channel) — этап 4b.
- Фильтрация по `emailEligibleUserIds` в `resolveBroadcastAudience` (buildAppDeps) — сейчас `emailEligibleUserIds` не передаётся из audience resolver, email-фанаут отправляет всем eligible-клиентам у кого есть verified email. Для точного контроля нужно добавить resolving через `broadcastEmailRecipientsPort` в `resolveBroadcastAudience`.

### Риски и решения

- **Legacy bot_message**: полная backward-compat через нормализацию на входе + флаг `legacyBotMessage` в deliveryJobs.
- **Lazy SMTP**: `getSmtpValueJson` вызывается per-execution, не при инициализации — корректно для кешированного DI.
- **Email fanout guarded**: если SMTP не настроен — `sendTransactionalSmtpEmail` вернёт ошибку/ok:false, которая логируется и считается в `errors`, но не роняет broadcast.

---

## Этап 3 (A2) — Заявки

**Дата:** 2026-06-12

### Что сделано

1. **Фильтры статусов → мультитоггл (без «Все»):**
   - Удалён тип `FilterMode` и массив `FILTER_CHIPS` со старым single-select (включая режим `"all"`).
   - Добавлен новый `FILTER_CHIPS: { status: IntakeStatus; label: string }[]` с 4 статусами: `new`, `in_review`, `booked`, `rejected` (без «Все»).
   - State заменён с `filterMode: FilterMode` на `selectedStatuses: Set<IntakeStatus>` (пустое множество = показать все заявки).
   - Функция `toggleStatus(status)` — клик вкл/выкл конкретный статус. Несколько статусов можно включить одновременно.
   - Логика фильтрации: `selectedStatuses.size === 0 ? allItems : allItems.filter(item => selectedStatuses.has(item.status))`.
   - Атрибут `aria-pressed` на каждой кнопке отражает текущее состояние тоггла.
   - Текст empty-state при фильтрации изменён: если нет заявок и выбраны статусы — «Нет заявок в выбранных статусах»; если список пуст совсем — «Заявок нет».
   - Удалён неиспользуемый импорт `doctorStatCardShellClass` из `doctorVisual`.

2. **Независимый скролл (CatalogSplitLayout):**
   - Раскладка переведена с `<div className="grid min-h-[400px]" style={{gridTemplateColumns:"1fr 1.4fr"}}>` на `CatalogSplitLayout` с `className={cn(DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE, "lg:grid-cols-[1fr_1.4fr]")}`.
   - Левый пейн (`leftPane`) — список заявок с тогглами; правый пейн (`rightPane`) — статистика + карточка детали. Каждый скроллится независимо.
   - `mobileView` переключается автоматически: `selectedId ? "detail" : "list"`.
   - Добавлены импорты: `CatalogSplitLayout`, `DoctorEmptyState`, `DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE`.

3. **Пустые состояния — `DoctorEmptyState`:**
   - Ad-hoc `<div>...<p>Выберите заявку слева</p>...</div>` заменён на `<DoctorEmptyState>`.
   - Состояния загрузки (левый пейн и правая карточка) также переведены на `DoctorEmptyState`.

4. **Статистика заявок (7/30/90/год) — НЕ тронута** (независима от фильтра, по решению владельца).
5. **Deep-link `?id=` и `onDetailChange`** — не сломаны; логика сохранена без изменений.

### Проверки

- `npx tsc --noEmit` — 0 ошибок в изменённых файлах (pre-existing ошибки в `schedule/**` — из параллельной инициативы, не наши).
- `npx vitest run src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.test.tsx` — **18 passed (1 file)**.
- `npx eslint DoctorOnlineIntakeClient.tsx DoctorOnlineIntakeClient.test.tsx` — **0 ошибок** (нет вывода).

### Затронутые файлы

- `apps/webapp/src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.tsx` — основной файл этапа.
- `apps/webapp/src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.test.tsx` — обновлены тесты под мультитоггл; добавлены кейсы «пустой выбор = все», «клик вкл/выкл», «несколько тогглов», «нет кнопки Все».

### Сознательно не сделано

- Mobile-кнопка «назад» в `mobileBackSlot` — не добавлялась (по аналогии с чатами, Этап 2). `CatalogSplitLayout` поддерживает слот, но мобильный UX не является фокусом этапа. Зафиксировано как развилка.
- Счётчики для статусов `booked` и `rejected` в чипах — не показываются (только `new` и `in_review` имеют счётчики, как было). Логика счётчиков не менялась.

### Развилки

- **Mobile UX заявок**: при открытии детали на мобильном (`mobileView="detail"`) пользователь не может вернуться к списку без выбора другой заявки — нет кнопки «← Назад» в `mobileBackSlot`. Аналогичная развилка из Этапа 2 (чаты). Решение — добавить `mobileBackSlot` с кнопкой ghost «← Назад» для закрытия детали.
- **Счётчики для всех статусов в тогглах**: сейчас счётчики отображаются только для `new` и `in_review`. Можно добавить для `booked` и `rejected` — небольшое изменение, но выходит за рамки текущего scope (требует уточнения у владельца, нужны ли все счётчики или только "горячие").
- **Начальный выбор тогглов**: дефолт — пустое множество (все заявки). Ранее дефолт был `filterMode="new"` (только новые). Изменение поведения может потребовать уточнения у владельца (если предпочтительно показывать только новые при входе). Зафиксировано как продуктовая развилка.

---

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
