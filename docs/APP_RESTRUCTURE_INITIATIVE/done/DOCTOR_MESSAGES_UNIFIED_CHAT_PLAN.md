# DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN — этап 5: сообщения врача

**Дата:** 2026-05-02.  
**Статус:** выполнено; post-audit + hardening fixes закрыты 2026-05-02 (unread badge, patient-missing errors, network fallback).  
**Связанный общий план:** [PLAN_DOCTOR_CABINET.md](../PLAN_DOCTOR_CABINET.md), этап 5.  
**Audit/LOG:** [`DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT.md`](DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT.md), [LOG.md](../LOG.md).

---

## Цель

Сделать один понятный сценарий переписки врача с пациентом:

- `/app/doctor/messages` показывает список чатов;
- у списка есть фильтр «непрочитанные»;
- конкретный диалог открывается в одном универсальном layout-е чата;
- тот же layout открывается из карточки пациента в модалке;
- старая отдельная форма отправки сообщений в карточке пациента уходит;
- прочтение сообщений отмечается автоматически при открытом/видимом диалоге.

Это этап про индивидуальные чаты. Массовые рассылки и журнал рассылок не трогать.

---

## Текущая база

Уже есть:

- `/app/doctor/messages`:
  - `apps/webapp/src/app/app/doctor/messages/page.tsx`;
  - `apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx`;
- doctor API:
  - `GET /api/doctor/messages/conversations`;
  - `GET /api/doctor/messages/[conversationId]`;
  - `POST /api/doctor/messages/[conversationId]`;
  - `POST /api/doctor/messages/[conversationId]/read`;
  - `GET /api/doctor/messages/unread-count`;
- patient API и UI используют тот же `support_conversations` поток:
  - `apps/webapp/src/app/api/patient/messages/**`;
  - `apps/webapp/src/app/app/patient/messages/PatientMessagesClient.tsx`;
- общий визуальный компонент:
  - `apps/webapp/src/modules/messaging/components/ChatView.tsx`;
- polling hook:
  - `apps/webapp/src/modules/messaging/hooks/useMessagePolling.ts`;
- support repo:
  - `apps/webapp/src/infra/repos/pgSupportCommunication.ts`;
  - уже есть `ensureWebappConversationForUser`, `listMessagesSince`, `markUserMessagesReadByAdmin`, `countUnreadUserMessagesForAdmin`.

В карточке пациента сейчас есть отдельный старый блок:

- `SendMessageForm` внутри `apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx`;
- история из `doctor-messaging` / `messageLog`;
- рядом уже есть ссылка «Открыть раздел сообщений».

Важное различие: старый `doctor-messaging` в карточке и новый support-chat поток — не одно и то же. Удалять старую форму можно только после того, как врач может открыть рабочий support-chat именно с этим пациентом.

---

## Scope boundaries

Разрешено трогать:

- doctor messages:
  - `apps/webapp/src/app/app/doctor/messages/**`;
  - `apps/webapp/src/app/api/doctor/messages/**`;
- doctor client card:
  - `apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx`;
  - focused child component рядом с карточкой, если это уменьшит размер правки;
- messaging module:
  - `apps/webapp/src/modules/messaging/**`;
- support communication repo only through existing service/port path:
  - `apps/webapp/src/infra/repos/pgSupportCommunication.ts`;
  - `apps/webapp/src/infra/repos/inMemorySupportCommunication.ts`, если нужен тестовый parity;
- DI only if needed:
  - `apps/webapp/src/app-layer/di/buildAppDeps.ts`;
  - `apps/webapp/src/app-layer/di/buildAppDeps.test.ts`;
- tests for changed API/UI;
- docs:
  - `docs/APP_RESTRUCTURE_INITIATIVE/LOG.md`;
  - this document;
  - `PLAN_DOCTOR_CABINET.md`, only if decisions change.

Вне scope:

