# Метрики дашборда специалиста (webapp)

**Назначение:** единые определения метрик кабинета специалиста: KPI на **`/app/doctor` («Сегодня»)**, плитки на **`/app/doctor/analytics/clients`**, SQL/списки.  
**Код (записи на приём, этап 8+):** при наличии booking engine — `apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts` (`be_appointments`); legacy fallback — `pgDoctorAppointments.ts` (`appointment_records`). Типы: `modules/doctor-appointments/ports.ts`. Календарь: `modules/booking-calendar/`, `pgBookingCalendar.ts`. Админские графики регистраций — `modules/admin-platform-stats/`, `pgAdminPlatformUserStats.ts`.  
**Навигация:** [`DOCTOR_CABINET_NAVIGATION.md`](DOCTOR_CABINET_NAVIGATION.md).

---

## Исключение тестовых аккаунтов из аналитики

- Источник идентификаторов: `system_settings.test_account_identifiers` (телефоны, Telegram, MAX).
- По умолчанию тестовые `platform_users` **не** попадают в KPI, графики и drill-down.
- Включение тестовых в выборки — **только** если в admin settings включён **`dev_mode`** (`readAnalyticsIncludeTestAccounts` в `apps/webapp/src/modules/analytics/analyticsAudience.ts`).
- **`debug_forward_to_admin`** на аналитику **не влияет** (только полнота серверных логов).
- Единый загрузчик на запрос: `loadDoctorAnalyticsAudience()` / `loadProductAnalyticsAudience()` (`apps/webapp/src/app-layer/analytics/loadAnalyticsAudience.ts`) → `excludedUserIds` / `includeTestAccounts`.
- Product analytics («Использование») дополнительно всегда исключает роли `admin` / `doctor`.
- В **`GET /api/admin/system-health`** блоки **`videoPlayback`** / **`videoPlaybackClient`** — платформенные KPI без per-user drill-down (UI → `/app/doctor/system-health`). В **`GET /api/doctor/content-stats`** / **`GET /api/admin/reminder-stats`** те же поля считаются с **`excludedUserIds`** (push/видео/разминки/практика/напоминания); при audience-фильтре **`media_playback_stats_hourly`** не используется для `totalResolutions`.
- Журнал воронки регистрации (`GET /api/admin/auth-registration-events`, баннер сбоев на «Сегодня») **всегда** исключает тестовые аккаунты, даже при `dev_mode` — операционный аудит, не дашборд метрик.

### Поверхности, проходящие через audience

| Зона | Точки входа |
|------|-------------|
| «Сегодня» | RSC `/app/doctor` — KPI, записи, `loadDoctorTodayDashboard` |
| По клиентам | RSC `/app/doctor/analytics/clients`, `GET /api/admin/doctor-analytics-appointments`, `GET /api/admin/platform-user-registration-stats`, `GET /api/admin/platform-user-subscriber-stats`, drill-down `GET /api/doctor/analytics-metric-accounts` |
| По контенту / уведомлениям | `GET /api/doctor/content-stats`, `GET /api/admin/reminder-stats` |
| Оценки материалов | `GET /api/doctor/material-ratings/*`, RSC `/app/doctor/material-ratings` |
| Использование | `GET /api/admin/product-analytics` (`includeTestAccounts` из `loadProductAnalyticsAudience`) |

---

## Время и часовой пояс

- Окна «сегодня / завтра / неделя» в `getAppointmentStats` и списке `view` по умолчанию — **`localDayRangeBoundsIso`** от **`app_display_timezone`** (`pgDoctorCanonicalAppointments`; legacy `pgDoctorAppointments` — UTC-полуночь через `getDateBounds`).
- Месячные метрики используют **`date_trunc('month', NOW())`** в часовом поясе сессии БД (обычно UTC на проде — уточнять на хосте).

### Отображение времени слота в UI (подписи к записям)

Метрики считают по **`start_at`** канонической записи (`be_appointments`). **Текст времени** на экранах — **`app_display_timezone`** + **`formatBusinessDateTime.ts`** (`createDoctorAppointmentsService` заполняет поле `time` из `recordAtIso` = `start_at`).

