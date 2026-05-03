# DOCTOR_NAV_BADGES_PLAN — этап 3: бейджи в меню врача

**Дата:** 2026-05-02.  
**Статус:** реализовано и закрыто по аудиту (код + пост-аудит: `DoctorSupportUnreadProvider`, `res.ok` для online-intake count).  
**Связанный общий план:** [PLAN_DOCTOR_CABINET.md](../PLAN_DOCTOR_CABINET.md), этап 3.

---

## Цель

Врач должен видеть из основного меню, что появились новые рабочие сигналы:

- новые онлайн-заявки;
- непрочитанные сообщения от пациентов.

Это маленький слой поверх уже закрытого этапа 2 «Меню врача» и уже закрытого этапа 5 «Сообщения». Этап не должен превращаться в дашборд «Сегодня» или новую систему уведомлений.

---

## Текущая база

Уже есть:

- кластерное меню:
  - `apps/webapp/src/shared/ui/doctorNavLinks.ts`;
  - `apps/webapp/src/shared/ui/DoctorMenuAccordion.tsx`;
  - используется в `DoctorAdminSidebar.tsx` и `DoctorHeader.tsx`;
- пункт «Онлайн-заявки»:
  - id `online-intake`;
  - route `routePaths.doctorOnlineIntake`;
- пункт «Сообщения»:
  - id `messages`;
  - route `/app/doctor/messages`;
- messages unread API:
  - `GET /api/doctor/messages/unread-count`;
  - hook `useDoctorSupportUnreadCount`;
  - refresh event `notifyDoctorSupportUnreadCountChanged`;
- online-intake API:
  - `GET /api/doctor/online-intake?status=new`;
  - response содержит `total`;
  - статусы: `new`, `in_review`, `contacted`, `closed`;
- online-intake UI:
  - `DoctorOnlineIntakeClient` по умолчанию фильтрует `new`.

Решение для этапа 3: бейдж «Онлайн-заявки» считает только `status=new`. `in_review` — это уже взятая в работу заявка, не «новая».

---

## Scope boundaries

Разрешено трогать:

- `apps/webapp/src/shared/ui/doctorNavLinks.ts`;
- `apps/webapp/src/shared/ui/DoctorMenuAccordion.tsx`;
- `apps/webapp/src/shared/ui/DoctorMenuAccordion.test.tsx`;
- `apps/webapp/src/shared/ui/DoctorAdminSidebar.tsx`, если нужен prop passthrough;
- `apps/webapp/src/shared/ui/DoctorHeader.tsx`, если нужен prop passthrough;
- doctor-only hook рядом с меню или в `modules/*`, если он не дублирует логику:
  - например `useDoctorNavBadgeCounts`;
  - или отдельный `useDoctorOnlineIntakeNewCount`;
- `apps/webapp/src/app/api/doctor/online-intake/**`, только если нужен отдельный лёгкий count endpoint;
- `apps/webapp/src/app/api/doctor/messages/unread-count/**`, только если нужно переиспользовать существующий контракт без изменения поведения;
- tests for changed API/UI/hooks;
- docs:
  - `docs/APP_RESTRUCTURE_INITIATIVE/LOG.md`;
  - this document;
  - `PLAN_DOCTOR_CABINET.md`, only if decisions change.

Вне scope:

- не делать дашборд «Сегодня» — это этап 4;
- не менять список/детали онлайн-заявок, кроме count API/hook;
- не менять логику статусов online-intake;
- не делать новые уведомления, toast, push, realtime, websocket, SSE;
- не менять пациентский интерфейс;
- не менять `/broadcasts`;
- не добавлять БД-миграции, индексы, env vars или интеграционные настройки;
- не менять структуру меню из этапа 2, кроме отображения бейджей рядом с существующими пунктами.

---

## Целевое поведение

### Desktop sidebar

- У пункта «Онлайн-заявки» виден бейдж, если `newCount > 0`.
- У пункта «Сообщения» виден бейдж, если `unreadCount > 0`.
- Бейджи не ломают active state и layout аккордеона.
- Если кластер «Работа с пациентами» закрыт, бейдж на скрытом пункте не обязан быть виден на заголовке кластера в первом проходе. Можно добавить позже, если понадобится.

