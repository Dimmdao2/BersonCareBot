# DOCTOR_TODAY_DASHBOARD_PLAN — этап 4: «Сегодня» врача

**Дата:** 2026-05-02.  
**Статус:** **реализовано** (2026-05-02); журнал — [`LOG.md`](LOG.md) («этап 4»); закрытие этапа — [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) этап 4.  
**Связанный общий план:** [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md), этап 4.

---

## Цель

Страница `/app/doctor` должна отвечать врачу на простой вопрос: **«что сейчас требует моего внимания?»**

**До этапа 4** первая страница кабинета была отчётной: плитки метрик. **После реализации** `/app/doctor` — экран «Сегодня» с рабочими очередями; агрегаты остаются на `/app/doctor/stats`.

---

## Текущая база

**Примечание после реализации (2026-05-02):** список ниже зафиксирован как **исходная точка ТЗ** (preflight до замены главной врача). Фактическая реализация — [`LOG.md`](LOG.md) («этап 4»), файлы `DoctorTodayDashboard.tsx`, `loadDoctorTodayDashboard.ts`, обновлённый `page.tsx`.

Уже есть (на момент preflight):

- страница `/app/doctor`:
  - `apps/webapp/src/app/app/doctor/page.tsx`;
  - сейчас вызывает `deps.doctorStats.getDashboardMetrics()`;
  - показывает `DashboardTile`;
  - использует `DoctorDashboardContextWidgets`;
- страница статистики:
  - `apps/webapp/src/app/app/doctor/stats/page.tsx`;
  - уже владеет агрегатами по записям и клиентам;
- записи врача:
  - `deps.doctorAppointments.listAppointmentsForSpecialist({ kind: "range", range: "today" })`;
  - `deps.doctorAppointments.listAppointmentsForSpecialist({ kind: "range", range: "week" })`;
  - `deps.doctorAppointments.listAppointmentsForSpecialist({ kind: "futureActive" })`;
  - тип строки: `AppointmentRow`;
- онлайн-заявки:
  - `getOnlineIntakeService().listForDoctor({ status: "new", limit, offset })`;
  - deep-link: `/app/doctor/online-intake/[requestId]`;
- сообщения:
  - `deps.messaging.doctorSupport.unreadFromUsers()`;
  - `deps.messaging.doctorSupport.listOpenConversations({ unreadOnly: true, limit })`;
  - страница: `/app/doctor/messages`;
- меню уже переименовано:
  - `/app/doctor` в меню называется «Сегодня».

### Подтверждённые контракты данных

`AppointmentRow` (`apps/webapp/src/modules/doctor-appointments/ports.ts`) даёт для UI:

- `id`;
- `clientUserId`;
- `clientLabel`;
- `time`;
- `recordAtIso`;
- `type`;
- `status`;
- `branchName`;
- `scheduleProvenancePrefix`;
- `link` — не использовать как основной CTA, пока существующие страницы используют `/app/doctor/clients/[clientUserId]`.

`IntakeRequestWithPatientIdentity` (`apps/webapp/src/modules/online-intake/types.ts`) даёт для UI:

- `id`;
- `type`;
- `status`;
- `summary`;
- `createdAt`;
- `updatedAt`;
- `patientName`;
- `patientPhone`.

Существующая страница online-intake:

- `/app/doctor/online-intake` показывает список заявок;
- `/app/doctor/online-intake/[requestId]` уже поддерживает deep-link через `initialOpenRequestId`;
- API route `apps/webapp/src/app/api/doctor/online-intake/route.ts` нормализует тот же shape для HTTP-списка, но `/app/doctor` может читать service напрямую на сервере.

`AdminConversationListRow` (`apps/webapp/src/infra/repos/pgSupportCommunication.ts`) даёт для UI:

- `conversationId`;
- `displayName`;
- `phoneNormalized`;
- `lastMessageAt`;
- `lastMessageText`;
- `unreadFromUserCount`;
- `status`.

---

## Продуктовое решение

MVP этапа 4:

1. На `/app/doctor` показываем рабочие очереди, а не статистический отчёт.
2. Статистические плитки убираем с главного экрана; оставляем компактную ссылку «Открыть статистику».
3. «Записи сегодня», «Новые онлайн-заявки», «Непрочитанные сообщения», «Ближайшие записи» — обязательные секции.
4. «К проверке» не делаем как реальную очередь в этом проходе, потому что в текущем коде нет явного единого источника «тест/анкета требует проверки врача». Можно оставить небольшой empty-state/заметку только если это не выглядит как рабочая функция.
5. Не делаем новый realtime, push, SSE, глобальный notification center или новый тип событий.