---

## Будущая активная запись

**Канон (этап 8):** `pgDoctorCanonicalAppointments` — статусы `created`, `awaiting_payment`, `paid`, `confirmed`, `rescheduled`, `manual_review_required`; **`start_at >= NOW()`**.

**Legacy (`appointment_records`):** `AR_ACTIVE_UPCOMING_SQL` в `pgDoctorAppointments.ts` — `status IN ('created', 'updated')`, `record_at >= NOW()`.

Используется для: плитки «Активные (будущие)», режима списка `?view=future`.

---

## Плитки «Пациенты»

| Плитка | Метрика | Определение |
|--------|---------|-------------|
| Всего в базе | `totalClients` | `platform_users` с `role = 'client'`, не архивные. |
| На сопровождении | `onSupportCount` | Уникальные клиенты с `doctor_patient_support.on_support = true`. |
| Были на приёме (месяц) | `visitedThisCalendarMonthCount` | Уникальные клиенты с прошедшим слотом `created`/`updated`: `record_at` в текущем календарном месяце **и** `record_at < NOW()`. |

**Список по клику:** подписчики (`/app/doctor/subscribers`), сопровождение — `?scope=all&support=on`; «программа без сопровождения» — `?scope=all&support=programWithoutSupport`; legacy «есть активная doctor-программа» — `?treatmentProgram=1`; «Были на приёме» — клиенты с записями `?visitedMonth=1` (`listClients({ visitedThisCalendarMonth: true, onlyWithAppointmentRecords: true })`).

---

## Плитки «Записи на приём»

| Плитка | Метрика | Определение |
|--------|---------|-------------|
| Активные (будущие) | `futureActiveCount` | Канон: активные статусы + `start_at >= NOW()`. |
| Всего за месяц | `recordsInCalendarMonthTotal` | Канон: `start_at` в текущем UTC-месяце (любой статус). |
| Отмен за месяц | `cancellationsInCalendarMonth` | Канон: terminal cancel-статусы; интервал по **`updated_at`** в текущем месяце. |

**Списки:** `/app/doctor/appointments?view=future|month|cancellationsMonth` (read `be_appointments`).

**Подпись клиента:** из `platform_users` / attribution; подсказка «В Rubitime» — только для legacy-проекции (`pgDoctorAppointments`), в каноническом списке не используется.

---

---

## Каналы связи (терминология)

**Канон:** каналом связи считается **любой** способ контакта и доставки сообщений клиенту: Telegram, MAX, email, телефон, SMS, web push и другие каналы из матрицы уведомлений.

На **`/app/doctor/analytics/clients`** блок «Каналы связи» показывает **комбинации имеющихся контактов** (круговая диаграмма и плитки «Только телефон», «Гости приложения» — клиенты без любого из контактов: телефона, подтверждённого email, Telegram, MAX).

Мессенджеры Telegram/MAX **не** являются единственными «каналами»; отдельные KPI «без каналов» только по TG/MAX **не используются**.

---

## Экран «Сегодня» (`/app/doctor`) — KPI

Верхние плитки (`DoctorTodayDashboard`, `deps.doctorStats.getStats()`):

| Плитка | Источник |
|--------|----------|
| Записи сегодня | Число записей на текущий день (`start_at` в окне «сегодня», `app_display_timezone`) |
| Записи на неделю | `getAppointmentStats({ range: 'week' }).total` — все строки с `start_at` в окне недели |
| Отмены за 30 дн. | `getAppointmentStats` → `cancellations30d` (канон: cancel-статусы, `updated_at` за 30 дней) |

Клик по плитке открывает список аккаунтов (`GET /api/doctor/analytics-metric-accounts`, ключи `today_*`).

Ссылка «Аналитика по клиентам» (admin) → `/app/doctor/analytics/clients`.

### Блок «Требует внимания» и проактивные сигналы (фаза 7 MVP)

