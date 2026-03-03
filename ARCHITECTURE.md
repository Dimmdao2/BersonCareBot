# Архитектура BersonCareBot (канон изоляции)

Цель: все внешние входы/выходы идут через единый событийный pipeline, без
вшитой бизнес-логики в интеграциях.

## Канонический pipeline

`IncomingEvent -> middleware(valid,safe) -> router -> orchestrator -> script resolution -> domain logic -> readDb/writeDb -> dispatch OutgoingEvent -> delivery status -> logs/retry/branch update`

Где `IncomingEvent` и `OutgoingEvent` универсальны для любых источников:
- `Event.source`: `telegram` / `rubitime` / `calendar` / etc.
- `Event.type`: `message` / `service` / `calendar` / etc.
- `Event.data`: payload в унифицированной структуре (phone/status/metadata).

## Целевая структура папок (V2)

- `src/app`
  Технический вход: server/di/routes, без бизнес-логики.

- `src/kernel`
  Центр домена и сценариев:
  `contracts`, `eventGateway`, `orchestrator`, `domain`.

- `src/infra`
  Реализация портов: `db`, `dispatch`, `queue`, `runtime`, `observability`.

- `src/edges`
  Внешние края (webhook-и/SDK адаптеры):
  `integrations/*`.

- `src/config`
  Конфигурация окружения (env) находится в общем слое.

## Переходные каталоги (текущее состояние)

- `src/integrations`
  Общие реализации SDK/мэппинг/коннекторы, от которых пока зависят `edges` и `infra`.
  Цель: переехать в `src/edges/integrations` (и/или `infra` для outbound).

- `src/observability`
  Удалено; актуальное логирование находится в `src/infra/observability`.

- `src/orchestrator`
  Остаточный слой от старой схемы; в V2 заменяется `src/kernel/orchestrator`.

- `___src__old`
  Архив прежнего runtime до миграции.

## Границы зависимостей (обязательно)

Разрешено:
- `app -> kernel + infra + edges`
- `edges -> kernel/contracts + kernel/eventGateway`
- `kernel/eventGateway -> kernel/contracts + kernel/orchestrator`
- `kernel/orchestrator -> kernel/contracts + kernel/domain`
- `kernel/domain -> kernel/contracts + ports`
- `infra -> ports + kernel/contracts`

Запрещено:
- `edges -> infra/db/*`
- `kernel/** -> fastify|pg|grammy|http sdk`
- `app/routes -> infra/db/repos` напрямую
- `edges -> kernel/orchestrator` напрямую (только через gateway)

Дополнительно:
- fallback/retry policy определяется в `kernel` (domain/orchestrator), а не в edges.

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