### Проверка плана перед исполнением

План считается готовым к передаче агенту, если:

- каждый шаг ниже имеет локальный критерий закрытия и проверку;
- каждая секция экрана имеет источник данных, empty-state и CTA;
- путь данных не требует новых таблиц, миграций, env vars или интеграционной конфигурации;
- все удаления предваряются `rg`-проверкой runtime-использования;
- `LOG.md` обновляется в том же проходе, что и код.

Осознанные ограничения:

- `AppShell variant="doctor"` сейчас не выводит заголовок `title` в DOM, поэтому видимый заголовок «Сегодня» должен быть частью контента страницы/компонента.
- `getOnlineIntakeService()` уже является текущим composition path для online-intake и не входит в `buildAppDeps`; в этом этапе не нужно переносить его в общий DI, если задача остаётся только чтением списка новых заявок.
- `DoctorDashboardContextWidgets` можно удалить только после `rg`-проверки; `useDoctorSupportUnreadCount` удалять нельзя, он нужен меню/бейджам и другим сценариям.

---

## Scope boundaries

Разрешено трогать:

- `apps/webapp/src/app/app/doctor/page.tsx`;
- `apps/webapp/src/app/app/doctor/DoctorDashboardContextWidgets.tsx` — удалить, упростить или заменить;
- новый doctor-only UI компонент рядом со страницей, например:
  - `apps/webapp/src/app/app/doctor/DoctorTodayDashboard.tsx`;
  - `apps/webapp/src/app/app/doctor/DoctorTodayDashboard.test.tsx`;
- новый app-layer/helper для сборки данных, если нужен:
  - `apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.ts`;
- новый модуль только если сборка данных становится заметной бизнес-логикой:
  - `apps/webapp/src/modules/doctor-today/service.ts`;
  - `apps/webapp/src/modules/doctor-today/service.test.ts`;
- существующие сервисы через `buildAppDeps()`:
  - `doctorAppointments`;
  - `messaging.doctorSupport`;
  - `doctorStats` только для ссылки/совместимости, но не для плиток на главной;
- `apps/webapp/src/app-layer/di/buildAppDeps.ts`, если добавляется новый `doctorToday` service;
- tests для изменённых компонентов/service;
- docs:
  - `docs/APP_RESTRUCTURE_INITIATIVE/LOG.md`;
  - this document;
  - `PLAN_DOCTOR_CABINET.md`, only if decisions change.

Вне scope:

- не менять пациентский интерфейс;
- не менять карточку пациента;
- не менять `/app/doctor/stats`, кроме случаев, когда нужно поправить ссылку/заголовок;
- не менять модель статусов online-intake;
- не делать новую очередь проверки тестов, пока не определён источник данных;
- не добавлять БД-миграции, индексы, env vars или интеграционные настройки;
- не переносить сюда задачи этапа 3 про бейджи меню;
- не делать аналитику, графики, отчёты или KPI на главной странице.

### Execution tracking

Обновлять статусы в этом блоке во время исполнения, без пропуска `pending` → `in_progress` → `completed` / `cancelled`.

- [ ] `pending` — Шаг 0: preflight и фиксация рамок.
- [ ] `pending` — Шаг 1: серверный helper загрузки данных.
- [ ] `pending` — Шаг 2: UI-модель и CTA-маппинг.
- [ ] `pending` — Шаг 3: замена `/app/doctor/page.tsx`.
- [ ] `pending` — Шаг 4: компонент `DoctorTodayDashboard`.
- [ ] `pending` — Шаг 5: реализация четырёх секций.
- [ ] `pending` — Шаг 6: удаление устаревших частей.
- [ ] `pending` — Шаг 7: тесты.
- [ ] `pending` — Шаг 8: документация и лог.

---

## Целевое поведение

### Верх экрана

- Заголовок shell: `Сегодня`.
- Короткий подзаголовок: например «Рабочие задачи на ближайшие часы».
- Справа или под заголовком — ссылка `Открыть статистику` на `/app/doctor/stats`.

### Секция 1. Записи сегодня

Показывает первые записи на сегодня по времени:

