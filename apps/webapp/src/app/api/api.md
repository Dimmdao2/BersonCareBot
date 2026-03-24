# api

Обработчики HTTP API вебаппа (Next.js route handlers).

- **auth/** — авторизация: обмен токена интегратора на сессию (exchange), вход по Telegram initData (telegram-init), выход (logout).
- **integrator/** — эндпоинты для бота/интегратора: приём событий (events), дневники (symptom-trackings, lfk-complexes), напоминания (reminders/dispatch). Доступ по подписи запроса (общий секрет).
- **media/** — отдача медиа по идентификатору (`GET /api/media/[id]`); загрузка для кабинета врача (`POST /api/media/upload`, multipart `file`, только роль doctor/admin). Ограничения: до 50 МБ, MIME из белого списка (`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `video/mp4`, `audio/mpeg`, `audio/wav`, `application/pdf`). Успех: `{ ok: true, mediaId, url }`. Ошибки: `413` (размер), `415` (MIME), `403` без прав.
- **health/** — проверка работоспособности сервиса.
- **me/** — данные текущего пользователя (если нужны для клиента).
- **menu/** — меню по роли (если используется отдельным запросом).

Роуты остаются тонкими: проверка прав и параметров, вызов сервисов из `buildAppDeps()` или модулей.
