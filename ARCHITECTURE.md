# Архитектура BersonCareBot

## ГЛАВНЫЙ ЖЕСТКИЙ КОНТРАКТ ИНТЕГРАЦИЙ

### Базовое правило

Уникальные для интеграции поля, структуры payload, таблицы, колонки и transport-specific детали известны только в двух местах:

1. **слой интеграции** — где внешний payload валидируется, нормализуется и превращается в универсальное событие;
2. **content-сценарии** — где эти данные могут использоваться как **нормализованные ключи условий и параметров**.

Все остальные слои работают с такими данными **только как с generic context data** и не знают:
- из какой интеграции они пришли;
- что они означают в терминах конкретного канала;
- как они хранятся во внешней БД/SDK/webhook payload.

### Жесткие запреты

#### Интеграции

Разрешено:
- валидировать внешний payload;
- мапить payload в `IncomingEvent`;
- прикладывать набор нормализованных context facts / context data;
- исполнять исходящие transport-specific intents.

Запрещено:
- выбирать бизнес-сценарий;
- знать orchestrator-ветвления;
- принимать бизнес-решения вместо content/kernel;
- прошивать сценарную логику в webhook handler.

#### App / Pipeline

Разрешено:
- wiring зависимостей;
- запуск pipeline;
- проброс портов и данных вниз.

Запрещено:
- интерпретировать интеграционные поля в бизнес-смысле;
- принимать решения по меню / booking / notifications;
- подменять orchestrator/domain.

#### Orchestrator

Разрешено:
- видеть только универсальный контейнер данных;
- матчить `event`, `input`, `context`, `meta`, `values`, `facts` по ключам и значениям;
- подставлять данные в шаги сценария;
- выбирать script plan.

Запрещено:
- знать transport/business смысл интеграционных ключей;
- читать raw payload интеграции как часть бизнес-логики;
- знать таблицы/поля БД конкретной интеграции;
- содержать hardcoded knowledge про booking, calendar, widget, telegram-menu.

#### Domain / Executor

Разрешено:
- исполнять generic actions;
- пользоваться портами;
- готовить `DbWriteMutation`, `OutgoingIntent`, `DeliveryJob`;
- переносить execution-state внутри одного сценария.

Запрещено:
- знать схему webhook payload интеграции;
- знать названия таблиц/колонок интеграционной БД;
- хранить в `values` infra-объекты, SDK, adapter instances.

#### Infra / DB / Dispatch

Разрешено:
- реализовывать порты ядра;
- хранить интеграционно-специфичные таблицы и колонки;
- мапить generic port-запросы в конкретную схему хранения/доставки.

Запрещено:
- принимать сценарные решения;
- тащить бизнес-ветвления в infra adapters.

### Правило для БД

Интеграционно-специфичные таблицы и поля остаются на стороне `infra`/integration-specific adapters.

Ядро работает только через порт:
- по generic query/mutation типу;
- по значениям ключей, пришедших в универсальном контексте;
- без знания имен таблиц, колонок и схемы хранения.

---

Цель: все входящие события обрабатываются единым pipeline, а бизнес-логика живет в `kernel`, не в webhook-адаптерах.

## Слои

- `src/app`
  - composition root (`di.ts`)
  - сборка приложения и wiring зависимостей
  - регистрация HTTP routes

- `src/config`
  - `env.ts` — секреты и env-переменные
  - `appSettings.ts` — неcекретные runtime-настройки

- `src/content`
  - source-bundles (`telegram`, `rubitime`, ...)
  - `scripts.json` и `templates.json`
  - content описывает сценарии, но не исполняет их

- `src/kernel`
  - контракты (`contracts`)
  - content registry contracts + loading schema
  - event gateway (`eventGateway`)
  - orchestrator (`orchestrator`)
  - domain actions / executor / use cases (`domain`)

- `src/infra`
  - реализации портов (`adapters`)
  - БД (`db`, `repos`, `readPort`, `writePort`)
  - dispatch в каналы (`adapters/dispatchPort.ts`)
  - runtime workers / scheduler (`runtime`)
  - logging / observability

- `src/integrations`
  - внешние адаптеры Telegram / Rubitime / SMSC / др.
  - schema validation
  - `mapIn` / `connector` / `mapOut` / delivery adapters

## Смысловые задачи по слоям

- **Integrations**
  - перевести внешний payload в универсальный `IncomingEvent`;
  - приложить нормализованные данные контекста;
  - исполнить transport-specific исходящие intents.

- **App**
  - связать зависимости;
  - собрать pipeline;
  - не принимать бизнес-решения.

- **Kernel / EventGateway**
  - технически принять событие;
  - проверить envelope, rate-limit, dedup/idempotency;
  - передать событие в pipeline.

- **Kernel / Orchestrator**
  - выбрать сценарий;
  - собрать plan шагов из content.

- **Kernel / Domain**
  - выполнить шаги плана;
  - подготовить generic записи в БД, intents и jobs.