- время;
- пациент/клиент;
- тип услуги;
- статус;
- филиал, если есть;
- источник расписания, если есть `scheduleProvenancePrefix`;
- CTA:
  - `Открыть карточку` если есть `clientUserId`;
  - `Открыть записи` если карточка не связана с пользователем.

Пустое состояние:

- «На сегодня записей нет»;
- CTA `Открыть записи`.

Источник:

```ts
deps.doctorAppointments.listAppointmentsForSpecialist({ kind: "range", range: "today" })
```

### Секция 2. Новые онлайн-заявки

Показывает до 3 новых заявок:

- имя пациента;
- телефон;
- тип заявки (`lfk` / `nutrition` с нормальной подписью);
- краткое описание/summary;
- дата создания;
- CTA `Открыть заявку`.

Источник:

```ts
getOnlineIntakeService().listForDoctor({
  status: "new",
  limit: 3,
  offset: 0,
})
```

Ссылка на заявку:

```txt
/app/doctor/online-intake/[requestId]
```

Пустое состояние:

- «Новых заявок нет»;
- CTA `Открыть все заявки`.

### Секция 3. Непрочитанные сообщения

Показывает до 3 диалогов с непрочитанными сообщениями от пациентов:

- имя;
- телефон, если есть;
- время последнего сообщения;
- короткий фрагмент последнего сообщения;
- счётчик непрочитанных в диалоге;
- CTA `Открыть сообщения`.

Источник:

```ts
deps.messaging.doctorSupport.listOpenConversations({
  unreadOnly: true,
  limit: 3,
})
```

Дополнительно можно получить общий счётчик:

```ts
deps.messaging.doctorSupport.unreadFromUsers()
```

Пустое состояние:

- «Непрочитанных сообщений нет»;
- CTA `Открыть все сообщения`.

### Секция 4. Ближайшие записи

Показывает ближайшие записи после сегодняшнего списка, чтобы врач видел короткий горизонт:

- рекомендуемый источник: `range: "week"` или `futureActive`;
- показывать не больше 5 строк;
- не дублировать записи из секции «Записи сегодня»;
- CTA `Все записи`.

Рекомендация для первого прохода:

```ts
deps.doctorAppointments.listAppointmentsForSpecialist({ kind: "range", range: "week" })
```

Затем отфильтровать уже показанные `id` из «Записи сегодня» и взять первые 5. Если фильтрация по датам/часовым поясам начинает усложнять этап, использовать `futureActive.slice(0, 5)` и явно записать это в `LOG.md`.

### Секция «К проверке»

В текущем проходе не делать как реальную рабочую очередь.

Причина: в коде есть результаты тестов в treatment-program, но нет готового статуса «ожидает проверки врачом» и нет готового общего списка таких задач. Если исполнитель найдёт уже готовый источник без новой модели данных, можно добавить секцию. Если нет — оставить вне scope и записать в `LOG.md`.

---

## Техническая форма

### Рекомендуемая сборка данных — выбрать минимальный вариант

Вариант A — допустим только если `page.tsx` остаётся коротким:

- `page.tsx` остаётся server component;
- `requireDoctorAccess()` вызывается в начале;
- `buildAppDeps()` создаётся один раз;
- `getOnlineIntakeService()` создаётся рядом с другими server deps;
- `Promise.all` собирает все списки;
- данные маппятся в локальный `TodayDashboardData`;
- UI передаётся в чистый presentational component `DoctorTodayDashboard`.

Вариант B — предпочтительный для агентского исполнения:

- добавить `apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.ts`;
- оставить `page.tsx` тонким: auth, deps, `loadDoctorTodayDashboard`, render;
- вынести нормализацию и дедупликацию в helper;
- тестировать helper отдельно без React;
- `DoctorTodayDashboard.tsx` тестировать как pure render component.

Вариант C — только если во время исполнения обнаружится настоящая доменная логика:

- добавить `apps/webapp/src/modules/doctor-today/service.ts`;
- описать port/deps в `modules/doctor-today/ports.ts`, если появится внешний источник;
- подключить через `buildAppDeps`;
- не импортировать `@/infra/db/*` или `@/infra/repos/*` из module;
- зафиксировать расширение scope в `LOG.md`.

Решение по умолчанию: **Вариант B**. Он лучше соответствует агентскому стандарту: тонкая страница, тестируемая сборка данных, минимальный риск разрастания RSC.

### Предлагаемая структура файлов

Обязательные изменения:

