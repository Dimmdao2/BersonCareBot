# settings

Маршрут приложения **`/app/settings`** (`apps/webapp/src/app/app/settings/page.tsx`).

- **Пациент** (`role === client`) перенаправляется на `/app/patient/profile`.
- **Врач / админ** видят один role-stable hub: «Специалист», «Установить приложение» и, только при
  server-resolved праве управления организацией, «Практика». Набор вкладок не зависит от текущего layout subtree.
  «Практика» владеет единственной настройкой терминологии **«Как называть клиента: Клиент / Пациент»** и
  organization-level appointment reminders (`doctor_appointment_reminder_*`, исторический префикс ключей) через
  `/api/admin/settings` → `updateSetting` → integrator mirror. Lifecycle notifications и `notifications_topics`
  не дублируются здесь: их канонический writer остаётся в настройках расписания.
- **Специалист** владеет account email, каналами уведомлений, личными defaults и timezone; appointment reminders
  не имеют личного UI/API write path.
- **Тариф и биллинг** — только owner/global-admin shell с server-side direct-tab guard; коммерческие действия,
  тариф и платежи до C5 недоступны. «Врачи»/Team fail-closed до C4 clinic entitlement: вкладки и body нет,
  включая прямой `?tab=team`.
- Legacy `/app/doctor/clinic/settings` и `/app/doctor/install` redirect в соответствующие вкладки `/app/settings`;
  `/app/doctor/clinic/members` redirect в default hub, не открывая Team до C4. Server guard хаба повторно
  проверяет organization-management access.
  Тот же каркас шапки, что в `/app/doctor` (`DoctorWorkspaceShell`, `DOCTOR_PAGE_CONTAINER_CLASS`).
- Ежедневная bot-рассылка с главной пациента retired: у неё нет settings UI, scheduler action или delivery handler.
  Пользовательские opt-in reminders и notification/event settings остаются отдельными механизмами.

Админские разделы (health, журнал, аналитика, параметры приложения, интеграции и т.д.) перенесены в основное меню кабинета (`/app/doctor/system-health`, `/app/doctor/audit-log`, `/app/doctor/analytics/*`, `/app/doctor/admin/*`). Старые ссылки **`?adminTab=`** на `/app/settings` редиректят на новые URL (см. `adminSettingsData.ts`, `ADMIN_TAB_REDIRECTS`).

Канон в репозитории: [`docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md`](../../../../docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md).

Секреты и операционные значения для интеграций по правилам репозитория хранятся в `system_settings` (scope admin), а не в новых env-переменных для интеграций.
