# DEV Steps Log

Текущий рабочий бранч: `dev/isolation-step1`.
Актуальный runtime находится в `src`, прежний runtime перенесен в `___src__old`.

## CANON V2 (источник истины для следующих шагов)

Начиная с этого момента дальнейшая разработка ведется только по схеме:

- `src/app` — технический вход (server/di/routes), без бизнес-логики.
- `src/kernel` — ядро:
  - `contracts` (events/steps/scripts/ports),
  - `eventGateway` (единый вход событий + dedup/rateLimit),
  - `orchestrator` (resolver/runner/policies/scripts),
  - `domain` (executeStep/actions/services/state).
- `src/infra` — инфраструктура (db/dispatch/queue/runtime/observability).
- `src/edges` — внешние края:
  - `integrations/*` (Telegram/Rubitime/SMSC/Calendars и др.).
- `src/config` — конфигурация окружения.
- `src/content` — контент отдельно (если используется; сейчас не выделен).

### Жесткие правила зависимостей (обязательно)

Разрешено:
- `app -> kernel + infra + edges`
- `edges -> kernel/contracts + kernel/eventGateway`
- `kernel/eventGateway -> kernel/contracts + kernel/orchestrator (+ ports via contracts)`
- `kernel/orchestrator -> kernel/contracts + kernel/domain`
- `kernel/domain -> kernel/contracts + ports`
- `infra -> ports + kernel/contracts`

Запрещено:
- `edges -> infra/db/*`
- `kernel/** -> fastify|pg|grammy|http sdk`
- `app/routes -> infra/db/repos` напрямую
- `edges -> kernel/orchestrator` напрямую (только через `eventGateway`)

### Канонический входной путь (для всех источников)

`edge webhook/ingress -> auth/validate/map -> IncomingEvent -> kernel/eventGateway -> dedup -> orchestrator -> domain.executeStep(step, ctx) -> StepResult -> orchestrator next step`

### Роли центра

- Центр потока: `kernel/orchestrator`
- Центр бизнес-правил: `kernel/domain`

Этот файл фиксирует:
- что уже выполнено по шагам из `PLAN.md`;
- какие именно изменения внесены (технически);
- что осталось и в каком порядке безопасно продолжать;
- критерии готовности и проверки перед каждым коммитом.

## Правила выполнения (зафиксировано и соблюдается)

Для каждого атомарного шага:
1. внести ограниченные по области изменения;
2. прогнать:
   - `pnpm run typecheck`
   - `pnpm run lint`
   - `pnpm test`
3. сделать отдельный коммит;
4. обновить `PLAN.md` (журнал);
5. сверить соответствие CANON V2 (раздел выше);
5. не переходить к следующему шагу при красных проверках.
6. держать целевую изоляцию каталогов V2: `src/app`, `src/kernel`, `src/infra`, `src/edges`, `src/content`.

## Пройденные шаги (детально)

### Шаг 0. Контрактный каркас (выполнен)

Цель: зафиксировать универсальные контракты без смены runtime-поведения.

Сделано:
- добавлены доменные контракты:
  - `src/kernel/contracts/events.ts`
  - `src/kernel/contracts/storage.ts`
  - `src/kernel/contracts/schemas.ts`
  - `src/kernel/contracts/orchestrator.ts`
  - `src/kernel/contracts/index.ts`
- введены базовые сущности:
  - `IncomingEvent`, `OutgoingEvent`
  - `DbReadQuery`, `DbWriteMutation`
- добавлены `zod`-схемы для контрактов.

Результат:
- есть единая типизированная модель событий и DB-команд;
- можно мигрировать интеграции поэтапно без большого рефакторинга.

---

### Шаг 1. Наблюдаемость и безопасность (выполнен)

Цель: убрать риск утечки чувствительных данных и добавить трассировку.

Сделано:
- доработан `src/infra/observability/logger.ts`:
  - redaction чувствительных ключей;
  - связка `correlationId` + `eventId`;
  - унификация request-scoped логов.

Результат:
- проще трассировать цепочку обработки;
- чувствительные поля не уходят в логи в открытом виде.

---

### Шаг 2. Telegram как интеграция (выполнен)

Цель: сделать Telegram тонким адаптером.

Сделано:
- добавлены/доработаны адаптеры в `src/integrations/telegram/*`;
- Telegram webhook приводит вход в внутренний event-формат;
- отправка сделана через connector-проекцию исходящих событий.

Результат:
- граница Telegram и домена стала чище;
- доменные правила не завязаны на детали Telegram API.

---

### Шаг 3. Rubitime как inbound connector (выполнен)

Цель: убрать смешивание webhook-валидации, доменной логики и доставки.