- не трогать `/app/doctor/broadcasts`;
- не менять массовые рассылки, broadcast audit, категории рассылок;
- не редизайнить карточку пациента целиком;
- не менять порядок блоков карточки пациента — это этап 6;
- не менять пациентский интерфейс `/app/patient/messages`, кроме случаев, когда общий `ChatView` нужно сохранить совместимым;
- не менять схему БД без отдельного решения;
- не добавлять env vars, интеграционные настройки или новые зависимости;
- не делать realtime/websocket/SSE. Polling остаётся допустимым;
- не чинить все старые долги `doctor-messaging` / `messageLog`, если они уходят из карточки.

---

## Архитектурные правила

Направление зависимостей:

```text
doctor page / client component
  -> doctor API route / server action
  -> buildAppDeps()
  -> modules/messaging/* service
  -> support communication port/repo
```

Запрещено:

- писать SQL в route handlers или React components;
- добавлять прямые infra imports в modules;
- расширять ESLint allowlist;
- дублировать чат-логику отдельно для карточки пациента;
- делать второй composer для карточки пациента.

Замечание по текущему коду: `modules/messaging/*` уже импортирует типы из `pgSupportCommunication`. Это существующее состояние. В этом этапе не расширять такую связность; если исполнитель трогает типы, предпочтительно вынести нужные DTO в module-level types/ports отдельным маленьким шагом.

---

## Минимальная продуктовая версия

Этап считается полезным, даже если без большой архитектурной переделки закрыты только эти вещи:

1. `/app/doctor/messages`:
   - список диалогов;
   - фильтр «Все / Непрочитанные»;
   - понятный empty-state;
   - выбор диалога открывает чат в модалке или правой панели, но через один chat layout.
2. Карточка пациента:
   - кнопка «Открыть чат»;
   - если у пациента есть непрочитанные — бейдж;
   - клик открывает тот же chat layout в модалке;
   - старая `SendMessageForm` больше не показывается как отдельный сценарий.
3. Прочтение:
   - при открытом диалоге входящие от пациента отмечаются прочитанными;
   - если точное IntersectionObserver-поведение дорого, допустима первая версия «отметить прочитанным после открытия диалога и рендера сообщений», но это нужно явно записать в `LOG.md`.

---

## Backend gaps to close

### 1. Фильтр непрочитанных

Сейчас `GET /api/doctor/messages/conversations` возвращает открытые диалоги без unread count.

Нужно:

- добавить unread count по каждому диалогу или поле `hasUnreadFromUser`;
- поддержать query `?unread=1` или фильтрацию на клиенте, если count уже получен;
- сортировка: непрочитанные от пациента выше, затем по `lastMessageAt desc`.

Предпочтительно считать unread на уровне repo query, чтобы не делать N+1.

### 2. Открыть чат по пациенту из карточки

Нужно endpoint/service method для врача:

- вход: `patientUserId`;
- действие: найти или создать webapp support conversation для этого пациента;
- выход: `conversationId` + последние сообщения + unread count по этому диалогу.

Возможные формы:

- `GET /api/doctor/messages/by-patient/[userId]`;
- или `POST /api/doctor/messages/conversations/ensure` с `{ patientUserId }`.

Выбрать простую форму по локальному стилю API. Route handler должен быть тонким: auth, validate, service call, response.

Важно: врач должен иметь доступ к пациенту по текущим правилам кабинета. Если сейчас для doctor access достаточно роли, не добавлять сложную ACL без отдельного решения.

### 3. Mark-as-read

Сейчас `POST /api/doctor/messages/[conversationId]/read` отмечает все сообщения пользователя в диалоге прочитанными.

Для точного visible-read можно расширить API позже:

- `messageIds`;
- или `upToCreatedAt`;
- или `visibleMessageIds`.

В этом этапе не делать сложный read model, если это превращается в отдельную backend-задачу. Минимум: автоматический вызов read при открытии видимого диалога + обновление counts/list.

---

## UI target

### `/app/doctor/messages`

Целевое поведение:

- слева список чатов;
- сверху фильтр:
  - «Все»;
  - «Непрочитанные»;
- строка чата:
  - имя пациента;
  - телефон, если есть;
  - последний текст;
  - время последнего сообщения;
  - бейдж непрочитанных, если есть;
- клик по строке:
  - открывает универсальный chat layout;
  - на desktop допустима правая панель или modal;
  - на mobile лучше modal / sheet-like поведение;
