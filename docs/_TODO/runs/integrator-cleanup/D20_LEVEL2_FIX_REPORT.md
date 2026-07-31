# D20 уровень 2 · отчёт по закрытию находок аудита F1–F7

Бриф: `worker-d20-level2-fix`. Аудит: `docs/_TODO/runs/integrator-cleanup/D20_LEVEL2_AUDIT.md`.

Продуктовый код не менялся: `git diff --stat -- 'apps/integrator/src/**/*.ts'` после всех правок
затрагивает только шесть `*.test.ts` файлов (см. итог внизу). Для каждой находки поломка вносилась
в продуктовый код руками, прогонялась, подтверждала красный тест, затем откатывалась — диффа на
продуктовом файле после отката нет (`git diff --stat` по нему пуст).

## Таблица F1–F7

| # | Статус | Файл теста | Поломка (файл:строка, что менялось) | Вывод прогона ДО отката (красный) | Подтверждение отката (зелёный / diff пуст) |
|---|---|---|---|---|---|
| **F1** | Закрыто | `infra/db/repos/notificationDeliveryAttempts.test.ts` — в оба теста скипов добавлено ожидание `status: 'skipped'` | `notificationDeliveryAttempts.ts:76` — `${input.status}` заменено на литерал `${'success'}` | 2 из 6 тестов красные: `AssertionError: … "status": "success"` вместо `"skipped"` в обоих describe-блоках скипов | Правка отменена; `vitest run notificationDeliveryAttempts.test.ts` → 6/6 passed; `git diff --stat` на `notificationDeliveryAttempts.ts` пуст |
| **F2** | Закрыто | `infra/runtime/worker/outgoingDeliveryWorker.finalize.test.ts` — добавлен третий тест (`attemptCount:1, maxAttempts:6`, обработка падает, финализация жива) плюс трекинг `rescheduledOk` в harness | `outgoingDeliveryWorker.ts:116-120` (`finalizeClaimedRowFailure`) — убрана ветка `if (attemptCount >= maxAttempts)`, финализация всегда шла в `queueMarkDead` | Новый (3-й) тест красный: `expected [] to deeply equal ["e0000…e"]` на `h.rescheduledOk` — строка ушла в `dead` вместо `failed_retryable`; два прежних теста остались зелёными | Правка отменена; `vitest run outgoingDeliveryWorker.finalize.test.ts` → 3/3 passed; `git diff --stat` на `outgoingDeliveryWorker.ts` пуст |
| **F3** | Закрыто | `kernel/domain/usecases/processAcceptedIncomingEvent.test.ts` — в первый тест добавлено `err: expect.objectContaining({ message: 'provider unreachable' })` | `processAcceptedIncomingEvent.ts:54-64` — из объекта `logger.warn(...)` убрано поле `err` (переменная `err` удалена вместе с использованием) | Тест красный: diff показывает пропавшее поле `err` в фактическом вызове `logger.warn` (осталось только `dispatchFailureCount`/… из другого, сводного, вызова — первый ожидаемый вызов не найден) | Правка отменена; `vitest run processAcceptedIncomingEvent.test.ts` → 3/3 passed (до добавления F4-теста); `git diff --stat` пуст |
| **F4** | Закрыто | `kernel/domain/usecases/processAcceptedIncomingEvent.test.ts` — добавлен четвёртый тест: `executeAction` бросает → ожидание `.rejects.toThrow('executor blew up')` | `processAcceptedIncomingEvent.ts:33` — вызов `await handleIncomingEvent(...)` обёрнут в try/catch, на ошибке возвращающий пустой `domainResult` вместо проброса | Новый (4-й) тест красный: `promise resolved "undefined" instead of rejecting` | Правка отменена; `vitest run processAcceptedIncomingEvent.test.ts` → 4/4 passed; `git diff --stat` пуст |
| **F5** | Закрыто | `kernel/eventGateway/dedup.test.ts` — добавлен тест: fingerprint с `replyTo: null` против того же без поля → ключи должны различаться | `dedup.ts:13` — фильтр `value !== undefined` заменён на `value !== undefined && value !== null` (буквально поломка, названная в аудите) | Новый тест красный: `expected '…' not to be '…'` — ключи совпали | Правка отменена; `vitest run dedup.test.ts` → 6/6 passed; `git diff --stat` пуст |
| **F6** | Закрыто | `kernel/eventGateway/eventGateway.test.ts` — добавлен 7-й тест: передаёт `options.runPipeline`, требует и вызова обёртки, и того, что pipeline реально выполнился ВНУТРИ неё | `eventGateway/index.ts:67` — `await (options?.runPipeline ? options.runPipeline(runPipeline) : runPipeline())` заменено на голый `await runPipeline()` | Новый (7-й) тест красный: `expected false to be true` на `wrapperInvoked`; остальные 6 тестов остались зелёными | Правка отменена; `vitest run eventGateway.test.ts` → 7/7 passed; `git diff --stat` пуст |
| **F7** | Закрыто | `infra/adapters/deliveryTargetsPort.test.ts` — добавлен тест: `telegramId: '   '` (одни пробелы) не становится целью | `deliveryTargets.ts:35` — условие `id.trim().length > 0` заменено на `id.length > 0` (сам `.trim()` при формировании `externalId` оставлен) | Новый тест красный: `telegram` с `externalId: ''` появился в списке целей вместо ожидаемого только `max` | Правка отменена; `vitest run deliveryTargetsPort.test.ts` → 16/16 passed; `git diff --stat` пуст |

