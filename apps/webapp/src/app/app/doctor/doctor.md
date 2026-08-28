# doctor

Раздел **`/app/doctor`** (layout: `layout.tsx`) — кабинет врача и админа.

**Каркас UI:** фиксированная шапка `DoctorHeader`, отступ контента `DOCTOR_WORKSPACE_TOP_PADDING_CLASS`, страницы оборачиваются в `AppShell` с `variant="doctor"`. Контейнер страницы (`DOCTOR_PAGE_CONTAINER_CLASS`): `max-w-7xl px-3 pt-3 pb-6`; вертикальный ритм между корневыми блоками внутри `#app-shell-content` — `gap-3`. Ширина внутреннего ряда шапки — `DOCTOR_HEADER_INNER_CLASS` (`px-4` / `md:px-6`). Подробнее: `docs/ARCHITECTURE/SPECIALIST_CABINET_STRUCTURE.md` (подраздел «Единый каркас страниц»).

**Главная** (`page.tsx`): только пользователи с ролью врач или админ. Экран «Сегодня» — двухколоночная раскладка: слева KPI, следующий приём, сводка и недельный график, справа сегодняшний календарь. На mobile быстрые действия «Новый визит» и «Новый клиент» находятся иконками в шапке; страница занимает пространство между мобильной шапкой и нижней навигацией без внешней прокрутки. При высоте viewport до `720px` недельный график заменяется двумя компактными KPI — записи и новые клиенты за текущую неделю. Задачи доступны через KPI: на mobile он открывает attention-список в модалке, на desktop — самостоятельную страницу. Встроенного блока задач на «Сегодня» нет. Основные компоненты: `DoctorTodayDashboard`, `DoctorTodayLeftKpiRow`, `DoctorTodayNextAppointment`, `DoctorTodayWeeklyAppointmentsChart`, `TodayMiniCalendarWithModal`.

**Задачи** (`tasks/page.tsx`): все открытые задачи специалиста. На desktop стандартный `CatalogSplitLayout`
50/50: список слева, детали/создание справа; на mobile список сменяется деталями с возвратом назад. Механика
`specialist_tasks`: read-only оставляет просмотр, но скрывает создание/изменение/выполнение; disabled скрывает
пункт меню и закрывает route.

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

### TODO#3: закрыт — полный список задач

`loadDoctorOpenTasks.ts` без лимита загружает все открытые задачи и batch-резолвит ФИО пациентов для KPI/модалки
«Сегодня» и самостоятельной страницы «Задачи». Старый встроенный блок задач на «Сегодня» удалён.

### TODO#4: длительность записи в DoctorCurrentAppointmentCard и DoctorTodayMiniCalendar

Оба компонента используют stub-длительность (90 и 60 мин соответственно) вместо реальной.

- Добавить поле `durationMinutes?: number` в `TodayAppointmentItem`
- Заполнять в `mapAppointmentToTodayItem` из поля `duration` в `AppointmentRow`
