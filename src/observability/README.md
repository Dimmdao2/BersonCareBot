# Observability

Слой наблюдаемости: логирование и задел под метрики и трейсинг.

## Текущий статус

- **Логирование:** Pino. Экспорт `logger`, `getRequestLogger`, `getWorkerLogger`, `getMigrationLogger`, `serializeError`.
- Конфигурация уровня через `LOG_LEVEL` (env). В development — pino-pretty.
- Никакой бизнес-логики в этом модуле: только форматирование и вывод логов.

## Планы

- **OpenTelemetry:** метрики (counters, histograms) и трейсинг (spans) для запросов и воркера.
- **Correlation id:** проброс request id / trace id в логах и в ответах.
- **Sentry (опционально):** отправка ошибок в Sentry с контекстом.
- Интеграция с Fastify (request logging, timing) и с воркером (job/mailing context).

## Правило

В observability не импортируются domain, channels, db, app: только конфиг (env) при необходимости и типы. Никакой бизнес-логики.
