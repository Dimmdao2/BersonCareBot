# settings

Маршрут приложения **`/app/settings`** (`apps/webapp/src/app/app/settings/page.tsx`).

- **Пациент** (`role === client`) перенаправляется на `/app/patient/profile`.
- **Врач / админ** видят только **настройки специалиста** (`SettingsForm`: подпись «пациент/клиент», SMS fallback). Тот же каркас шапки, что в `/app/doctor` (`DoctorWorkspaceShell`, `DOCTOR_PAGE_CONTAINER_CLASS`).

Админские разделы (health, журнал, аналитика, параметры приложения, интеграции и т.д.) перенесены в основное меню кабинета (`/app/doctor/system-health`, `/app/doctor/audit-log`, `/app/doctor/analytics/*`, `/app/doctor/admin/*`). Старые ссылки **`?adminTab=`** на `/app/settings` редиректят на новые URL (см. `adminSettingsData.ts`, `ADMIN_TAB_REDIRECTS`).

Канон в репозитории: [`docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md`](../../../../docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md).

Секреты и операционные значения для интеграций по правилам репозитория хранятся в `system_settings` (scope admin), а не в новых env-переменных для интеграций.
