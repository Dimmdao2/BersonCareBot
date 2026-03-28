Страница профиля пациента (`/app/patient/profile`).

- Показывает редактирование имени, телефон и заглушку email.
- Показывает привязанные каналы (Telegram/MAX/VK) и ссылки подключения.
- Содержит выход из аккаунта: форма POST на `/api/auth/logout` (редирект на `/app`).
- Server action `updateDisplayName` обновляет `platform_users.display_name` через `userProjection`.