Сделано:
- `src/integrations/rubitime/webhook.ts` переведен на inbound-паттерн;
- добавлен `src/integrations/rubitime/connector.ts`;
- сценарии Rubitime маршрутизируются через orchestrator;
- доставка по телефону вынесена в dispatcher (вместо прямого связывания webhook -> Telegram/SMS).

Результат:
- Rubitime больше не принимает архитектурные решения о каналах доставки;
- поведение стало проще расширять под новые коннекторы.

---

### Шаг 4. Orchestrator v1 (выполнен)

Цель: централизовать текущие сценарии в оркестраторе без изменения бизнес-поведения.

Что уже сделано:
- создан `src/kernel/domain/usecases/orchestrateIncomingEvent.ts`;
- Rubitime сценарий формирует `writes` + `outgoing` через унифицированные контракты;
- Telegram main-path идет через `orchestrateIncomingEventWithDeps`;
- ветка linking (`/start <record>` + контакт) перенесена из `telegram/webhook` в оркестратор.
- добавлен fixture-driven тест для Telegram webhook (`01..13` из `e2e/fixtures/telegram`) с mocked deps для контроля 1:1 поведения сценариев.
- добавлен trace `DbReadQuery/DbWriteMutation` для Telegram linking и main-path через tracing-обертки `userPort/notificationsPort`.

Критерии закрытия:
- оркестратор формирует `reads/writes/outgoing` для ключевых Telegram/Rubitime сценариев;
- поведение зафиксировано целевыми тестами (`orchestrateIncomingEvent.test.ts` + `webhook.fixtures.test.ts`) без изменения runtime-семантики.

---

### Структурное выравнивание интеграций (доп. выполненный блок)

Сделано:
- `src/channels/telegram` удален;
- Telegram полностью находится в `src/integrations/telegram`;
- добавлены:
  - `src/integrations/types.ts`
  - `src/integrations/registry.ts`
  - `src/integrations/telegram/index.ts`
  - `src/integrations/rubitime/index.ts`
  - `src/integrations/smsc/index.ts`
- реестр интеграций подключен в runtime (`buildApp`) и логируется при старте.

Результат:
- единая точка учета интеграций;
- классификация `kind`: `messenger` / `system` / `provider`.

---

### Доставка и fallback (частично опережающе выполнено)

Сделано:
- добавлен `src/app/dispatchers/messageByPhone.ts`;
- реализован retry policy через `p-retry`;
- fallback до SMS (через SMSC) уже работает в соответствующих потоках;
- добавлен реальный `src/integrations/smsc/client.ts` + env-конфиг.

Комментарий:
- это функционально относится к шагам 5/6, но уже внедрено безопасно и с проверками.

---

### Шаг 10. Структурная нормализация каталогов (завершен)

Цель: перейти от смешанных импортов к явным слоям `orchestrator` и `ports` без
изменения бизнес-поведения.

Сделано в текущем атомарном шаге:
- целевой orchestration-слой закреплен в `src/kernel/orchestrator`;
- контракты вынесены в `src/kernel/contracts`, реализации портов размещены в `src/infra/*`;
- интеграции переведены на импорты из `src/kernel/*` и `src/infra/*`;
- завершен финальный перенос `src/domain` в `src/kernel`:
  - `src/domain/contracts/*` -> `src/kernel/contracts/*`,
  - `src/domain/{types,webhookContent,phone,ports/*}` -> `src/kernel/domain/*`,
  - `src/domain/usecases/*` + тесты -> `src/kernel/domain/usecases/*`.
- все импорты в `src/*` переключены с `../domain/*` на `../kernel/*`;
- legacy-папка `src/domain` удалена.

Результат:
- слой интеграций перестал напрямую зависеть от `domain/usecases/index` и `app/dispatchers/outgoingEvent`;
- в main runtime (`src/*`) больше нет зависимостей от `src/domain/*`;
- целевая структура `app/kernel/...` для domain-контента реализована, перенос завершен.

## Коммиты текущей серии (ключевые)

- `9dfab09` docs(plan): define canonical isolation roadmap
- `a33b1ba` feat(domain): add unified event and db contract layer
- `c1e15d5` chore(observability): add redaction and request event tracing
- `4c02dd3` refactor(telegram): add connector adapters for event boundaries
- `c1955e2` refactor(rubitime): make webhook an inbound connector with orchestration
- `8366753` refactor(domain): route telegram main flow through orchestrator
- `dbdb525` feat(dispatch): add retrying message-by-phone dispatcher
- `76e6a64` feat(smsc): add real SMSC client with env-based config
- `fa2db99` refactor(structure): unify telegram under integrations layer
- `17963f4` chore(integrations): add typed registry and kind descriptors
- `7e1660b` chore(integrations): wire registry into app startup logs
- `ccad0da` refactor(telegram): move linking branch into orchestrator deps

