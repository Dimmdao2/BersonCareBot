# settings

Маршрут приложения **`/app/settings`** (`apps/webapp/src/app/app/settings/page.tsx`).

- **Пациент** (`role === client`) перенаправляется на `/app/patient/profile`.
- **Врач / админ** видят страницу настроек кабинета с той же шапкой и шириной колонки, что и в `/app/doctor`: `DoctorHeader`, `DOCTOR_WORKSPACE_TOP_PADDING_CLASS` и `DOCTOR_PAGE_CONTAINER_CLASS` из `shared/ui/doctorWorkspaceLayout.ts` (без отдельного `AppShell`, но визуально совпадает с `AppShell variant="doctor"`). У **администратора** — переключатель admin mode и дополнительные вкладки (**Режимы**, **здоровье системы**, параметры приложения, авторизация, интеграции, каталог записи, **лог операций**). Секция здоровья берёт косвенные сигналы из `GET /api/admin/system-health` (webapp DB, integrator `/health`, projection health), без прямого systemd/process API.

Секреты и операционные значения для интеграций по правилам репозитория хранятся в `system_settings` (scope admin), а не в новых env-переменных для интеграций.

Вкладка **«Параметры приложения»** (при admin mode): URL приложения, таймзона, **все флаги `video_*`** (playback API, стратегия HLS/MP4, пайплайн транскода, автотранскод новых загрузок, watermark, TTL presigned), темы уведомлений.

Вкладка **«Режимы»** (`AdminSettingsSection`): админский телефон / Telegram ID / Max ID (первый слот массивов в БД), **тестовые аккаунты** (`test_account_identifiers`), режим техработ patient app, `dev_mode` и связанные флаги. Отдельный экран вайтлистов ролей (ранее отдельная вкладка настроек) **не показывается**; вайтлисты `allowed_*` / `doctor_*` остаются в `ALLOWED_KEYS` и `PATCH /api/admin/settings` для совместимости. Свой числовой id в боте: команда **`/show_my_id`**. См. `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`.
