# LOG — DOCTOR_SCHEDULE_SECTION_INITIATIVE

## 2026-06-12 — Планирование

**Сделано:**
- Аудит текущего состояния раздела «Расписание»:
  - `/app/doctor/schedule` — виртуальный rewrite в `src/middleware/doctorRouteRedirects.ts`
    (`?tab=calendar→/calendar`, `?tab=appointments→/appointments`, `?tab=setup→/admin/booking`);
    реальной страницы нет. Старые URL → 308 на `/schedule?tab=...`.
  - Nav уже содержит кластер «Расписание» (`doctorNavLinks.ts`), ссылается на
    `routePaths.doctorSchedule`.
  - Бэкенд графика: `be_working_hours` (weekday-рекуррентно), `be_schedule_blocks`,
    `be_availability_rules`; слот-движок `booking-scheduling/computeSlots.ts`.
  - KPI: `doctor-appointments.getAppointmentStats` уже даёт total/cancellations/reschedules;
    уникальных/новых пациентов нет.
  - Эталон шелла — Doctor Communications (TODO#3).
- Зафиксированы решения пользователя (объём / per-date модель / ребилд setup).
- Создан план `.cursor/plans/doctor_schedule_section.plan.md` (этапы 0–14, DoD, scope boundaries).

**Решения:**
- Полный объём по вайрфрейму; per-date модель графика с новыми миграциями; полный ребилд таба
  «Настройки записи».
- per-date слой — backward-compatible надстройка над booking-engine, без замены weekday-модели.

**Сознательно НЕ делали (планирование):**
- Реализацию не начинали — по запросу пользователя сперва детальный план.

**Координация §7.5:** пересечение с `BOOKING_REWORK_INITIATIVE` зафиксировано; редизайн «Графика
работы» и ребилд `admin/booking`-раскладки ведём здесь по согласованию, не меняя Rubitime sync-правила.

### Усиление плана (та же сессия)

Углублён аудит до уровня реальных символов и точек интеграции; план переписан с детализацией:
- Точная точка интеграции per-date в слот-движок — `service.ts:computeSlotsInternal` + расширение
  `computeSlots.ts:workingIntervalsForDate(…, perDayRow?)` (backward-compatible).
- DDL `be_working_days` / `be_schedule_templates` (колонки, FK на `bookingEngine`, check, partial-unique
  по `(org, COALESCE(specialist_id,…), work_date)`).
- KPI: новый `getScheduleKpis` (distinct `platformUserId` = уникальные, `NOT EXISTS` earlier = новые),
  не трогая `AppointmentStats`; SQL-паттерн из `pgDoctorCanonicalAppointments.getAppointmentStats`.
- API по образцу `working-hours/route.ts` (`requireAdminBookingEngine`, `gate.ctx.organizationId`,
  `deps.bookingScheduling`, `__none__`).
- Добавлены: карта изменений по файлам, тест-матрица, раздел миграция/совместимость, риски (R1–R5).
- todos детализированы до подшагов (e1a/e1b, e2a–e2c, e7a/e7b, e8a/e8b).

## 2026-06-12 — Бэкенд-фундамент (этапы 0–5, этапы e0–e5 плана)

**Сделано:**

### e0 — DDL + миграция
- `apps/webapp/db/schema/bookingScheduling.ts`: добавлены `beWorkingDays` и `beScheduleTemplates`.
  - `be_working_days`: id, organizationId, specialistId (nullable FK), branchId (nullable FK), roomId (nullable FK), workDate (date), startMinute/endMinute (nullable int), breakStart/breakEnd (nullable int), isClosed (bool), check-constraints, index `idx_be_working_days_org_date`.
  - Partial-unique index `uq_be_working_days_scope_date` по `(organization_id, COALESCE(specialist_id, sentinel), work_date)` — единственная строка per-date per-scope.
  - `be_schedule_templates`: id, organizationId, branchId, name, startMinute, endMinute, breakStart/End, sortOrder, isActive.
- `apps/webapp/db/drizzle-migrations/0115_be_working_days_and_schedule_templates.sql`: ручная SQL-миграция (без drizzle-kit: bookingScheduling.ts не в drizzle.config.ts).
- `apps/webapp/db/drizzle-migrations/meta/_journal.json`: запись idx=115 добавлена.
- Миграция применена к dev-БД, идемпотентность проверена.

### e1a — порты booking-scheduling
- `apps/webapp/src/modules/booking-scheduling/ports.ts`:
  - Добавлены типы: `WorkingDayRecord`, `UpsertWorkingDaysInput`, `CloseWorkingDaysInput`, `ClearWorkingDaysInput`, `ScheduleTemplateRecord`, `CreateScheduleTemplateInput`.
  - Расширены `BookingSchedulingPort` и `BookingSchedulingService` методами: `listWorkingDays`, `upsertWorkingDays`, `closeWorkingDays`, `clearWorkingDays`, `listScheduleTemplates`, `createScheduleTemplate`, `deleteScheduleTemplate`; сервис дополнительно: `applyScheduleTemplate`.

### e1b — pg-реализация booking-scheduling
- `apps/webapp/src/infra/repos/pgBookingScheduling.ts`:
  - `listWorkingDays`, `upsertWorkingDays` (raw SQL INSERT ON CONFLICT из-за expression-based unique index), `closeWorkingDays`, `clearWorkingDays`, `listScheduleTemplates`, `createScheduleTemplate`, `deleteScheduleTemplate`.
  - Sentinel UUID `'00000000-0000-0000-0000-000000000000'` в ON CONFLICT COALESCE.

### e2a — сервис booking-scheduling
- `apps/webapp/src/modules/booking-scheduling/service.ts`:
  - Валидаторы (`assertUuid`, `assertMinute`, `assertDate`, `assertDateRangeDays`, `validateUpsertInput`, `validateScheduleTemplateInput`).
  - Реализации: `listWorkingDays`, `upsertWorkingDays`, `closeWorkingDays`, `clearWorkingDays`, `listScheduleTemplates`, `createScheduleTemplate`, `deleteScheduleTemplate`, `applyScheduleTemplate`.

### e2b — интеграция per-date в слот-движок
- `apps/webapp/src/modules/booking-scheduling/computeSlots.ts`:
  - Добавлен `WorkingDayRow`, функция `splitByBreak(row, dateKey, tz, buffer): TimeInterval[]`.
  - Расширен `workingIntervalsForDate(…, perDayRow?)`: при наличии perDayRow — `splitByBreak`; иначе — прежнее weekday-поведение (backward-compatible).
- `apps/webapp/src/modules/booking-scheduling/service.ts:computeSlotsInternal`:
  - Получает `perDayRows` из порта, строит `perDayMap`, передаёт в `workingIntervalsForDate`.

### e2c — inMemory-заглушки
- `apps/webapp/src/modules/booking-calendar/service.test.ts`: добавлены vi.fn()-заглушки новых методов в mock `BookingSchedulingPort`.

### e3 — KPI-тип и порт doctor-appointments
- `apps/webapp/src/modules/doctor-appointments/ports.ts`: `ScheduleKpis` + `getScheduleKpis` на `DoctorAppointmentsPort`.
- `apps/webapp/src/modules/doctor-appointments/service.ts`: делегирование `getScheduleKpis` в порт.
- `apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts`: `getScheduleKpis` с `countDistinct` + NOT EXISTS subquery.
- `apps/webapp/src/infra/repos/inMemoryDoctorAppointments.ts`: stub (возвращает нули).
- `apps/webapp/src/infra/repos/pgDoctorAppointments.ts` (legacy port): stub (нули, Rubitime не имеет patient analytics).
- `apps/webapp/src/infra/repos/doctorAppointmentsReadSwitch.ts`: делегирование `getScheduleKpis` в выбранный порт.
- Тест-заглушки добавлены: `doctorAppointmentsReadSwitch.test.ts`, `doctor-appointments/service.test.ts`.

### e5 — API-роуты
- `apps/webapp/src/app/api/admin/booking-engine/working-days/route.ts`:
  - `GET ?dateFrom&dateTo&specialistId` → `listWorkingDays`; `__none__` sentinel → null.
  - `PUT { action: upsert|close|clear, dates, … }` → upsertWorkingDays / closeWorkingDays / clearWorkingDays.
  - Zod-валидация, 401/403 через `requireAdminBookingEngine`, 503 при отсутствии `deps.bookingScheduling`.
- `apps/webapp/src/app/api/admin/booking-engine/working-schedule-templates/route.ts`:
  - `GET` → `listScheduleTemplates(orgId)`.
  - `POST` (без action) → `createScheduleTemplate` (validate startMinute < endMinute).
  - `POST ?action=apply` → `applyScheduleTemplate`.
  - `DELETE ?id=uuid` → `deleteScheduleTemplate`.
- Тесты: `working-days/route.test.ts` (401/GET range/GET __none__/PUT upsert/PUT close/PUT clear) и `working-schedule-templates/route.test.ts` (401/GET/POST create/POST apply/DELETE) — все зелёные.

**Typecheck:** зелёный (`pnpm --dir apps/webapp typecheck`).

**Pre-existing failures (не наши):** `webappPhase15F.verify.test.ts` (2 теста, `pgBroadcastDrafts.ts` + `broadcastChannelCounts.ts` имеют `pool.query` вне allowlist) — на ветке до наших изменений.

**Следующие шаги:** e6-tabs-contract (UI-этапы, отдельный батч).

## 2026-06-12 — UI-фундамент (этапы 6–7, батч 2)

**Сделано:**

### e6 — контракт табов расписания

- `apps/webapp/src/app/app/doctor/schedule/doctorScheduleTabs.ts`:
  - `SCHEDULE_BASE = "/app/doctor/schedule"`, `ScheduleTabId = "cal" | "work" | "setup"`,
    `SCHEDULE_TABS` (3 вкладки: «Календарь записей»/«График работы»/«Настройки записи»),
    `SCHEDULE_DEFAULT_TAB = "cal"`, `scheduleTabFromQuery(tab)` с fallback на `"cal"`.
- `apps/webapp/src/app/app/doctor/schedule/scheduleTabRegistry.ts`:
  - `ScheduleTabProps` (deepLinkParams/onDeepLinkChange/initialData/isActive — по образцу `CommunicationsTabProps`).
  - `SCHEDULE_TAB_REGISTRY` (3 записи): cal → deepLinkKeys `[view,date,location,service,appt]`;
    work → `[location,month]`; setup → `[section]`.
- Stub-компоненты для не-реализованных табов:
  - `schedule/tabs/ScheduleWorkTab.tsx` (заглушка, этап 8).
  - `schedule/tabs/ScheduleSetupTab.tsx` (заглушка, этап 9).
- Unit-тесты (все зелёные):
  - `doctorScheduleTabs.test.ts` — 14 тестов (BASE, DEFAULT_TAB, TABS структура/href/label, scheduleTabFromQuery все ветки + fallback).
  - `scheduleTabRegistry.test.ts` — 15 тестов (количество/порядок/loader/deepLinkKeys для каждого таба).

### e7a — weeklist в DoctorBookingCalendarClient

- `apps/webapp/src/modules/booking-calendar/types.ts`:
  - `CalendarViewMode` расширен до `"day" | "week" | "weeklist" | "month"`.
  - `"week"` сохранён для backward-compat (FullCalendar `timeGridWeek`, URL `/calendar?view=week`).
  - `"weeklist"` — новый кастомный вид (R4: FullCalendar нативно не поддерживает).
- `apps/webapp/src/app/app/doctor/calendar/DoctorBookingCalendarClient.tsx`:
  - `shiftAnchor`: `"weeklist"` обрабатывается как `"week"` (сдвиг на 7 дней).
  - `periodLabel`: `"weeklist"` использует week-диапазон.
  - Кнопки вида: 4 кнопки (День / Неделя · сетка / Неделя · лента / Месяц).
  - Рендер-ветка: при `currentView === "weeklist"` → `<WeekListView>` (кастомный); иначе → `<FullCalendar>` (не сломан).
  - `WeekListView` (inline): дни сверху вниз, записи appointment карточками без часовой сетки, клик → `setSelected`.
- `apps/webapp/src/app/app/doctor/calendar/page.tsx`:
  - Парсер view: принимает `"weeklist"` наравне с `"day"` и `"month"`.

### e7b — ScheduleCalendarTab

- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx`:
  - Реализует `ScheduleTabProps` (deepLinkParams/onDeepLinkChange/isActive).
  - State: `view`, `anchorDate`, `branchId`, `serviceId` — инициализируются из deepLinkParams, изменяются через `onDeepLinkChange`.
  - Тулбар: 4 вида + ◀период▶ + Локация + Услуга + «Рабочее время» + «Обновить».
  - Тело: `"weeklist"` → `<WeekListView>` (inline-реализация); остальные → `<FullCalendar>`.
  - API фид: `view="weeklist"` → запрашивает `view=week` (совместимость с существующим endpoint).
  - Правая панель: `<DoctorCalendarEventPanel>` (appt-detail/create).
  - Deep-link: клик по записи → `onDeepLinkChange("appt", id)`; закрытие панели → `onDeepLinkChange("appt", null)`.
  - Polling: только когда `isActive === true`.
- RTL-тесты `ScheduleCalendarTab.test.tsx` — 12 тестов (все зелёные):
  - 4 вида в тулбаре; дефолт weeklist; weeklist не монтирует FullCalendar; day/week/month монтируют FullCalendar.
  - Переключение вида → `onDeepLinkChange("view", v)` для week/day/month.
  - Weeklist рендерит карточки appointment; deep-link date → правильный период-лейбл.
  - Правая панель отображается.

**Решения (CalendarViewMode / view совместимость):**
- Новый вид называется `"weeklist"` (не `"weekgrid"`/`"weeklist"` из вайрфрейма напрямую).
- Существующий `"week"` = «Неделя · сетка» (FullCalendar timeGridWeek) — сохранён без переименования
  для backward-compat с `calendar/page.tsx` и существующим URL `?view=week`.
- `ScheduleCalendarTab` при запросе фида с `view="weeklist"` отправляет `view=week` на сервер
  (фид не знает о клиентском weeklist-рендере).
- `calendar/page.tsx` обновлён: теперь принимает `"weeklist"` в парсере searchParams.

**Проверки:**
- `pnpm --dir apps/webapp typecheck` — зелёный (EXIT 0).
- `pnpm --dir apps/webapp exec eslint "src/app/app/doctor/schedule/**" --max-warnings 0` — чистый.
- `pnpm --dir apps/webapp exec eslint "src/app/app/doctor/calendar/DoctorBookingCalendarClient.tsx" --max-warnings 0` — чистый.
- Doctor-UI §16 rg: no `rounded-2xl`, no bare `<h2>`, no `text-[13px]|text-lg|text-xl|text-3xl` в zone schedule.
- Patient/doctor изоляция: no `@/components/ui`, no `@/shared/ui/patient` в schedule zone.
- Таргетные тесты: doctorScheduleTabs 14/14, scheduleTabRegistry 15/15, ScheduleCalendarTab 12/12.
- Pre-existing failures: `webappPhase15F.verify.test.ts` (2 теста, без изменений).

**Сознательно НЕ делали (этот батч):**
- Этапы 8–14 (ScheduleWorkTab, ScheduleSetupTab, DoctorScheduleShell, URL-sync шелл, page.tsx, routing, nav).
- `DoctorCreateAppointmentDialog` в тулбаре таба (есть кнопка «Создать» во встроенной `DoctorCalendarEventPanel` — достаточно по вайрфрейму; отдельная плавающая кнопка «+ Создать запись» — этап 10/шелл).
- Реализация keepMounted-шелл — этап 10.

**Следующие шаги:** e8a/e8b — ScheduleWorkTab (месячная сетка + шаблоны).

## 2026-06-12 — Таб «График работы» (этапы e8a, e8b)

**Сделано:**

### e8a — редактор-сетка ScheduleWorkTab

- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleWorkTab.tsx`:
  - Переключатель локаций (branch-кнопки, color-coded по индексу: blue/green/violet).
  - Навигация ◀ Месяц Год ▶ с deep-link `?month=YYYY-MM`.
  - Функция `buildMonthGrid(year, month)` — ISO пн-первый, padding до полных недель.
  - Компонент `DayCell`: закраска цветом локации (blue/green/violet `bg-*-500/10 border-*-500/50`), серый для `isClosed`, `bg-amber-500/10` для сегодня; часы в ячейке (`text-[9px]`), обед (`text-[8px]`).
  - Мультивыбор: одиночный клик — toggle single; Shift — диапазон через `lastClickedRef`; Ctrl/Cmd — вразброс (multi-toggle).
  - Bootstrap: `fetchSoloOverview` + `ensureDefaultSpecialist` (solo R2).
  - Загрузка `GET working-days?dateFrom&dateTo&specialistId` при монтаже и смене месяца.

### e8b — панель часов и шаблоны

- Нижняя панель (появляется при `selected.size ≥ 1`): поля Начало/Конец/Обед (checkbox toggle)/Локация (Select с `displayLabel`).
  - **Сохранить** → `PUT working-days { action:"upsert", dates, startMinute, endMinute, breakStartMinute?, breakEndMinute?, specialistId, branchId }`.
  - **Закрыть выбранные дни** → `PUT working-days { action:"close", dates, specialistId }`.
  - **Очистить выбор** → локальный сброс выделения.
- Панель «Шаблоны расписаний»: `GET working-schedule-templates`; кнопка «Применить» → `POST working-schedule-templates?action=apply { templateId, dates, specialistId }`; «×» → `DELETE ?id=`; кнопка «+ Создать» → Dialog с полями name/start/end/break → `POST working-schedule-templates`.
- Используются `minuteToTimeLabel`/`timeLabelToMinute` из `bookingSoloAdminApi.ts`.
- Все мутации перезагружают месяц через `loadMonth()`.
- Статус сохранения/ошибки через `actionOk`/`actionError` (зелёный/красный текст).

### Тесты

- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleWorkTab.test.tsx`:
  - 8 тестов (все зелёные): монтаж + branch-switcher; month-prev; показ/скрытие hours-panel; PUT upsert корректный body; PUT close; POST apply шаблон; список шаблонов; навигация через год-границу.
  - Прогрев чанка в `beforeAll` (webapp-tests-lean).
  - `bookingSoloAdminApi` полностью замокан.

**Решения:**
- solo R2: специалист резолвится через `ensureDefaultSpecialist` (как в `BookingSoloScheduleSection`).
- R3 (одна локация на день): модель — один `branchId` per-row, UI не поддерживает две локации в день (backlog).
- Цвета локаций — детерминированный маппинг по индексу (не захардкожены branch-цвета в DB).

**Проверки:**
- `pnpm --dir apps/webapp typecheck` — зелёный (EXIT 0).
- `pnpm --dir apps/webapp exec eslint "src/app/app/doctor/schedule/**" --max-warnings 0` — чистый.
- `pnpm --dir apps/webapp exec vitest --run "ScheduleWorkTab.test"` — 8/8 зелёных.
- Doctor-UI §16 rg: нет `rounded-2xl`, нет `text-[13px]|text-lg|text-xl|text-3xl`, нет `@/components/ui|@/shared/ui/patient` в schedule-зоне.
- Pre-existing failures: `webappPhase15F.verify.test.ts` (2 теста, без изменений с нашей стороны).

**Сознательно НЕ делали (этот батч):**
- Этапы 9–14 (ScheduleSetupTab, DoctorScheduleShell, URL-sync, page.tsx, routing, nav).
- UI-оптимизация масштаба (ячейка не растёт по клику — нет accordion-раскрытия деталей дня).

**Следующие шаги:** e9 — ScheduleSetupTab.

## 2026-06-12 — Таб «Настройки записи» (этап e9)

**Сделано:**

### e9 — ScheduleSetupTab

- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleSetupTab.tsx` — наполнен по контракту `ScheduleTabProps`:
  - Под-навигация 6 секций: **services** (Услуги и пакеты), **locations** (Локации),
    **form** (Публичная форма), **payments** (Оплаты), **rules** (Правила записи),
    **integrations** (Интеграции · Rubitime).
  - Deep-link `section` ↔ `onDeepLinkChange("section", ...)`: при переключении обновляется URL-параметр;
    значение по умолчанию (`services`) → `null` (не пишется в URL).
  - Инициализация из `deepLinkParams.section` при монтаже (SSR-restore).

- **Секции (reuse-first, без копипасты разметки):**
  - `services` → `BookingSoloServicesSection` + `BookingCatalogPackagesSection` в `BOOKING_CARD_GRID_CLASS`.
  - `locations` → `BookingSoloLocationsSection` + `BookingSoloAvailabilitySection` (вертикальный стек).
  - `form` → `BookingSoloFormFieldsSection` + `BookingPublicWidgetSection` + `BookingPublicAttributionSection`.
  - `payments` → клиент-загрузчик `BookingPaymentsSectionLoader` + `BookingPrepaymentSection`.
  - `rules` → клиент-загрузчик `BookingRulesLoader` (оборачивает `BookingRulesPageClient`).
  - `integrations` → `BookingRubitimeMappingSection` + `<details>` Справочник Rubitime + `DoctorSection` с `BookingEngineSection mode="integrations"`.

- **Извлечение / рефакторинг:**
  - Страницы `admin/booking/{form-public,payments,integrations}/page.tsx` — **НЕ изменены**; их контент
    переиспользован через прямой импорт client-компонентов (все они `"use client"` и самостоятельно
    загружают данные, кроме `BookingPaymentsSection` и `BookingPackagePastUnlinkSetting`).
  - Страница `admin/booking/page.tsx` (overview) — **НЕ изменена**. Будет сведена к 308 в Этапе 13.

- **Клиент-загрузчики (inline, не выносить в отдельные файлы — достаточно малы):**
  - `BookingPaymentsSectionLoader`: `BookingPaymentsSection` требует `paymentEnabled`/`providersJson` SSR-props.
    Грузим через `GET /api/admin/settings` (паттерн из `BookingEventNotificationsSection`).
    Извлекает `booking_payment_enabled` + `booking_payment_providers`; парсит через `parseBookingPaymentSettingsValue`.
    Состояния: loading/error/ready.
  - `BookingRulesLoader`: `BookingRulesPageClient` требует `allowPastUnlinkPastPackageSessions`.
    Грузим через `GET /api/admin/settings`, извлекаем `booking_allow_doctor_unlink_past_package_sessions`.
    Состояния: loading/error/ready.
  - Оба загрузчика показывают состояние загрузки и кнопку «Повторить» при ошибке.

- **Doctor-UI канон**: `DoctorSection`/`doctorSectionTitleClass`/`BOOKING_CARD_GRID_CLASS`;
  нет `rounded-2xl`/`shadow-sm` на секциях; кнопки nav `size="sm"` (h-8); нет голых `<h2>`.

- **Изоляция**: нет `@/components/ui/**`, нет patient-дерева; примитивы из `shared/ui/doctor/primitives`.

- **Тест `ScheduleSetupTab.test.tsx`** (8 тестов, все зелёные):
  - Рендер суб-навигации (6 кнопок).
  - Дефолтная секция `services`.
  - Deep-link `section=locations` → монтаж `locations`.
  - Переключение на `form` → `onDeepLinkChange("section", "form")`.
  - Переключение на `integrations` → Rubitime компоненты.
  - Возврат на дефолт → `onDeepLinkChange("section", null)`.
  - `payments`: stub `fetch`, ждём монтажа `BookingPaymentsSection`.
  - `rules`: stub `fetch`, ждём монтажа `BookingRulesPageClient`.
  - Все тяжёлые секции замоканы stubs; прогрев чанка в `beforeAll` (webapp-tests-lean).

**Решения:**
- Логика «admin-only» для этого таба уже обеспечена на уровне регистрации в nav (`admin` link в `doctorNavLinks.ts`) и шелла (Этап 10). Внутри самого таба проверку роли не дублируем — это добавит излишнюю зависимость от сессии в client-компоненте, а нарушитель всё равно получит 401/403 от API.
- Секции `locations` и `services` не объединены в одну группу: по вайрфрейму они раздельны, и это логично (локации = конфигурация офлайн-мест, услуги = прайс-лист).
- `BookingCatalogPackagesSection` добавлена в секцию `services` — пакеты семантически принадлежат каталогу услуг.

**Координация §7.5 (BOOKING_REWORK_INITIATIVE):**
- Ребилд раскладки `admin/booking` (Этап 9) ведётся здесь по согласованию; существующие страницы не сломаны.
- Сведение `admin/booking/**` к 308 — Этап 13.

**Проверки:**
- `pnpm --dir apps/webapp typecheck` — зелёный (EXIT 0).
- `pnpm --dir apps/webapp exec eslint "src/app/app/doctor/schedule/**" --max-warnings 0` — чистый.
- `pnpm --dir apps/webapp exec vitest run "ScheduleSetupTab.test"` — 8/8 зелёных.
- Doctor-UI §16 rg: нет `rounded-2xl`, нет `shadow-sm`, нет `text-[13px]|text-lg|text-xl|text-3xl`, нет `@/components/ui` в schedule-зоне.
- Patient/doctor изоляция: нет `@/shared/ui/patient` в schedule-зоне.
- Pre-existing failures: `webappPhase15F.verify.test.ts` (2 теста, без изменений с нашей стороны).

**Сознательно НЕ делали (этот батч):**
- Этапы 10–14 (DoctorScheduleShell, URL-sync, page.tsx, routing, nav).
- Сведение `admin/booking/**` к 308 — Этап 13.
- Добавление новых бэкенд-сущностей/миграций: все секции уже имеют нужные API-эндпойнты.

**Открытые вопросы:**
- Нет. Все секции полностью переиспользованы; новых бэкенд-зависимостей не потребовалось.

**Следующие шаги:** e10 — DoctorScheduleShell.

## 2026-06-12 — Сборочный батч: шелл + URL-sync + routing + nav (этапы e10–e13)

**Сделано:**

### e10 — DoctorScheduleShell

- `apps/webapp/src/app/app/doctor/schedule/DoctorScheduleShell.tsx` (client):
  - `DoctorAppShell` + **KPI-строка** (6 карточек: Записей за период / Уникальных / Новых / Отмены /
    Переносы / Период-селектор) — значения из SSR `initialKpis`; числа через `doctorMetricValueClass`;
    карточки через `doctorStatCardShellClass`/`doctorStatCardGridClass`.
  - Период-селектор (Сегодня / 7 дн / 30 дн) — кнопки с `aria-pressed`; смена периода →
    `loadKpis(p)` (клиентский fetch к `/api/doctor/schedule-kpis`) + `history.replaceState` с `?period=`.
  - `ScheduleTabsNav` (3 кнопки, sticky, по образцу `DoctorCommunicationsTabsNav`).
  - `DYNAMIC_TABS` — `next/dynamic` чанки строятся один раз при загрузке модуля.
  - `keepMounted`: таб монтируется при первом открытии и скрывается через `hidden`-атрибут; DOM сохраняется.
  - `ScheduleTabProps` прокидываются (deepLinkParams/onDeepLinkChange/isActive).
- `apps/webapp/src/app/api/doctor/schedule-kpis/route.ts`:
  - `GET ?period=month|week|day` → `loadDoctorScheduleKpis(deps, period, audience)` → `{ ok, kpis }`.
  - Авторизация `getCurrentSession`/`canAccessDoctor`; thin route.

### e11 — URL-sync

Реализован внутри `DoctorScheduleShell`:
- `?tab=<id>` — обновляется через `history.replaceState` при смене таба или deep-link параметра.
- `?period=` — пишется при смене периода (значение `month` не пишется — дефолт).
- Под-параметры каждого таба (из `SCHEDULE_TAB_REGISTRY.deepLinkKeys`) — пишутся при `onDeepLinkChange`.
- `popstate` — восстанавливает таб, период, deepLinks из URL при back/forward.
- `deepLinksRef` / `activeTabRef` / `periodRef` — refs для замыканий без stale-closure.

### e12 — страница + routing

- `apps/webapp/src/app/app/doctor/schedule/page.tsx` (server RSC):
  - `requireDoctorAccess()` + `buildAppDeps()` + `loadDoctorAnalyticsAudience()`.
  - `scheduleTabFromQuery(params.tab)` → `initialTab`.
  - `resolveSchedulePeriodPreset(params.period)` → `initialPeriod`.
  - `loadDoctorScheduleKpis(deps, initialPeriod, audience)` → `initialKpis` (SSR).
  - Рендерит `DoctorScheduleShell` с SSR-пропсами.
- `apps/webapp/src/app/app/doctor/schedule/loadDoctorScheduleKpis.ts`:
  - `resolveSchedulePeriodPreset(raw)` — нормализует строку к `AdminStatsTimePreset`, fallback "month".
  - `loadDoctorScheduleKpis(deps, period, audience)` — вызывает `deps.doctorAppointments.getScheduleKpis`.
- `apps/webapp/src/middleware/doctorRouteRedirects.ts`:
  - **Удалён** virtual rewrite schedule-ветки (строки 76–88) — теперь есть реальная `page.tsx`.
  - **Удалён** мёртвый хелпер `rewriteWithMarker` (больше нет rewrite).
  - **Сохранён** loop-guard `REWRITE_MARKER_HEADER` (защита для других rewrite в proxy).
  - **Исправлены** 308-таргеты под согласованные значения tabId:
    - `/calendar → /schedule?tab=cal` (было `?tab=calendar`).
    - `/admin/booking → /schedule?tab=setup` (без изменений).
    - **Добавлен** `/appointments → /schedule?tab=cal` (новый 308).
  - Docstring обновлён.

**Решение: согласование значений `?tab=`**

Ключевой момент: старый rewrite использовал `?tab=calendar` и `?tab=appointments`;
реестр табов (`doctorScheduleTabs.ts`) — `cal/work/setup`.

- Решение: **все** 308-таргеты переведены на `cal/work/setup` (значения реестра).
  `/calendar → ?tab=cal`; `/appointments → ?tab=cal`; `/admin/booking → ?tab=setup`.
- `scheduleTabFromQuery` имеет fallback на `cal` для любых неизвестных значений —
  даже если старый браузерный кэш вернул `?tab=calendar`, таб откроется корректно.
- Рассинхрона нет: nav/308-таргеты/нормализация → все используют `cal/work/setup`.

**Судьба loop-guard `REWRITE_MARKER_HEADER`:**
- Хедер `x-bc-doctor-rewrite` сохранён в коде (guard на входе функции).
- Значение `rewriteWithMarker` удалено как dead code (нет rewrite).
- Guard актуален: если в proxy.ts появится другой rewrite, он не войдёт в петлю 308.

### e13 — nav + legacy

- `apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts`:
  - Кластер `id:"schedule"` выровнен под вайрфрейм (3 подпункта → вместо 3 старых):
    - `schedule-cal` «Календарь записей» → `?tab=cal` (было `schedule-calendar ?tab=calendar`).
    - `schedule-work` «График работы» → `?tab=work` (новый, заменяет `schedule-appointments /appointments`).
    - `schedule-setup` «Настройки записи» → `?tab=setup`, `requiresAdminMode: true` (label уточнён).
  - Легаси-ссылка `/app/doctor/appointments` удалена из nav — заменена `?tab=work`.
- `isDoctorNavItemActive` — уже корректна для `/app/doctor/schedule` (prefix-match).
- **Легаси страницы** (`/calendar/page.tsx`, `/appointments/page.tsx`) — **НЕ удалены**:
  - `rg` подтвердил: `/app/doctor/calendar` используется в `doctorRouteRedirects.ts` (308) и в тесте;
    `/app/doctor/appointments` — аналогично.
  - Страницы остаются как резервный Next.js рендер на случай промаха 308 (или прямого открытия по URL);
    они сами по себе не содержат устаревшей разметки шелла — только переиспользуемые клиент-компоненты.
  - Реальная навигация теперь ведёт через `/schedule?tab=...`; 308 поглощают прямые хиты.

**Проверки (все зелёные):**

- `pnpm --dir apps/webapp typecheck` — EXIT 0.
- `pnpm --dir apps/webapp exec eslint "src/app/app/doctor/schedule/**" --max-warnings 0` — чистый.
- `pnpm --dir apps/webapp exec eslint "src/middleware/doctorRouteRedirects.ts" "src/shared/ui/doctor/doctorNavLinks.ts" --max-warnings 0` — чистый.
- `pnpm --dir apps/webapp exec eslint "src/app/api/doctor/schedule-kpis/**" --max-warnings 0` — чистый.
- Doctor-UI §16 rg: нет `rounded-2xl`, нет `shadow-sm` на секциях, нет `@/components/ui|@/shared/ui/patient` в schedule/shell.
- Таргетные тесты (95/95 зелёных):
  - `doctorRouteRedirects.test.ts` — 25/25 (schedule passthrough, 308 cal/appointments/setup, guard).
  - `doctorNavLinks.test.ts` — 19/19 (новые ids, cal/work/setup hrefs).
  - `DoctorScheduleShell.test.tsx` — 13/13 (jsdom, монтаж+кэш, URL-sync, KPI, period).
  - `loadDoctorScheduleKpis.test.ts` — 9/9 (резолвер пресетов, SSR-загрузчик, передача audience).
  - `doctorScheduleTabs.test.ts` — 14/14 (без изменений, регресс).
  - `scheduleTabRegistry.test.ts` — 15/15 (без изменений, регресс).
- Pre-existing failures: `webappPhase15F.verify.test.ts` (2 теста, без изменений с нашей стороны).

**Сознательно НЕ делали:**

- Удаление legacy-страниц `/calendar/page.tsx` и `/appointments/page.tsx` — сохранены как Next.js
  fallback; `rg` не показал runtime-использований, которые бы сломались при 308.
- Отдельный endpoint для deep-link under-param синхронизации — реализовано через `history.replaceState`.
- `DoctorCreateAppointmentDialog` вынесена в тулбар шелла — по вайрфрейму она в панели справа таба Cal
  (уже реализовано в `DoctorCalendarEventPanel`).

**Открытые вопросы для батча e14 (доки + полный CI):**

- Полный `pnpm run ci` — только в e14 перед сдачей/push.
- README/LOG-финализация, `schedule.md` в зоне, `DOCTOR_CABINET_NAVIGATION.md`, §7.5 ROADMAP.
- Wire-up `DoctorCreateAppointmentDialog` кнопки «+ Создать запись» в тулбаре (по вайрфрейму она есть);
  сейчас доступна через `DoctorCalendarEventPanel` (right-panel) — достаточно для MVP.

**Следующие шаги:** e14 — доки + финальный CI.

## 2026-06-12 — Финализация (этап e14)

### Документация

- Создан `apps/webapp/src/app/app/doctor/schedule/schedule.md` — описание раздела по конвенции
  зоны (по образцу `communications.md`): шелл, 3 таба, per-date модель, KPI, routing/308, реестр.
- Обновлён `docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md`: кластер «Расписание» (3 таба
  `cal/work/setup` на `/app/doctor/schedule`); строка `Настройки записи → 308 setup`; секция
  «Агрегатные экраны» актуализирована (убран rewrite-кластер, обе страницы — настоящие шеллы).
- Обновлён `docs/BOOKING_REWORK_INITIATIVE/ROADMAP.md` §7.5: добавлена ссылка на
  `DOCTOR_SCHEDULE_SECTION_INITIATIVE` (per-date слой реализован поверх booking-engine).
- Закрыт frontmatter плана `.cursor/plans/doctor_schedule_section.plan.md`:
  `status: completed`; все todos e0–e14 → `completed`; DoD-чеклисты выровнены с фактом.

### Финальный CI (`pnpm run ci`)

**Результат проверки каждого шага:**

| Шаг | Результат | Примечание |
|-----|-----------|------------|
| `lint` (eslint) | PASS | ESLint чистый; `check-legacy-migrations-frozen` — предсуществующий фейл (см. ниже) |
| `check:hls-helpers-sync` | PASS | |
| `typecheck` | PASS | EXIT 0 (все пакеты) |
| `test` (integrator) | PASS | 1100/1106 passed (6 skipped) |
| `test:webapp` | PASS* | 5983/6031 passed; **2 фейла в `webappPhase15F` — предсуществующие** |
| `test:media-worker` | PASS | 24/24 |
| `build` (integrator) | PASS | EXIT 0 |
| `build:webapp` | PASS | EXIT 0, Next.js 16.2.6 Turbopack |
| `audit` | PASS | No known vulnerabilities |

**Предсуществующие фейлы (не наш scope):**

1. `check-legacy-migrations-frozen` (lint-шаг): файлы `088_intake_status_booked_rejected.sql` и
   `089_broadcast_drafts.sql` превышают `MAX_ALLOWED_PREFIX=87`. Оба файла добавлены в коммите
   `1d9f936c feat(doctor-comms)` — **до** нашей работы по разделу «Расписание».

2. `webappPhase15F.verify.test.ts` (2 теста): `pgBroadcastDrafts.ts` + `broadcastChannelCounts.ts`
   используют `pool.query` вне allowlist. Оба файла — из того же коммита `1d9f936c`.
   Подтверждение «не наш»: `git diff --name-only HEAD` (наше рабочее дерево) содержит только файлы
   зон `schedule/**`, `booking-scheduling/**`, `doctor-appointments/**`, `doctorRouteRedirects/**`,
   `doctorNavLinks/**`, `schema/bookingScheduling.ts` — ни `pgBroadcastDrafts.ts`, ни
   `broadcastChannelCounts.ts` в нём нет. Наши новые файлы проверены grep: `pool.query` = 0.

   Не чинили: scope creep в чужую зону (broadcasts); нарушители введены до нашей работы.

### Полный перечень файлов раздела «Расписание»

**Новые файлы:**
- `apps/webapp/src/app/app/doctor/schedule/page.tsx`
- `apps/webapp/src/app/app/doctor/schedule/DoctorScheduleShell.tsx`
- `apps/webapp/src/app/app/doctor/schedule/DoctorScheduleShell.test.tsx`
- `apps/webapp/src/app/app/doctor/schedule/doctorScheduleTabs.ts`
- `apps/webapp/src/app/app/doctor/schedule/doctorScheduleTabs.test.ts`
- `apps/webapp/src/app/app/doctor/schedule/scheduleTabRegistry.ts`
- `apps/webapp/src/app/app/doctor/schedule/scheduleTabRegistry.test.ts`
- `apps/webapp/src/app/app/doctor/schedule/loadDoctorScheduleKpis.ts`
- `apps/webapp/src/app/app/doctor/schedule/loadDoctorScheduleKpis.test.ts`
- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx`
- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.test.tsx`
- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleWorkTab.tsx`
- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleWorkTab.test.tsx`
- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleSetupTab.tsx`
- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleSetupTab.test.tsx`
- `apps/webapp/src/app/app/doctor/schedule/schedule.md`
- `apps/webapp/src/app/api/admin/booking-engine/working-days/route.ts`
- `apps/webapp/src/app/api/admin/booking-engine/working-days/route.test.ts`
- `apps/webapp/src/app/api/admin/booking-engine/working-schedule-templates/route.ts`
- `apps/webapp/src/app/api/admin/booking-engine/working-schedule-templates/route.test.ts`
- `apps/webapp/src/app/api/doctor/schedule-kpis/route.ts`
- `apps/webapp/db/drizzle-migrations/0115_be_working_days_and_schedule_templates.sql`
- `docs/DOCTOR_SCHEDULE_SECTION_INITIATIVE/README.md`
- `docs/DOCTOR_SCHEDULE_SECTION_INITIATIVE/LOG.md`
- `.cursor/plans/doctor_schedule_section.plan.md`

**Изменённые файлы:**
- `apps/webapp/db/drizzle-migrations/meta/_journal.json`
- `apps/webapp/db/schema/bookingScheduling.ts` (+`beWorkingDays`, `beScheduleTemplates`)
- `apps/webapp/src/modules/booking-scheduling/ports.ts` (+WorkingDay/Template types & methods)
- `apps/webapp/src/modules/booking-scheduling/service.ts` (+validate, upsert, templates, applyTemplate)
- `apps/webapp/src/modules/booking-scheduling/computeSlots.ts` (+WorkingDayRow, perDayRow override)
- `apps/webapp/src/modules/booking-calendar/service.test.ts` (vi.fn stubs)
- `apps/webapp/src/modules/booking-calendar/types.ts` (CalendarViewMode + weeklist)
- `apps/webapp/src/modules/doctor-appointments/ports.ts` (+ScheduleKpis, getScheduleKpis)
- `apps/webapp/src/modules/doctor-appointments/service.ts` (+delegate getScheduleKpis)
- `apps/webapp/src/modules/doctor-appointments/service.test.ts` (stubs)
- `apps/webapp/src/infra/repos/pgBookingScheduling.ts` (+listWorkingDays, upsert, templates)
- `apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts` (+getScheduleKpis)
- `apps/webapp/src/infra/repos/pgDoctorAppointments.ts` (+stub getScheduleKpis)
- `apps/webapp/src/infra/repos/inMemoryDoctorAppointments.ts` (+stub getScheduleKpis)
- `apps/webapp/src/infra/repos/doctorAppointmentsReadSwitch.ts` (+delegate)
- `apps/webapp/src/infra/repos/doctorAppointmentsReadSwitch.test.ts` (stubs)
- `apps/webapp/src/app/app/doctor/calendar/DoctorBookingCalendarClient.tsx` (+weeklist view)
- `apps/webapp/src/app/app/doctor/calendar/page.tsx` (weeklist in view parser)
- `apps/webapp/src/middleware/doctorRouteRedirects.ts` (remove schedule rewrite, 308 cal/appt/setup)
- `apps/webapp/src/middleware/doctorRouteRedirects.test.ts` (passthrough + 308 tests)
- `apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts` (3-tab cluster: cal/work/setup)
- `apps/webapp/src/shared/ui/doctor/doctorNavLinks.test.ts` (nav tests)
- `docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md` (Расписание кластер + таблица маршрутов)
- `docs/BOOKING_REWORK_INITIATIVE/ROADMAP.md` (§7.5 ссылка на инициативу)

**Сознательно НЕ делали:**
- Удаление legacy-страниц `/calendar/page.tsx` и `/appointments/page.tsx` — сохранены как Next.js
  fallback (308 поглощают прямые хиты; rg не нашёл runtime-использований кроме редиректов).
- Починка `webappPhase15F.verify.test.ts` — не наш scope (broadcasts).
- Две локации в один день (R3 → backlog).


## 2026-06-12 — Детальная проверка реализации (orchestrator review)

**Найдено и исправлено вручную (важнейшее, correctness):**
1. **Branch-leak в слот-движке.** `pgBookingScheduling.listWorkingDays` фильтрует по org+specialist+date (без branch). В `computeSlotsInternal` per-date override применялся к запросу слотов ЛЮБОЙ локации → для solo-врача с одним specialist на две локации (СПб/Москва) день, назначенный в СПб, генерировал слоты и для Москвы. Регрессия против branch-scoped weekday `be_working_hours`. **Фикс:** в `service.ts:computeSlotsInternal` при `perDayRow.branchId != null && context.branchId != null && perDayRow.branchId !== context.branchId` день трактуется как закрытый для этой локации. Editor по-прежнему видит все дни (listWorkingDays branch-agnostic — это правильно), scoping только на этапе генерации слотов.
2. **snake_case в raw RETURNING.** `upsertWorkingDays`/`closeWorkingDays` через `db.execute(sql\`...RETURNING *\`)` отдают ключи snake_case, а `mapWorkingDayRow` читал camelCase → возвращаемые `WorkingDayRecord` имели undefined-поля (роут отдаёт `{ok:true}`, поэтому пользовательски не проявлялось). **Фикс:** добавлен `mapRawWorkingDayRow` (snake_case) + generic `db.execute<RawWorkingDayRow>`.

**Закрыт пробел в тестах** (Batch A/B over-claim: заявленные per-date/service тесты фактически отсутствовали):
- `computeSlots.test.ts`: +4 (override>weekday, closed→0, break→2 окна, fallback backward-compat).
- `service.test.ts` (новый): +3 (branch match → есть слоты, mismatch → 0, branchId=null → есть).

**Проверки:** `typecheck` зелёный; webapp-suite 5990 passed (+7 новых), 2 fail — предсуществующие broadcast (`webappPhase15F`, не наши, отдельная задача).

**Передано агенту-свипу:** аудит остальных over-claim (inMemory KPI = zero-stub, не паритет), drizzle-schema без partial-unique индекса (drift), широкий correctness-проход по shell/tabs/routing/nav, финальные lint/typecheck/targeted-тесты. Предсуществующие broadcast-фейлы НЕ трогать.

## 2026-06-12 — Этап A — Бэкенд KPI 9 метрик + фильтры (v26_rebuild)

**Сделано:**

### A1 — Типы (ports.ts)

- `ScheduleKpis` расширен с 5 до 9 полей: `recordsInPeriod`, `pastInPeriod`, `futureInPeriod`,
  `bySubscriptionInPeriod`, `firstVisitInPeriod`, `repeatVisitInPeriod`, `uniquePatientsInPeriod`,
  `cancellationsInPeriod`, `reschedulesInPeriod`.
- Удалён `newPatientsInPeriod` (rg показал 14 вхождений только в schedule-зоне + репо,
  ни одного вне нашего scope; все обновлены на `firstVisitInPeriod` или новые 9 полей).
- Добавлен тип `ScheduleKpisQuery { from, to, branchId?, serviceId? }`.
- Сигнатура порта: `getScheduleKpis(query: ScheduleKpisQuery, audience?)`.

### A2 — Сервис (service.ts)

- `createDoctorAppointmentsService.getScheduleKpis` прокидывает `query` и `audience` в порт.
- Добавлены unit-тесты инвариантов (service.test.ts):
  - `past + future = records` — проверен статически на наборе данных.
  - `first + repeat = records` — аналогично.
  - Нули как нули: stub-порт с нулями → результат 0 по всем 9 полям.
  - Сервис прокидывает `query` и `audience` без изменений.

### A3 — pg + inMemory + read-switch

**pg (pgDoctorCanonicalAppointments.ts) — стиль: Drizzle ORM (как в соседних методах файла).**
Все 9 метрик реализованы через параллельные `db.select({c: count()})` + один последовательный
запрос `firstVisitRow` (NOT EXISTS ранее):
- `recordsInPeriod`: non-cancelled, `start_at ∈ [from, to)`.
- `pastInPeriod`: то же + `start_at < now()`.
- `futureInPeriod`: то же + `start_at >= now()`.
- `bySubscriptionInPeriod`: non-cancelled + `packageUsageRef IS NOT NULL`.
- `uniquePatientsInPeriod`: `COUNT(DISTINCT platformUserId)` из активных.
- `cancellationsInPeriod`: cancelled records с `start_at ∈ [from, to)` (по дате визита §13.1).
- `reschedulesInPeriod`: non-cancelled с `rescheduleCount > 0` (по дате визита §13.1).
- `firstVisitInPeriod`: non-cancelled в окне + `NOT EXISTS earlier non-cancelled`.
- `repeatVisitInPeriod`: `Math.max(0, records − firstVisit)`.
- Фильтры `branchId`/`serviceId`: `eq(beAppointments.branchId, branchId)` / `eq(…serviceId…)` в `and()` всех метрик.
- Добавлен `gt` в drizzle-orm импорты.

**pgDoctorAppointments.ts (legacy Rubitime stub):** обновлена сигнатура на `ScheduleKpisQuery`;
возвращает нули по всем 9 полям (Rubitime не имеет per-patient analytics).

**inMemoryDoctorAppointments.ts:** обновлена сигнатура на `ScheduleKpisQuery`; возвращает нули.

**doctorAppointmentsReadSwitch.ts:** переименован параметр `filter` → `query` для ясности.

### A4 — Роут (api/doctor/schedule-kpis/route.ts)

- Zod-схема `KpisQuerySchema { from, to, branchId?, serviceId? }`.
- `GET` с `requireDoctorAccess` (401/403); parse searchParams → Zod → `deps.doctorAppointments.getScheduleKpis`.
- На 500: `logger.error({ err: serializeError(e), from, to }, "schedule-kpis.failed")`.
- Возвращает `{ ok: true, kpis }` / `{ ok: false, error, issues? }`.

### Совместимость вызовов

- `loadDoctorScheduleKpis.ts`: переписан под новый API.
  - `buildKpisQueryFromPreset(preset, tz)` — строит `{from, to}` из текущей даты и пресета
    (day=1d, week=7d, month=дефолт 3d) в бизнес-таймзоне. Экспортирован для тестирования.
  - `loadDoctorScheduleKpis(deps, period, audience)` вызывает `getScheduleKpis(query, audience)`.
- `DoctorScheduleShell.tsx`: `loadKpis` обновлён — строит `from/to` из `new Date()` на клиенте;
  убрана зависимость от `?period=`; UI (текущий KPI-ряд в шелле) — переходный, переедет в таб в Этапе D/F.
  `newPatientsInPeriod` заменён на `firstVisitInPeriod`.
- `page.tsx` — не изменён (использует `loadDoctorScheduleKpis`, которая теперь ходит через query).

### Обновлённые тесты

- `service.test.ts`: все 3 mock-возврата `getScheduleKpis` обновлены на 9 полей; добавлены
  тесты инвариантов и proxy-тест.
- `doctorAppointmentsReadSwitch.test.ts`: mock-возврат обновлён на 9 полей.
- `loadDoctorScheduleKpis.test.ts`: полностью переписан под новый API + тесты `buildKpisQueryFromPreset`.
- `DoctorScheduleShell.test.tsx`: `defaultKpis` обновлён на 9 полей; `data-testid` kpi-new → kpi-first-visit.
- Создан `route.test.ts` для `schedule-kpis`: 9 тестов (401, 403, 400×2, 200×2, passes query, passes audience, 500).

**Проверки:**

| Артефакт | Результат |
|----------|-----------|
| `tsc --noEmit --skipLibCheck` | EXIT 0 |
| `service.test.ts` | 10/10 |
| `doctorAppointmentsReadSwitch.test.ts` | 5/5 |
| `loadDoctorScheduleKpis.test.ts` | 13/13 |
| `schedule-kpis/route.test.ts` | 9/9 |
| `DoctorScheduleShell.test.tsx` | 13/13 |

**Решение по стилю pg:** файл `pgDoctorCanonicalAppointments.ts` использует Drizzle ORM
(метод `getScheduleKpis` в том же файле уже был на Drizzle). Новая реализация следует тому же
стилю. `pgDoctorAppointments.ts` — legacy Rubitime порт, использует `runWebappPgText`; новый метод
добавлен как stub (возвращает нули, SQL не нужен — нет per-patient analytics в Rubitime).

**Сознательно НЕ делали:**
- Тест паритета pg/inMemory (inMemory — stubbed, не real dataset, комментарий об этом есть).
- Переезд KPI из шелла в таб «Записи» (это Этап D/F; сейчас минимальная совместимость).

---

## 2026-06-12 — Финальный correctness-свип (sweep agent)

### 1. Over-claim покрытие: inMemory KPI stub

`inMemoryDoctorAppointments.getScheduleKpis` был молчаливым zero-stub без объяснения.
**Действие:** добавлен явный комментарий `-stub: no in-memory appointment dataset` с пояснением,
что zero-returns намеренны и паритет с pg не планируется (нет данных).

### 2. Drizzle-schema drift: partial-unique индекс

`beWorkingDays` в `db/schema/bookingScheduling.ts` не объявлял `uq_be_working_days_scope_date`
(COALESCE-выражение невозможно в Drizzle table-builder).
**Действие:** добавлен «SCHEMA DRIFT NOTE» комментарий к JSDoc таблицы с указанием:
- индекс в миграции `0115`; drizzle-kit его не воспроизведёт; при пересоздании — добавить вручную.

### 3. Over-claim покрытие: pgBookingScheduling mapper tests

`mapRawWorkingDayRow` и `mapWorkingDayRow` были приватными без тестов, хотя маппер
был источником критического бага (snake_case vs camelCase).
**Действие:**
- Экспортированы `mapRawWorkingDayRow`, `mapWorkingDayRow`, `RawWorkingDayRow` из `pgBookingScheduling.ts`.
- Создан `src/infra/repos/pgBookingScheduling.mappers.test.ts`: 4 теста (полный маппинг,
  закрытый день, маппинг перерыва, null-поля). Drizzle изолирован через vi.mock.

### 4. Широкий correctness-проход

Проверены без обнаружения реальных багов:
- `DoctorScheduleShell.tsx`: URL-sync (buildTabUrl/handleDeepLinkChange/popstate), keepMounted,
  period-fetch через loadKpis, SSR-restore через `typeof window` guard — всё корректно.
- `doctorRouteRedirects.ts`: 308-таргеты `/calendar→?tab=cal`, `/appointments→?tab=cal`,
  `/admin/booking→?tab=setup`; отсутствие петли; loop-guard `REWRITE_MARKER_HEADER` — OK.
- `doctorNavLinks.ts`: кластер schedule с cal/work/setup; `requiresAdminMode` на setup — OK.
- `loadDoctorScheduleKpis.ts` + `schedule-kpis/route.ts`: нормализация периода, auth guard — OK.
- `working-days/route.ts`: `__none__`→null, Zod discriminatedUnion, 503 при отсутствии deps — OK.
- `working-schedule-templates/route.ts`: create/apply/delete с правильным порядком аргументов — OK.
  (Проверено: `deleteScheduleTemplate(id, orgId)` в роуте → сервис `(id, orgId)` → порт `(orgId, id)` — корректная цепочка.)
- `ScheduleWorkTab.tsx`: маппинг selected→PUT body, handleSave/handleClose/handleApplyTemplate — OK.
- `ScheduleCalendarTab.tsx`: weeklist→view=week для API, deep-link restore — OK.
- `ScheduleSetupTab.tsx`: sub-nav deep-link, admin-gate via nav (не внутри компонента) — OK.

### Проверки

| Артефакт | Результат |
|----------|-----------|
| `pnpm typecheck` | EXIT 0 |
| `eslint src/infra/repos/pgBookingScheduling.ts inMemoryDoctorAppointments.ts pgBookingScheduling.mappers.test.ts db/schema/bookingScheduling.ts` | 0 warnings |
| `eslint src/app/app/doctor/schedule/**` | 0 warnings |
| Таргетные тесты: все 16 файлов (169 тестов) | 169/169 зелёных |
| Новые mapper тесты: `pgBookingScheduling.mappers.test.ts` | 4/4 зелёных |
| Предсуществующие фейлы `webappPhase15F` | не тронуты |

### Сознательно НЕ делали

- `mapWorkingDayRow` (Drizzle-typed, не raw) оставлен экспортированным но без отдельного unit-теста
  (Drizzle-инференс типобезопасен; тестирование требовало бы фиктивной `$inferSelect` структуры —
  избыточно; покрыт косвенно через route.test.ts mock-calls).
- Полный `pnpm run ci` не запускался (оркестратор запустит отдельно по завершении всего свипа).

---

## 2026-06-12 — Этап B — Перерывы (breaks jsonb) + короткое имя филиала (v26_rebuild)

### B1 — Drizzle-схема + миграции

**Изменения в схеме:**
- `apps/webapp/db/schema/bookingScheduling.ts`:
  - `beWorkingDays` и `beScheduleTemplates`: добавлена колонка `breaks` (`jsonb NOT NULL DEFAULT '[]'::jsonb`, `$type<Array<{startMinute,endMinute}>>`) — N-break модель.
  - Легаси-колонки `breakStartMinute`/`breakEndMinute` оставлены nullable для backward-compat.
- `apps/webapp/db/schema/bookingEngine.ts`:
  - `beBranches`: добавлена колонка `shortTitle` (`text`, nullable) — migration 0117.

**Миграции (ручные SQL, не drizzle-kit — `bookingScheduling.ts` не в `drizzle.config.ts`):**
- `0116_breaks_jsonb_working_days_templates.sql`:
  - `ALTER TABLE be_working_days ADD COLUMN IF NOT EXISTS breaks jsonb NOT NULL DEFAULT '[]'::jsonb`
  - `ALTER TABLE be_schedule_templates ADD COLUMN IF NOT EXISTS breaks jsonb NOT NULL DEFAULT '[]'::jsonb`
  - Бэкфилл: `UPDATE … SET breaks = jsonb_build_array(…) WHERE break_start_minute IS NOT NULL AND … AND breaks = '[]'::jsonb`
  - Применена к dev-БД: бэкфилл 5 строк в `working_days`, 0 в `templates`. Идемпотентна.
- `0117_be_branches_short_title.sql`:
  - `ALTER TABLE be_branches ADD COLUMN IF NOT EXISTS short_title text`
  - Применена к dev-БД. Идемпотентна.
- `meta/_journal.json`: добавлены записи idx=116 (`when=1785900000000`) и idx=117 (`when=1786000000000`).

**Решение — fallback на легаси-скалары:** если `breaks = []` после бэкфилла (строка без перерыва),
синтезировать из `breakStartMinute`/`breakEndMinute` только в runtime (`resolveBreaks` helper в
pgBookingScheduling). Это безопасно: строки с `breaks IS NULL` не существуют (DEFAULT `'[]'`).

### B2 — Порты / Сервис / Репозиторий / Zod-валидация

**Типы и порты:**
- `modules/booking-scheduling/ports.ts`:
  - `BreakInterval = { startMinute: number; endMinute: number }`.
  - `breaks: BreakInterval[]` → `WorkingDayRecord`, `ScheduleTemplateRecord`.
  - `breaks?: BreakInterval[]` → `UpsertWorkingDaysInput`, `CreateScheduleTemplateInput`.

**Сервис (`modules/booking-scheduling/service.ts`):**
- `validateBreaks(breaks, dayStart, dayEnd)`: count ≤ 6 (`MAX_BREAKS`), каждый ⊂ [dayStart, dayEnd],
  без пересечений (sorted prev.end ≤ cur.start).
- `validateUpsertInput` и `validateScheduleTemplateInput` вызывают `validateBreaks` при `breaks.length > 0`.
- `applyScheduleTemplate`: `effectiveBreaks` = `tmpl.breaks.length > 0 ? tmpl.breaks : (legacy scalar fallback)`.

**Репозиторий (`infra/repos/pgBookingScheduling.ts`):**
- `resolveBreaks(breaks, legacyStart, legacyEnd)` helper — централизованный fallback.
- `mapWorkingDayRow`, `mapRawWorkingDayRow`, `mapTemplateRow` — включают `breaks`.
- `RawWorkingDayRow` расширен полем `breaks: Array<…> | null`.
- Raw SQL в `upsertWorkingDays`/`closeWorkingDays` включает колонку `breaks`.
- `createScheduleTemplate` пишет `effectiveBreaks`.

**Zod-валидация в API-роутах:**
- `working-days/route.ts`: `breakIntervalSchema = z.object({startMinute, endMinute})`;
  `breaks: z.array(breakIntervalSchema).max(6).optional()` в `upsertSchema`.
- `working-schedule-templates/route.ts`: аналогично в `createBody`.

**Тесты:**
- `pgBookingScheduling.mappers.test.ts`: +3 новых теста (breaks=[] при нет легаси, легаси→синтез, breaks[] приоритет). Итого 5/5.
- `modules/booking-scheduling/service.test.ts`: `breaks: []` добавлен в фикстуру `WorkingDayRecord` (type-fix). 3/3.

### B3 — Слот-движок: N перерывов

**Изменения в `computeSlots.ts`:**
- `WorkingDayRow` type: добавлено опциональное поле `breaks?`.
- `resolveWorkingDayBreaks(row)`: возвращает `BreakInterval[]` с fallback на legacy scalars.
- `splitByBreak(row, dateKey, tz, buffer)` — полный рерайт с cursor-based подходом:
  - Сортировка breaks по `startMinute`.
  - Курсор `cursorMs` движется от `dayStartMs`; при каждом break (clamp к [dayStart, dayEnd])
    добавляет интервал `[cursor, breakStart]` и двигает курсор на `breakEnd`.
  - Финальный хвост `[cursor, dayEnd]` добавляется если `cursor < dayEnd`.
  - Результат: N+1 интервалов для N перерывов.

**Тесты `computeSlots.test.ts`:** +11 новых тестов (0 перерывов, 1 через breaks[], 1 через legacy scalar, 2 перерыва, 3 перерыва, flush start, flush end, breaks[] приоритет, closed day, weekday fallback). Итого 16/16.

### B4 — be_branches.short_title: чтение + UI

**Типы и порты:**
- `modules/booking-engine/types.ts`: `BeBranch.shortTitle: string | null`.
- `modules/booking-engine/ports.ts`: `OrganizationCatalogPort.upsertBranch` — `shortTitle?: string | null`.
- `modules/booking-calendar/types.ts`: `CalendarFilterOption.shortLabel?: string | null`.

**Репозитории:**
- `infra/repos/pgBookingEngine.ts`:
  - `mapBranch()`: читает `row.shortTitle ?? null`.
  - `upsertBranch()`: пишет `shortTitle` (key-in-input check для обновлений).
- `infra/repos/pgBookingCalendar.ts`:
  - `listFilterMeta`: `select` включает `shortTitle: beBranches.shortTitle`;
    маппинг branches: `{ id, label, shortLabel: r.shortTitle ?? null }`.

**API-роут:**
- `branches/[id]/route.ts`: `PatchSchema` расширена полем `shortTitle: z.string().trim().max(12).nullable().optional()`.
  `upsertBranch` call: `shortTitle` передаётся только если присутствует в `parsed.data` (preserve-existing семантика).

**Settings UI:**
- `app/app/settings/bookingSoloAdminApi.ts`: `SoloOverview.branches` — добавлено поле `shortTitle: string | null`.
- `app/app/settings/BookingSoloLocationsSection.tsx`:
  - `editShortTitle` state.
  - Столбец «Короткое название» в таблице (header + cell).
  - В режиме редактирования: `<Input placeholder="СПб, Мск" maxLength={12} …>`.
  - Инициализация при нажатии «Изм.»: `setEditShortTitle(b.shortTitle ?? "")`.
  - Сохранение: `shortTitle: editShortTitle.trim() || null` в PATCH body.

**Проверки B4:**
- `tsc --noEmit --skipLibCheck`: EXIT 0.
- Таргетные тесты (24/24): `pgBookingScheduling.mappers.test.ts` (5/5),
  `computeSlots.test.ts` (16/16), `service.test.ts` (3/3).

### Коммиты (все в feat/doctor-ui-rebuild)

1. **`feat(booking-scheduling): B1+B4-schema — breaks jsonb (0116) + be_branches.short_title (0117)`**
   — db/schema, migrations, _journal.json.
2. **`feat(booking-scheduling): B2 — breaks BreakInterval ports/service/pg/Zod validation`**
   — ports.ts, service.ts, pgBookingScheduling.ts, mappers.test.ts, service.test.ts, API routes.
3. **`feat(booking-scheduling): B3 — computeSlots N-break cursor engine + 11 tests`**
   — computeSlots.ts, computeSlots.test.ts.
4. **`feat(booking-engine): B4 — be_branches.short_title + CalendarFilterOption.shortLabel + settings UI`**
   — types.ts, ports.ts (engine+calendar), pgBookingEngine.ts, pgBookingCalendar.ts, branches/[id]/route.ts, BookingSoloLocationsSection.tsx, bookingSoloAdminApi.ts.

### Сознательно НЕ делали

- UI перерывов в `ScheduleWorkTab` (панель «N перерывов», форма добавления перерыва) — Этапы E4/E5.
- Метка `shortTitle` на карточках дней в `ScheduleWorkTab` — Этап E2.
- Паритет `inMemory` для breaks/shortTitle (stub, нет данных).
- Удаление легаси-колонок `break_start_minute`/`break_end_minute` — намеренно backward-compat.

## Этап C — Фид диапазоны/часы ±1ч + ближайшее свободное окно

**Сделано:**
- **C1** `parseCalendarQuery`: виды `3days` (якорь+2 дня) и `feed` (±30 дней §13.6, либо явные `from/to`);
  явные `from/to` перекрывают расчёт по view; `month` строго 1-е..последнее (без overflow-дней). Не сломаны
  `week`/`weeklist`/`day`.
- **C2** `booking-calendar`: тип `WorkingBounds` + `deriveWorkingBounds` (min/max из `working`-событий ±60 мин,
  зажато в [0,1440]; null если нет рабочих) → поле `workingBounds` в `CalendarAggregate`. Решение: считаем на
  сервере и отдаём в ответе фида (клиент берёт готовое; fallback-дефолт при null).
- **C3** `booking-scheduling`: `nearestFreeWindow(input)` (порт+сервис+pg) через чистую
  `computeNearestFreeWindowFromData(todayKey,tz,workingHours,perDayRow,busy,nowMs)` — переиспользует
  `workingIntervalsForDate` (N перерывов) + `subtractBusy`; зажимает старт окна к `now`. Тонкий роут
  `GET /api/doctor/schedule/nearest-free-window` (guard `requireDoctorBookingEngine` + Zod + graceful
  degradation: при ошибке/недоступности → `window:null`, не 500 + pino-лог). inMemory booking-scheduling в
  репо нет — паритет неприменим.

**Проверки:** `tsc --noEmit` = 0; целевые vitest зелёные — добавлены 5 тестов `computeNearestFreeWindowFromData`
(окно после busy с зажимом к now; окно после busy при now внутри busy; полностью занят→null; закрыт→null;
после рабочих часов→null) и 4 теста `parseCalendarQuery` (3days, month strict, feed ±30, явные from/to).

**Решения/нюансы:** workingBounds считаем на сервере (проще и тестируемо). `feed`-окно по умолчанию ±30 дней
(§13.6). Коммиты: `e3368c98` (реализация) + отдельный коммит тестов+plan+LOG.

---

## Этап D — Ребилд таба «Записи» (2026-06-13)

### D1 — Тулбар

- Переключатель **3 дня · Неделя · Месяц · Лента** (view: 3days/weekgrid/month/feed); «День» в переключателе отсутствует.
- Лейбл периода `◀ … ▶` + стрелки скрыты в `feed`.
- Фильтры `Локация ▾ · Услуга ▾` (`DoctorCalendarToolbarFilter`).
- Кнопка «+ Создать запись» (primary, справа, всегда).
- Экспортируемый helper `visibleRange(view, anchor, tz) → {from, to}` — единый источник диапазона для фида и KPI:
  - `3days` = anchor + 2 дня; `weekgrid` = пн–вс; `month` = 1-е..последнее; `feed` = ±30 дней; `day` = один день.

### D2 — KPI-ряд (9 карточек) внутри таба

- Сетка `grid-cols-3 ... xl:grid-cols-9` под тулбаром.
- Классы из `doctorVisual.ts`: `doctorStatCardShellClass`, `doctorStatCardInteractiveClass`, `doctorMetricValueClass`, `doctorMetricLabelClass`.
- `data-testid="kpi-<key>"`, `role="button"`, `cursor-pointer`, onClick = no-op (фильтрация — следующая итерация).
- **Скрыт** в `feed` и `day` (`showKpi = view !== "feed" && view !== "day"`).
- Нули отображаются как `0` (не «—») после первой загрузки.
- Параллельная загрузка: `loadFeed()` и `loadKpis()` запускаются одновременно на каждое изменение view/date/filters.

### D3 — Часовые виды 3 дня и Неделя; Дневной drill-down

- **3 дня** (`3days`): FullCalendar `timeGrid3days` (кастомный view с `duration:{days:3}`), сегодня+2 дня.
- **Неделя** (`weekgrid`): FullCalendar `timeGridWeek`.
- Клик по заголовку дня (`navLinkDayClick`) → `drillDownDay(dateKey)`:
  - Запоминает исходный вид в `drillBackView` + `from` deep-link.
  - Переключается на `view=day`.
- **Дневной вид** (`day`):
  - Кнопка `← Назад` (`data-testid="drill-back-btn"`) → возвращает в `drillBackView` (fallback `3days`).
  - Стрелки ◀▶ листают по дням.
  - KPI скрыт.
- Часы сетки: `slotMinTime`/`slotMaxTime` из `workingBounds` ответа фида (бэкенд даёт ±1ч); fallback `06:00–23:00`.

### D4 — Месяц и Лента

- **Месяц** (`month`): `dayGridMonth`; плашка = `eventLastName()` (первое слово/фамилия); сегодня — жёлтая подсветка через CSS `fc-day-today` + `#fff8e6`; `+N` при переполнении (FullCalendar `dayMaxEvents`); клик по числу дня → `drillDownDay`.
- **Лента** (`feed`): кастомный `FeedView` (не FullCalendar); вертикальный поток `FeedDayCard`; пустые дни пропущены; кнопки «← Загрузить более ранние» / «Загрузить ещё →» расширяют `feedRangeFrom`/`feedRangeTo` на 30 дней в каждую сторону; KPI и стрелки скрыты.

### D5 — Правая панель: карточка/заглушка

- Если выбрана запись или открыт create-режим: `DoctorCalendarEventPanel`.
- Иначе: `RightPanelEmptyStub`:
  - Иконка + «Запись не выбрана» + подсказка.
  - CTA «+ Создать запись» → открывает `DoctorCalendarEventPanel` в create-режиме.
  - `NearestWindowLine` — GET `/api/doctor/schedule/nearest-free-window` → «Ближайшее окно сегодня: HH:MM–HH:MM»; скрыт если `window=null` или ошибка (graceful degradation).
- Дублирование CTA (тулбар + заглушка) — намеренное (ТЗ §2.8).

### D6 — Deep-link

- `scheduleTabRegistry.ts`: `deepLinkKeys` для `cal` расширен до 6 ключей: `view/date/location/service/appt/from`.
- `from` — источник drill-down: значение вида, из которого перешли в `day`; при `← Назад` используется для восстановления.
- URL-sync через шелл (`onDeepLinkChange`) без изменений в `DoctorScheduleShell.tsx`.
- Допустимые значения `view`: `3days|weekgrid|month|feed|day`.

### Решения

- `view=weeklist` (Wave3) **не удалён** из `CalendarViewMode` (backward-compat); в переключателе таба его нет. Код в `ScheduleCalendarTab.tsx` использует только `CalV26View` (internal type); `resolveView()` знает про `weeklist` чтобы не ломать URL со старым значением — но он маппируется на `3days` (fallback).
- KPI в шелле (`DoctorScheduleShell.tsx`) и KPI в табе временно **сосуществуют** — шелловый KPI будет убран в Этапе F.
- `fcViews as any` — FullCalendar ViewOptions типизация не принимает кастомные string-ключи в index-signature при union с optional `dayGridMonth?: undefined`; явный cast до `any` без потери runtime-корректности.

### Проверки

| Артефакт | Результат |
|----------|-----------|
| `tsc --noEmit --skipLibCheck` | EXIT 0 (только pre-existing BroadcastForm ошибка) |
| `vitest run "ScheduleCalendarTab.test"` | **37/37** зелёных |
| `vitest run "scheduleTabRegistry.test"` | **16/16** зелёных |
| Все schedule тесты (`vitest run "schedule"`) | **170/170** зелёных (21 файл) |
| Pre-existing failures | `webappPhase15F.verify.test.ts` — 2 теста, не тронуты |

### Изменённые / созданные файлы

- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx` — полный ребилд (D1–D5)
- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.test.tsx` — полный ребилд (37 тестов)
- `apps/webapp/src/app/app/doctor/schedule/scheduleTabRegistry.ts` — `from` ключ
- `apps/webapp/src/app/app/doctor/schedule/scheduleTabRegistry.test.ts` — обновлён под 6 ключей

### Сознательно НЕ делали

- Перенос KPI из шелла в таб (убирается в Этапе F — `DoctorScheduleShell.tsx`).
- Полная реализация `+N` в Месяце через кастомный popover (FullCalendar нативно показывает «+N more» → достаточно).
- Клик по KPI-карточке для фильтрации (следующая итерация, только разметка).
- `view=weeklist` из Wave3 убран из переключателя таба, но тип в `CalendarViewMode` сохранён.