### Mobile Sheet

- Те же бейджи, что в desktop.
- При открытии Sheet данные должны быть актуальными или обновиться быстро.
- Клик по пункту закрывает Sheet как сейчас.

### Значения

- `0` не показывать.
- `1..99` показывать числом.
- `100+` показывать как `99+` или `100+`; выбрать один вариант и покрыть тестом. Рекомендация: `99+`.

### Обновление

- Сообщения: использовать существующий `useDoctorSupportUnreadCount`.
- Онлайн-заявки: добавить аналогичный лёгкий hook.
- Интервал polling: 20 секунд, как у messages hook, или общий hook с двумя запросами.
- Не делать запрос на каждый render.
- Если `document.visibilityState !== "visible"`, polling не нужен.

---

## Backend plan

### Сообщения

Переиспользовать:

- `GET /api/doctor/messages/unread-count`;
- `useDoctorSupportUnreadCount`.

Новый API для сообщений не нужен.

### Онлайн-заявки

Вариант A — предпочтительный, если не хочется менять API:

- hook делает `GET /api/doctor/online-intake?status=new&limit=1`;
- берёт `total`;
- не грузит больше одной строки.

Вариант B — предпочтительный, если хочется явный лёгкий контракт:

- добавить `GET /api/doctor/online-intake/new-count`;
- ответ `{ ok: true, count: number }`;
- внутри service/port использовать тот же источник, что list, без второго смысла статуса.

Выбор по умолчанию: **Вариант A**, потому что существующий list API уже отдаёт `total`, а изменение меньше. Если при исполнении окажется, что list API тяжёлый или неудобен для polling, перейти на вариант B и записать решение в `LOG.md`.

---

## UI plan

### Типы меню

Не обязательно менять `DoctorMenuLinkItem`, но допустимо добавить metadata:

```ts
badgeKey?: "onlineIntakeNew" | "messagesUnread";
```

Если metadata добавляется:

- `online-intake` получает `badgeKey: "onlineIntakeNew"`;
- `messages` получает `badgeKey: "messagesUnread"`;
- renderer получает объект `badgeCounts`.

Если metadata не добавляется:

- можно маппить по `item.id`;
- это проще, но менее явно.

Рекомендация: добавить `badgeKey`, чтобы не завязывать rendering на строковые id внутри компонента.

### Renderer

`DoctorMenuAccordion` должен:

- получить counts из hook внутри себя или через props;
- отрендерить label + badge в одной строке;
- сохранить существующие `id` ссылок:
  - `doctor-sidebar-link-online-intake`;
  - `doctor-sidebar-link-messages`;
  - `doctor-menu-link-online-intake`;
  - `doctor-menu-link-messages`;
- не ломать `aria-expanded` cluster buttons.

Рекомендуемая разметка бейджа:

- маленький `span`;
- `aria-label` или `title`, чтобы было понятно: «Новых заявок: N», «Непрочитанных сообщений: N»;
- класс локальный, без изменения shadcn `Badge` глобально.

---

## Шаги исполнения

### Шаг 0. Preflight

Проверить текущие источники:

- `GET /api/doctor/messages/unread-count`;
- `useDoctorSupportUnreadCount`;
- `GET /api/doctor/online-intake?status=new&limit=1`;
- `DoctorMenuAccordion`.

Команды:

```bash
rg "useDoctorSupportUnreadCount|unread-count|online-intake|DoctorMenuAccordion|DOCTOR_MENU_CLUSTERS" apps/webapp/src
```

Критерий закрытия: в `LOG.md` записано, что messages source переиспользуется, а online-intake count берётся из `status=new`.

### Шаг 1. Online-intake count hook

- Добавить doctor-only hook для новых онлайн-заявок.
- В первой версии использовать `GET /api/doctor/online-intake?status=new&limit=1`.
- Возвращать `0` при ошибке/недоступности, не ломать меню.
- Polling только при visible document.

Проверки:

- unit/hook test: успешный ответ с `total`;
- ошибка fetch не падает;
- hidden tab не делает лишний запрос, если это уже покрывается паттерном existing hook.

### Шаг 2. Badge model

