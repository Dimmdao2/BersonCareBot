# Метрики дашборда специалиста (webapp)

**Назначение:** единые определения плиток `/app/doctor` и соответствующих SQL/списков.  
**Код:** `apps/webapp/src/infra/repos/pgDoctorAppointments.ts`, `pgDoctorClients.ts`, типы в `modules/doctor-appointments/ports.ts` и `modules/doctor-clients/ports.ts`.

---

## Время и часовой пояс

- Окна «сегодня / завтра / неделя» в `getAppointmentStats` и списке `view` по умолчанию считаются от **UTC-полуночи** текущего дня (`getDateBounds` в `pgDoctorAppointments.ts`).
- Месячные метрики используют **`date_trunc('month', NOW())`** в часовом поясе сессии БД (обычно UTC на проде — уточнять на хосте).

---

## Будущая активная запись

**Предикат (алиас `ar`):** `AR_ACTIVE_UPCOMING_SQL` в `pgDoctorAppointments.ts`.

- `deleted_at IS NULL`
- `status IN ('created', 'updated')`
- `record_at IS NOT NULL`
- **`record_at >= NOW()`** — согласовано с кабинетом пациента (`appointment_records` / `listActiveByPhoneNormalized`).

Используется для: плитки «Активные (будущие)», режима списка `?view=future`, метрики «На сопровождении» (через join к `appointment_records`).

---

## Плитки «Пациенты»

| Плитка | Метрика | Определение |
|--------|---------|-------------|
| Всего в базе | `totalClients` | `platform_users` с `role = 'client'`, не архивные. |
| На сопровождении | `onSupportCount` | Уникальные клиенты с хотя бы одной **будущей активной** записью (предикат как выше, `record_at >= NOW()`). |
| Были на приёме (месяц) | `visitedThisCalendarMonthCount` | Уникальные клиенты с прошедшим слотом `created`/`updated`: `record_at` в текущем календарном месяце **и** `record_at < NOW()`. |

**Список по клику:** подписчики (`/app/doctor/subscribers`), сопровождение — `?appointment=1`; «Были на приёме» — клиенты с записями `?visitedMonth=1` (`listClients({ visitedThisCalendarMonth: true, onlyWithAppointmentRecords: true })`).

---

## Плитки «Записи на приём»

| Плитка | Метрика | Определение |
|--------|---------|-------------|
| Активные (будущие) | `futureActiveCount` | `COUNT` по `AR_ACTIVE_UPCOMING_SQL`. |
| Всего за месяц | `recordsInCalendarMonthTotal` | Все **не удалённые** строки, `record_at` в текущем UTC-месяце (**любой статус**, в т.ч. отменённые). |
| Отмен за месяц | `cancellationsInCalendarMonth` | `status = 'canceled'`, исключение по `last_event` (`AR_CANCELLATION_LAST_EVENT_EXCLUSION_SQL`), интервал по **`updated_at`** в текущем месяце («когда отмена зафиксирована»). |

**Списки:** `/app/doctor/appointments?view=future|month|cancellationsMonth`.

---

## Страница «Статистика» (`/app/doctor/stats`)

- `getStats().appointments` берётся из `getAppointmentStats({ range: 'week' })`.
- **Всего записей:** все не soft-delete строки с `record_at` в окне недели (**включая отменённые**).
- **Отмен в окне:** подмножество с `status = 'canceled'` и фильтром `last_event`.
- **Отмен за 30 дн.:** по `updated_at`, не soft-delete.

---

## Журнал изменений

См. `docs/MIGRATION/DOCTOR_DASHBOARD_METRICS_CHANGELOG.md`.