## Оставшиеся задачи (подробно)

### A) Зачистка переходных каталогов (приоритет: высокий)

Нужно:
- перенести реализации из `src/integrations/*` в `src/edges/integrations/*` (inbound) и/или `src/infra/dispatch/*` (outbound);
- убрать re-export-слой в `src/edges/*`, заменить импорты на новые пути;
- перевести все импорты с `src/observability/*` на `src/infra/observability/*` и удалить legacy `src/observability` (выполнено);
- удалить `src/orchestrator` после подтверждения отсутствия импортов.

Критерий завершения:
- `src/integrations` и `src/orchestrator` не используются и удалены.

### B) Перевод app/routes на edges handlers (приоритет: высокий)

Нужно:
- `GET /health` оставить в app;
- `POST /webhook/telegram` -> `edges/integrations/telegram/webhook.ts`;
- `POST /webhook/rubitime/:token` -> `edges/integrations/rubitime/webhook.ts`;
- `GET /api/rubitime` -> `edges/integrations/rubitime/reqSuccessIframe.ts`.

Критерий завершения:
- app только регистрирует route -> edge handler, без бизнес-ветвлений.

### C) Единый вход всех событий через eventGateway (приоритет: высокий)

Нужно:
- webhook handlers вызывают только `eventGateway.handleIncoming(event)`;
- scheduler/retry runtime тоже отправляют события через `eventGateway`.

Критерий завершения:
- нет прямых вызовов orchestrator из edges.

### 1) Завершить Шаги 5/6 формально (приоритет: высокий)

Нужно:
- унифицировать dispatch исходящих сообщений через общий dispatcher-интерфейс;
- расширить журнал попыток доставки (временные/фатальные ошибки);
- проверить, что fallback-policy определяется в домене, а не в интеграциях.

Критерий завершения:
- единый путь исходящей отправки по `OutgoingEvent`;
- диагностируемость причин недоставки и ретраев.

### 2) Шаг 7 — Scheduler как `IncomingEvent(schedule.tick)` (приоритет: средний)

Нужно:
- вынести cron-поведение в генерацию входящих событий;
- запретить scheduler-логике прямую отправку в каналы.

Критерий завершения:
- scheduler вызывает только orchestrator.

### 3) Шаг 8 — Заглушки будущих коннекторов (приоритет: средний)

Нужно:
- шаблоны для `VK`, `Max`, `Instagram`, `Email`, `Google/Yandex Calendar`;
- сразу фиксировать формат адаптера (inbound/outbound + descriptor + kind);
- использовать официальные SDK там, где доступны и целесообразны.

Критерий завершения:
- новый коннектор добавляется без изменений доменного ядра.

### 4) Шаг 9 — Админка (после стабилизации событийной модели)

Нужно:
- сначала read-only: метрики, логи, ошибки доставки;
- затем управление настройками и интеграциями через API.

Критерий завершения:
- управление идет через API и оркестратор, без обходных прямых путей.

### 5) Шаг 10 — Структурная нормализация каталогов (приоритет: высокий)

Нужно:
- убрать остаточные переходные папки и импорты;
- оставить целевой путь обработки:
  `incoming -> middleware -> router -> eventGateway -> orchestrator -> domain -> infra`.

Критерий завершения:
- структура соответствует V2 без legacy-слоев.

## Безопасный порядок дальнейшего движения

1. Формально выровнять `Шаги 5/6` под общий dispatch pipeline.
2. Выполнить структурную нормализацию каталогов (`Шаг 10`) без изменения поведения.
3. Подключить scheduler (`Шаг 7`) через `schedule.tick`.
4. Добавить шаблоны новых интеграций (`Шаг 8`).
5. После стабилизации переходить к админке (`Шаг 9`).

## Текущее состояние

- Рабочее дерево на момент создания файла: ожидаются только новые правки текущего шага.
- Базовая изоляция интеграций достигнута.
- Главный незакрытый риск: наличие переходного слоя `src/integrations`.

## Журнал выполнения (V2)