Для каждой находки: поломка вносилась ИМЕННО той правкой, что назвал аудит (или её точный эквивалент,
где аудит указывал строку приблизительно), прогонялась узким файлом теста, затем отменялась тем же
редактированием обратно (не `git checkout`, т.к. рядом уже стояли правки тестов в том же файле —
проверено построчным diff `git diff --stat` по продуктовому `.ts`-файлу: пусто после отмены).

## Границы

- Продуктовый код не менялся ни в одном из семи случаев — все правки только в тестах. F1–F7 не
  потребовали правки поведения: во всех случаях поведение уже соответствовало карте, тестам просто
  не хватало ассерта/сценария.
- Остальные тесты уровня 2 не переписывались, уровни 0/1/3 не трогались.
- Развилок не возникло: все семь пунктов закрылись без необходимости расширять требования сверх
  того, что назвал аудит.

## Итоговый прогон интегратора

Команда: `pnpm --dir apps/integrator exec vitest run`

| | Test Files | Tests |
|---|---|---|
| До (baseline, начало сессии) | 20 passed \| 3 skipped (23) | 125 passed \| 9 skipped (134) |
| После (все правки применены, поломки отменены) | 20 passed \| 3 skipped (23) | 130 passed \| 9 skipped (139) |

+5 тестов: по одному новому в F2, F4, F5, F6, F7 (F1 и F3 расширили ассерты существующих тестов,
новых `it` не добавляли).

`git diff --stat -- 'apps/integrator/src/**/*.ts'` (после всех правок и откатов поломок) —
6 изменённых файлов, все `*.test.ts`:

```
 .../src/infra/adapters/deliveryTargetsPort.test.ts |  9 ++++
 .../db/repos/notificationDeliveryAttempts.test.ts  | 18 +++++---
 .../worker/outgoingDeliveryWorker.finalize.test.ts | 51 +++++++++++++++++++++-
 .../usecases/processAcceptedIncomingEvent.test.ts  | 23 ++++++++++
 .../src/kernel/eventGateway/dedup.test.ts          | 26 +++++++++++
 .../src/kernel/eventGateway/eventGateway.test.ts   | 32 ++++++++++++++
 6 files changed, 153 insertions(+), 6 deletions(-)
```

Продуктовые файлы (`notificationDeliveryAttempts.ts`, `outgoingDeliveryWorker.ts`,
`processAcceptedIncomingEvent.ts`, `dedup.ts`, `eventGateway/index.ts`, `deliveryTargets.ts`) в этом
диффе не участвуют.
