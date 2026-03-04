# Архитектура BersonCareBot

Цель: все входящие события обрабатываются единым pipeline, а бизнес-логика живет в `kernel`, не в webhook-адаптерах.

## Слои

- `src/app`
  - composition root (`di.ts`)
  - регистрация HTTP routes
  - wiring портов и runtime

- `src/kernel`
  - контракты (`contracts`)
  - event gateway (`eventGateway`)
  - orchestrator (`orchestrator`)
  - domain actions/usecases (`domain`)

- `src/infra`
  - БД (`db`, `repos`, `writePort`)
  - dispatch в каналы (`dispatch`)
  - runtime workers (`runtime`)
  - logging/observability

- `src/integrations`
  - внешние адаптеры Telegram/Rubitime/SMSC
  - mapIn/mapOut, schema validation

- `src/config`
  - `env.ts` — секреты и env-переменные
  - `appSettings.ts` — несеkретные runtime-настройки (poll/retry delays)

## Основной pipeline

`IncomingEvent -> EventGateway -> Orchestrator(resolve script) -> Domain actions -> DbWrite/Dispatch`

Подробно:

1. Webhook-adapter валидирует и нормализует вход.
2. Пакует в `IncomingEvent`.
3. `eventGateway` делает safety checks (rate-limit, dedup/idempotency, debug-forward).
4. `orchestrator` строит скрипт шагов (`event.log`, `booking.upsert`, `message.send`, и т.д.).
5. `domain` преобразует шаги в `DbWriteMutation` и `OutgoingIntent`.
6. `writePort` применяет мутации в БД.
7. `dispatchPort` отправляет в Telegram/SMSC с fallback/retry политикой.

## Правила изоляции

Разрешено:

- `app -> kernel + infra + integrations`
- `integrations -> kernel/contracts + kernel/eventGateway`
- `kernel/*` зависит только от контрактов/портов
- `infra/*` реализует порты и не содержит сценарных решений

Запрещено:

- `integrations -> infra/db/repos/*` напрямую
- `kernel/* -> fastify|pg|grammy` напрямую
- бизнес-ветвления в webhook handlers

## Rubitime delivery logic (текущее поведение)

- `event-create-record`:
  - при linked Telegram: immediate Telegram
  - при отсутствии link: enqueue delayed retry job
    - 2 попытки проверки привязки, раз в минуту
    - если link появился -> Telegram
    - если нет -> SMS fallback

- `event-remove-record` и `event-update-record`:
  - без ожидания
  - immediate отправка в доступный канал (Telegram либо SMS fallback)

## Runtime процессы

- `main.ts` — HTTP API (webhooks + health + iframe endpoint)
- `main-worker.ts` — фоновые задачи:
  - `schedule.tick`
  - обработка delayed Rubitime create retry jobs

## Deploy model

- Docker Compose services: `api_blue`, `api_green`, `worker`, `admin`, `db`
- Nginx переключает трафик между `3001` (blue) и `3002` (green)
- Deploy script:
  - build candidate slot
  - run migrations
  - health check
  - switch Nginx proxy
  - update current slot marker