| Секция / бейдж | Источник | Определение |
|----------------|----------|-------------|
| «К проверке» | `treatmentProgramProgress` | Distinct попытки тестов на оценку (как `pending-program-tests/summary`) |
| «Сигналы пациентов» | `doctorProactiveInsights.queryInsights` | Только `doctor_patient_support.on_support = true`: **`wellbeing_low_streak`** — `general_wellbeing` ≤ 2 три календарных дня подряд (якорь — сегодня или вчера); **`program_inactivity`** — активная doctor-программа без `program_action_log.done` по **этому** instance ≥ 5 дней |
| Бейдж «Сегодня» в меню | `todayAttention` | `pending-program-tests/summary` + `proactive-insights/summary` |

Пороги — `apps/webapp/src/modules/doctor-proactive-insights/constants.ts` (admin UI — backlog RECOMMENDATIONS §этап 8). На карточке клиента — `listForPatient` → блок «Сигналы» на табе «Обзор».

## Страница «Аналитика по клиентам» (`/app/doctor/analytics/clients`)

- Legacy URL **`/app/doctor/stats`** — server redirect на `analytics/clients`.
- **Приём (неделя):** `getAppointmentStats({ range: 'week' })` — прошедшие визиты в окне (без отмен), отменённые визиты по слоту, записались по `created_at`, отмены/переносы по `be_appointment_cancellations` / `be_appointment_reschedules.created_at` в окне (канон).
- **Клиенты:** `getClientContactBreakdown()` — всего, **только телефон** (телефон без мессенджеров и без подтверждённого email), **гости приложения** (нет телефона, email, telegram, max), круговая диаграмма сегментов (только ТГ / Макс / email / ТГ+email / Макс+email / телефон+email).

### Блок админа: регистрации и слияния

Только **`session.user.role === admin`**: клиентский блок загружает **`GET /api/admin/platform-user-registration-stats`** (контракт — [`api.md`](../../apps/webapp/src/app/api/api.md) в дереве `app/api`). Границы **«сегодня / N дней / произвольный период»** считаются в **IANA `app_display_timezone`** (через `getAppDisplayTimeZone()`), не в UTC-полуночи страницы записей выше. **Регистрации** — `platform_users.role = 'client'` и `created_at` в интервале, исключая аккаунты, merged в том же интервале; **слияния** — строки с `merged_into_id` и меткой времени **`merged_at`** (заполняется при merge и channel-link claim; миграция **`0067_platform_users_merged_at.sql`**). График — Recharts (`LineChart`), см. `apps/webapp/src/app/app/doctor/analytics/clients/AdminRegistrationLineChart.tsx`.

## KPI раздела «Расписание» — отдельная поверхность

Раздел `/app/doctor/schedule` (таб «Записи») содержит собственный **9-метричный KPI-ряд**
(Записей/Прошло/Впереди/По абонементу/Первичных/Повторных/Уникальных/Отмены/Переносы).

Эти метрики **не смешивать** с дашбордом «Сегодня» выше:
- Реализованы через `getScheduleKpis(query: ScheduleKpisQuery)` в `modules/doctor-appointments/ports.ts`.
- API: `GET /api/doctor/schedule-kpis?from=&to=&branchId?=&serviceId?=`.
- Диапазон произвольный `{from, to}` (не пресет дня/недели); фильтры по филиалу/услуге.
- `firstVisitInPeriod` = первая запись пациента вообще (`NOT EXISTS` ранних записей за весь период, §13.5 ТЗ v26).
- Отмены/переносы считаются по дате визита (`start_at`), не по дате события (§13.1 ТЗ v26).
- Живут только в `ScheduleCalendarTab`; шелл `DoctorScheduleShell` метрики не хранит.

Подробнее: `apps/webapp/src/app/app/doctor/schedule/schedule.md`,
`docs/DOCTOR_SCHEDULE_SECTION_INITIATIVE/`.

## Журнал изменений

См. [`docs/archive/2026-04-initiatives/MIGRATION/DOCTOR_DASHBOARD_METRICS_CHANGELOG.md`](../archive/2026-04-initiatives/MIGRATION/DOCTOR_DASHBOARD_METRICS_CHANGELOG.md).