- **Infra**
  - реализовать БД, dispatch, queue, worker, scheduler.

## Основной pipeline

Актуальная цепочка:

`IncomingEvent -> EventGateway -> IncomingEventPipeline -> Domain use case -> Orchestrator(build plan) -> Executor -> DbWrite / Queue / Dispatch`

Подробно:

1. Интеграционный adapter валидирует и нормализует внешний вход.
2. Упаковывает его в `IncomingEvent`.
3. `eventGateway` делает технические проверки:
   - envelope validation;
   - rate limit;
   - dedup/idempotency.
4. `incomingEventPipeline` передает событие в domain use case.
5. Domain use case вызывает `orchestrator.buildPlan()`.
6. `orchestrator` выбирает content-script и возвращает список generic шагов (правило выбора: `priority` и `specificity`, см. `docs/ARCHITECTURE/CONTENT_AND_SCRIPTS_FLOW.md`).
7. Domain executor преобразует шаги в:
   - `DbWriteMutation`
   - `OutgoingIntent`
   - `DeliveryJob`
8. `writePort` применяет мутации.
9. `dispatchPort` отправляет intents в transport adapters.
10. `runtime/worker` обрабатывает queued jobs.

## Правила изоляции

Разрешено:

- `app -> kernel + infra + integrations + config`
- `integrations -> kernel/contracts + kernel/eventGateway`
- `kernel/*` зависит только от контрактов, content-моделей и портов
- `infra/*` реализует порты и не содержит сценарных решений
- `content` хранит условия и шаги сценариев, но не исполняет их

Запрещено:

- `integrations -> infra/db/repos/*` напрямую
- `kernel/* -> fastify|pg|grammy` напрямую
- бизнес-ветвления в webhook handlers
- knowledge про конкретные интеграционные таблицы/поля внутри `kernel`
- хранение adapter/infra objects внутри scenario execution state (`values`)

## Runtime процессы

- `src/main.ts`
  - HTTP API
  - webhooks
  - health endpoints

- `src/infra/runtime/worker/main.ts`
  - обработка delivery/runtime jobs

- `src/infra/runtime/scheduler/main.ts`
  - production: systemd **`bersoncarebot-scheduler-prod.service`** (`deploy/systemd/bersoncarebot-scheduler-prod.service`); цикл `schedule.tick` → напоминания и др. сценарии из `content/scheduler/scripts.json`

## Webapp: операции с БД вне UI (скрипты, ручной SQL)

Сервис `apps/webapp` хранит идентичность и **доверие к телефону** для tier **patient** в PostgreSQL (`platform_users.phone_normalized` и `patient_phone_trust_at`). Произвольные правки в обход приложения не проходят через закрытый перечень trusted writers в коде.

- **Правила для агентов и операторов:** [`apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md`](apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md) (порядок действий, когда выставлять доверие, предпочтение готовых инструментов вроде `user-phone-admin.ts` и продуктового merge).
- **Продуктовая карта и enum trusted paths:** [`docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`](docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md) §8.
- **Оглавление папки скриптов:** [`apps/webapp/scripts/README.md`](apps/webapp/scripts/README.md).

## Deploy model

**Текущая модель (host):** Node.js на сервере, системный PostgreSQL, systemd, nginx. Бэкап БД перед миграциями, деплой через `deploy/host/deploy-prod.sh`. Подробно: `deploy/HOST_DEPLOY_README.md`.

## Текущие отклонения от жесткого контракта

### ⚠ Отклонение 1. Transport/delivery knowledge частично живет в content

Сейчас в `src/content/*/scripts.json` есть признаки transport-specific логики:
- transport event names вроде `callback.received`, `webhook.received`;
- transport/UI actions вроде `message.replyKeyboard.show`, `message.inlineKeyboard.show`, `callback.answer`;
- delivery-поля вроде `delivery.channels`, `retry`, `onFail`.

Дефолты политики доставки по source задаются через порт `DeliveryDefaultsPort` (реализация в infra); ядро их не содержит. Явные `delivery`/`retry`/`onFail` в сценариях по-прежнему допустимы. Целевая чистая модель: сценарии только generic intent/data, вся delivery policy вне content.

### ~~⚠ Отклонение 3. Scheduler есть в коде, но не запущен как отдельный сервис~~ (устранено)

Ранее отдельный systemd-юнит для `src/infra/runtime/scheduler/main.ts` не был частью host-deploy. Сейчас канонический unit: **`bersoncarebot-scheduler-prod.service`** (`deploy/systemd/bersoncarebot-scheduler-prod.service`), установка и restart — `deploy/host/bootstrap-systemd-prod.sh` / `deploy/host/deploy-prod.sh` (см. `docs/ARCHITECTURE/SERVER CONVENTIONS.md`).

*(Отклонения 2 и 4 устранены: eventGateway — только idempotencyPort и pipeline; дефолты доставки вынесены в порт `DeliveryDefaultsPort`, реализация в infra, ядро не знает имён каналов.)*
