# doctor

Раздел **`/app/doctor`** (layout: `layout.tsx`) — кабинет врача и админа.

**Каркас UI:** фиксированная шапка `DoctorHeader`, отступ контента `DOCTOR_WORKSPACE_TOP_PADDING_CLASS`, страницы оборачиваются в `AppShell` с `variant="doctor"`. Контейнер страницы (`DOCTOR_PAGE_CONTAINER_CLASS`): `max-w-7xl px-3 pt-3 pb-6`; вертикальный ритм между корневыми блоками внутри `#app-shell-content` — `gap-3`. Ширина внутреннего ряда шапки — `DOCTOR_HEADER_INNER_CLASS` (`px-4` / `md:px-6`). Подробнее: `docs/ARCHITECTURE/SPECIALIST_CABINET_STRUCTURE.md` (подраздел «Единый каркас страниц»).

**Главная** (`page.tsx`): только пользователи с ролью врач или админ. Экран «Сегодня» — двухколоночная раскладка (левое полотно: поток + сопровождение + задачи + сигналы; правое: KPI записей + карточка приёма + мини-календарь). Компоненты: `DoctorTodayDashboard`, `DoctorTodayLeftKpiRow`, `DoctorTodayRightKpiRow`, `DoctorCurrentAppointmentCard`, `DoctorTodayMiniCalendar`, `DoctorTodaySignalsSection`, `DoctorGlobalTasksSection`.

---

## TODO: недостающие данные для «Сегодня»

### TODO#1: контакты пациента в карточке «Сейчас на приёме»
`DoctorCurrentAppointmentCard` отображает имя, время, тип записи. Телефон, email, telegram — отсутствуют в `TodayAppointmentItem`. Для реализации:
- Вариант A: добавить `clientContacts?: { phone: string | null; hasTelegram: boolean; hasEmail: boolean }` в `TodayAppointmentItem` (заполнять в `mapAppointmentToTodayItem` через JOIN или отдельный запрос в `loadDoctorTodayDashboard.ts`)
- Вариант B: lazy-load через клиентский `fetch("/api/doctor/clients/:userId/contacts")` после mount

### TODO#2: рабочее время для мини-календаря
`DoctorTodayMiniCalendar` использует stub-диапазон (min/max часов из записей ±1ч, fallback 09–19). Для диапазона из настроек врача:
- Источник: `modules/booking-scheduling/service.ts`
- Нужна функция `getAppWorkingHours(): Promise<{ startHour: number; endHour: number }>`
- Передать как проп `workingHoursRange` в `DoctorTodayMiniCalendar`

### TODO#3: «Все задачи» и лимит в DoctorGlobalTasksSection
`loadDoctorTodayDashboard.ts` запрашивает не более 8 задач (`listGlobalOpen(userId, 8)`). Если задач больше — врач не увидит остальные.
- Вариант A: добавить `globalOpenTasksTruncated: boolean` в `TodayDashboardData` (fetch N+1, truncate при необходимости)
- Вариант B: создать страницу `/app/doctor/tasks` и добавить ссылку в `DoctorGlobalTasksSection` при `tasks.length >= 8`

### TODO#4: длительность записи в DoctorCurrentAppointmentCard и DoctorTodayMiniCalendar
Оба компонента используют stub-длительность (90 и 60 мин соответственно) вместо реальной.
- Добавить поле `durationMinutes?: number` в `TodayAppointmentItem`
- Заполнять в `mapAppointmentToTodayItem` из поля `duration` в `AppointmentRow`
