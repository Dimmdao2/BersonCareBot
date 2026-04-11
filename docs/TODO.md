# Project backlog (не срочные улучшения)

Краткий список отложенных задач по безопасности, лимитам и наблюдаемости. Реализация по приоритетам продукт/ops.

## Security / Auth

- Сделать OAuth `state` одноразовым (хранить used `state.n` или nonce с TTL в Redis/БД).
- Добавить Redis/БД для защиты от replay в пределах TTL подписанного state.
- Унифицировать обработку ошибок OAuth (JSON vs redirect) между callback-роутами.
- Проверить все OAuth callback-роуты на единый контракт ответа.

## Rate limiting

- Расширить ключ rate limit для OAuth start (например IP + provider или отдельный ключ на route).
- Ввести конфигурируемые лимиты (env / `system_settings`) вместо констант в коде.

## Config / Secrets

- Убрать чтение полных секретов в `GET /api/auth/oauth/providers` — проверка «настроено» без вытягивания значения в handler.
- Слой «config validation» / exists-only accessors для admin keys.
- Проверить логирование `integrationRuntime` и смежных путей на утечки секретов.

## Observability

- Метрики OAuth flow (start / success / exchange_failed).
- Логировать повторные попытки callback (по возможности без PII).
- Логировать/метрить срабатывания rate limit (hits, 429).
