# DOCTOR_SCHEDULE_SECTION_INITIATIVE

Раздел **«Расписание»** кабинета врача по референсу `docs/design/doctor-cabinet-wireframe.html`
(секция `#p-schedule`): реальная страница-шелл `/app/doctor/schedule` с KPI-строкой и тремя табами —
**Календарь записей**, **График работы**, **Настройки записи**.

## Статус

**Завершена.** v26-ребилд завершён (Этапы A–F + post-audit, 2026-06-12 — 2026-06-13).
Ветка: `feat/doctor-ui-rebuild`.

ТЗ: [`TZ_ZAPISI_V26.md`](TZ_ZAPISI_V26.md).
План: [`.cursor/plans/doctor_schedule_v26_rebuild.plan.md`](../../.cursor/plans/doctor_schedule_v26_rebuild.plan.md) — `status: completed`.
Исходный план (Wave1–3): [`.cursor/plans/doctor_schedule_section.plan.md`](../../.cursor/plans/doctor_schedule_section.plan.md) — закрыт.
Лог: [`LOG.md`](LOG.md).

### Что реализовано (итог)

- **A** — 9 KPI-метрик (роут `GET /api/doctor/schedule-kpis`), произвольный `{from,to}` + фильтры branch/service. `firstVisitInPeriod` = первая запись пациента вообще (строгое `NOT EXISTS` ранних записей).
- **B** — N перерывов `breaks jsonb` в `be_working_days` + `be_schedule_templates` (миграции 0115–0116, бэкфилл); слот-движок cursor-based `splitByBreak`. Короткое имя `be_branches.short_title` (migration 0117).
- **C** — Фид-диапазоны `3days/feed` + явные `from/to`; `workingBounds ±1ч`; `nearestFreeWindow` (роут `GET /api/doctor/schedule/nearest-free-window`, graceful degradation).
- **D** — Таб «Записи»: переключатель 3 дня/Неделя/Месяц/Лента, «День» = drill-down, KPI-ряд 9 карточек под тулбаром (скрыт в Ленте/Дне), правая панель с заглушкой + ближайшее окно.
- **E** — Таб «График работы»: две колонки (lg), реальный бэкенд-фильтр сетки по filial, строчная панель N перерывов (`BreakRowField`), короткие имена филиалов, шаблоны с перерывами.
- **F** — KPI/период убраны из шелла; пункт «Расписание» = одна ссылка (не аккордеон); ярлыки «Записи»/«Настройки»; редиректы `/calendar,/appointments→?tab=cal`, `/admin/booking→?tab=setup` сохранены.

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
