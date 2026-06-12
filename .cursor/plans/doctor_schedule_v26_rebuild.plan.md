---
name: Расписание врача — приведение к референсу v26_1 (Записи + График работы + бэкенд-дельта)
overview: >
  Привести раздел «Расписание» кабинета врача (/app/doctor/schedule) к референсу
  docs/design/doctor-cabinet-wireframe.html#p-schedule (вайрфрейм v26_1) и «Пояснениям по поведению».
  Wave3 (коммит d5c246bc) не совпадает с референсом по табу «Записи» и «График работы» + общий разрыв по
  детализации. Объём: (А) бэкенд KPI — 9 метрик с фильтрами и произвольным диапазоном; (B) несколько
  перерывов в дне (breaks jsonb + миграция + слот-движок) и короткое имя филиала (be_branches.short_title
  + миграция + настройка); (C) календарный фид с произвольными диапазонами/часами ±1ч + ближайшее окно;
  (D) ребилд таба «Записи» (период=единый источник, KPI внутри таба, виды 3 дня/Неделя/Месяц/Лента,
  День=drill-down, заглушка правой панели); (E) ребилд таба «График работы» (две колонки, реальный
  фильтр по филиалу, строчная панель часов с N перерывами, короткие имена); (F) чистка шелла (KPI/период
  из шелла, метрики только в «Записи»), пункт меню «Расписание» аккордеон→ссылка, fidelity-проход, docs.
  Полный ТЗ — docs/DOCTOR_SCHEDULE_SECTION_INITIATIVE/TZ_ZAPISI_V26.md. Решения §13 зафиксированы
  2026-06-12 (Отмены/Переносы по дате визита; реальный фильтр сетки по филиалу; breaks jsonb; короткое имя
  в секции «Локации»). Каноны: clean-arch (БД только через порты, никакого raw SQL — Drizzle+Zod), логи
  pino @/infra/logging/logger, коммиты по блокам, пуши 3 блоками после полного CI.