- `apps/webapp/src/app/app/doctor/page.tsx`:
  - убрать `deps.doctorStats.getDashboardMetrics()`;
  - убрать локальный `DashboardTile`;
  - убрать `DoctorDashboardContextWidgets`;
  - установить `AppShell variant="doctor"` и отрендерить `DoctorTodayDashboard`.
- `apps/webapp/src/app/app/doctor/DoctorTodayDashboard.tsx`:
  - pure server-compatible component без `"use client"`;
  - принимает `data: TodayDashboardData`;
  - содержит видимый заголовок, ссылку на статистику и 4 секции.
- `apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.ts`:
  - серверный helper загрузки/нормализации;
  - экспортирует типы `Today*` и функции, которые удобно тестировать.
- `apps/webapp/src/app/app/doctor/DoctorTodayDashboard.test.tsx`:
  - render-тесты для секций, empty-state и CTA.
- `apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.test.ts`:
  - unit-тесты дедупликации и маппинга, если helper добавлен.

Опциональные изменения:

- `apps/webapp/src/app/app/doctor/DoctorDashboardContextWidgets.tsx`:
  - удалить, если `rg` подтверждает единственное использование;
  - если удаление неудобно для диффа, оставить неиспользуемым нельзя — лучше удалить файл.
- `docs/APP_RESTRUCTURE_INITIATIVE/LOG.md`:
  - добавить запись исполнения.
- `docs/APP_RESTRUCTURE_INITIATIVE/PLAN_DOCTOR_CABINET.md`:
  - трогать только если меняется статус/решение этапа 4.

### Типы UI-модели

Рекомендуемая модель:

```ts
export type TodayAppointmentItem = {
  id: string;
  time: string;
  clientLabel: string;
  clientUserId: string | null;
  type: string;
  status: string;
  branchName: string | null;
  scheduleProvenancePrefix: string | null;
  href: string;
  ctaLabel: string;
};

export type TodayIntakeItem = {
  id: string;
  patientName: string;
  patientPhone: string;
  typeLabel: string;
  summary: string | null;
  createdAtLabel: string;
  href: string;
};

export type TodayUnreadConversationItem = {
  conversationId: string;
  displayName: string;
  phoneNormalized: string | null;
  lastMessageAtLabel: string;
  lastMessageText: string | null;
  unreadFromUserCount: number;
  href: string;
};

export type TodayDashboardData = {
  todayAppointments: TodayAppointmentItem[];
  newIntakeRequests: TodayIntakeItem[];
  unreadConversations: TodayUnreadConversationItem[];
  unreadTotal: number;
  upcomingAppointments: TodayAppointmentItem[];
};
```

Требования к маппингу:

- `clientUserId` у `AppointmentRow` сейчас типизирован как `string`, но CTA всё равно должен проверять `trim()`; пустое значение ведёт на `/app/doctor/appointments`.
- URL карточки клиента строить через `encodeURIComponent(clientUserId)`.
- `IntakeType` маппить как `lfk` → `ЛФК`, `nutrition` → `Нутрициология`; неизвестные значения не ожидаются.
- `summary` и `lastMessageText` не должны ломать сетку: ограничить длину в UI (`line-clamp`/CSS) или в helper коротким `truncateText`.
- Даты отображать тем же простым local format, что уже используется в doctor UI; не добавлять новую timezone-настройку.
- Для сообщений `href` на MVP может быть `/app/doctor/messages`; deep-link в конкретный conversation не вводить в этом проходе.

### Серверные вызовы

Сборка данных должна выглядеть концептуально так:

```ts
const [todayAppointments, weekAppointments, newIntake, unreadConversations, unreadTotal] =
  await Promise.all([
    deps.doctorAppointments.listAppointmentsForSpecialist({ kind: "range", range: "today" }),
    deps.doctorAppointments.listAppointmentsForSpecialist({ kind: "range", range: "week" }),
    getOnlineIntakeService().listForDoctor({ status: "new", limit: 3, offset: 0 }),
    deps.messaging.doctorSupport.listOpenConversations({ unreadOnly: true, limit: 3 }),
    deps.messaging.doctorSupport.unreadFromUsers(),
  ]);
```

Правила:

- не вызывать `deps.doctorStats.getDashboardMetrics()` на `/app/doctor`;
- не добавлять API route для главной, потому что это server component;
- не добавлять polling/hook на главную;
- ошибки отдельных сервисов не глушить silently: если текущие страницы падают при ошибке deps, главная может следовать тому же server-error поведению.

### Client vs Server

