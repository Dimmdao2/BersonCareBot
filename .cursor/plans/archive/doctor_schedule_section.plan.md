---
name: Doctor «Расписание» — раздел кабинета врача (шелл + 3 таба + per-date бэкенд)
overview: >
  Построить раздел «Расписание» в кабинете врача по референсу docs/design/doctor-cabinet-wireframe.html
  (pane #p-schedule): реальная страница-шелл /app/doctor/schedule (вместо текущего virtual-rewrite в
  doctorRouteRedirects) с KPI-строкой и тремя ленивыми табами — «Календарь записей», «График работы»,
  «Настройки записи». Эталон шелла/реестра/URL-sync — Doctor Communications (TODO#3,
  DoctorCommunicationsShell + communicationsTabRegistry + doctorCommunicationsTabs). Эталон UI-примитивов
  — экран упражнений + DOCTOR_APP_UI_STYLE_GUIDE.md + shared/ui/doctor/**. Объём согласован с
  пользователем (2026-06-12): полный по вайрфрейму; «График работы» на НОВОЙ per-date модели (таблицы
  be_working_days + be_schedule_templates, миграции, интеграция со слот-движком
  booking-scheduling/computeSlotsInternal); «Настройки записи» — полный ребилд под doctor-канон с
  под-навигацией (раскладка как база для будущего ТЗ), переиспользуя существующие Booking*Section и
  при необходимости до-реализуя/мигрируя бэкенд. Раздел частично пересекается с зоной
  BOOKING_REWORK_INITIATIVE §7.5 — координация зафиксирована в LOG.
isProject: false
status: completed
todos:
  - id: e0-baseline
    content: "Этап 0 — прочитать .cursor/rules/*.mdc (clean-arch, doctor-ui, plan-standard, system-settings, host-psql), DOCTOR_APP_UI_STYLE_GUIDE.md, BOOKING_REWORK_INITIATIVE/ROADMAP.md §7.5, RUBITIME_BOOKING_PIPELINE.md; завести docs/DOCTOR_SCHEDULE_SECTION_INITIATIVE/{README,LOG}.md (есть); зафиксировать зелёный baseline"
    status: completed
  - id: e1a-schema
    content: "Этап 1.A — Drizzle-схема be_working_days + be_schedule_templates в db/schema/bookingScheduling.ts (колонки, FK на bookingEngine, check-констрейнты, partial-unique по scope+date); экспорт в db/schema/index.ts + relations.ts"
    status: completed
  - id: e1b-migration
    content: "Этап 1.B — drizzle-kit generate → ревью SQL миграции в db/drizzle-migrations/**; применить на dev (apps/webapp/.env.dev, host-psql преамбула); проверить idempotent re-run"
    status: completed
  - id: e2a-ports-types
    content: "Этап 2.A — booking-scheduling/ports.ts: типы WorkingDayRecord/ScheduleTemplateRecord/UpsertWorkingDaysInput + сигнатуры listWorkingDays/upsertWorkingDays/clearWorkingDays/listScheduleTemplates/createScheduleTemplate/deleteScheduleTemplate/applyScheduleTemplate в Port и Service"
    status: completed
  - id: e2b-service
    content: "Этап 2.B — service.ts: валидация (assertUuid, минуты 0..1440, break⊂день, диапазон дат ≤92 дн), applyScheduleTemplate = read template → upsertWorkingDays; unit-тесты сервиса"
    status: completed
  - id: e2c-pg-inmemory
    content: "Этап 2.C — pg-инфра в pgBookingScheduling.ts (listWorkingDays scope+range, upsert ON CONFLICT по unique, clear, templates CRUD) + параллельная inMemory-реализация (если есть inMemory для scheduling, иначе тест-дабл в unit); DI-проводка в buildAppDeps; pg + inMemory unit-тесты паритета"
    status: completed
  - id: e3-slot-engine
    content: "Этап 3 — per-date в слот-движок: WorkingDayRow + расширить workingIntervalsForDate(dateKey,tz,weekdayRows,buffer,perDayRow?) — perDay override (closed→[]; break→два интервала) поверх weekday; в computeSlotsInternal догрузить port.listWorkingDays(range) в Map<dateKey> и передавать; unit-тесты computeSlots (override>weekday, перерыв, closed, fallback) + регресс существующих"
    status: completed
  - id: e4-kpi
    content: "Этап 4 — KPI: ScheduleKpis-тип + getScheduleKpis(filter) в doctor-appointments (port+service); pg: distinct platformUserId (уникальные) + NOT EXISTS earlier (новые) поверх существующих rangeCond/cancellation/reschedule; inMemory-паритет; resolveAppointmentStatsBounds reuse; unit-тесты границ/уникальности/новизны"
    status: completed
  - id: e5-api
    content: "Этап 5 — тонкие роуты: api/admin/booking-engine/working-days (GET range, PUT upsert/clear) и .../working-schedule-templates (GET/POST/DELETE/apply) по образцу working-hours/route.ts (requireAdminBookingEngine, gate.ctx.organizationId, deps.bookingScheduling, __none__ sentinel, Zod); KPI — SSR в page.tsx; route-тесты 401/контракт/валидация"
    status: completed
  - id: e6-tabs-contract
    content: "Этап 6 — контракт табов: doctorScheduleTabs.ts (SCHEDULE_BASE, SCHEDULE_TABS cal/work/setup, scheduleTabFromQuery, SCHEDULE_DEFAULT_TAB=cal) + scheduleTabRegistry.ts (id/loader/deepLinkKeys: cal→[view,date,location,service,appt], work→[location,month], setup→[section]); ScheduleTabProps; unit-тесты реестра/нормализации"
    status: completed
  - id: e7a-weeklist
    content: "Этап 7.A — вид «Неделя·лента» (weeklist) в DoctorBookingCalendarClient: дни сверху вниз, записи карточками без часовой сетки; расширить CalendarViewMode и переключатель видов (День/Неделя·сетка/Неделя·лента/Месяц); фид calendar route уже отдаёт события — переиспользовать"
    status: completed
  - id: e7b-cal-tab
    content: "Этап 7.B — ScheduleCalendarTab: обёртка над DoctorBookingCalendarClient + правый appt-detail card + диалог «+ Создать запись» (DoctorCreateAppointmentDialog) + тулбар (виды, ◀период▶, Локация/Услуга); deep-link view/date/location/service/appt ↔ шелл; RTL-тест (прогрев чанков в beforeAll)"
    status: completed
  - id: e8a-work-editor
    content: "Этап 8.A — ScheduleWorkTab редактор: переключатель локации (branch), месячная сетка с мультивыбором дней (click/Shift/Cmd), ◀месяц▶; закраска ячеек цветом локации/closed; состояние выбора"
    status: completed
  - id: e8b-work-panel
    content: "Этап 8.B — нижняя панель часов (появляется при ≥1 выбранном дне): Начало/Конец/Обед/Локация → Сохранить (PUT upsert) / Закрыть выбранные дни (is_closed) / Очистить выбор; панель «Шаблоны расписаний» (список + Применить + создать/удалить); провязка к working-days/templates API; doctor-примитивы; RTL/контракт-тест выбор→upsert и applyTemplate"
    status: completed
  - id: e9-setup-tab
    content: "Этап 9 — ScheduleSetupTab: под-навигация секций под doctor-эталон (Услуги и пакеты · Публичная форма · Оплаты · Правила записи · Интеграции·Rubitime) — раскладка как база ТЗ; переиспользовать BookingSoloServicesSection/LocationsSection/AvailabilitySection/BookingRulesPageClient + form-public/payments/integrations контент; до-реализация/миграции недостающего (фиксировать в LOG); admin-only; rg перед удалением старой раскладки"
    status: completed
  - id: e10-shell
    content: "Этап 10 — DoctorScheduleShell (client): DoctorAppShell + KPI-строка (6 карточек, doctorMetricValueClass) + TabsNav + ленивый next/dynamic монтаж активного таба с кэшем уже открытых (keepMounted); ScheduleTabProps-контракт; RTL монтаж+кэш"
    status: completed
  - id: e11-url-sync
    content: "Этап 11 — синхронизация ?tab + под-параметров ↔ URL без полного перехода (history.replaceState/router.replace), restore при back/forward; unit-тест deep-link ключей (чанки в beforeAll)"
    status: completed
  - id: e12-page-routing
    content: "Этап 12 — app/app/doctor/schedule/page.tsx (server: requireDoctorAccess + SSR KPI + initialTab → DoctorScheduleShell); убрать schedule-ветку из doctorRouteRedirects.ts (строки 76–88), СОХРАНИТЬ 308 со старых URL (/calendar→?tab=cal, /admin/booking→?tab=setup, /appointments→?tab=cal); обновить doctorRouteRedirects.test.ts"
    status: completed
  - id: e13-nav-legacy
    content: "Этап 13 — выровнять doctorNavLinks.ts кластер «Расписание» под вайрфрейм (Календарь записей/График работы/Настройки записи → ?tab=cal|work|setup); isDoctorNavItemActive для schedule; свести легаси /calendar,/appointments к 308/абсорбции (rg на runtime-использование перед удалением); nav-тесты"
    status: completed
  - id: e14-docs-ci
    content: "Этап 14 — синхронная документация (README/LOG инициативы, schedule.md в зоне, обновить DOCTOR_CABINET_NAVIGATION.md и §7.5 ROADMAP ссылкой); финальный pnpm install --frozen-lockfile && pnpm run ci зелёный перед сдачей/push"
    status: completed
---

# Doctor «Расписание» — детальный план

**Референс верстки:** `docs/design/doctor-cabinet-wireframe.html` → `#p-schedule` (строки ~805–1084).
**Эталон шелла/табов:** `apps/webapp/src/app/app/doctor/communications/{DoctorCommunicationsShell.tsx,communicationsTabRegistry.ts,doctorCommunicationsTabs.ts,page.tsx}`.
**Эталон UI:** экран упражнений + `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md` + `apps/webapp/src/shared/ui/doctor/**` + `doctorVisual.ts`.

---

## 1. Текущее состояние (факты аудита — с путями и символами)

| Область | Факт |
|---------|------|
| Маршрут | `/app/doctor/schedule` — **виртуальный rewrite** в `src/middleware/doctorRouteRedirects.ts:76–88` (вызывается из `src/proxy.ts:11`). Реальной `page.tsx` нет. `?tab=calendar→/calendar`, `?tab=appointments→/appointments`, `?tab=setup→/admin/booking`. Маркер защиты от петли — `REWRITE_MARKER_HEADER = "x-bc-doctor-rewrite"`. |
| 308-редиректы | `/app/doctor/calendar → /schedule?tab=calendar`, `/app/doctor/admin/booking → /schedule?tab=setup` (`doctorRouteRedirects.ts:59–60`). |
| Nav | `src/shared/ui/doctor/doctorNavLinks.ts` — кластер `id:"schedule"` с подпунктами `schedule-calendar`(`?tab=calendar`)/`schedule-appointments`(`/appointments`)/`schedule-setup`(`?tab=setup`, admin). `routePaths.doctorSchedule = "/app/doctor/schedule"` (`src/app-layer/routes/paths.ts:116`). |
| Календарь | `src/app/app/doctor/calendar/{page.tsx,DoctorBookingCalendarClient.tsx}` — FullCalendar (`dayGrid`/`timeGrid`/`interaction`), `CalendarViewMode = day\|week\|month` (нет «Неделя·лента»). Фид — `GET /api/admin/booking-engine/calendar` (`requireAdminBookingEngine` + `parseCalendarQuery` + `deps.bookingCalendar.getCalendar`). |
| Записи | `src/app/app/doctor/appointments/page.tsx` — список + (admin) `BookingSoloScheduleSection`/`BookingScheduleBlocksSection`/`BookingScheduleSlotsProbeSection`. Диалог `DoctorCreateAppointmentDialog` (props внутренние: `serviceId`/`branchId`/`datetime-local`, использует `displayLabel`). |
| Настройки | `src/app/app/doctor/admin/booking/` — `bookingAdminTabs.ts`: 4 вкладки (`overview`/`form-public`/`payments`/`integrations`); секции `BookingSoloLocationsSection`/`BookingSoloServicesSection`/`BookingSoloAvailabilitySection`/`BookingRulesPageClient` из `app/app/settings/`. Зона `BOOKING_REWORK_INITIATIVE`. |
| Бэкенд графика | `db/schema/bookingScheduling.ts`: `beWorkingHours` (**weekday 0–6**, `start/end_minute`, scope org/specialist/branch/room), `beScheduleBlocks` (block/absence/manual), `beAvailabilityRules` (buffer/max_chain). |
| Слот-движок | `src/modules/booking-scheduling/service.ts:computeSlotsInternal` — `pickWorkingHours(port.listWorkingHours)` → цикл по дням `workingIntervalsForDate(day, tz, working, buffer)` (`computeSlots.ts`) → `subtractBusy` → `generateSlotsFromFree`. pg: `pgBookingScheduling.ts:getSlots → buildSlotsForContext`. |
| KPI | `doctor-appointments.getAppointmentStats` (`pgDoctorCanonicalAppointments.ts`) даёт `total/pastVisits/cancelledVisits/bookingsCreated/cancellationActions/rescheduleActions/cancellations30d`. Таблицы `beAppointments` (FK пациента — `platformUserId`), `beAppointmentCancellations`, `beAppointmentReschedules`. Аудитория — `appointmentUserAudienceCond(excludedUserIds)`. **Уникальных/новых пациентов нет.** |

---

## 2. Решения пользователя (2026-06-12)

1. **Объём** — полный по вайрфрейму (заход в §7.5, координация в LOG).
2. **Модель «График работы»** — **per-date «плавающее»**: новые таблицы + миграции + интеграция со слот-движком. Backward-compatible: нет per-date строки на дату → поведение как сейчас (weekday).
3. **«Настройки записи»** — максимальный ребилд под эталон с под-навигацией; недостающий бэкенд доделываем/мигрируем.

---

## 3. Целевая архитектура

```
app/app/doctor/schedule/page.tsx            (server: requireDoctorAccess + SSR KPI + initialTab)
  └─ DoctorScheduleShell (client: DoctorAppShell + KPI row(6) + TabsNav + lazy keepMounted)
       registry: scheduleTabRegistry.ts
         cal   → ScheduleCalendarTab   (DoctorBookingCalendarClient + weeklist + appt card + create)
         work  → ScheduleWorkTab        (per-date month-grid editor + templates)
         setup → ScheduleSetupTab        (под-навигация Booking*Section)

booking-scheduling/service.ts ─ ports.ts ─ infra/repos/pgBookingScheduling.ts
   listWorkingDays / upsertWorkingDays / clearWorkingDays / *ScheduleTemplate*  → be_working_days / be_schedule_templates
   computeSlotsInternal: per-date Map override → workingIntervalsForDate(…, perDayRow?)

doctor-appointments/service.ts ─ ports.ts ─ infra/repos/pgDoctorCanonicalAppointments.ts
   getScheduleKpis(filter) → distinct platformUserId (уникальные) + NOT EXISTS earlier (новые) + reuse stats
```

---

## 4. Карта изменений по файлам

**Новые:**
- `apps/webapp/src/app/app/doctor/schedule/page.tsx`
- `…/schedule/DoctorScheduleShell.tsx` (+ `.test.tsx`)
- `…/schedule/doctorScheduleTabs.ts` (+ `.test.ts`)
- `…/schedule/scheduleTabRegistry.ts` (+ `.test.ts`)
- `…/schedule/tabs/ScheduleCalendarTab.tsx`
- `…/schedule/tabs/ScheduleWorkTab.tsx` (+ под-компоненты сетки/панели; + `.test.tsx`)
- `…/schedule/tabs/ScheduleSetupTab.tsx`
- `…/schedule/loadDoctorScheduleKpis.ts` (+ `.test.ts`)
- `apps/webapp/src/app/api/admin/booking-engine/working-days/route.ts` (+ `.test.ts`)
- `apps/webapp/src/app/api/admin/booking-engine/working-schedule-templates/route.ts` (+ `.test.ts`)
- Drizzle-миграция в `apps/webapp/db/drizzle-migrations/**` (generate).

**Изменяемые:**
- `db/schema/bookingScheduling.ts` (+2 таблицы), `db/schema/{index,relations}.ts`.
- `src/modules/booking-scheduling/{ports,service,computeSlots}.ts` (+ тесты).
- `src/infra/repos/pgBookingScheduling.ts` (+ inMemory-аналог если есть; иначе тест-дабл).
- `src/modules/doctor-appointments/{ports,service}.ts`, `src/infra/repos/{pgDoctorCanonicalAppointments,inMemoryDoctorAppointments}.ts` (+ тесты).
- `src/app-layer/di/buildAppDeps.ts` (проводка новых методов — если меняется фабрика).
- `src/app/app/doctor/calendar/DoctorBookingCalendarClient.tsx` (+ weeklist view).
- `src/middleware/doctorRouteRedirects.ts` (+ `.test.ts`).
- `src/shared/ui/doctor/doctorNavLinks.ts` (+ nav-тест).
- Доки (§14).

**Абсорбируются/сводятся к 308:** `…/calendar/page.tsx`, `…/appointments/page.tsx` (после `rg` на runtime-использование).

---

## 5. Дизайн данных (per-date)

### 5.1 `be_working_days` (рабочий день по конкретной дате)

```
id                 uuid pk default gen_random_uuid()
organization_id    uuid not null  → be_organizations(id) on delete cascade
specialist_id      uuid           → be_specialists(id)   on delete cascade   (solo: резолвится ensureDefaultSpecialist)
branch_id          uuid           → be_branches(id)      on delete cascade   (локация, назначенная на день)
room_id            uuid           → be_rooms(id)         on delete cascade
work_date          date    not null
start_minute       int                                  (null когда is_closed)
end_minute         int
break_start_minute int
break_end_minute   int
is_closed          bool    not null default false
created_at         timestamptz default now()
updated_at         timestamptz default now()
```
- **Уникальность:** partial-unique `(organization_id, specialist_id, work_date)` — один график на специалиста в день (локация — атрибут). NULL `specialist_id` (org-level) обрабатывается через `COALESCE(specialist_id, '00000000-0000-0000-0000-000000000000')` в выражении индекса.
- **Check:** `is_closed OR (start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute)`; перерыв (если задан) `break_start_minute >= start_minute AND break_end_minute <= end_minute AND break_end_minute > break_start_minute`.
- **Индекс:** `(organization_id, work_date)` для range-выборки фида/слотов.

### 5.2 `be_schedule_templates` (шаблоны расписаний)

```
id                 uuid pk
organization_id    uuid not null → be_organizations
branch_id          uuid          → be_branches   (локация шаблона)
name               text not null            ("СПб день · 11–19")
start_minute       int  not null
end_minute         int  not null
break_start_minute int
break_end_minute   int
sort_order         int  not null default 0
is_active          bool not null default true
created_at/updated_at timestamptz
```
- **Check:** минуты как выше. Применение — UI «Применить» → `applyScheduleTemplate(dates[], templateId)`.

### 5.3 Интеграция со слот-движком (ключевой инвариант)

`computeSlots.ts`:
```ts
export type WorkingDayRow = {
  workDate: string;            // YYYY-MM-DD
  startMinute: number | null;
  endMinute: number | null;
  breakStartMinute: number | null;
  breakEndMinute: number | null;
  isClosed: boolean;
};

// расширенная сигнатура (добавлен необяз. perDayRow — backward-compatible)
export function workingIntervalsForDate(
  dateKey, timeZone, weekdayRows, bufferMinutes, perDayRow?: WorkingDayRow,
): TimeInterval[] {
  if (perDayRow) {
    if (perDayRow.isClosed || perDayRow.startMinute == null) return [];
    const windows = splitByBreak(perDayRow);     // [start,end] минус перерыв → 1–2 окна
    return windows.map(applyBufferToUtc);          // как сейчас, но из perDay
  }
  // … текущее поведение: weekdayRows.filter(w.weekday === wd) …
}
```
`service.ts:computeSlotsInternal`:
```ts
const perDayRows = await port.listWorkingDays({ organizationId, specialistId, branchId, roomId,
                                                dateFrom: context.dateFrom, dateTo: context.dateTo });
const perDayMap = new Map(perDayRows.map(r => [r.workDate, r]));
// в цикле по дню:
const intervals = workingIntervalsForDate(day, tz, working, buffer, perDayMap.get(day));
```
**Инвариант:** нет строки в `be_working_days` на дату → `perDayMap.get(day) === undefined` → weekday-поведение без изменений (регрессия закрыта тестами).

---

## 6. Дизайн KPI

`doctor-appointments` — новый метод (AppointmentStats не трогаем, чтобы не задеть дашборд):
```ts
export type ScheduleKpis = {
  recordsInPeriod: number;       // = AppointmentStats.total (не purged, startAt ∈ окно)
  uniquePatientsInPeriod: number;// COUNT(DISTINCT platformUserId) в окне
  newPatientsInPeriod: number;   // distinct platformUserId в окне, у кого НЕТ записи со startAt < from
  cancellationsInPeriod: number; // = cancellationActionsInPeriod
  reschedulesInPeriod: number;   // = rescheduleActionsInPeriod
};
getScheduleKpis(filter: DoctorAppointmentStatsFilter, audience?): Promise<ScheduleKpis>;
```
- pg: те же `rangeCond`/`createdInRangeCond`/audience что в `getAppointmentStats`; `uniquePatients` = `countDistinct(beAppointments.platformUserId)` с `BE_APPOINTMENTS_NOT_PURGED`; `newPatients` = подзапрос/`NOT EXISTS` на более раннюю запись того же `platformUserId` в той же org.
- Период из тулбара (вайрфрейм «30 дн ▾») → `DoctorAppointmentStatsFilter` (`kind:"preset"`/`kind:"range"`), границы — `resolveAppointmentStatsBounds(filter, iana)`.
- inMemory-паритет + unit-тесты (границы окна, дубликаты пациента, «новый» на границе).

---

## 7. Дизайн API (тонкие роуты)

Образец — `api/admin/booking-engine/working-hours/route.ts`: `requireAdminBookingEngine()` → `gate.ctx.organizationId`, `deps.bookingScheduling` (503 если нет), сентинел `__none__`, Zod-боди.

- `working-days/route.ts`
  - `GET ?from=&to=&specialistId=&branchId=` → `{ ok, rows: WorkingDayRecord[] }` (range ≤ 92 дн).
  - `PUT { dates: string[], action: "upsert", startMinute, endMinute, breakStartMinute?, breakEndMinute?, branchId } | { dates, action: "close" } | { dates, action: "clear" }` → upsert/закрыть/снять.
- `working-schedule-templates/route.ts`
  - `GET` → список; `POST` create; `DELETE ?id=`; `POST { action:"apply", templateId, dates[] }` → `applyScheduleTemplate`.
- KPI — **через SSR** в `page.tsx` (`loadDoctorScheduleKpis(deps, filter)`), без отдельного роута (период меняется → клиент обновляет через router с `?period=`).

---

## 8. Scope boundaries

**Разрешено:** `…/doctor/schedule/**` (новый), `…/calendar/**`, `…/appointments/**` (абсорбция/308), `…/admin/booking/**` (ребилд раскладки setup), `doctorNavLinks.ts`+`shell/**`, `modules/{booking-scheduling,doctor-appointments}/**`, `db/schema/bookingScheduling.ts`+`{index,relations}.ts`+миграции, `infra/repos/pgBookingScheduling*`+`*DoctorAppointments*`+inMemory, новые `api/admin/booking-engine/{working-days,working-schedule-templates}/**`, `doctorRouteRedirects.ts`+тест, `routes/paths.ts`, доки инициативы.

**Вне scope:** пациентский booking-UX (`app/patient/**`, `public-booking`, `patient-booking`) — только совместимость слот-движка; Rubitime sync-правила (`booking-rubitime-bridge`, `booking-appointment-sync`) — не ломать, новых правил не вводить; `booking-merge`, `google-calendar`; GitHub CI workflow; ESLint-allowlist.

---

## 9. Инварианты проекта (обязательно)

- **Clean-arch:** модули через ports/DI; `buildAppDeps` только в page/route/action; новые таблицы — Drizzle, без raw SQL для новых фич.
- **Doctor-UI канон:** `doctorSectionCardClass`/`DoctorSection`, KPI — `doctorMetricValueClass`; без `rounded-2xl`/`shadow-sm` на секциях; типошкала §B; контролы `h-8`; Select с `displayLabel`. Самопроверка §16 AGENTS чистая.
- **Patient/Doctor изоляция:** doctor-зона не импортирует `@/components/ui/**` / patient-дерево; primitives из `shared/ui/doctor/primitives/*`.
- **Конфиг в БД, не env:** таймзона бизнес-текстов — `app_display_timezone` (scope admin); интеграц-конфиг — `system_settings`.
- **Per-date backward-compat:** отсутствие per-date строки == текущее weekday-поведение.

---

## 10. Этапы (детально, с чек-листами)

> Чек-листы — локальные проверки (rg / целевые vitest / typecheck+lint затронутого пакета). Полный `pnpm run ci` — один раз в DoD (§14) и перед push.

### Этап 0 — baseline
- Прочитать правила + §7.5 ROADMAP + RUBITIME_BOOKING_PIPELINE.
- README/LOG инициативы (созданы) — актуализировать.
- ☑ `pnpm --dir apps/webapp typecheck`; ☑ точечные тесты booking-scheduling/doctor-appointments зелёные (baseline).

### Этап 1 — схема + миграция
- **1.A** Таблицы из §5.1–5.2 в `bookingScheduling.ts`; экспорт `index.ts`+`relations.ts`.
- **1.B** `drizzle-kit generate`; ревью SQL; применить на dev (`set -a && source apps/webapp/.env.dev && set +a` → migrate).
- ☑ `pnpm --dir apps/webapp typecheck`; ☑ миграция применяется и idempotent; ☑ `rg "beWorkingDays|beScheduleTemplates" db/schema/index.ts`.

### Этап 2 — port/service + инфра
- **2.A** типы + сигнатуры в `ports.ts` (Port и Service).
- **2.B** `service.ts` валидация + `applyScheduleTemplate`; unit-тесты сервиса.
- **2.C** pg-инфра (upsert `ON CONFLICT (organization_id, coalesce(specialist_id,…), work_date)`); inMemory-паритет; DI-проводка.
- ☑ `pnpm --dir apps/webapp test -- booking-scheduling`; ☑ `rg "listWorkingDays" src/app-layer/di/buildAppDeps.ts`.

### Этап 3 — слот-движок
- `WorkingDayRow` + `splitByBreak` + расширенная `workingIntervalsForDate` + `perDayMap` в `computeSlotsInternal` + `port.listWorkingDays` в пайплайне.
- ☑ `pnpm --dir apps/webapp test -- computeSlots` (override>weekday, перерыв→2 окна, closed→0 слотов, fallback weekday); ☑ существующие слот-тесты зелёные (регресс).

### Этап 4 — KPI
- `ScheduleKpis` + `getScheduleKpis` (pg distinct + NOT EXISTS; inMemory-паритет).
- ☑ `pnpm --dir apps/webapp test -- doctor-appointments` (границы окна, уникальность, новизна на границе).

### Этап 5 — API
- `working-days` + `working-schedule-templates` роуты (Zod, guard, `__none__`).
- ☑ route-тесты: 401 без сессии, контракт upsert/close/clear, валидация диапазона, apply-template.

### Этап 6 — контракт табов
- `doctorScheduleTabs.ts` + `scheduleTabRegistry.ts` + `ScheduleTabProps`.
- ☑ unit-тесты реестра (deepLinkKeys) и `scheduleTabFromQuery` (fallback cal).

### Этап 7 — таб «Календарь записей»
- **7.A** weeklist-вид в `DoctorBookingCalendarClient` (+ `CalendarViewMode` расширить, переключатель 4 вида).
- **7.B** `ScheduleCalendarTab` (appt-card + `DoctorCreateAppointmentDialog` + тулбар + deep-link).
- ☑ RTL: переключение видов, weeklist-рендер, deep-link view/date (прогрев чанков в `beforeAll`).

### Этап 8 — таб «График работы»
- **8.A** сетка месяца с мультивыбором + локация + ◀месяц▶ + закраска.
- **8.B** панель часов/обеда (Сохранить/Закрыть/Очистить) + шаблоны (Применить/создать/удалить); провязка API.
- ☑ RTL: выбор дней→PUT upsert; «Закрыть»→`action:"close"`; applyTemplate; контракт маппинга.

### Этап 9 — таб «Настройки записи»
- Под-навигация секций (Услуги/Форма/Оплаты/Правила/Интеграции); reuse `Booking*Section`; до-реализация/миграции недостающего (LOG); admin-only.
- ☑ `rg` runtime-использования старой раскладки перед удалением; ☑ lint/typecheck зоны; ☑ smoke секций.

### Этап 10 — шелл
- `DoctorScheduleShell`: KPI-строка(6) + TabsNav + lazy keepMounted.
- ☑ RTL: монтаж активного таба + кэш уже открытых.

### Этап 11 — URL-sync
- ?tab + под-параметры ↔ URL без перехода; restore back/forward.
- ☑ unit-тест deep-link ключей (чанки в `beforeAll`).

### Этап 12 — страница + routing
- `schedule/page.tsx` server-вход (SSR KPI); убрать schedule-ветку rewrite (`doctorRouteRedirects.ts:76–88`), сохранить 308 (`:59–60` + добавить `/appointments→?tab=cal`); обновить тест.
- ☑ `pnpm --dir apps/webapp test -- doctorRouteRedirects` (schedule без rewrite; 308 сохранены; loop-guard ок).

### Этап 13 — nav + легаси
- Выровнять кластер под 3 таба (`cal/work/setup`); `isDoctorNavItemActive` для schedule; свести `/calendar`,`/appointments` к 308/абсорбции (`rg` перед удалением).
- ☑ nav-тесты; ☑ `rg "/app/doctor/calendar\"|/app/doctor/appointments\"" src` (нет битых ссылок).

### Этап 14 — доки + CI
- README/LOG/`schedule.md`; ссылки в `DOCTOR_CABINET_NAVIGATION.md` и §7.5 ROADMAP.
- ☑ **DoD:** `pnpm install --frozen-lockfile && pnpm run ci` зелёный.

---

## 11. Тест-матрица

| Зона | Файл теста | Что покрыть |
|------|-----------|-------------|
| Слот-движок | `computeSlots.test.ts` | perDay override>weekday; перерыв→2 окна; is_closed→0; fallback; буфер |
| Scheduling service/infra | `booking-scheduling/service.test.ts` + pg/inMemory | upsert/clear/close; applyTemplate; валидация минут/дат; паритет |
| KPI | `doctor-appointments/service.test.ts` + pg/inMemory | уникальные (дубликаты), новые (NOT EXISTS на границе), reuse отмен/переносов |
| API | `working-days/route.test.ts`, `working-schedule-templates/route.test.ts` | 401; контракт; валидация; apply |
| Реестр/нормализация | `scheduleTabRegistry.test.ts`, `doctorScheduleTabs.test.ts` | deepLinkKeys; fallback cal |
| Шелл/URL | `DoctorScheduleShell.test.tsx` | монтаж+кэш; ?tab+под-параметры (чанки в beforeAll) |
| Календарь | RTL для `ScheduleCalendarTab` | 4 вида; weeklist; deep-link |
| График | RTL для `ScheduleWorkTab` | выбор→upsert; close; applyTemplate |
| Routing | `doctorRouteRedirects.test.ts` | schedule без rewrite; 308; loop-guard |
| Nav | nav-тест | 3 таба; active для schedule |

Соблюдать `webapp-tests-lean`: реальные `page` импорты — в `beforeAll` с `import()`, не в каждом `it`; не поднимать глобальные таймауты.

---

## 12. Миграция и совместимость

- Миграция аддитивная (две новые таблицы, без изменения существующих) → нулевой риск для текущего booking-flow.
- Per-date слой включается данными: пока врач не задал ни одного дня в «График работы», слоты считаются по weekday `be_working_hours` как сейчас.
- `system_settings` — новых ключей не предполагается (локации = существующие `be_branches`; таймзона = `app_display_timezone`). Если по ходу §9 потребуется ключ — добавить в `ALLOWED_KEYS` и пройти `updateSetting` (зеркало integrator), зафиксировать в LOG.
- Rubitime: per-date меняет только расчёт собственных слотов; синхронизация записей не затрагивается.

---

## 13. Риски и открытые допущения

- **R1 (пересечение §7.5):** редизайн «График работы» и ребилд `admin/booking`-раскладки — зона BOOKING_REWORK. Ведём здесь по согласованию; перед стартом §8/§9 сверить ROADMAP §7.5, отметить в LOG, не дублировать сущности (используем `be_working_hours`/`be_schedule_blocks` как есть + новый per-date слой).
- **R2 (solo specialist_id):** unique по `(org, COALESCE(specialist_id,…), date)`; solo резолвит специалиста через `ensureDefaultSpecialist` (как `BookingSoloScheduleSection`). Допущение: один активный специалист — подтвердить на dev.
- **R3 (несколько локаций в один день):** модель = один график на день (локация — атрибут). Если потребуется две локации/день — расширять unique до `(org, specialist, branch, date)` (вынести в backlog, не делать сейчас).
- **R4 (weeklist во FullCalendar):** библиотека нативно не даёт «ленту по дням» как в вайрфрейме — реализуем кастомным рендером поверх того же фида `getCalendar`, не ломая day/week/month.
- **R5 (период KPI):** уточнить дефолт (вайрфрейм «30 дн») и набор пресетов — взять из существующего `AdminStatsTimePreset`.

---

## 14. Definition of Done

1. ☑ `/app/doctor/schedule` — реальная страница-шелл с KPI-строкой и табами cal/work/setup; rewrite убран, 308 со старых URL сохранены, loop-guard цел.
2. ☑ «Календарь записей»: День/Неделя·сетка/Неделя·лента/Месяц + appt-card + «Создать запись»; deep-link (view/date/location/service/appt) работает.
3. ☑ «График работы»: per-date редактор (мультивыбор → часы/обед/локация → Сохранить/Закрыть/Очистить) + шаблоны; данные в `be_working_days`/`be_schedule_templates`; слот-движок учитывает per-date override (closed→нерабочий, fallback weekday) — покрыто тестами.
4. ☑ «Настройки записи»: ребилд под doctor-эталон с под-навигацией; недостающий бэкенд доделан (все секции переиспользованы, новых миграций не потребовалось), зафиксирован в LOG.
5. ☑ KPI (записей/уникальных/новых/отмены/переносы/период) — из БД, не моки.
6. ☑ Миграции применяются чисто; clean-arch и doctor-UI канон соблюдены (rg §16 чистая); patient/doctor изоляция не нарушена.
7. ☑ `pnpm run ci` зелёный (предсуществующий broadcast-фейл изолирован — не наш scope); LOG отражает сделанное / сознательно не сделанное / координацию с §7.5.

---

## 15. Что сознательно НЕ делаем (этой итерацией)

- Не меняем пациентский booking-UX и Rubitime sync-правила — только совместимость слот-движка.
- Не вводим отдельный «course/schedule engine»; per-date — надстройка над booking-engine.
- Не поддерживаем две локации в один день (R3 → backlog).
- Категории рассылок «Опрос»/«Расписание приёмов» из вайрфрейма — не здесь.