isProject: false
status: pending
todos:
  - id: e0-baseline
    content: "Этап 0 — прочитать .cursor/rules/*.mdc (clean-arch, plan-standard, webapp-tests, pre-push-ci, ui-copy, host-psql) + DOCTOR_APP_UI_STYLE_GUIDE.md + TZ_ZAPISI_V26.md; зафиксировать зелёный baseline (и пред-существующие красные broadcasts из 1d9f936c — НЕ наши). Проверки: rg правил, baseline-прогон затронутых тестов"
    status: completed
  - id: a1-kpi-types
    content: "A1 — ScheduleKpis +5 полей (pastInPeriod/futureInPeriod/bySubscriptionInPeriod/firstVisitInPeriod/repeatVisitInPeriod) + тип ScheduleKpisQuery{from,to,branchId?,serviceId?} в doctor-appointments/ports.ts; снять newPatientsInPeriod после rg-проверки runtime. Проверки: rg newPatientsInPeriod, tsc по webapp"
    status: completed
  - id: a2-kpi-service
    content: "A2 — service.ts getScheduleKpis(query,audience) прокидка; unit-тесты инвариантов past+future=records, first+repeat=records, нули как нули. Проверки: vitest doctor-appointments/service"
    status: completed
  - id: a3-kpi-pg-inmemory
    content: "A3 — pg (Drizzle, 9 метрик, фильтры branch/service в WHERE; join к appointment_records для Отмен/Переносов по дате визита start_at §13.1) + inMemory-паритет + read-switch. Проверки: vitest pgDoctorAppointments/inMemory паритет"
    status: completed
  - id: a4-kpi-route
    content: "A4 — роут api/doctor/schedule-kpis на {from,to,branchId?,serviceId?} (Zod) вместо ?period; requireDoctorAccess; route-тесты 401/контракт/валидация. Проверки: vitest route"
    status: completed
  - id: b1-breaks-schema
    content: "B1 — Drizzle: колонка breaks jsonb $type<{startMinute,endMinute}[]> default '[]' в beWorkingDays + beScheduleTemplates; миграция 0116 через drizzle-kit generate + ревью SQL; бэкфилл из break_start/end_minute в массив; легаси-колонки nullable; ослабить старые break-check. Проверки: drizzle-kit generate diff, применить на dev (host-psql), idempotent re-run"
    status: completed
  - id: b2-breaks-ports
    content: "B2 — booking-scheduling ports/service/pg/inMemory: breaks в WorkingDayRecord/UpsertWorkingDaysInput/ScheduleTemplateRecord/apply; Zod-валидация массива (каждый ⊂ дня, без пересечений, сортировка, ≤6); чтение breaks с fallback на легаси при пустом. Проверки: vitest booking-scheduling/service + pgBookingScheduling.mappers"
    status: completed
  - id: b3-breaks-slot-engine
    content: "B3 — computeSlots.ts:workingIntervalsForDate — вычитать N перерывов (сорт + N+1 интервалов) вместо одного; unit-тесты 0/1/2/3 перерыва, граничные, closed, fallback на weekday, регресс существующих. Проверки: vitest computeSlots"
    status: completed
  - id: b4-branch-short-title
    content: "B4 — Drizzle be_branches.short_title text nullable + миграция 0117; чтение shortTitle в booking-engine overview/branch-листы + CalendarFilterOption(branches) + источник филиалов work-таба; поле «Короткое название» в BookingSoloLocationsSection (Zod trim ≤12). Проверки: drizzle-kit generate, vitest затронутых reads, tsc"
    status: completed
  - id: c1-feed-ranges
    content: "C1 — диапазоны фида для 3days/day/feed через getCalendar(rangeStart,rangeEnd) без слома week/month; контракт-тест диапазона. Проверки: vitest booking-calendar/service + calendar route"
    status: completed
  - id: c2-feed-hours
    content: "C2 — часы сетки часовых видов из working-событий видимых дней ±1ч (клиент из фида или workingBounds в ответе — решить, LOG); fallback дефолт. Проверки: unit на derive границ"
    status: completed
  - id: c3-nearest-free-window
    content: "C3 — booking-scheduling: nearestFreeWindow(dateKey,scope)→{from,to}|null (порт+pg+inMemory; тонкий роут или поле фида); unit «окно после последней записи дня», «нет окна→null». Проверки: vitest"
    status: completed
  - id: d1-zapisi-toolbar
    content: "D1 — ScheduleCalendarTab тулбар: переключатель 3 дня/Неделя/Месяц/Лента (без «День») + ◀label▶ (скрыт в feed) + фильтры Локация/Услуга + «+ Создать запись»; helper visibleRange(view,anchor,tz). Проверки: RTL переключение видов"
    status: completed
  - id: d2-zapisi-kpi
    content: "D2 — KPI-ряд 9 карточек ВНУТРИ таба под тулбаром (doctorVisual классы, cursor-pointer no-op, data-testid kpi-*), скрыт в feed/day, параллельная загрузка фид+KPI по одному диапазону+фильтрам, нули как 0. Проверки: RTL видимость KPI по видам + реакция на фильтры"
    status: completed
  - id: d3-zapisi-hourly-day
    content: "D3 — часовые виды 3 дня/Неделя (клик по заголовку дня → drill-down day) + дневной вид (← Назад через from, листание стрелками по дням, KPI скрыт). Проверки: RTL drill-down day↔Назад"
    status: completed
  - id: d4-zapisi-month-feed
    content: "D4 — Месяц (плашка=строка, фамилия; сегодня жёлтый #fff8e6; +N; клик по числу→day) + Лента (бесконечный скролл обе стороны, пустые дни пропущены, без границ недель, KPI/стрелки скрыты). Проверки: RTL месяц-плашки + лента-скролл"
    status: completed
  - id: d5-zapisi-right-panel
    content: "D5 — правая панель: запись→DoctorCalendarEventPanel; пусто→заглушка «Запись не выбрана» + CTA «+ Создать запись» + «Ближайшее окно сегодня HH:MM–HH:MM» (C3; скрыть если null). Проверки: RTL заглушка↔карточка"
    status: completed
  - id: d6-zapisi-deeplink
    content: "D6 — deep-link реестр cal: view/date/location/service/appt/from (view∈3days|weekgrid|month|feed|day); URL-sync через шелл; unit-тест ключей (прогрев чанков в beforeAll). Проверки: vitest scheduleTabRegistry + deep-link"
    status: completed
  - id: e1-work-layout
    content: "E1 — ScheduleWorkTab раскладка две колонки (§0.1.1): слева сетка дней + месяц-нав/легенда, справа панель часов, шаблоны — снизу на всю ширину; адаптив-стэк на узких. Проверки: RTL присутствие 3 зон"
    status: pending
  - id: e2-work-daycards
    content: "E2 — карточки дней: у́же по ширине, время крупнее (поднять с text-[9px]); метка короткое-имя филиала (B4), перерывы «обед HH–HH» / «N перерывов»; сегодня жёлтый, выбранные primary, закрытые серые. Проверки: RTL рендер карточки с short_title + N перерывов"
    status: pending
  - id: e3-work-branch-filter
    content: "E3 — реальный фильтр сетки по филиалу (§13.2): переключатель филиалов + «Все» (дефолт); фильтр в чтение working-days (branchId) предпочтительно бэкендом; локация назначения — в правой панели (дефолт=активный фильтр). Проверки: RTL фильтр меняет видимые дни"
    status: pending
  - id: e4-work-hours-breaks
    content: "E4 — строчная панель часов (§6.4): Начало/Конец на строке, перерывы построчно (Перерыв N: from–to ×), кнопка «+ перерыв», клиентская валидация (⊂ дня, без пересечений); Сохранить→PUT working-days с breaks; Закрыть/Очистить. Проверки: RTL выбор дней→PUT с массивом breaks (2+ перерыва)"
    status: pending
  - id: e5-work-templates
    content: "E5 — шаблоны с N перерывами (форма создания строчные перерывы → POST templates с breaks; apply на выбранные дни); подпись — короткое имя филиала. Проверки: RTL create-template с breaks + apply"
    status: pending
  - id: f1-shell-cleanup
    content: "F1 — DoctorScheduleShell: убрать KpiRow/loadKpis/period/?period/initialKpis|Period; SSR initialData (KPI+фид «3 дня») в таб; метрики ТОЛЬКО в «Записи» (исчезают над work/setup). Проверки: RTL шелл без KPI, метрики только на cal"
    status: pending
  - id: f2-nav-link
    content: "F2 — doctorNavLinks.ts: пункт schedule аккордеон→одна ссылка href=routePaths.doctorSchedule (убрать items; admin-гейтинг setup — в шелле); обновить doctorNavLinks.test.ts; smoke активного пункта на ?tab=work. Проверки: vitest doctorNavLinks"
    status: pending
  - id: f3-labels-redirects
    content: "F3 — ярлыки табов cal→«Записи», setup→«Настройки» (doctorScheduleTabs.ts); редиректы /calendar,/appointments→?tab=cal, /admin/booking→?tab=setup сохранить, ?period убрать; обновить тесты. Проверки: vitest doctorRouteRedirects + doctorScheduleTabs"
    status: pending
  - id: f4-fidelity-pass
    content: "F4 — fidelity-проход (§7): сверить cal/work/setup-chrome против #p-schedule, закрыть мелкие расхождения (заголовки, отступы, типографика плашек, цвета статусов, пустые состояния); список найденного и закрытого — в LOG.md. Проверки: визуальная сверка (dev-login 127.0.0.1:5200) + RTL ключевых стыков"
    status: pending
  - id: f5-docs
    content: "F5 — обновить schedule.md (период-модель, 9 KPI, виды, drill-down, окно, две колонки work, N перерывов breaks, short_title, пункт меню) + initiative LOG.md; финальный pnpm run ci перед пушем. Проверки: rg ссылок, финальный CI"
    status: pending
