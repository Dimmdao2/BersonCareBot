# Лог: метрики дашборда врача и навигация (webapp)

## 2026-05-15

### Сделано

- Подсказка **«В Rubitime: …»** при расхождении `appointment_records.payload_json.name` и подписи профиля (`platform_users`): список `/app/doctor/appointments` и блоки записей на `/app/doctor` («Сегодня»). Код: `appointmentRubitimeNameMismatch.ts`, `pgDoctorAppointments.ts` (`rubitimeNameIfDifferent` на строке записи).

### Документация

- `docs/ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md`, `RUBITIME_BOOKING_PIPELINE.md`, `SPECIALIST_CABINET_STRUCTURE.md`, `docs/README.md`.

---

## 2026-04-02

### Проблема

- Подписи времени записи из проекции (`appointment_records`) в карточке клиента и в кабинете пациента могли **не совпадать** с виджетом «Ближайший приём» на `/app/doctor` и списком записей врача: дашборд использовал **`app_display_timezone`**, а путь через `getUpcomingAppointments` в DI — `toLocale*` **без** `timeZone` (фактически TZ процесса Node).

### Сделано

1. **`formatBusinessDateTime.ts`:** `formatAppointmentDateNumericRu`, `formatAppointmentTimeShortRu` (с **`parseBusinessInstant`** и явной зоной).
2. **`buildAppDeps.ts`:** `getUpcomingAppointments`, `getPastAppointments`, `listAppointmentHistoryForPhone` переведены на **`getAppDisplayTimeZone()`** и эти форматтеры; история — **`formatBookingDateTimeMediumRu`**.
3. **`appointmentLabels.ts`:** пометка `@deprecated` для `formatRuAppointmentDate` / `formatRuAppointmentTime` (остаточное использование только там, где допустима зависимость от локали процесса).
4. **Документация:** `docs/ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md`, этот лог.

### Проверки

- `pnpm run ci`.

---

## 2026-03-28

### Проблема

- Плитки дашборда вели на страницы без соответствующих фильтров (записи всегда «сегодня», отмены — на общую статистику).
- Метрики и списки расходились: `getAppointmentStats` не исключал soft-delete; «приходили в месяце» считали будущие слоты; граница «сейчас» везде `> NOW()` vs `>= NOW()`.
- Подписи не отражали семантику (отмены по `updated_at` месяца vs слот).

### Сделано

1. **Документация:** `docs/ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md` (источник истины по метрикам).
2. **SQL:** `deleted_at IS NULL` в `getAppointmentStats`; общий фрагмент `AR_ACTIVE_UPCOMING_SQL` (`record_at >= NOW()`); метрика «были на приёме» — только `record_at < NOW()` в месяце.
3. **Порты:** `DoctorAppointmentsListFilter` / `DoctorAppointmentStatsFilter`; фильтр `visitedThisCalendarMonth` у клиентов.
4. **UI:** href плиток → целевые query (`appointments?view=…`, `clients?visitedMonth=1`); страница записей с режимами; фильтр «Приём в этом месяце» на списке клиентов; уточнён текст `/doctor/stats` и ссылка на список отмен месяца.
5. **Тесты:** утверждение про `deleted_at` в `pgDoctorAppointments.test.ts`; обновлены моки `doctor-appointments/service.test.ts`.

### Проверки

- `pnpm run ci` перед пушем.

### Ограничения / долг

- Окна дат врача остаются UTC из `getDateBounds`; при необходимости таймзоны врача/филиала — отдельная задача.
- Список «месяц» показывает все статусы; отмены в прошлом месяце с фиксацией отмены в текущем попадают в плитку «Отмен за месяц», но не обязаны попадать в `view=month` — задокументировано в ARCHITECTURE.