Главный экран должен быть в основном серверным:

- не polling;
- не live updates;
- данные обновляются при refresh/navigation;
- ссылки ведут в рабочие разделы, где уже есть свои интерактивные flows.

Client component допустим только для мелкого UI, если без него нельзя, но не нужен для MVP.

---

## UI rules

- Использовать compact doctor style из этапа 8: `gap-3`, `p-3`, `text-sm`, без крупных hero-карточек.
- Не возвращать большие плитки метрик на главный экран.
- Секции должны быть рабочими списками, а не цифрами.
- В каждой секции должно быть понятное empty-state сообщение и CTA.
- CTA ведут только в существующие рабочие места:
  - карточка пациента;
  - `/app/doctor/appointments`;
  - `/app/doctor/online-intake`;
  - `/app/doctor/messages`;
  - `/app/doctor/stats`.

---

## Шаги исполнения

### Шаг 0. Preflight и фиксация рамок

Выполнить read-only проверку текущего состояния:

```bash
rg "DoctorDashboardContextWidgets|DashboardTile|getDashboardMetrics|listAppointmentsForSpecialist|listForDoctor|listOpenConversations|unreadFromUsers" apps/webapp/src
rg "@/infra/db|@/infra/repos" apps/webapp/src/app/app/doctor
```

Проверить руками в коде:

- `apps/webapp/src/app/app/doctor/page.tsx` — где сейчас вызываются `getDashboardMetrics`, `futureActive`, `DashboardTile`;
- `apps/webapp/src/app/app/doctor/DoctorDashboardContextWidgets.tsx` — единственный ли это consumer `DoctorDashboardContextWidgets`;
- `apps/webapp/src/app/app/doctor/stats/page.tsx` — статистика остаётся доступной;
- `apps/webapp/src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.tsx` — deep-link `[requestId]` уже работает через `initialOpenRequestId`;
- `apps/webapp/src/app/app/doctor/appointments/page.tsx` — текущий fallback route `/app/doctor/appointments`.

Критерий закрытия:

- подтверждено, что работа не требует БД, env, новых API route, realtime или изменения статусов;
- понятен список файлов, которые будут удалены/созданы;
- если обнаружен дополнительный consumer `DoctorDashboardContextWidgets`, сначала скорректировать план.

Локальные проверки:

- `rg` выше выполнены;
- `git status --short` просмотрен перед началом реализации, чтобы не смешать чужие изменения.

### Шаг 1. Завести серверный helper загрузки данных

Создать `apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.ts`.

Минимальные экспорты:

- `TodayAppointmentItem`;
- `TodayIntakeItem`;
- `TodayUnreadConversationItem`;
- `TodayDashboardData`;
- `loadDoctorTodayDashboard(deps, intakeService)`;
- чистые helper-функции, если нужны тесты:
  - `mapAppointmentToTodayItem`;
  - `mapIntakeToTodayItem`;
  - `mapConversationToTodayItem`;
  - `getUpcomingAppointments(today, week, limit)`.

Правила реализации:

- helper не должен импортировать `buildAppDeps` или `requireDoctorAccess`;
- helper может принимать `deps` параметром из `page.tsx`;
- helper может импортировать типы из модулей (`AppointmentRow`, `IntakeRequestWithPatientIdentity`), но не infra;
- `getOnlineIntakeService()` лучше вызывать в `page.tsx`, а сервис передавать в helper, чтобы helper был тестируемым;
- если типизация deps становится громоздкой, использовать узкий локальный type только с нужными методами.

Критерий закрытия:

- загрузка данных описана в одном месте;
- `page.tsx` не разрастается бизнес-логикой;
- helper можно протестировать без React и без настоящей БД.

Локальные проверки:

- `rg "@/infra/db|@/infra/repos" apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.ts`;
- unit-тест helper добавляется на шаге 7, если helper содержит дедуп/маппинг.

### Шаг 2. Сформировать модель данных экрана

В helper нормализовать ровно данные для UI:

- для записей:
  - `id`;
  - `time`;
  - `clientLabel`;
  - `clientUserId`;
  - `type`;
  - `status`;
  - `branchName`;
  - `scheduleProvenancePrefix`;
  - `href`;
  - `ctaLabel`;
- для заявок:
  - `id`;
  - `patientName`;
  - `patientPhone`;
  - `typeLabel`;
  - `summary`;
  - `createdAtLabel`;
  - `href`;
