# DEV Steps Log

Текущий рабочий бранч: `dev/isolation-step1`.

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
5. не переходить к следующему шагу при красных проверках.

## Пройденные шаги (детально)

### Шаг 0. Контрактный каркас (выполнен)

Цель: зафиксировать универсальные контракты без смены runtime-поведения.

Сделано:
- добавлены доменные контракты:
  - `src/domain/contracts/events.ts`
  - `src/domain/contracts/storage.ts`
  - `src/domain/contracts/schemas.ts`
  - `src/domain/contracts/orchestrator.ts`
  - `src/domain/contracts/index.ts`
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
- доработан `src/observability/logger.ts`:
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

### Шаг 4. Orchestrator v1 (частично выполнен, в работе)

Цель: централизовать текущие сценарии в оркестраторе без изменения бизнес-поведения.

Что уже сделано:
- создан `src/domain/usecases/orchestrateIncomingEvent.ts`;
- Rubitime сценарий формирует `writes` + `outgoing` через унифицированные контракты;
- Telegram main-path идет через `orchestrateIncomingEventWithDeps`;
- ветка linking (`/start <record>` + контакт) перенесена из `telegram/webhook` в оркестратор.

Что еще не закрыто:
- довести Telegram-поток до полного отражения через `DbReadQuery/DbWriteMutation`;
- добавить fixture/e2e покрытие для оркестрационных Telegram-сценариев;
- зафиксировать критерий “поведение 1:1” через тестовые фикстуры.

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

### 1) Закрыть Шаг 4 полностью (приоритет: высокий)

Нужно:
- довести Telegram сценарии до прозрачного `reads/writes/outgoing` следа в orchestrator;
- минимизировать “скрытые” DB-операции вне контрактов;
- добавить fixture-тесты для сценариев:
  - `/start` без параметров;
  - `/start <record>` + контакт;
  - конфликт привязки телефона;
  - повторный update (dedup).

Критерий завершения:
- оркестратор выдает полный план операций по ключевым Telegram-сценариям;
- тесты подтверждают неизменность пользовательского поведения.

### 2) Завершить Шаги 5/6 формально (приоритет: высокий)

Нужно:
- унифицировать dispatch исходящих сообщений через общий dispatcher-интерфейс;
- расширить журнал попыток доставки (временные/фатальные ошибки);
- проверить, что fallback-policy определяется в домене, а не в интеграциях.

Критерий завершения:
- единый путь исходящей отправки по `OutgoingEvent`;
- диагностируемость причин недоставки и ретраев.

### 3) Шаг 7 — Scheduler как `IncomingEvent(schedule.tick)` (приоритет: средний)

Нужно:
- вынести cron-поведение в генерацию входящих событий;
- запретить scheduler-логике прямую отправку в каналы.

Критерий завершения:
- scheduler вызывает только orchestrator.

### 4) Шаг 8 — Заглушки будущих коннекторов (приоритет: средний)

Нужно:
- шаблоны для `VK`, `Max`, `Instagram`, `Email`, `Google/Yandex Calendar`;
- сразу фиксировать формат адаптера (inbound/outbound + descriptor + kind);
- использовать официальные SDK там, где доступны и целесообразны.

Критерий завершения:
- новый коннектор добавляется без изменений доменного ядра.

### 5) Шаг 9 — Админка (после стабилизации событийной модели)

Нужно:
- сначала read-only: метрики, логи, ошибки доставки;
- затем управление настройками и интеграциями через API.

Критерий завершения:
- управление идет через API и оркестратор, без обходных прямых путей.

## Безопасный порядок дальнейшего движения

1. Дозакрыть `Шаг 4` (полный traceset операций + fixture tests).
2. Формально выровнять `Шаги 5/6` под общий dispatch pipeline.
3. Подключить scheduler (`Шаг 7`) через `schedule.tick`.
4. Добавить шаблоны новых интеграций (`Шаг 8`).
5. После стабилизации переходить к админке (`Шаг 9`).

## Текущее состояние

- Рабочее дерево на момент создания файла: ожидаются только новые правки текущего шага.
- Базовая изоляция интеграций достигнута.
- Главный незакрытый риск: неполная формализация Telegram DB-read/write через контракты на уровне оркестратора.
