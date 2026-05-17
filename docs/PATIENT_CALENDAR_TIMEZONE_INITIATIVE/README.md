# Календарный пояс пациента (IANA)

Инициатива: **корректный локальный календарный день** для пациента (чек-лист программы, дневник, настроение и др.) через поле **`platform_users.calendar_timezone`** (IANA), UX выбора в профиле и первичное заполнение из браузера.

## Документы

- **Главный план (фазы, DoD, риски):** [`MASTER_PLAN.md`](MASTER_PLAN.md)
- **Журнал исполнения:** [`LOG.md`](LOG.md)

## Код и API (якоря)

- Слияние подписей для `react-timezone-select`: [`apps/webapp/src/shared/timezone/patientTimezoneSelectLabels.ts`](../../apps/webapp/src/shared/timezone/patientTimezoneSelectLabels.ts)
- Профиль пациента (UTC / селект): [`apps/webapp/src/app/app/patient/profile/PatientCalendarTimezoneSection.tsx`](../../apps/webapp/src/app/app/patient/profile/PatientCalendarTimezoneSection.tsx)
- Bootstrap при входе в кабинет: [`apps/webapp/src/app/app/patient/PatientCalendarTimezoneBootstrap.tsx`](../../apps/webapp/src/app/app/patient/PatientCalendarTimezoneBootstrap.tsx)
- API: `GET` / `PATCH` / `POST` — [`apps/webapp/src/app/api/patient/profile/calendar-timezone/route.ts`](../../apps/webapp/src/app/api/patient/profile/calendar-timezone/route.ts)
- Репозиторий: [`apps/webapp/src/infra/repos/pgPatientCalendarTimezone.ts`](../../apps/webapp/src/infra/repos/pgPatientCalendarTimezone.ts)
- IANA из браузера для auth: [`apps/webapp/src/shared/lib/browserCalendarIana.ts`](../../apps/webapp/src/shared/lib/browserCalendarIana.ts)
- Реестр API (кратко): [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) — блок **patient/profile/calendar-timezone**

## Связанные каноны

- `app_display_timezone` vs персональный пояс: см. комментарии в схеме `calendar_timezone` и модуль настроек отображения.
- Интеграционные ключи — только `system_settings` (не env): `.cursor/rules/000-critical-integration-config-in-db.mdc`, `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`.
