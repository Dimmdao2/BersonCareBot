# webhooks

Проверка подписи запросов от интегратора (бота).

Верификация подписи GET и POST по заголовкам (timestamp, signature) и общему секрету. Используется в маршрутах API integrator (diary, events, reminders) перед обработкой тела запроса.
