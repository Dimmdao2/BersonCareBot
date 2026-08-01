# Расписание (`/app/doctor/schedule`)

Агрегатный раздел кабинета врача: управление записями, рабочим графиком и настройками записи под
единым URL с тремя ленивыми табами. Wireframe: `docs/design/doctor-cabinet-wireframe.html#p-schedule`.
Инициатива: `docs/DOCTOR_SCHEDULE_SECTION_INITIATIVE/`.

## Маршрутизация

`/app/doctor/schedule` — настоящая страница-шелл (`page.tsx`). Internal-rewrite убран (этап e12).
Старые прямые URL → **308** на агрегатный URL.

| Вкладка   | `?tab=`         | Старый URL (308 → агрегатный)                                                                      |
| --------- | --------------- | -------------------------------------------------------------------------------------------------- |
| Записи    | `cal` (default) | `/app/doctor/calendar` → `?tab=cal`                                                                |
| Записи    | `cal`           | `/app/doctor/appointments` (включая `?view=future\|past`) → `?tab=cal`; legacy query отбрасывается |
| Настройки | `setup`         | `/app/doctor/admin/booking` → `?tab=setup`                                                         |

**Loop-guard:** `x-bc-doctor-rewrite` в `doctorRouteRedirects.ts` сохранён (защита от петли для
других rewrite в proxy).

## Пункт меню

Пункт `id="schedule"` в `doctorNavLinks.ts` — **одна прямая ссылка** на
`routePaths.doctorSchedule` (без аккордеона/под-пунктов). Admin-гейтинг таба «Настройки»
обеспечивается внутри шелла, не в меню.

## Архитектура шелла

`page.tsx` (сервер) — `requireDoctorAccess` → рендерит клиентский `DoctorScheduleShell(initialTab)`.

- `DoctorScheduleShell.tsx` (`"use client"`) — `DoctorAppShell` + `ScheduleTabsNav` +
  реестр табов (`scheduleTabRegistry.ts`) + URL-sync (`?tab` + под-параметры табов через
  `history.replaceState`/`popstate`). Лениво монтирует активный таб (`next/dynamic`, `ssr:false`)
  и кэширует открытые (keepMounted: скрытие, не размонтирование).

**KPI не хранится в шелле** (§3.1 ТЗ). Шелл не знает о метриках.

## KPI (9 карточек) — только в табе «Записи»

| Карточка      | Поле `ScheduleKpis`      |
| ------------- | ------------------------ |
| Записей       | `recordsInPeriod`        |
| Прошло        | `pastInPeriod`           |
| Впереди       | `futureInPeriod`         |
| По абонементу | `bySubscriptionInPeriod` |
| Первичных     | `firstVisitInPeriod`     |
| Повторных     | `repeatVisitInPeriod`    |
| Уникальных    | `uniquePatientsInPeriod` |
| Отмены        | `cancellationsInPeriod`  |
| Переносы      | `reschedulesInPeriod`    |

Отображаются только в «Записях» (не в drill-down «День»). Параллельная загрузка событий + KPI
по одному диапазону + фильтрам. API: `GET /api/doctor/schedule-kpis?from=&to=&branchId?=&serviceId?=`.

**Семантика ключевых полей:**

- `firstVisitInPeriod` — пациент, у которого **нет ни одной** более ранней не-отменённой записи
  за весь период (§13.5 ТЗ): `NOT EXISTS(start_at < outer.start_at)`, строгий порядок `(start_at,id)`.
- `cancellationsInPeriod` / `reschedulesInPeriod` — считаются по дате **визита** (`start_at ∈ [from,to)`), не по дате события (§13.1 ТЗ).

## Реестр табов (`scheduleTabRegistry.ts`)

| id      | Метка         | Компонент             | deep-link ключи                                       |
| ------- | ------------- | --------------------- | ----------------------------------------------------- |
| `cal`   | Записи        | `ScheduleCalendarTab` | `view`, `date`, `location`, `service`, `appt`, `from` |
| `work`  | График работы | `ScheduleWorkTab`     | `location`, `month`                                   |
| `setup` | Настройки     | `ScheduleSetupTab`    | `section`                                             |

Тип пропов вкладки: `ScheduleTabProps { deepLinkParams, onDeepLinkChange, initialData, isActive }`.

## Вкладки

### Записи (`cal`) — `ScheduleCalendarTab`

- 3 диапазона в переключателе: **3 дня / Неделя / Месяц**. «День» — только drill-down (клик по
  заголовку дня или числу в месяце).
  - Default без явного deep-link `view` — **неделя** (owner-review 2026-07-18 §3: чистый desktop-вход и
    reload открывают неделю, а не 3 дня). Явный `?view=` (или иной deep-link выбор) не переопределяется.
  - `3days` — FullCalendar `timeGrid3days` (custom view, duration 3 days).
  - `weekgrid` — FullCalendar `timeGridWeek`.
  - `month` — FullCalendar `dayGridMonth`; плашка = фамилия; сегодня `#fff8e6`; `+N` при переполнении.
  - `day` — drill-down: кнопка «← Назад», стрелки по дням, KPI скрыт.
- **KPI-ряд** 9 карточек — под тулбаром, скрыт в `day`. Нули отображаются как 0.
- Тулбар: диапазон + независимый переключатель рендера **Календарь / Список** (`render=list`) +
  ◀period▶ + Локация + Услуга + «+ Создать запись».
- В `Настройки → Календарь` можно выбрать филиал, услугу и специалиста по умолчанию для формы создания;
  явный scope/фильтр текущего календаря имеет приоритет, а недоступный специалист не подставляется.