- Добавить `badgeKey` в menu item type или локальную мапу badge по id.
- Убедиться, что `DOCTOR_MENU_LINKS` и tests не ломаются.
- Добавить тест на badge metadata для `online-intake` и `messages`.

Проверки:

- `doctorNavLinks.test.ts`.

### Шаг 3. Badge rendering

- Обновить `DoctorMenuAccordion`.
- Бейджи должны быть одинаковы в `variant="sidebar"` и `variant="sheet"`.
- Сохранить active styles.
- Не показывать `0`.
- Большие значения форматировать (`99+`).

Проверки:

- `DoctorMenuAccordion.test.tsx`: sidebar shows badges;
- `DoctorMenuAccordion.test.tsx`: sheet shows badges;
- `DoctorMenuAccordion.test.tsx`: zero badges hidden;
- `DoctorMenuAccordion.test.tsx`: large count formatted.

### Шаг 4. Refresh behavior

- Сообщения уже обновляются через `useDoctorSupportUnreadCount`.
- После read в `DoctorChatPanel` уже вызывается refresh event для doctor unread count.
- Для online-intake после смены статуса на странице заявок достаточно polling; отдельный browser event можно добавить только если это дешёво.

Опционально:

- добавить `notifyDoctorOnlineIntakeCountChanged`;
- вызывать его после успешного `PATCH /api/doctor/online-intake/[id]/status`.

Не делать это обязательным, если усложняет этап.

### Шаг 5. Документация и лог

- Добавить запись в `LOG.md`:
  - какие источники счётчиков использованы;
  - какие проверки прошли;
  - что не делали (дашборд, push/realtime, stage 4).
- Если выбран отдельный endpoint вместо list API — обновить `apps/webapp/src/app/api/api.md`.

---

## Проверки этапа

Targeted tests:

```bash
pnpm --dir apps/webapp test -- src/shared/ui/doctorNavLinks.test.ts src/shared/ui/DoctorMenuAccordion.test.tsx
pnpm --dir apps/webapp test -- src/app/api/doctor/messages/unread-count/route.test.ts src/app/api/doctor/online-intake/route.test.ts
```

Если добавлен новый hook test:

```bash
pnpm --dir apps/webapp test -- <new-hook-test-file>.test.tsx
```

Если менялись API/exports/shared UI:

```bash
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
```

Архитектурная проверка:

```bash
rg "@/infra/db|@/infra/repos" apps/webapp/src/app/api/doctor/online-intake apps/webapp/src/shared/ui apps/webapp/src/modules
```

Не запускать полный корневой `pnpm run ci` внутри этапа без repo-level причины. Перед push действует общее правило репозитория.

---

## Manual smoke

Проверить:

- в desktop sidebar бейдж «Онлайн-заявки» появляется при `new` заявке;
- после перевода заявки из `new` в `in_review` бейдж уменьшается после refresh/polling;
- бейдж «Сообщения» появляется при непрочитанном сообщении пациента;
- после открытия/прочтения чата бейдж «Сообщения» уменьшается;
- в mobile Sheet бейджи совпадают с desktop;
- меню не дёргается и не ломает аккордеон.

---

## Stop conditions

Остановиться и спросить, если:

- `GET /api/doctor/online-intake?status=new&limit=1` оказывается слишком тяжёлым для polling и нужен отдельный endpoint или индекс;
- нужно менять модель статусов online-intake;
- нужно делать realtime/push/SSE;
- бейдж на закрытом кластере становится обязательным продуктовым требованием;
- задача начинает тянуть дашборд «Сегодня» или inbox-секции этапа 4;
- требуется менять БД, env или интеграционные настройки.

---

## Definition of Done

- У «Онлайн-заявки» в desktop/sidebar и mobile Sheet есть бейдж новых заявок (`status=new`).
- У «Сообщения» в desktop/sidebar и mobile Sheet есть бейдж непрочитанных сообщений от пациентов.
- Бейджи используют существующие источники истины и не дублируют логику.
- `0` не отображается; большие значения форматируются.
- Polling не стреляет на каждый render и не мешает hidden tab.
- Tests и lint/typecheck выполнены по масштабу изменений.
- `LOG.md` содержит запись о выполнении этапа 3 и принятых решениях.
