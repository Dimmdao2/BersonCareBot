# Расписание (`/app/doctor/schedule`)

Агрегатный раздел кабинета врача: управление записями, рабочим графиком и настройками записи под
единым URL с тремя ленивыми табами. Wireframe: `docs/design/doctor-cabinet-wireframe.html#p-schedule`.
Инициатива: `docs/DOCTOR_SCHEDULE_SECTION_INITIATIVE/`.

## Маршрутизация

`/app/doctor/schedule` — настоящая страница-шелл (`page.tsx`). Internal-rewrite убран (этап e12).
Старые прямые URL → **308** на агрегатный URL.

| Вкладка | `?tab=` | Старый URL (308 → агрегатный) |
|---------|---------|-------------------------------|
| Календарь записей | `cal` (default) | `/app/doctor/calendar` → `?tab=cal` |
| Календарь записей | `cal` | `/app/doctor/appointments` → `?tab=cal` |
| Настройки записи | `setup` | `/app/doctor/admin/booking` → `?tab=setup` |

**Loop-guard:** `x-bc-doctor-rewrite` в `doctorRouteRedirects.ts` сохранён (защита от петли для
других rewrite в proxy).

## Архитектура шелла

`page.tsx` (сервер) — `requireDoctorAccess` + `buildAppDeps` + `loadDoctorScheduleKpis` (SSR) →
рендерит клиентский `DoctorScheduleShell(initialTab, initialKpis, initialPeriod)`.

- `DoctorScheduleShell.tsx` (`"use client"`) — `DoctorAppShell` + **KPI-строка** (6 карточек) +
  `ScheduleTabsNav` + реестр табов (`scheduleTabRegistry.ts`) + URL-sync (`?tab` + `?period` +
  под-параметры табов через `history.replaceState`/`popstate`). Лениво монтирует активный таб
  (`next/dynamic`, `ssr:false`) и кэширует открытые (keepMounted: скрытие, не размонтирование).
- `loadDoctorScheduleKpis.ts` — SSR-загрузчик KPI + `resolveSchedulePeriodPreset` (fallback `month`).
- `api/doctor/schedule-kpis/route.ts` — клиентский GET `?period=` для смены периода без перегрузки.

## KPI-строка (6 карточек)

| Карточка | Поле `ScheduleKpis` | Источник |
|----------|--------------------|--------------------|
| Записей за период | `recordsInPeriod` | `COUNT(*)` на `beAppointments` в окне |
| Уникальных пациентов | `uniquePatientsInPeriod` | `COUNT(DISTINCT platformUserId)` |
| Новых пациентов | `newPatientsInPeriod` | `NOT EXISTS` ранней записи |
| Отмены | `cancellationsInPeriod` | `beAppointmentCancellations` |
| Переносы | `reschedulesInPeriod` | `beAppointmentReschedules` |
| Период | — | кнопки Сегодня / 7 дн / 30 дн |

KPI берутся из `doctor-appointments.getScheduleKpis` (port + pg + inMemory), не смешиваются с
`getAppointmentStats` (дашборд «Сегодня»).

## Реестр табов (`scheduleTabRegistry.ts`)

| id | Компонент | deep-link ключи |
|----|-----------|-----------------|
| `cal` | `ScheduleCalendarTab` | `view`, `date`, `location`, `service`, `appt` |
| `work` | `ScheduleWorkTab` | `location`, `month` |
| `setup` | `ScheduleSetupTab` | `section` |

Тип пропов вкладки: `ScheduleTabProps { deepLinkParams, onDeepLinkChange, initialData, isActive }`.

## Вкладки

### Календарь записей (`cal`) — `ScheduleCalendarTab`

- 4 вида: **День / Неделя · сетка / Неделя · лента / Месяц** (`CalendarViewMode`).
  - `weeklist` — кастомный inline-вид (FullCalendar нативно не поддерживает); тот же фид `getCalendar`.
  - Остальные → `FullCalendar` (day/timeGridWeek/dayGrid).