---

# План: Расписание врача — приведение к референсу v26_1

Источник истины по требованиям — **`docs/DOCTOR_SCHEDULE_SECTION_INITIATIVE/TZ_ZAPISI_V26.md`**
(этот план — исполняемая декомпозиция ТЗ; детали поведения/контрактов не дублируются, ссылки на §ТЗ).

## Scope boundaries

**Разрешено трогать** (ТЗ §1.3):
- `apps/webapp/src/app/app/doctor/schedule/**` (tabs ScheduleCalendarTab/ScheduleWorkTab, DoctorScheduleShell,
  loadDoctorScheduleKpis, doctorScheduleTabs, scheduleTabRegistry, schedule.md).
- `apps/webapp/src/app/api/doctor/schedule-kpis/route.ts`,
  `apps/webapp/src/app/api/admin/booking-engine/{working-days,working-schedule-templates}/route.ts`.
- `apps/webapp/src/modules/{doctor-appointments,booking-calendar,booking-scheduling}/**` (ports/service/types/computeSlots).
- `apps/webapp/src/infra/repos/{pgDoctorAppointments,inMemoryDoctorAppointments,pgBookingScheduling}.ts` + read-switch.
- `apps/webapp/db/schema/{bookingScheduling,bookingEngine}.ts` + `db/drizzle-migrations/**` (0116 breaks, 0117 short_title).
- `apps/webapp/src/app/api/doctor/booking-engine/calendar/route.ts`.
- `BookingSoloLocationsSection` — **точечно** поле short_title.
- `apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts` + тест.
- `docs/DOCTOR_SCHEDULE_SECTION_INITIATIVE/LOG.md`.

