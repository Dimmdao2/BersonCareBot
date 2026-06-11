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

### TODO#2: кросс-вкладочные бейджи непрочитанных
`DoctorCommunicationsTabsNav` принимает `badges`, но страницы их пока не передают: счётчики
непрочитанных чатов / новых заявок известны только своей странице. Нужен лёгкий общий загрузчик
(`unreadFromUsers()` + счётчик новых заявок), вызываемый на каждой странице вкладок.

### TODO#3: вынести Заявки/Рассылки в layout вкладок
Сейчас таб-бар вставлен в каждую страницу. Возможна общая `communications/layout.tsx`, если
страницы переедут под единый сегмент (требует переноса роутов — вне текущего UI-scope).
