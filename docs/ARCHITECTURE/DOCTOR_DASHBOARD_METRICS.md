# Метрики дашборда специалиста (webapp)

**Назначение:** единые определения метрик кабинета специалиста: KPI на **`/app/doctor` («Сегодня»)**, плитки на **`/app/doctor/analytics/clients`**, SQL/списки.  
**Код:** `apps/webapp/src/infra/repos/pgDoctorAppointments.ts`, `pgDoctorClients.ts`, типы в `modules/doctor-appointments/ports.ts` и `modules/doctor-clients/ports.ts`; админские графики регистраций — `modules/admin-platform-stats/`, `pgAdminPlatformUserStats.ts`.  
**Навигация:** [`DOCTOR_CABINET_NAVIGATION.md`](DOCTOR_CABINET_NAVIGATION.md).

---

## Время и часовой пояс

- Окна «сегодня / завтра / неделя» в `getAppointmentStats` и списке `view` по умолчанию считаются от **UTC-полуночи** текущего дня (`getDateBounds` в `pgDoctorAppointments.ts`).
- Месячные метрики используют **`date_trunc('month', NOW())`** в часовом поясе сессии БД (обычно UTC на проде — уточнять на хосте).

### Отображение времени слота в UI (подписи к записям)

Метрики выше считают в SQL по **`record_at`** (timestamptz). **Текст времени** на экранах («Ближайший приём» на `/app/doctor`, список записей врача, карточка клиента, кабинет пациента по проекции) должен браться из **одной** бизнес-таймзоны: ключ **`app_display_timezone`** в `system_settings` (чтение **`getAppDisplayTimeZone()`**), форматирование через **`formatBusinessDateTime.ts`** (`formatDoctorAppointmentRecordAt`, `formatAppointmentDateNumericRu`, `formatAppointmentTimeShortRu`, `formatBookingDateTimeMediumRu` и т.д.).

Источник в коде: **`createDoctorAppointmentsService`** (поле `time` у строки записи), **`buildAppDeps.ts`** — `getUpcomingAppointments`, `getPastAppointments`, `listAppointmentHistoryForPhone`. Не использовать для слотов из БД **`toLocaleString` / `toLocaleTimeString` без `timeZone`**: это привязывает вывод к TZ процесса Node и расходится с дашбордом, если **`app_display_timezone`** ≠ TZ сервера.

---

## Будущая активная запись

**Предикат (алиас `ar`):** `AR_ACTIVE_UPCOMING_SQL` в `pgDoctorAppointments.ts`.

- `deleted_at IS NULL`
- `status IN ('created', 'updated')`
- `record_at IS NOT NULL`
- **`record_at >= NOW()`** — согласовано с кабинетом пациента (`appointment_records` / `listActiveByPhoneNormalized`).

Используется для: плитки «Активные (будущие)», режима списка `?view=future`.

---

## Плитки «Пациенты»

| Плитка | Метрика | Определение |
|--------|---------|-------------|
| Всего в базе | `totalClients` | `platform_users` с `role = 'client'`, не архивные. |
| На сопровождении | `onSupportCount` | Уникальные клиенты с хотя бы одной **активной** записью в `treatment_program_instances` (`status = 'active'`). |
| Были на приёме (месяц) | `visitedThisCalendarMonthCount` | Уникальные клиенты с прошедшим слотом `created`/`updated`: `record_at` в текущем календарном месяце **и** `record_at < NOW()`. |

**Список по клику:** подписчики (`/app/doctor/subscribers`), сопровождение — `?treatmentProgram=1`; «Были на приёме» — клиенты с записями `?visitedMonth=1` (`listClients({ visitedThisCalendarMonth: true, onlyWithAppointmentRecords: true })`).

---

## Плитки «Записи на приём»

| Плитка | Метрика | Определение |
|--------|---------|-------------|
| Активные (будущие) | `futureActiveCount` | `COUNT` по `AR_ACTIVE_UPCOMING_SQL`. |
| Всего за месяц | `recordsInCalendarMonthTotal` | Все **не удалённые** строки, `record_at` в текущем UTC-месяце (**любой статус**, в т.ч. отменённые). |
| Отмен за месяц | `cancellationsInCalendarMonth` | `status = 'canceled'`, исключение по `last_event` (`AR_CANCELLATION_LAST_EVENT_EXCLUSION_SQL`), интервал по **`updated_at`** в текущем месяце («когда отмена зафиксирована»). |

**Списки:** `/app/doctor/appointments?view=future|month|cancellationsMonth`.

**Подпись клиента (Rubitime vs профиль):** в списке записей и на `/app/doctor` («Сегодня») основная строка имени — джойн к `platform_users` (как в `LIST_SELECT` → `clientLabel` в `pgDoctorAppointments.ts`). Если `payload_json.name` из проекции Rubitime после нормализации отличается от этой подписи, под основной строкой показывается краткая подсказка «В Rubitime: …». Логика сравнения без БД: `apps/webapp/src/shared/lib/appointmentRubitimeNameMismatch.ts`. Подробнее поток данных — [`RUBITIME_BOOKING_PIPELINE.md`](RUBITIME_BOOKING_PIPELINE.md).

---

## Экран «Сегодня» (`/app/doctor`) — KPI

Верхние плитки (`DoctorTodayDashboard`, `deps.doctorStats.getStats()`):

| Плитка | Источник |
|--------|----------|
| Записи сегодня | Число записей на текущий UTC-день (данные дашборда «Сегодня») |
| Записи на неделю | `getAppointmentStats({ range: 'week' }).total` — все не удалённые строки с `record_at` в окне недели (**включая отменённые**) |
| Отмены за 30 дн. | `getAppointmentStats` → `cancellations30d` (по `updated_at`, см. ниже) |
| Новые клиенты за 7 дн. без каналов связи | `countRecentClientsWithoutMessagingChannels(7)` — `platform_users` с `created_at` ≥ now−7d, без привязок telegram/max |

Ссылка «Аналитика по клиентам» (admin) → `/app/doctor/analytics/clients`.

## Страница «Аналитика по клиентам» (`/app/doctor/analytics/clients`)

- Legacy URL **`/app/doctor/stats`** — server redirect на `analytics/clients`.
- Операционные агрегаты `getStats().clients`: **всего**, **без каналов** (все клиенты), с одним/несколькими каналами; блок записей — те же правила, что `getAppointmentStats({ range: 'week' })` (**отмен в окне**, **отмен за 30 дн.**).

### Блок админа: регистрации и слияния

Только **`session.user.role === admin`**: клиентский блок загружает **`GET /api/admin/platform-user-registration-stats`** (контракт — [`api.md`](../../apps/webapp/src/app/api/api.md) в дереве `app/api`). Границы **«сегодня / N дней / произвольный период»** считаются в **IANA `app_display_timezone`** (через `getAppDisplayTimeZone()`), не в UTC-полуночи страницы записей выше. **Новые аккаунты** — `platform_users.role = 'client'` и `created_at` в интервале; **слияния** — строки с `merged_into_id` и меткой времени **`merged_at`** (заполняется при merge и channel-link claim; миграция **`0067_platform_users_merged_at.sql`**). График — Recharts (`LineChart`), см. `apps/webapp/src/app/app/doctor/analytics/clients/AdminRegistrationLineChart.tsx`.

## Журнал изменений

См. [`docs/archive/2026-04-initiatives/MIGRATION/DOCTOR_DASHBOARD_METRICS_CHANGELOG.md`](../archive/2026-04-initiatives/MIGRATION/DOCTOR_DASHBOARD_METRICS_CHANGELOG.md).
