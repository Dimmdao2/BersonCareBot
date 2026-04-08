# settings

Маршрут приложения **`/app/settings`** (`apps/webapp/src/app/app/settings/page.tsx`).

- **Пациент** (`role === client`) перенаправляется на `/app/patient/profile`.
- **Врач / админ** видят страницу настроек кабинета; у **администратора** доступен переключатель admin mode и дополнительные вкладки (режим, параметры приложения, авторизация, доступ и роли, интеграции, каталог записи).

Секреты и операционные значения для интеграций по правилам репозитория хранятся в `system_settings` (scope admin), а не в новых env-переменных для интеграций.

Вкладка «Доступ и роли» задаёт вайтлисты **Telegram / Max ID**. Ключи `admin_phones`, `doctor_phones`, `allowed_phones` в БД и API те же, что в `ALLOWED_KEYS` (`apps/webapp/src/modules/system-settings/types.ts`); отдельных полей под телефоны на этой странице пока нет (см. `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`).