**Вне scope** (без отдельного согласования): контент-секции таба «Настройки» (кроме chrome §7) и их бэкенд;
правила Rubitime-sync; weekday-модель `be_working_hours` и миграция 0115; клик-по-KPI фильтрация (следующая
итерация — только разметка); метрики онлайн/офлайн, «Статистика», неявки.

## Зафиксированные решения (§13 ТЗ, 2026-06-12)
1. Отмены/Переносы в KPI — по **дате визита** (`start_at` в окне).
2. Кнопки филиалов «График работы» — **реальный фильтр сетки** (+ «Все»); локация назначения — в правой панели.
3. Несколько перерывов — **`breaks jsonb`** в существующих таблицах.
4. KPI-диапазон «Месяца» — календарный месяц (overflow-дни не входят).
5. Короткое имя филиала — настройка в секции **«Локации»**.
6. Лента: окно ±30 дней, шаг 30.

## Этапы и чек-листы

### Этап 0 — Baseline
- [ ] Прочитаны правила `.cursor/rules/*.mdc` + ТЗ. `rg` ключевых инвариантов (no raw SQL в modules, порты).
- [ ] Зафиксирован зелёный baseline; пред-существующие красные (broadcasts из `1d9f936c`:
  `check-legacy-migrations-frozen` на `migrations/088_,089_`, `webappPhase15F.verify.test.ts`) помечены как
  НЕ наши — чинить отдельным согласованным блоком до пуша.

### Этап A — Бэкенд KPI (9 метрик + фильтры) → `a1..a4`
ТЗ §4.1. DoD A: `getScheduleKpis` отдаёт 9 чисел по `{from,to,branchId?,serviceId?}`; инварианты
`past+future=records`, `first+repeat=records`; pg/inMemory паритет; route 401/контракт/Zod зелёные;
lint/typecheck области.

### Этап B — Несколько перерывов + короткое имя филиала → `b1..b4`
ТЗ §4.4, §4.5. DoD B: `breaks jsonb` (миграция 0116, бэкфилл, idempotent); движок вычитает N перерывов;
Zod-валидация массива; `be_branches.short_title` (миграция 0117) пишется/читается, поле в «Локациях»;
pg/inMemory паритет; тесты зелёные.

