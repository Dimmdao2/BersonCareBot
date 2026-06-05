# Метрики дашборда специалиста (webapp)

**Назначение:** единые определения метрик кабинета специалиста: KPI на **`/app/doctor` («Сегодня»)**, плитки на **`/app/doctor/analytics/clients`**, SQL/списки.  
**Код (записи на приём, этап 8+):** при наличии booking engine — `apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts` (`be_appointments`); legacy fallback — `pgDoctorAppointments.ts` (`appointment_records`). Типы: `modules/doctor-appointments/ports.ts`. Календарь: `modules/booking-calendar/`, `pgBookingCalendar.ts`. Админские графики регистраций — `modules/admin-platform-stats/`, `pgAdminPlatformUserStats.ts`.  
**Навигация:** [`DOCTOR_CABINET_NAVIGATION.md`](DOCTOR_CABINET_NAVIGATION.md).

---

## Исключение тестовых аккаунтов из аналитики

- Источник идентификаторов: `system_settings.test_account_identifiers` (телефоны, Telegram, MAX).
- По умолчанию тестовые `platform_users` **не** попадают в KPI, графики и drill-down на «Сегодня», «Аналитика», «Использование», «По уведомлениям», «По контенту».
- Включение тестовых в выборки — только если в admin settings включён **`dev_mode`** или **`debug_forward_to_admin`** (логика: `apps/webapp/src/modules/analytics/analyticsAudience.ts`).
- Product analytics («Использование») дополнительно всегда исключает роли `admin` / `doctor`.
- Технические видеометрики (`videoPlayback`, `videoPlaybackClient`) не имеют user drill-down; KPI ведут на `/app/doctor/system-health`.

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

## Экран «Сегодня» (`/app/doctor`) — KPI

Верхние плитки (`DoctorTodayDashboard`, `deps.doctorStats.getStats()`):

| Плитка | Источник |
|--------|----------|
| Записи сегодня | Число записей на текущий день (`start_at` в окне «сегодня», `app_display_timezone`) |
| Записи на неделю | `getAppointmentStats({ range: 'week' }).total` — все строки с `start_at` в окне недели |
| Отмены за 30 дн. | `getAppointmentStats` → `cancellations30d` (канон: cancel-статусы, `updated_at` за 30 дней) |
| Новые клиенты за 7 дн. без каналов связи | `countRecentClientsWithoutMessagingChannels(7)` — `platform_users` с `created_at` ≥ now−7d, без привязок telegram/max |

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

## Журнал изменений

См. [`docs/archive/2026-04-initiatives/MIGRATION/DOCTOR_DASHBOARD_METRICS_CHANGELOG.md`](../archive/2026-04-initiatives/MIGRATION/DOCTOR_DASHBOARD_METRICS_CHANGELOG.md).