- Тулбар: вид + ◀период▶ + Локация + Услуга + «Рабочее время» + «Обновить».
- Правая панель: `DoctorCalendarEventPanel` (детали записи / создание).
- Поллинг: только когда таб `isActive === true`.

### График работы (`work`) — `ScheduleWorkTab`

- Переключатель локаций (branch), месячная сетка с мультивыбором дней (click / Shift / Ctrl+Cmd).
- Ячейка закрашивается цветом локации (детерминированный маппинг по индексу).
- **Нижняя панель** (при ≥1 выбранном дне): Начало / Конец / Обед / Локация →
  - **Сохранить** → `PUT /api/admin/booking-engine/working-days { action:"upsert" }`.
  - **Закрыть выбранные дни** → `PUT { action:"close" }`.
  - **Очистить выбор** → локальный сброс.
- **Шаблоны расписаний**: GET список; Применить → `POST ?action=apply`; «×» → DELETE; «+ Создать» → форма.
- Solo R2: специалист резолвится через `ensureDefaultSpecialist`.

### Настройки записи (`setup`) — `ScheduleSetupTab`

Admin-only (обеспечено на уровне nav и шелла). Под-навигация 6 секций:

| `?section=` | Компоненты |
|-------------|-----------|
| `services` (default) | `BookingSoloServicesSection` + `BookingCatalogPackagesSection` |
| `locations` | `BookingSoloLocationsSection` + `BookingSoloAvailabilitySection` |
| `form` | `BookingSoloFormFieldsSection` + `BookingPublicWidgetSection` + `BookingPublicAttributionSection` |
| `payments` | `BookingPaymentsSectionLoader` + `BookingPrepaymentSection` |
| `rules` | `BookingRulesLoader` (→ `BookingRulesPageClient`) |
| `integrations` | `BookingRubitimeMappingSection` + `BookingEngineSection` |

## Per-date модель графика (бэкенд)

### Таблицы

- `be_working_days` — рабочий день по конкретной дате:
  `(organization_id, specialist_id, branch_id, room_id, work_date, start_minute, end_minute,
  break_start_minute, break_end_minute, is_closed)`.
  Partial-unique: `(organization_id, COALESCE(specialist_id, sentinel), work_date)`.
- `be_schedule_templates` — шаблоны часов:
  `(organization_id, branch_id, name, start_minute, end_minute, break_start_minute, break_end_minute,
  sort_order, is_active)`.

Миграция: `db/drizzle-migrations/0115_be_working_days_and_schedule_templates.sql`.

### Интеграция со слот-движком

`booking-scheduling/computeSlots.ts:workingIntervalsForDate(…, perDayRow?)`:
- Есть `perDayRow` → per-date override (closed → `[]`; break → 2 интервала).
- Нет → weekday `be_working_hours` (backward-compatible).

`service.ts:computeSlotsInternal` — строит `perDayMap<dateKey, WorkingDayRow>` и передаёт в
`workingIntervalsForDate`. Нет строки на дату = нет override.

### API-роуты

- `GET/PUT /api/admin/booking-engine/working-days` — range-выборка + upsert/close/clear.
- `GET/POST/DELETE /api/admin/booking-engine/working-schedule-templates` — CRUD + `apply`.

Авторизация: `requireAdminBookingEngine`; Zod-валидация; паттерн `working-hours/route.ts`.

## Координация с BOOKING_REWORK_INITIATIVE

§7.5 ROADMAP владеет редизайном экрана управления рабочим временем. Раздел «Расписание» строит
per-date слой поверх booking-engine по согласованию (не замещая weekday-модель). Существующие
страницы `admin/booking/**` не удалены; ребилд раскладки ведётся через `ScheduleSetupTab`.

## Связанные документы

- `docs/DOCTOR_SCHEDULE_SECTION_INITIATIVE/{README,LOG}.md`
- `docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md`
- `docs/BOOKING_REWORK_INITIATIVE/ROADMAP.md` §7.5
- `src/modules/booking-scheduling/{ports,service,computeSlots}.ts`
- `src/modules/doctor-appointments/ports.ts` (`ScheduleKpis`, `getScheduleKpis`)