- отправка сообщения остаётся через существующий `POST /api/doctor/messages/[conversationId]`;
- после отправки список обновляется.

### Карточка пациента

Целевое поведение:

- в блоке коммуникаций вместо старой формы:
  - CTA «Открыть чат»;
  - бейдж «N непрочитанных», если есть;
  - короткое пояснение: «История переписки открывается в едином чате»;
- клик:
  - ensure/fetch conversation by patient;
  - открывает modal с тем же chat layout;
- старая история `messageLog` может остаться как архивный журнал только если её удаление рискованно. Но отправка из карточки должна идти только через единый chat layout.

Если убрать старую историю сейчас сложно, оставить её под подписью «Старый журнал отправок» и записать follow-up. Но форму отправки не дублировать.

### Универсальный chat layout

Рекомендуется вынести из `DoctorSupportInbox`:

- `DoctorChatPanel` или `SupportConversationChat`;
- props:
  - `conversationId`;
  - `initialMessages?`;
  - `variant="doctor"`;
  - `onReadStateChanged?`;
  - `onSent?`;
- внутри:
  - загрузка сообщений;
  - composer;
  - polling;
  - mark-as-read;
  - автоскролл.

`ChatView` можно оставить низкоуровневым компонентом пузырьков. Не надо ломать patient usage.

---

## Автопрочтение

Цель: врач не должен вручную нажимать «прочитано».

Приоритеты:

1. Если дешёво:
   - `IntersectionObserver` на входящих сообщениях от пациента;
   - когда сообщение попало в область чата, отправить read;
   - батчить вызовы, не стрелять запросом на каждое сообщение.
2. Если текущий backend не поддерживает message-level read:
   - при первом отображении диалога вызвать conversation-level read;
   - после успешного read обновить unread count в списке;
   - записать в `LOG.md`, что точное per-visible read отложено.

Не делать сложную модель с read receipts для каждого участника без отдельного решения.

---

## Шаги исполнения

**Статус шагов (факт 2026-05-02):**

- [x] Шаг 0. Preflight
- [x] Шаг 1. Conversation list + unread filter
- [x] Шаг 2. Chat layout extraction
- [x] Шаг 3. Modal opening from messages list
- [x] Шаг 4. Open chat from patient card
- [x] Шаг 5. Read behavior (conversation-level; limitation зафиксирован в `LOG.md`)
- [x] Шаг 6. Удаление дубля отправки
- [x] Шаг 7. Документация и лог

### Шаг 0. Preflight

Проверить фактическую поддержку backend:

- `GET /api/doctor/messages/conversations`;
- `GET/POST /api/doctor/messages/[conversationId]`;
- `POST /api/doctor/messages/[conversationId]/read`;
- `GET /api/doctor/messages/unread-count`;
- `supportCommunication.ensureWebappConversationForUser`;
- `ClientProfileCard` и старый `SendMessageForm`.

Команды/поиск:

```bash
rg "DoctorSupportInbox|SendMessageForm|doctorMessaging|supportCommunication|markUserMessagesRead|unread-count" apps/webapp/src
```

Критерий закрытия: в `LOG.md` записано, что backend уже умеет, чего не хватает.

### Шаг 1. Conversation list + unread filter

- Расширить список conversations unread-полем.
- Добавить filter «Все / Непрочитанные».
- Обновить сортировку: unread от пациента выше.
- Показывать бейдж unread count.

Проверки:

- API route test для conversations с unread count;
- UI test или focused component test на фильтр unread;
- smoke: список пустой / есть unread / нет unread.

### Шаг 2. Chat layout extraction

- Вынести общую логику выбранного диалога из `DoctorSupportInbox`.
- Сохранить отправку, polling, загрузку истории.
- Не менять patient `ChatView` поведение.

Проверки:

- render test: chat layout показывает messages и composer;
- send success очищает draft и вызывает refresh;
- polling merge не дублирует сообщения.

### Шаг 3. Modal opening from messages list

- Из списка чатов открывать выбранный диалог через новый layout.
- На desktop можно оставить правую панель, если modal сильно усложняет. Но layout должен быть тот же, что будет использовать карточка пациента.
- Если выбран modal, закрытие не должно сбрасывать список.

