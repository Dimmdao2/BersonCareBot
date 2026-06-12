# Коммуникации (`/app/doctor/communications`)

Агрегатный экран кабинета врача: весь входящий/исходящий поток с пациентами под одним
заголовком «Коммуникации» и единым таб-баром. Wireframe: `docs/design/doctor-cabinet-wireframe.html#p-comms`.

## Маршрутизация (клиентский шелл, без rewrite)

`/app/doctor/communications` — настоящая страница-шелл (`page.tsx` → `DoctorCommunicationsShell`).
Internal-rewrite убран (Block 5 TODO#3). Старые прямые URL → **308** на агрегатный URL.

| Вкладка | id | Старый URL (308 → агрегатный) |
|---------|------|-------------------------------|
| Чаты | `chats` (default) | `/app/doctor/messages` |
| Заявки | `intake` | `/app/doctor/online-intake`, `/online-intake/:id` (→ `?tab=intake&id=:id`) |
| Комментарии | `comments` | `/app/doctor/comments` |
| Рассылки | `broadcasts` | `/app/doctor/broadcasts`, `/broadcasts/archive` (→ `?tab=broadcasts&archive=1`) |

**Защита от петли redirсts** больше не нужна для communications (rewrite убран).
Маркер `x-bc-doctor-rewrite` сохранён только для `/schedule`. Тесты: `doctorRouteRedirects.test.ts`.

## Архитектура шелла (TODO#3)

`page.tsx` (сервер) — `requireDoctorAccess` + `loadDoctorCommunicationsBadges` +
SSR-предзагрузка непрочитанных комментариев (`loadDoctorExerciseCommentsForTab`) →
рендерит клиентский `DoctorCommunicationsShell(initialTab, badges, initialTabData)`.

- `DoctorCommunicationsShell.tsx` (`"use client"`) — `DoctorAppShell` + `DoctorCommunicationsTabsNav` +
  реестр табов (`communicationsTabRegistry.ts`) + URL-sync (`?tab` + deep-link `id`/`archive` через
  `history.replaceState`/`popstate`). Лениво монтирует активный таб (`next/dynamic`, `ssr:false`) и
  кэширует уже открытые (keepMounted: скрытие, не размонтирование) → мгновенное переключение.
- 4 таб-обёртки в `tabs/`: `ChatsTab` (поллинг при активном+видимом окне), `IntakeTab` (deep-link `id`),
  `CommentsTab` (SSR непрочитанные + ленивая история/поиск), `BroadcastsTab` (deep-link `archive`).

## Компоненты таб-бара

- `doctorCommunicationsTabs.ts` — конфиг 4 вкладок (`COMMUNICATIONS_TABS`) + `communicationsTabFromQuery`.
- `DoctorCommunicationsTabsNav.tsx` — sticky таб-бар (паттерн `BookingAdminTabsNav`). Активная вкладка —
  пропом `activeTab` от шелла; клик по вкладке — `onTabClick` (client-switch без навигации). Бейджи — проп `badges`.

Таб-бар рендерит **только шелл** (`DoctorCommunicationsShell`), не отдельные страницы — легаси-страницы
вкладок сведены к 308-редиректам (Block 6).

## TODO

### ~~TODO#1: выделенный список комментариев к упражнениям~~ ✅ сделано
`comments/page.tsx` рендерит реальный список новых комментариев. Загрузчик извлечён в
shared app-layer `loadDoctorExerciseCommentAttention.ts` (форматтеры — `doctorTodayFormat.ts`),
его переиспользуют и «Сегодня» (`loadDoctorTodayDashboard`), и диалог
`DoctorTodayAttentionDialog` (через `groupExerciseCommentAttentionByPatient`). Список —
`comments/DoctorExerciseCommentsList.tsx` (reuse `ProgramItemDiscussionMessageBody`).
Ответ/отметка прочитанным — по ссылке «Открыть комментарии в программе» (read-only список).

### ~~TODO#2: кросс-вкладочные бейджи непрочитанных~~ ✅ сделано
`loadDoctorCommunicationsBadges.ts` — лёгкий общий загрузчик (`chats` = `unreadFromUsers()`,
`intake` = `listForDoctor({ status: "new" }).total`; устойчив к сбоям, нули опускаются). Все 4
страницы вкладок вызывают его и передают `badges` в `DoctorCommunicationsTabsNav`, поэтому
непрочитанные чаты / новые заявки видны со всех вкладок, а не только своей.

- [x] **Block 1** — загрузчик + unit-тесты.
- [x] **Block 2** — подключение на 4 страницах вкладок (messages / online-intake / comments / broadcasts).

Scope-примечание: `comments` в общий загрузчик не входит — его источник
(`loadDoctorExerciseCommentAttention`) обходит программы всех клиентов на сопровождении и слишком
тяжёл для вызова на каждой вкладке.

### ~~TODO#3: Коммуникации как единый клиентский экран с табами~~ ✅ сделано

**Статус:** реализовано (Blocks 1–6 + аудитные правки). `/app/doctor/communications` — клиентский
шелл с мгновенным переключением 4 табов; комментарии — doctor-wide запросом (новый метод порта/инфры
с тестами и DI); internal-rewrite убран, 308 со старых URL сохранены; `schedule` не тронут. Решения и
детали — ниже; журнал коммитов — в конце файла. План: `.cursor/plans/doctor_communications_client_shell.plan.md`.

**Это НЕ «только UI»:** задача затронула proxy/redirects и data-слой (см. scope).

**Цель/решение (вариант C).** Уйти от 4 отдельных серверных роутов через proxy-rewrite к **одному
клиентскому контейнеру-шеллу + отдельным компонентам-табам**, чтобы переключение между вкладками
было мгновенным (без повторного рендера сервера и очистки экрана). Обоснование: рендер 30–500
текстовых строк для браузера — не нагрузка; 3 из 4 табов уже клиентские; «тяжесть» была только в
загрузчике комментариев (фан-аут по пациентам) — её убираем прямым запросом (ниже).

**Архитектура.**
- `DoctorCommunicationsShell` — **клиентский** контейнер: `DoctorAppShell title="Коммуникации"` +
  `DoctorCommunicationsTabsNav` + синхронизация `?tab=` (и под-параметров: intake `id`, broadcasts
  `archive`) ↔ URL без полного перехода (`history.replaceState`/router) + реестр табов. Лениво
  монтирует активный таб (`next/dynamic`) и кэширует после первого открытия → мгновенное
  переключение. **Добавление нового таба = новый компонент + строка в реестре, без переписывания
  страницы.**
- **4 отдельных компонента-таба** (свои файлы, правятся изолированно):
  - **Чаты** — текущий `DoctorSupportInbox`. Поллинг ~1/сек, обновлять **только при реальном
    изменении** (`since=<ts>`/сравнение последнего сообщения), **только когда таб активен И окно
    видно** (`visibilitychange`). Вебсокет пока не нужен.
  - **Заявки** — `DoctorOnlineIntakeClient`; deep-link `id` (деталь заявки).
  - **Рассылки** — `BroadcastForm` + `BroadcastAuditLog`; deep-link `archive`.
  - **Комментарии** — **непрочитанные сверху одним запросом**, история — лениво на скролле; поиск
    клиент-сначала + серверный добор (канон `useMediaLibraryPickerServerSearch`). Глобальный поиск
    по всем комментариям сейчас не нужен (поиск по пациенту/тексту).

**Data-слой (по чистой архитектуре — в модуле, не на странице).**
- Новый метод(ы) в `program-item-discussion` (**port + Drizzle infra + тесты + DI**): сейчас порт
  чисто per-`stageItem`/per-`patient`, doctor-wide запроса нет — поэтому старый загрузчик и бежит
  фан-аутом по пациентам. Нужно: `listUnreadExerciseCommentsForDoctor({ doctorUserId, limit, cursor })`
  (непрочитанные, новые сверху, один индексированный запрос; `O(непрочитанных)`, а **on-support —
  это WHERE-фильтр**, не цикл и не порядок) и историю `listExerciseCommentsForDoctor({ …, cursor })`
  для ленивой подгрузки. Под капотом — последний msg на stage-item, где он от пациента и
  `createdAt >` времени прочтения врачом (join read-состояния viewer'а), фильтр «врач ведёт
  пациента».
- Comments-таб переходит на новый метод. Прежний фан-аут `loadDoctorExerciseCommentAttention` для
  таба больше не используется; дашборд «Сегодня» можно перевести на тот же запрос **позже,
  отдельным шагом** (убрать дубль) — в этой задаче не обязателен.
- Серверные данные (комментарии, журнал рассылок) шелл получает лениво через API route /
  server action.

**Routing (это `proxy.ts`, НЕ middleware — middleware в проекте нет).**
- `/app/doctor/communications` становится настоящей страницей-шеллом → **убрать internal-rewrite для
  communications** из `apps/webapp/src/proxy.ts`; оставить **308** со старых прямых URL
  (`/messages`, `/online-intake[/:id]`, `/comments`, `/broadcasts[/archive]`) на `?tab=…`. Сохранить
  deep-links (`id`, `archive`). Обновить `middleware/doctorRouteRedirects.ts` + тесты
  `doctorRouteRedirects.test.ts` (защита от петли для communications больше не нужна — rewrite ушёл).
- **`/app/doctor/schedule` НЕ трогаем** — остаётся на rewrite-агрегации; communications — пилот
  нового подхода.

**Scope.** Разрешено: `apps/webapp/src/app/app/doctor/communications/**` и 4 компонента/страницы
вкладок; `apps/webapp/src/proxy.ts` + `src/middleware/doctorRouteRedirects.ts` + их тесты; **новый
read-метод в `apps/webapp/src/modules/program-item-discussion/`** (port + infra Drizzle + тесты) +
проводка в `buildAppDeps`; при необходимости API route / server action для ленивых данных.
**Вне scope:** schedule; рефактор дашборда «Сегодня» (опционально отдельным шагом); вебсокеты.

**Процесс.** План — по `plan-authoring-execution-standard`; reuse-first (эталон — экран упражнений,
см. `DOCTOR_APP_UI_STYLE_GUIDE.md`); коммиты поэтапно по блокам с трейлером
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; **не пушить**; перед закрытием —
typecheck/lint/тесты затронутых пакетов + живой dev (`dev:doctor`, `127.0.0.1:5200`) + полный CI
финальным гейтом. Вести «Журнал» ниже.

## Журнал

- **2026-06-12 · TODO#3 SQL-fix** — дубликат столбца `id` в CTE doctor-wide запроса
  (`messages.id` + `instances.id` → две колонки `"id"`, Postgres падал на живом dev). Фикс:
  `instanceId → sql\`${instances.id}\`.as("instance_id")`. Добавлен opt-in dev-DB integration тест
  (`RUN_DOCTOR_COMMENTS_DEV_DB=1`), реально исполняющий запрос против БД — проверено `bcb_webapp_dev`.
  Коммит `149179c1`.
- **2026-06-12 · TODO#3 аудит-правки (ревью Blocks 1–6)** — pg-тест doctor-wide методов (8),
  документация promo-расхождения с «Сегодня», уточнён doc-comment поиска, удалён мёртвый экспорт
  `communicationsTabFromPathname`, оптимизация поллинга (пауза интервала при `hidden`). Коммит `0982d1f0`.
- **2026-06-12 · TODO#3 Block 6** — `/communications` как серверная страница-шелл (`page.tsx`:
  `requireDoctorAccess` + бейджи + SSR непрочитанных → `DoctorCommunicationsShell`); легаси-страницы
  вкладок (`messages`/`online-intake`/`[requestId]`/`comments`/`broadcasts`/`archive`) сведены к
  `permanentRedirect` на `?tab=…`; таб-бар рендерится только из шелла. Коммит `225b1755`.
- **2026-06-11 · TODO#3 Block 2** — таб «Комментарии» на doctor-wide запрос + ленивая история/поиск:
  `loadDoctorExerciseCommentsForTab` (один doctor-wide запрос, совместим с `TodayExerciseCommentAttentionItem`),
  `GET /api/doctor/exercise-comments` (история cursor + поиск `?q=`),
  `DoctorCommentsTab` (клиент, SSR-пропы, «Загрузить ещё», reuse `DoctorExerciseCommentsList`),
  `useDoctorExerciseCommentsSearch` (клиент-фильтр + debounced серверный добор). 28 тестов.
- **2026-06-11 · TODO#1 ✅** — стаб вкладки «Комментарии» заменён рабочим списком; загрузчик
  `loadDoctorExerciseCommentAttention` извлечён из `loadDoctorTodayDashboard` (чистый code-move),
  форматтеры → `doctorTodayFormat.ts`, группировка переиспользована диалогом. Коммит `5b3708c4`.
- **2026-06-11 · TODO#2 Block 1** — добавлен общий загрузчик бейджей
  `loadDoctorCommunicationsBadges` (`chats` = непрочитанные сообщения, `intake` = новые заявки) +
  unit-тесты. Коммит `7d16040e`.
- **2026-06-11 · TODO#2 Block 2 ✅** — все 4 страницы вкладок передают `badges` в таб-бар;
  живо проверено (dev:doctor): «Чаты 3» виден и на вкладке «Рассылки» (кросс-таб). Коммит `a36306d2`.
- **2026-06-12 · TODO#3 Block 5** — убран internal-rewrite communications из `doctorRouteRedirects.ts`;
  `/communications` проходит насквозь → рендерится страница-шелл; 308 со старых URL сохранены;
  `schedule` rewrite не тронут. 7 тестов-passthrough добавлены, 7 старых rewrite-тестов заменены.
  27 тестов зелёные.
- **2026-06-11 · TODO#3 Block 4** — 4 компонента-таба (чаты-поллинг, заявки, рассылки, комментарии):
  `DoctorSupportInbox` — `active` prop + поллинг 1/сек только при активном табе + видимом окне (`visibilitychange`) + сигнатурный guard (`setList` только при реальном изменении);
  `ChatsTab` — прокидывает `isActive` → `active`;
  `DoctorOnlineIntakeClient` — `onDetailChange` prop (открытие/закрытие карточки → URL-sync);
  `IntakeTab` — wires `onDetailChange → onDeepLinkChange("id", ...)`;
  `BroadcastsTab` — без изменений (уже реализован в Block 3), добавлены 3 теста (`archive=1`, кнопка «← Рассылки»).
  7 новых тестов. Коммит `57da243a`.
- **2026-06-11 · TODO#3 Block 3** — клиентский шелл + реестр + URL-sync:
  `communicationsTabRegistry.ts` (типы + массив 4 табов + `CommunicationsTabProps`),
  `DoctorCommunicationsShell.tsx` (`next/dynamic` module-level, keepMounted Set+hidden, `history.replaceState`, `popstate`),
  `DoctorCommunicationsTabsNav` (`onTabClick?` backwards-compat), 4 таб-обёртки в `tabs/`,
  10 тестов (keepMounted, URL-sync, deep-link id/archive). Коммит `7ae6cab3`.
- **2026-06-11 · TODO#3 — ТЗ зафиксировано** (обсуждение с владельцем). Решение: вариант C
  (единый клиентский шелл + ленивые компоненты-табы), мгновенное переключение; чат-поллинг только
  активным+видимым окном и только при изменении; комментарии — непрочитанные одним doctor-wide
  запросом (новый метод в `program-item-discussion`) + ленивая история + клиент-поиск с серверным
  добором; `/communications` → настоящая страница-шелл, internal-rewrite из `proxy.ts` убрать, 308
  оставить, schedule не трогать. Реализацию делает отдельный чат (план — по
  plan-authoring-execution-standard).
