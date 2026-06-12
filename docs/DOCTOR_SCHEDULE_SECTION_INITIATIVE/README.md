# DOCTOR_SCHEDULE_SECTION_INITIATIVE

Раздел **«Расписание»** кабинета врача по референсу `docs/design/doctor-cabinet-wireframe.html`
(секция `#p-schedule`): реальная страница-шелл `/app/doctor/schedule` с KPI-строкой и тремя табами —
**Календарь записей**, **График работы**, **Настройки записи**.

## Статус

Активна. План: [`.cursor/plans/doctor_schedule_section.plan.md`](../../.cursor/plans/doctor_schedule_section.plan.md).
Ветка: `feat/doctor-ui-rebuild`.

## Решения (зафиксировано 2026-06-12)

- **Объём** — полный по вайрфрейму (раздел частично заходит в зону `BOOKING_REWORK_INITIATIVE` §7.5).
- **Модель «График работы»** — НОВАЯ per-date «плавающая»: таблицы `be_working_days` +
  `be_schedule_templates`, миграции, интеграция со слот-движком `booking-scheduling/computeSlots`.
  Backward-compatible: нет per-date строки на дату → поведение как сейчас (weekday `be_working_hours`).
- **«Настройки записи»** — максимальный ребилд под doctor-эталон с под-навигацией секций (раскладка
  как база для будущего ТЗ); недостающий бэкенд доделываем и мигрируем по ходу (фиксируем в LOG).

## Эталоны

- Шелл/реестр/URL-sync табов — Doctor Communications (TODO#3): `DoctorCommunicationsShell`,
  `communicationsTabRegistry.ts`, `doctorCommunicationsTabs.ts`.
- UI-примитивы — экран упражнений + `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md` + `shared/ui/doctor/**`.
- Слот-движок и расписание — `BOOKING_REWORK_INITIATIVE/ROADMAP.md` §7.5, `RUBITIME_BOOKING_PIPELINE.md`.

## Координация с BOOKING_REWORK_INITIATIVE

§7.5 ROADMAP владеет редизайном экрана управления рабочим временем и зоной `admin/booking/**`.
Эта инициатива строит агрегатор-раздел «Расписание» поверх существующего booking-engine и добавляет
per-date слой по согласованию с пользователем. Пересечения и принятые решения — в [`LOG.md`](LOG.md).

## Связанные документы

- `docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md`
- `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`
- `docs/BOOKING_REWORK_INITIATIVE/ROADMAP.md` (§7.5 Расписание)
