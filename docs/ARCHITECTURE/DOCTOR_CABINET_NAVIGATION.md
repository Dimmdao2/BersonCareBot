# Навигация кабинета специалиста (webapp)

**Актуально с 2026-06 (этап 5).** Источник правды в коде: `apps/webapp/src/shared/ui/doctorNavLinks.ts`, заголовки экранов — `doctorScreenTitles.ts`.

## `/app/settings`

- **Пациент** → редирект на `/app/patient/profile`.
- **Врач / админ** → только личные настройки специалиста (`SettingsForm`: подпись «пациент/клиент», SMS fallback). Тот же каркас шапки, что `/app/doctor`.
- Операционные разделы (health, журнал, аналитика, параметры приложения, интеграции) **перенесены** в меню кабинета врача. Старые URL **`/app/settings?adminTab=…`** редиректят на новые маршруты (`adminSettingsData.ts` → `ADMIN_TAB_REDIRECTS`).
- Переключатель «режим админа» (`AdminModeToggle`) **удалён**: для `role === admin` admin mode считается всегда включённым (`requireAdminModeSession`).

## Меню (`doctorNavLinks`)

Порядок секций: standalone **«Сегодня»**, затем кластеры.

| Кластер | Пункты (кратко) |
|---------|------------------|
| *(standalone)* | Сегодня → `/app/doctor` |
| Работа с пациентами | Пациенты, Записи, Календарь |
| Коммуникации | Онлайн-заявки, Сообщения, Рассылки |
| Каталог ЛФК | Упражнения, комплексы, тесты, шаблоны программ, курсы, справочники, … |
| Контент | Главная пациента, материалы, библиотека файлов |
| Аналитика *(admin)* | По клиентам, по контенту, по уведомлениям, Использование |
| Система *(admin)* | Здоровье системы, архив сбоев, журнал операций |
| Администрирование *(admin)* | Настройки приложения, авторизация, интеграции, **Настройки записи**, технические режимы, **Мердж пациентов** |

Пункты с `requiresAdminMode: true` видны только при `role === admin`.

## Маршруты (admin / аналитика)

| Назначение | URL | Примечание |
|------------|-----|------------|
| Сегодня (рабочий inbox) | `/app/doctor` | KPI + очереди; см. [`DOCTOR_DASHBOARD_METRICS.md`](DOCTOR_DASHBOARD_METRICS.md) |
| Календарь записей | `/app/doctor/calendar` | Read switch: `appointment_records` (default) или `be_appointments` (`booking_doctor_appointments_read_source`); API `/api/doctor/booking-engine/calendar` (`readSource`, `freeSlotsEnabled`) |
| Список записей | `/app/doctor/appointments` | `?tab=appointments\|schedule` · `?view=future\|past`; tab=**schedule** — только admin; RSC fetch через `DoctorAppointmentsReadSwitch`; API пагинации архива: `GET /api/doctor/appointments/list?view=past&offset=N` |
| Аналитика по клиентам | `/app/doctor/analytics/clients` | Бывш. `/app/doctor/stats`; пресет **«Сутки»** (`preset=day`) + week/month/custom |
| Статистика (legacy URL) | `/app/doctor/stats` | **Редирект** → `analytics/clients` |
| По контенту | `/app/doctor/material-ratings` | UI «Статистика материалов»: дашборд **`content-stats`** + таблицы оценок; см. [`MATERIAL_RATINGS.md`](MATERIAL_RATINGS.md) |
| По уведомлениям | `/app/doctor/analytics/notifications` | Бывш. `?adminTab=reminder-stats`; **`windowHours`** 24 ч / 7 дн. / 30 дн. |
| Использование (product) | `/app/doctor/usage` | Бывш. `?adminTab=product-analytics`; те же пресеты **`windowHours`** |
| Здоровье системы | `/app/doctor/system-health` | `GET /api/admin/system-health` |
| Архив сбоев | `/app/doctor/health-archive` | |
| Журнал операций | `/app/doctor/audit-log` | `GET /api/admin/audit-log`; сверху — ошибки регистрации (`GET /api/admin/auth-registration-events`) |
| Параметры приложения | `/app/doctor/admin/app-settings` | |
| Авторизация | `/app/doctor/admin/auth` | |
| Интеграции | `/app/doctor/admin/integrations` | |
| Настройки записи | `/app/doctor/admin/booking` | **4 вкладки** (`bookingAdminTabs.ts`): «Обзор и настройка» (локации, услуги, доступность, правила абонементов), «Форма и публичная запись», «Оплата», «Интеграция Rubitime»; API `/api/admin/booking-engine/*`; расписание — у врача (`/appointments?tab=schedule`) |
| Запись → Интеграции (Rubitime catalog v2) | `/app/doctor/admin/booking/integrations` | **`RubitimeSection`** — справочник `booking_*` через `/api/admin/booking-catalog/*` (город → филиал → услуга → специалист → branch-service); inline PATCH услуг, форма «Создать услугу»; план [`.cursor/plans/archive/rubitime_catalog_ux_fix.plan.md`](../../.cursor/plans/archive/rubitime_catalog_ux_fix.plan.md) |
| Технические режимы | `/app/doctor/admin/technical` | |

