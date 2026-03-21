Страница профиля пациента (`/app/patient/profile`).

- Показывает редактирование имени, телефон и заглушку email.
- Показывает привязанные каналы (Telegram/MAX/VK) и ссылки подключения.
- Содержит выход из аккаунта (`/api/auth/logout`).
- Server action `updateDisplayName` обновляет `platform_users.display_name` через `userProjection`.