- 2026-02-27: Начата миграция к CANON V2 в `src`: добавлен `kernel` каркас (`contracts`, `eventGateway`, `orchestrator`, `domain`) и переключен `src/app/di.ts` на `kernel`-контракты/`createEventGateway`.
- 2026-02-27: Для безопасной инкрементальной миграции добавлены совместимые фасады `src/domain/*` -> re-export из `kernel/*`.
- 2026-02-27: Добавлены V2-слои `src/infra/*` и `src/edges/*` (фасады и каркасы), `app`-импорты переведены на `src/config`, `infra/db`, `infra/observability`, `edges/registry`, `edges/integrations/smsc`.
- 2026-02-27: Реализованы `edges` webhook handlers для Telegram/Rubitime по цепочке `auth -> validate -> map -> eventGateway`, `app/di` подключен к `edges/*` регистраторам по умолчанию.
- 2026-02-27: Обязательные проверки шага пройдены: `typecheck`, `lint`, `test` — зеленые.
- 2026-02-27: `GET /api/rubitime` переведен на edge-wiring: добавлен `registerRubitimeIframeEdgeRoute` и подключен по умолчанию в `app/di`.
- 2026-02-27: Повторный прогон обязательных проверок после edge-iframe wiring: `typecheck`, `lint`, `test` — зеленые.
- 2026-02-27: Убран `noopOrchestrator` из `src/app/di.ts`: по умолчанию подключен реальный `createOrchestrator()` из `kernel/orchestrator`.
- 2026-02-27: Реализован базовый исполняемый контур `resolver -> runner -> domain.executeStep` с первым действием `event.log` (формирует `DbWriteMutation`), проверки `typecheck`, `lint`, `test` — зеленые.
- 2026-02-27: Введен `kernel/domain/actions` registry: добавлены первые обработчики `event.log`, `booking.upsert`, `message.send`.
- 2026-02-27: `kernel/domain/executeStep` переведен на выполнение через action-registry; `resolver` добавляет прикладные шаги для Rubitime webhook, `runner` агрегирует эффекты шагов.
- 2026-02-27: Проверки после шага action-registry: `typecheck`, `lint`, `test` — зеленые.
- 2026-02-27: Подключены default `infra` порты в `src/app/di.ts`: `createDbWritePort`, `createDefaultDispatchPort`, `createInMemoryIdempotencyPort`; gateway теперь применяет writes/outgoing end-to-end по умолчанию.
- 2026-02-27: Формализован Шаг 5/6 (первый контур): `kernel/domain/executeStep` задает fallback policy для `message.send` (`delivery.channels`, `delivery.maxAttempts`), `infra/dispatch/default.ts` выполняет `channels -> retry -> fallback` и пишет `delivery.attempt.log` через `DbWritePort`.
- 2026-02-27: Подключен реальный Telegram outbound в dispatch pipeline: `infra/dispatch/default.ts` использует `integrations/telegram/client` для `telegram` канала, затем fallback до `smsc`.
- 2026-02-27: `delivery.attempt.log` переведен на persistent storage: `infra/db/repos/messageLogs.ts` пишет в таблицу `delivery_attempt_logs`, добавлена миграция `migrations/010_add_delivery_attempt_logs.sql`.
- 2026-02-27: `scheduler/retry runtime` переведен на единый вход: `infra/runtime/scheduler.ts` и `infra/runtime/worker.ts` формируют только `IncomingEvent(schedule.tick)` и передают события в `eventGateway` (без прямого dispatch в каналы).
- 2026-02-27: Добавлены шаблоны будущих edge-коннекторов в `src/edges/integrations/*`: `vk`, `max`, `instagram`, `email`, `calendar`, а также общий шаблон `template.ts` (`inbound/outbound + descriptor`); `edges/registry.ts` расширен новыми дескрипторами.
- 2026-02-27: Начат финальный блок Шага 10: удалены фасады `src/domain/contracts/*`, `src/domain/eventGateway.ts`, `src/domain/index.ts`; импорты `src/integrations/{rubitime,telegram}/connector.ts` переведены на `kernel/contracts`.
- 2026-02-27: Завершена структурная нормализация `src/domain`: типы и порты перенесены в `kernel/domain/{types,ports/*}`, импорты `integrations/telegram/*` и `db/repos/telegramUsers.ts` переключены на `kernel/domain/*`, legacy `src/domain/*` удален.
- 2026-02-27: Добавлен read-only admin edge-слой: `edges/admin/routes.ts` (`GET /admin/metrics`, `GET /admin/logs/delivery`), wired в `app/di.ts` и `app/routes.ts`.
- 2026-02-27: Плановые Шаги 5-10 формально закрыты в `PLAN.md`; проверки `typecheck`, `lint`, `test` после полного прогона — зеленые.
- 2026-02-27: Финальный перенос main runtime `src/domain` -> `src/kernel` завершен: добавлены `src/kernel/contracts/*` и `src/kernel/domain/*` (types/ports/usecases/tests), все импорты `src/*` переключены на `kernel/*`, папка `src/domain` удалена, проверки `typecheck`, `lint`, `test` — зеленые.
