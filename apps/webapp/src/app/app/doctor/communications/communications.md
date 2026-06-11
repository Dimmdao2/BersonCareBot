# Коммуникации (`/app/doctor/communications`)

Агрегатный экран кабинета врача: весь входящий/исходящий поток с пациентами под одним
заголовком «Коммуникации» и единым таб-баром. Wireframe: `docs/design/doctor-cabinet-wireframe.html#p-comms`.

## Маршрутизация (rewrite, без дублирования страниц)

`/app/doctor/communications?tab=<id>` — агрегатный URL. `middleware/doctorRouteRedirects.ts`
делает **internal-rewrite** на легаси-страницу вкладки; браузерный URL остаётся
`/communications?tab=<id>`. Старые прямые URL → 308 на агрегатный.

| Вкладка | id | `?tab=` rewrite → страница | Старый URL (308 → агрегатный) |
|---------|------|---------------------------|-------------------------------|
| Чаты | `chats` (default) | `/app/doctor/messages` | `/app/doctor/messages` |
| Заявки | `intake` | `/app/doctor/online-intake[/:id]` | `/app/doctor/online-intake`, `/online-intake/:id` |
| Комментарии | `comments` | `/app/doctor/comments` | `/app/doctor/comments` |
| Рассылки | `broadcasts` | `/app/doctor/broadcasts[/archive]` | `/app/doctor/broadcasts`, `/broadcasts/archive` |

**Петля редиректов:** в Next 16 (proxy-конвенция) внутренний `rewrite` повторно проходит через
proxy. Защита — заголовок-маркер `x-bc-doctor-rewrite` (см. `doctorRouteRedirects.ts`). Тесты:
`doctorRouteRedirects.test.ts`.

## Компоненты таб-бара

- `doctorCommunicationsTabs.ts` — конфиг 4 вкладок (`COMMUNICATIONS_TABS`) + `communicationsTabFromQuery` / `communicationsTabFromPathname`.
- `DoctorCommunicationsTabsNav.tsx` — sticky таб-бар (паттерн `BookingAdminTabsNav`). Активная вкладка — пропом `activeTab` от страницы (детерминированно, без `useSearchParams`). Бейджи — опциональный проп `badges`.

Каждая страница вкладки рендерит `<DoctorCommunicationsTabsNav activeTab="…" />` первым блоком и `title="Коммуникации"` в `DoctorAppShell`.

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

### TODO#3: вынести Заявки/Рассылки в layout вкладок
Сейчас таб-бар вставлен в каждую страницу. Возможна общая `communications/layout.tsx`, если
страницы переедут под единый сегмент (требует переноса роутов — вне текущего UI-scope).

## Журнал

- **2026-06-11 · TODO#1 ✅** — стаб вкладки «Комментарии» заменён рабочим списком; загрузчик
  `loadDoctorExerciseCommentAttention` извлечён из `loadDoctorTodayDashboard` (чистый code-move),
  форматтеры → `doctorTodayFormat.ts`, группировка переиспользована диалогом. Коммит `5b3708c4`.
- **2026-06-11 · TODO#2 Block 1** — добавлен общий загрузчик бейджей
  `loadDoctorCommunicationsBadges` (`chats` = непрочитанные сообщения, `intake` = новые заявки) +
  unit-тесты. Коммит `7d16040e`.
- **2026-06-11 · TODO#2 Block 2 ✅** — все 4 страницы вкладок передают `badges` в таб-бар;
  живо проверено (dev:doctor): «Чаты 3» виден и на вкладке «Рассылки» (кросс-таб). Коммит `a36306d2`.