- Прошедшие и будущие записи проверяются в этом же календаре: выбрать подходящий вид и перейти к нужному
  диапазону кнопками предыдущего/следующего периода либо через deep-link `view` + `date`; при необходимости
  тот же диапазон открыть списком через `render=list`. Отдельных past/future-списков больше нет; legacy
  `/appointments?view=future|past` всегда ведёт на `?tab=cal`.
- Часы сетки: из `workingBounds` ответа календарного API (±1ч); fallback `06:00–23:00`.
- Правая панель: карточка записи или заглушка «Запись не выбрана» + CTA + `NearestWindowLine`.
- Поллинг: только когда `isActive === true`.

### График работы (`work`) — `ScheduleWorkTab`

- Раскладка две колонки (lg): слева сетка дней, справа панель часов (при ≥1 выбранном дне).
- Sticky bar: фильтр «Все» + кнопки филиалов (цвет по индексу: blue/green/violet/orange);
  навигация ◀ Месяц Год ▶.
- **Карточки дней**: `min-h-[52px]`, `text-[11px] font-semibold` (время крупнее),
  метка = `shortTitle ?? title.split(" ")[0]` (E2), перерывы = «обед HH–HH» / «N перерывов» (B3).
- Мультивыбор: клик / Shift / Ctrl+Cmd.
- **Панель часов** (справа, E4): Начало / Конец + строчные перерывы (`+ перерыв` / `×` кнопка),
  Локация → **Сохранить** → `PUT /api/admin/booking-engine/working-days { breaks: [...]  }`;
  **Закрыть выбранные дни** / **Очистить выбор**.
- **Фильтр сетки**: бэкенд-фильтр по `branchId` (E3); пустые дни видны всегда.
- **Шаблоны** (снизу, полная ширина, E5): создать с N перерывами, применить, удалить.

### Настройки (`setup`) — `ScheduleSetupTab`

Admin-only (обеспечено на уровне nav и шелла). Под-навигация секций:

| `?section=`          | Компоненты                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calendar` (default) | `ScheduleCalendarDefaultsSection`                                                                                                                    |
| `locations`          | `BookingSoloLocationsSection` + `BookingSoloAvailabilitySection`                                                                                     |
| `services`           | `BookingSoloServicesSection` — canonical booking catalog (create/edit/deactivate)                                                                    |
| `specialists`        | `BookingSoloSpecialistsSection` — canonical booking-engine specialists (owner/себя + сотрудники); отдельно от личных «Настроек специалиста» аккаунта |
| `form`               | `BookingSoloFormFieldsSection` + `BookingPublicWidgetSection` + `BookingPublicAttributionSection`                                                    |
| `payments`           | `BookingPaymentsSectionLoader` + `BookingPrepaymentSection`                                                                                          |
| `rules`              | `BookingRulesLoader` (→ `BookingRulesPageClient`)                                                                                                    |
| `notifications`      | `ScheduleNotificationsSection`                                                                                                                       |
| `packages`           | Шаблоны абонементов (`SectionPackages` через `/api/doctor/booking-engine/packages`); прямой URL: `/app/doctor/schedule?tab=setup&section=packages` |

В секции `locations` строка **«Онлайн»** — встроенная локация организации поверх существующей
`be_branches`, а не отдельный тип записи. Её нельзя переименовать, удалить или создать повторно.
Включённая локация появляется отдельной колонкой в матрице доступности услуг; новые услуги в ней
по умолчанию выключены. Выключение скрывает колонку и публичный выбор, но сохраняет назначения для
последующего повторного включения.

## Per-date модель графика (бэкенд)

### Таблицы

- `be_working_days` — рабочий день по конкретной дате:
  `(organization_id, specialist_id, branch_id, room_id, work_date, start_minute, end_minute,
breaks jsonb NOT NULL DEFAULT '[]', isClosed)`.
  - Partial-unique: `(organization_id, COALESCE(specialist_id, sentinel), work_date)`.
  - `breaks: Array<{startMinute, endMinute}>` — N-break модель (B1/B3); до 6 перерывов;
    legаси-колонки `break_start_minute`/`break_end_minute` сохранены для backward-compat.
- `be_schedule_templates` — шаблоны часов: аналогично содержат `breaks jsonb`.
- `be_branches.short_title` (text, nullable) — короткое имя для UI (B4, migration 0117).

Миграции: `0115` (per-date таблицы), `0116` (breaks jsonb), `0117` (short_title).

### Интеграция со слот-движком

`booking-scheduling/computeSlots.ts:workingIntervalsForDate(…, perDayRow?)`:

- N перерывов: `resolveWorkingDayBreaks` → cursor-based `splitByBreak` → N+1 интервалов (B3).
- Нет perDayRow → weekday `be_working_hours` (backward-compatible).

### API-роуты

- `GET/PUT /api/admin/booking-engine/working-days` — range-выборка + upsert/close/clear.
- `GET/POST/DELETE /api/admin/booking-engine/working-schedule-templates` — CRUD + apply.
- `GET /api/doctor/schedule-kpis?from=&to=&branchId?=&serviceId?=` — 9 метрик.
- `GET /api/doctor/schedule/nearest-free-window` — ближайшее свободное окно (C3).
- `GET /api/doctor/booking-engine/calendar` — события календаря + `workingBounds` (C1/C2).

Авторизация: `requireAdminBookingEngine` (booking routes) / `requireDoctorAccess` (KPI, calendar).

## Связанные документы

- `docs/DOCTOR_SCHEDULE_SECTION_INITIATIVE/{README,LOG}.md`
- `docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md`
- `docs/BOOKING_REWORK_INITIATIVE/ROADMAP.md` §7.5
- `src/modules/booking-scheduling/{ports,service,computeSlots}.ts`
- `src/modules/doctor-appointments/ports.ts` (`ScheduleKpis`, `ScheduleKpisQuery`, `getScheduleKpis`)