Проверки:

- клик по чату открывает layout;
- закрытие возвращает к списку;
- read state обновляет badge.

### Шаг 4. Open chat from patient card

- Добавить doctor API для ensure/fetch conversation by `patientUserId`.
- В `ClientProfileCard` заменить старую форму отправки на CTA «Открыть чат».
- Добавить unread badge для пациента, если backend позволяет получить count дёшево.
- Открывать modal с тем же chat layout.

Проверки:

- card render test: CTA есть, `SendMessageForm` не рендерится;
- click opens modal and loads conversation;
- patient missing / conversation cannot be created -> понятный error state.

### Шаг 5. Read behavior

- Реализовать auto-read выбранным способом:
  - exact visible read через observer, если не дорого;
  - или conversation-level read after open/render.
- После read обновлять:
  - список чатов;
  - unread filter;
  - глобальный unread count, если UI его использует.

Проверки:

- API read route test, если контракт менялся;
- UI test на вызов read при открытии/видимости;
- smoke: непрочитанные исчезают после открытия диалога.

### Шаг 6. Удаление дубля отправки

- Убедиться, что `SendMessageForm` больше не используется в карточке пациента.
- Проверить, что старая `doctor-messaging` история не является единственным важным журналом.
- Если история остаётся, переименовать визуально в старый журнал / историю отправок, без composer.

Проверки:

```bash
rg "SendMessageForm|doctorMessaging|doctor-client-message-history-list|doctor-client-open-support-chat-button" apps/webapp/src/app/app/doctor/clients apps/webapp/src/app/app/doctor/messages
```

### Шаг 7. Документация и лог

- Добавить запись в `LOG.md`:
  - что закрыто;
  - какие backend gaps закрыты;
  - какой read behavior выбран;
  - что сознательно не делали.
- Если точный visible-read отложен, записать это как limitation, не как скрытый долг.

---

## Проверки этапа

Targeted tests:

```bash
pnpm --dir apps/webapp test -- src/app/api/doctor/messages
pnpm --dir apps/webapp test -- src/modules/messaging
```

Если добавлены/изменены UI tests:

```bash
pnpm --dir apps/webapp test -- <new-or-changed-ui-test-file>.test.tsx
```

Phase-level для webapp, если затронуты API + shared messaging components + client card:

```bash
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
```

Архитектурная проверка:

```bash
rg "@/infra/db|@/infra/repos" apps/webapp/src/modules apps/webapp/src/app/api/doctor/messages
```

Полный корневой `pnpm run ci` внутри этапа не нужен без repo-level изменений. Перед push действует общее правило репозитория.

---

## Manual smoke

Проверить:

- `/app/doctor/messages` без диалогов;
- `/app/doctor/messages` с несколькими диалогами;
- фильтр «Непрочитанные»;
- отправка ответа врачом;
- polling новых сообщений;
- открытие чата из карточки пациента;
- read behavior: unread badge исчезает после открытия/прочтения;
- старая форма отправки в карточке пациента не видна;
- `/app/doctor/broadcasts` не изменился.

---

## Stop conditions

Остановиться и спросить, если:

- support-chat нельзя надёжно открыть по `patientUserId` без новой модели данных;
- старый `doctor-messaging` нельзя убрать из карточки без потери критичного сценария;
- точное visible-read требует schema change или сложной read receipt модели;
- для modal/layout нужно переписывать patient messages UI;
- для решения нужен websocket/SSE;
- задача начинает тянуть broadcasts, рассылки, дашборд, бейджи меню или глубокую переработку карточки пациента;
- нужно менять production env или интеграционные настройки.

---

## Definition of Done

- `/app/doctor/messages` показывает список чатов с фильтром «Непрочитанные».
- Один chat layout используется из списка чатов и из карточки пациента.
- В карточке пациента нет отдельной формы отправки сообщения.
- Врач может открыть чат конкретного пациента из карточки.
- Непрочитанные сообщения пациента автоматически отмечаются прочитанными выбранным способом.
- `/broadcasts` не затронут.
- Tests/API/UI checks выполнены по масштабу изменений.
- `LOG.md` содержит запись о выполнении этапа 5 и ограничениях, если они остались.
