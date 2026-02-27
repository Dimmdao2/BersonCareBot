# Архитектура BersonCareBot (канон изоляции)

Цель: все внешние входы/выходы идут через единый событийный pipeline, без
вшитой бизнес-логики в интеграциях.

## Канонический pipeline

`IncomingEvent -> middleware(valid,safe) -> router -> orchestrator -> script resolution -> domain logic -> readDb/writeDb -> dispatch OutgoingEvent -> delivery status -> logs/retry/branch update`

Где `IncomingEvent` и `OutgoingEvent` универсальны для любых источников:
- `Event.source`: `telegram` / `rubitime` / `calendar` / etc.
- `Event.type`: `message` / `service` / `calendar` / etc.
- `Event.data`: payload в унифицированной структуре (phone/status/metadata).

## Целевая структура папок

- `src/integrations`
  Только адаптеры внешних систем: прием webhook/SDK callback, валидация, mapping в `IncomingEvent`, отправка `OutgoingEvent` в конкретный SDK/API.

- `src/orchestrator`
  Центральная маршрутизация событий, выбор сценария (script), координация ветвлений и вызов портов.

- `src/domain`
  Чистые бизнес-правила и шаги сценариев без SDK/Fastify/pg зависимостей.

- `src/ports`
  Контракты взаимодействия (`readDb`, `writeDb`, dispatchers, внешние сервисы).

- `src/db`
  Реализация портов БД, репозитории/миграции/клиент.

## Границы зависимостей (обязательно)

- `integrations` не знают бизнес-ветвления: только parse/validate/map/dispatch.
- `domain` не знает про Telegram/Fastify/pg/HTTP.
- `orchestrator` знает сценарии и вызывает только порты.
- `db` не знает про интеграции и UI; только реализация `DbReadQuery`/`DbWriteMutation`.
- fallback/retry policy определяется в orchestration/domain, а не в интеграции.

## Сценарий обработки (детально)

1. Интеграция принимает вход (`webhook`, callback, cron tick).
2. Middleware делает safety-checks (schema validation, auth/token, normalization).
3. Router передает событие в orchestrator как `IncomingEvent`.
4. Orchestrator определяет script по `source/type/data`.
5. Domain исполняет логические ветки сценария.
6. Через `readDb` читаются нужные состояния.
7. Формируются `DbWriteMutation` и `OutgoingEvent`.
8. Через dispatcher отправляются сообщения/webhook-и.
9. Получается статус доставки (success/retry/fail).
10. Пишутся логи и при необходимости обновляется состояние в БД.

## Текущий курс миграции

- Проект находится в переходе к этому канону.
- Все новые изменения должны усиливать изоляцию в направлении структуры:
  `domain + db + orchestrator + ports + integrations`.