Редиректы `?adminTab=` → см. `ADMIN_TAB_REDIRECTS` в `apps/webapp/src/app/app/settings/adminSettingsData.ts`.

## Окна аналитики (doctor)

| Экран | Query | Пресеты UI |
|-------|--------|------------|
| По клиентам | `preset=day\|week\|month\|custom` (+ `from`/`to`) | «Сутки», «Неделя», «Месяц», произвольный |
| По контенту, уведомлениям, использованию | `windowHours` (1…720, default **168**) | **24 ч**, **7 дн.**, **30 дн.** — [`analyticsWindowHourPresets.ts`](../../apps/webapp/src/app/app/doctor/analytics/shared/analyticsWindowHourPresets.ts) |
| Детализация оценки материала | `preset=week\|month\|custom` | «Сутки» на экране `[kind]/[id]` — локальный пресет дня |

Общий загрузчик контента/напоминаний: **`loadContentEngagementStats`** — [`loadAdminReminderStats.ts`](../../apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts); канон полей дашборда — [`MATERIAL_RATINGS.md`](MATERIAL_RATINGS.md) §«Дашборд content-stats».

## Экран «Сегодня» — KPI и health-баннер

**KPI-плитки** (верх страницы): новые сообщения (ссылка в inbox), записи сегодня, записи на неделе, отмены за 30 дн. Определения — [`DOCTOR_DASHBOARD_METRICS.md`](DOCTOR_DASHBOARD_METRICS.md). Тестовые аккаунты из `test_account_identifiers` в метриках скрыты, пока не включён **`dev_mode`** (`debug_forward_to_admin` не влияет).

**Баннер** «Требуется внимание к здоровью системы» (только `role === admin`): те же **критичные** сигналы, что сводка system-health (`adminDoctorTodayHealthBannerFromSystemHealth` в `collectAdminSystemHealthData`), **без** некритичных `mediaPreview` / `videoPlayback` / `videoPlaybackClient`.

## Журнал операций (`admin_audit_log`)

- UI: `/app/doctor/audit-log` — сверху **`AdminAuthRegistrationEventsSection`** (product analytics `auth_register_*`), ниже **`AdminAuditLogSection`** (`admin_audit_log`).
- API audit: `GET /api/admin/audit-log` — guard admin + admin mode.
- API registration funnel: `GET /api/admin/auth-registration-events` — raw events из `product_analytics_events_recent` (см. `auth.md` §«Журнал воронки регистрации»).
- По умолчанию в UI: **`excludeSystemHealth=1`** (строки `action` с префиксом `system_health_` скрыты).
- Фильтр «Системные снимки»: **`systemHealthOnly=1`** (`actionPrefix` в SQL).
- Оба флага одновременно → **400** `invalid_system_health_filter`.
- Запись `system_health_integrator_push_outbox` в audit — только при **смене** статуса и если уже был предыдущий снимок в журнале (не первая запись `ok`).

См. также [`api.md`](../../apps/webapp/src/app/api/api.md) (admin/audit-log, admin/auth-registration-events), [`DB_STRUCTURE.md`](DB_STRUCTURE.md) (`admin_audit_log`, `product_analytics_events_recent`).

## Связанные документы

- [`SPECIALIST_CABINET_STRUCTURE.md`](SPECIALIST_CABINET_STRUCTURE.md) — каркас страниц и карточка клиента.
- [`DOCTOR_DASHBOARD_METRICS.md`](DOCTOR_DASHBOARD_METRICS.md) — определения метрик.
- [`OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md`](../OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md) — health UI и баннер.
- [`apps/webapp/src/app/app/settings/settings.md`](../../apps/webapp/src/app/app/settings/settings.md) — маршрут `/app/settings`.