- для сообщений:
  - `conversationId`;
  - `displayName`;
  - `phoneNormalized`;
  - `lastMessageAtLabel`;
  - `lastMessageText`;
  - `unreadFromUserCount`;
  - `href`.

CTA-правила:

- запись с `clientUserId.trim()` → `/app/doctor/clients/${encodeURIComponent(clientUserId)}`;
- запись без валидного `clientUserId` → `/app/doctor/appointments`;
- новая заявка → `/app/doctor/online-intake/${encodeURIComponent(id)}`;
- сообщение → `/app/doctor/messages`;
- статистика → `/app/doctor/stats`;
- все записи → `/app/doctor/appointments?view=future` для «Ближайшие» и `/app/doctor/appointments` для «Сегодня».

Критерий закрытия:

- `DoctorTodayDashboard` не содержит знания о raw service rows;
- ссылки централизованы в helper или рядом с типами, а не дублируются по JSX.

Локальные проверки:

- typecheck после реализации;
- тесты на CTA для linked/fallback appointment и intake deep-link.

### Шаг 3. Заменить `/app/doctor/page.tsx`

Изменить страницу:

- оставить `requireDoctorAccess()`;
- оставить `buildAppDeps()`;
- добавить `getOnlineIntakeService()`;
- вызвать `loadDoctorTodayDashboard(...)`;
- вернуть `AppShell variant="doctor"` и `DoctorTodayDashboard data={data}`;
- убрать `Link`, если он нужен был только для плиток;
- убрать `DashboardTile`;
- убрать `DoctorDashboardContextWidgets`;
- убрать `doctorStats.getDashboardMetrics()` с главной.

Важно:

- `AppShell title` можно оставить `"Сегодня"` ради семантики props, но видимый заголовок должен быть внутри `DoctorTodayDashboard`, потому что doctor variant не рендерит title;
- статистика не исчезает из продукта, она остаётся на `/app/doctor/stats`.

Критерий закрытия:

- `rg "getDashboardMetrics|DashboardTile|DoctorDashboardContextWidgets" apps/webapp/src/app/app/doctor/page.tsx` не находит совпадений;
- `/app/doctor/page.tsx` остаётся server component без `"use client"`.

Локальные проверки:

- `pnpm --dir apps/webapp typecheck`;
- lints по изменённым файлам.

### Шаг 4. Создать `DoctorTodayDashboard`

Создать `apps/webapp/src/app/app/doctor/DoctorTodayDashboard.tsx`.

Структура компонента:

- верхний блок:
  - `<h1>` или видимый заголовок `Сегодня`;
  - короткий подзаголовок «Рабочие задачи на ближайшие часы»;
  - компактная ссылка `Открыть статистику`;
- section «Записи сегодня»;
- section «Новые онлайн-заявки»;
- section «Непрочитанные сообщения»;
- section «Ближайшие записи».

UI-инварианты:

- без `"use client"`;
- без локального polling;
- без крупной hero-метрики;
- `rounded-xl border border-border bg-card p-3`;
- `gap-3`, `text-sm`, compact rows;
- empty-state внутри той же карточки, без визуального ощущения ошибки;
- CTA — `Link`, не `button`, если это навигация;
- использовать существующие shadcn/base компоненты (`Badge`, `buttonVariants`) только если они уже доступны и не тянут client-only поведение.

Критерий закрытия:

- все четыре обязательные секции присутствуют всегда;
- в каждой секции есть empty-state и CTA;
- общий счётчик сообщений, если показан, не заменяет список диалогов.

Локальные проверки:

- render-тест на наличие заголовка и четырёх секций;
- визуальный smoke в браузере после запуска webapp.

### Шаг 5. Реализовать секции по очереди

#### 5.1. Записи сегодня

Данные:

- source: `listAppointmentsForSpecialist({ kind: "range", range: "today" })`;
- показывать весь полученный список или ограничить разумным числом только если список слишком длинный в реальных данных; если ограничивается — добавить ссылку «Все записи».

UI строки:

- `time`;
- `clientLabel`;
- `type`;
- `status`;
- `branchName`, если есть;
- `scheduleProvenancePrefix`, если есть;
- CTA `Открыть карточку` или `Открыть записи`.

Empty-state:

- текст «На сегодня записей нет»;
- CTA `Открыть записи`.

Проверки:

- тест empty-state;
- тест строки с `clientUserId`;
- тест fallback без `clientUserId`.

#### 5.2. Новые онлайн-заявки