### Этап C — Фид + ближайшее окно → `c1..c3`
ТЗ §4.2, §4.3. DoD C: фид отдаёт корректные диапазоны для 3days/day/feed без слома week/month; часы ±1ч;
`nearestFreeWindow` считается и деградирует gracefully (нет окна → CTA без подсказки); тесты зелёные.

### Этап D — Ребилд таба «Записи» → `d1..d6`
ТЗ §5, §3. DoD D: переключатель 3 дня/Неделя/Месяц/Лента; «День» только drill-down; KPI-ряд 9 карточек
ВНУТРИ таба, по видимому диапазону+фильтрам, скрыт в feed/day; Лента бесконечная; Месяц фамилия-строка +
жёлтый; правая панель карточка/заглушка с окном; deep-link; RTL ключевых стыков зелёные.

### Этап E — Ребилд таба «График работы» → `e1..e5`
ТЗ §6. DoD E: раскладка две колонки (дни/часы/шаблоны снизу); карточки у́же, время крупнее, короткие имена;
реальный фильтр сетки по филиалу (+ «Все»); строчная панель часов с N перерывами (+перерыв/×) →
`PUT working-days` с `breaks`; шаблоны с N перерывами; RTL/контракт выбор→upsert и applyTemplate зелёные.

### Этап F — Чистка шелла, меню, маршруты, fidelity, docs → `f1..f5`
ТЗ §3.1, §5.6, §5.7, §7. DoD F: шелл без KPI/периода, **метрики только в «Записи»**; пункт меню
«Расписание» — одна ссылка; ярлыки/редиректы обновлены; fidelity-список расхождений закрыт (в LOG); таб
«Настройки» — chrome-сверка; docs синхронны; nav/redirect-тесты зелёные.

### Финал
- [ ] Один `pnpm run ci` после всего объёма (перед каждым пушем — `pre-push-ci`).
- [ ] Короткий отчёт: изменённые области, результаты проверок, что намеренно не делали.

## Логирование (ТЗ §8)
pino `@/infra/logging/logger` + `serializeError` на границах сервиса/роута (KPI, nearestFreeWindow,
upsert working-days/templates); без PII; клиентские ошибки — в UI-состоянии, не глотать молча.

## Коммиты и пуши (ТЗ §10)
Коммитить по этапам (A…F) связными зелёными блоками. Пуши — 3 блоками, каждый после полного CI:
**Пуш-1** после A+B+C (бэкенд); **Пуш-2** после D+E (фронт); **Пуш-3** после F. Пред-существующие красные
(Этап 0) блокируют пуш — чинить отдельным согласованным блоком.

## Definition of Done (раздел целиком) — ТЗ §14
- [ ] «Записи»: 3 дня/Неделя/Месяц/Лента; «День» — drill-down; KPI 9 карточек только в «Записи», по
  диапазону+фильтрам, скрыт в Ленте/Дне; Лента бесконечная; Месяц фамилия+жёлтый; правая панель с окном.
- [ ] «График работы»: две колонки; карточки у́же + время крупнее; короткие имена; реальный фильтр по
  филиалу; N перерывов (строчно) сохраняются и применяются через шаблоны.
- [ ] Бэкенд: 9-метричный getScheduleKpis с фильтрами; фид произвольных диапазонов; nearestFreeWindow;
  breaks (миграция+движок+валидация); be_branches.short_title (миграция+чтение+настройка); pg/inMemory паритет.
- [ ] Шелл без KPI/периода; меню — одна ссылка; ярлыки/редиректы; ?period удалён.
- [ ] Fidelity-проход закрыт (список в LOG); «Настройки» — chrome-сверка.
- [ ] Логи на границах; Zod в роутах; чистота слоёв; миграции idempotent.
- [ ] Тесты зелёные; полный CI перед каждым из 3 пушей; schedule.md + LOG.md синхронны.