Данные:

- source: `getOnlineIntakeService().listForDoctor({ status: "new", limit: 3, offset: 0 })`;
- брать `result.items`;
- не показывать `in_review`, `contacted`, `closed`.

UI строки:

- `patientName`;
- `patientPhone`;
- `typeLabel`;
- `summary`;
- `createdAtLabel`;
- CTA `Открыть заявку`.

Empty-state:

- текст «Новых заявок нет»;
- CTA `Открыть все заявки`.

Проверки:

- тест 0 заявок;
- тест 1–3 заявки;
- тест deep-link `/app/doctor/online-intake/[id]`;
- существующий `apps/webapp/src/app/api/doctor/online-intake/route.test.ts` не ломается.

#### 5.3. Непрочитанные сообщения

Данные:

- source list: `listOpenConversations({ unreadOnly: true, limit: 3 })`;
- source count: `unreadFromUsers()`;
- список важнее числа, потому что экран отвечает «что открыть».

UI строки:

- `displayName`;
- `phoneNormalized`, если есть;
- `lastMessageAtLabel`;
- `lastMessageText`;
- `unreadFromUserCount`;
- CTA `Открыть сообщения`.

Empty-state:

- текст «Непрочитанных сообщений нет»;
- CTA `Открыть все сообщения`.

Проверки:

- тест empty-state;
- тест строки с `unreadFromUserCount`;
- тест, что CTA ведёт на `/app/doctor/messages`;
- существующие tests для messages route/Inbox не ломаются.

#### 5.4. Ближайшие записи

Данные:

- source по умолчанию: `listAppointmentsForSpecialist({ kind: "range", range: "week" })`;
- фильтр: исключить id из «Записи сегодня»;
- лимит: 5;
- если `range: "week"` возвращает уже сегодняшние и будущие в правильном порядке — использовать порядок порта;
- если порядок неясен — сортировать по `recordAtIso`, `null` в конец.

Empty-state:

- текст «Ближайших записей на неделе нет»;
- CTA `Все записи`.

Fallback:

- если в реализации всплывает сложность с timezone/week semantics, можно перейти на `futureActive.slice(0, 5)`;
- это решение обязательно записать в `LOG.md`.

Проверки:

- тест дедупликации по `id`;
- тест лимита 5;
- ручной smoke: день с сегодняшними записями и день без них.

### Шаг 6. Удалить устаревшие части

Удалить/убрать:

- локальный `DashboardTile` из `page.tsx`;
- импорт `DoctorDashboardContextWidgets`;
- файл `DoctorDashboardContextWidgets.tsx`, если `rg` подтвердил отсутствие других imports.

Не удалять:

- `useDoctorSupportUnreadCount`;
- `shared/hooks/useSupportUnreadPolling.ts`;
- `/api/doctor/messages/unread-count`;
- `/app/doctor/stats`.

Критерий закрытия:

- `rg "DoctorDashboardContextWidgets" apps/webapp/src` не находит runtime-использований;
- `rg "DashboardTile" apps/webapp/src/app/app/doctor` не находит совпадений.

Локальные проверки:

- `pnpm --dir apps/webapp typecheck`;
- `pnpm --dir apps/webapp lint`.

### Шаг 7. Тесты

Добавить `DoctorTodayDashboard.test.tsx`.

Покрыть:

- заголовок `Сегодня` и ссылку `Открыть статистику`;
- все четыре секции;
- empty-state для каждой секции;
- запись с карточкой клиента;
- запись без карточки клиента;
- заявку с type label `ЛФК`;
- заявку с type label `Нутрициология`;
- unread conversation с телефоном, временем, текстом и счётчиком;
- ближайшие записи без дубликатов.

Добавить `loadDoctorTodayDashboard.test.ts`, если helper содержит чистые функции.

Покрыть:

- `getUpcomingAppointments` исключает today ids;
- `getUpcomingAppointments` ограничивает 5 строк;
- `mapAppointmentToTodayItem` строит fallback CTA;
- `mapIntakeToTodayItem` строит deep-link;
- `mapConversationToTodayItem` не падает при `lastMessageText: null`.

Критерий закрытия:

- критичная логика CTA и дедупликации не проверяется только ручным smoke;
- snapshot-тесты не обязательны, лучше явные assertions по текстам и ссылкам.

### Шаг 8. Документация и execution log

В `docs/APP_RESTRUCTURE_INITIATIVE/LOG.md` добавить запись:

- дата;
- «Этап 4: Сегодня врача»;
- какие секции реализованы;
- какие источники данных использованы;
- что удалено с главной: `DashboardTile`, `getDashboardMetrics`, context widgets;
- что сознательно не делали:
  - «К проверке»;
  - realtime/push/SSE;
  - notification center;
  - patient card;
  - миграции/env;
- какие проверки выполнены и результат.

Обновить этот документ:

- статус на `реализовано`, только после фактического исполнения;
- отметить отклонения от плана, если они были.

`PLAN_DOCTOR_CABINET.md`:

- обновить только если этап 4 закрывается в общем плане или изменилось продуктовое решение.

---

## Проверки этапа

Preflight / architecture:

```bash
rg "DoctorDashboardContextWidgets|DashboardTile|getDashboardMetrics" apps/webapp/src/app/app/doctor
rg "@/infra/db|@/infra/repos" apps/webapp/src/app/app/doctor apps/webapp/src/modules/doctor-today
```

Targeted tests для новых файлов:

```bash
pnpm --dir apps/webapp test -- src/app/app/doctor/DoctorTodayDashboard.test.tsx
```

Если добавлен helper:

```bash
pnpm --dir apps/webapp test -- src/app/app/doctor/loadDoctorTodayDashboard.test.ts
```

Regression tests по затронутым источникам:

```bash
pnpm --dir apps/webapp test -- src/modules/doctor-appointments/service.test.ts
pnpm --dir apps/webapp test -- src/app/api/doctor/online-intake/route.test.ts
pnpm --dir apps/webapp test -- src/app/app/doctor/messages/DoctorSupportInbox.test.tsx
```

Если менялись RSC/page/shared types или удалялись файлы:

```bash
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
```

Если добавлен `modules/doctor-today`:

```bash
pnpm --dir apps/webapp test -- src/modules/doctor-today/service.test.ts
rg "@/infra/db|@/infra/repos" apps/webapp/src/modules/doctor-today
```

Обычный финал этапа: targeted tests + `typecheck` + `lint` по webapp достаточно. Полный корневой `pnpm run ci` нужен перед push/merge или если пользователь явно просит прогон «как в CI».

---

## Manual smoke

Проверить:

- `/app/doctor` открывается как «Сегодня».
- Если на сегодня нет записей, empty-state понятный и есть ссылка на записи.
- Если на сегодня есть запись, видны время, имя, тип, статус и CTA.
- Новая онлайн-заявка со статусом `new` видна в секции «Новые онлайн-заявки».
- Заявка в `in_review` не отображается как новая.
- Непрочитанный диалог виден в секции сообщений.
- Когда непрочитанных диалогов нет, секция не выглядит ошибкой.
- Ближайшие записи не дублируют список «сегодня».
- Ссылка «Открыть статистику» ведёт на `/app/doctor/stats`.

---

## Stop conditions

Остановиться и спросить, если:

- для «К проверке» требуется новая модель данных или новый статус результатов тестов;
- нужно менять смысл статусов online-intake;
- нужно добавлять realtime/push/SSE;
- нужно делать отдельную систему уведомлений;
- нужно менять карточку пациента;
- для ближайших записей требуется точная бизнес-логика «2–3 дня» с новым фильтром и это выходит за дешёвый проход;
- нужны БД-миграции, env vars или интеграционные настройки.

---

## Definition of Done

- `/app/doctor` показывает рабочий экран «Сегодня», а не отчётные плитки.
- Видимый заголовок `Сегодня` есть внутри страницы, потому что doctor `AppShell` не рендерит `title`.
- Главные секции готовы и покрыты тестами: записи сегодня, новые онлайн-заявки, непрочитанные сообщения, ближайшие записи.
- Метрики не занимают главный экран; `deps.doctorStats.getDashboardMetrics()` не вызывается на `/app/doctor`; ссылка на `/app/doctor/stats` сохранена.
- Все CTA ведут в существующие рабочие разделы и проверены тестами/ручным smoke.
- «К проверке» либо явно отложено в `LOG.md`, либо реализовано только на уже существующем источнике без новой модели.
- Targeted tests, `pnpm --dir apps/webapp typecheck`, `pnpm --dir apps/webapp lint` выполнены.
- `LOG.md` содержит запись о выполнении этапа 4 и принятых решениях.
- Полный `pnpm run ci` не требуется внутри маленького этапа, но обязателен перед push по общему правилу репозитория.
