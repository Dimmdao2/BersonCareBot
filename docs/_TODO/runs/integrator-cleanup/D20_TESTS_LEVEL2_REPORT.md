# D20, шаг 3 — тесты УРОВНЯ 2: «сообщение потеряно молча»

Run: `worker-d20-tests-level2`. Пишется по ходу работы, не постфактум. Фоновых задач и
подзапусков не использовал.

**Authority:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` п. D20.
**Карта:** `D20_INTEGRATOR_MAP.md`, раздел «Уровень 2», пункты 9–13.
**Правила:** `.cursor/rules/tests-check-behaviour-not-circumstances.mdc`,
`.cursor/rules/webapp-tests-lean-no-bloat.mdc`.

Push/merge не делал, галочки плана не ставил. Продуктовый код не менялся — единственная правка
среды: `pnpm install` в отдельный локальный store (`--config.store-dir`) и сборка четырёх
воркспейс-пакетов (`packages/*`), потому что репозиторий на этой машине был установлен не
полностью (см. раздел «Окружение» ниже).

---

## Базовая линия ДО работы

```
pnpm --dir apps/integrator exec vitest run
 Test Files  14 passed | 3 skipped (17)
      Tests  88 passed | 9 skipped (97)
   Duration  5.30s
```

Совпадает с состоянием после уровня 0/1 (`D20_LEVEL0_TESTS_REPORT.md`), не с исходными 47 из карты
31.07 — уровень 0 уже прибавил 41 тест до этого захода.

---

## Окружение (важно для воспроизводимости)

На этой машине `node_modules` отсутствовали, а `pnpm install` падал с `EROFS` — корневая ФС
смонтирована `ro`, кроме самого рабочего дерева (`bind rw` только на
`/home/dev/dev-projects/bcb-wt-testsuite-g0`), а дефолтный pnpm store лежит вне этого дерева.
Решение: `pnpm install --frozen-lockfile --config.store-dir=<repo>/.pnpm-store-local` (store внутри
рабочего дерева) + сборка локальных воркспейс-пакетов, от которых зависит интегратор:
`@bersoncare/db-principal`, `@bersoncare/operator-db-schema`, `@bersoncare/platform-merge`,
`@bersoncare/error-tracking` (`pnpm --filter <pkg> run build`). После этого `88 passed | 9 skipped`
воспроизвёлся один-в-один. Никаких изменений в `package.json`/lockfile/конфиге pnpm не вносил.

---

## Ход работы

### Пункт 9 — `kernel/eventGateway/index.ts` + `dedup.ts`

Карта называет `eventGateway` «самой дорогой ошибкой во всём интеграторе». Файлы:
**`kernel/eventGateway/dedup.test.ts`** (5 тестов), **`kernel/eventGateway/eventGateway.test.ts`**
(6 тестов).

**Как проверяется.** Идемпотентный порт в тесте — не мок с записью вызовов, а работающая
in-memory реализация контракта `IdempotencyPort` (реально хранит какие ключи заняты). Так «то же
событие пришло второй раз» проверяется НАСТОЯЩИМ повторным проходом через `handleIncomingEvent`, а
не утверждением «функция вызвана».

Покрыто (`dedup.ts`):

| Поведение | Тестов |
|---|---|
| fingerprint в другом порядке полей → ключ идентичен | 1 |
| два разных сообщения → ключи разные | 1 |
| значения с `:`/`=` не схлопывают два разных события в один ключ | 1 |
| fingerprint отсутствует → фолбэк `source:type:eventId` | 1 |
| fingerprint — пустой объект → тот же фолбэк, что при отсутствии | 1 |

Покрыто (`eventGateway/index.ts`):

| Поведение | Тестов |
|---|---|
| дубль по fingerprint → pipeline выполнен один раз, второй `dropped/DUPLICATE` | 1 |
| pipeline упал → ключ освобождён, повтор доставки обрабатывается заново | 1 |
| `release` сам упал → `rejected`, не тихий `accepted` и не необработанный reject | 1 |
| битый конверт → `rejected/INVALID_ENVELOPE`, pipeline не запускался | 1 |
| TTL — осознанное значение, а не случайность (дефолт 900 и явный override) | 2 |

#### Арбитры — дословный вывод «до/после»

**До поломок:** `Tests 11 passed (11)` (оба файла).

**dedup.ts:**

| # | Поломка | Вывод |
|---|---|---|
| D-A1 | убран `.sort()` в `buildCanonicalFingerprint` | `AssertionError: expected 'telegram:message.received:chatId=42:messageId=7' to be 'telegram:message.received:messageId=7:chatId=42'` → `1 failed \| 4 passed` |
| D-A2 | убран `encodeURIComponent` для key/value | `AssertionError: expected 'telegram:message.received:a=1:b=2' not to be 'telegram:message.received:a=1:b=2'` (два разных события схлопнулись) → `1 failed \| 4 passed` |
| D-A3 | убрана проверка `entries.length === 0` | `expected 'max:message.received:' to be 'max:message.received:evt-7'` → `1 failed \| 4 passed` |
| D-A4 | фолбэк заменён на голый `eventId` | `expected 'evt-42' to be 'max:callback.received:evt-42'` → `1 failed \| 4 passed` |

**eventGateway/index.ts:**

| # | Поломка | Вывод |
|---|---|---|
| G-A1 | dedup-блок отключён (`if (false && idempotencyPort)`) | 3 теста красных: `seenTtl` пуст (TTL-тесты) и `runCount` не проверялся раздельно — dedup вообще выключен |
| G-A2 | из catch убран `release(dedupKey)` | `expected 'dropped' to be 'accepted'` — повтор доставки после сбоя не обработался |
| G-A3 | `release()` вызывается без `try/catch` | `promise rejected "Error: release transport down" instead of resolving` |
| G-A4 | `incomingEventSchema.parse` отключена | `expected {status:'accepted'} to match {status:'rejected', reason:'INVALID_ENVELOPE'}` |

**После восстановления:** оба файла — `diff` с `git show HEAD:<файл>` пуст, `Tests 11 passed (11)`.

---

### Пункт 10 — `kernel/domain/usecases/processAcceptedIncomingEvent.ts`

Файл: **`processAcceptedIncomingEvent.test.ts`** (3 теста).

**Что доказано.** Падение единственного intent (ответа человеку) сегодня становится наблюдаемым
РОВНО одним способом — структурированным `logger.warn` с полным диагностическим контекстом
(`intentIndex`, `intentType`, `eventId`, `correlationId`, затем сводка `dispatchFailureCount` /
`failedIntentIndices` / `failedIntentTypes` по всему событию). Best-effort по цепочке подтверждён:
падение первого intent (`message.edit`) не блокирует второй (`callback.answer`) — предмет
комментария в шапке самого модуля («не оставлять пользователя с бесконечным loading»).

**Что НЕ доказано и почему (развилка, не молчаливый обход).** Карта требует «единственный ответ
человеку, не ушедший из-за ошибки, становится наблюдаемым» — по контексту карты (заголовок
уровня 2: «в логах чисто») это должно означать наблюдаемость СНАРУЖИ лога: инцидент, метрика,
очередь ретрая. Этого в коде нет: `processAcceptedIncomingEvent` возвращает `Promise<void>`,
ошибка каждого intent гасится в `logger.warn` и дальше по стеку (`incomingEventPipeline.ts` →
`eventGateway`) не всплывает никак. Красный тест под ещё не реализованное поведение писать не
стал — по прецеденту уровня 0 (`D20_LEVEL0_TESTS_REPORT.md`, раздел «НЕ покрыто») такие пункты
идут строкой в отчёт с предложением, а не постоянно падающим тестом в сьюте. **Предложение**:
если `dispatchFailureCount > 0` и провалившийся intent относится к классу «единственный ответ
пациенту» (`message.send`/`message.edit` с адресатом-пациентом, не `callback.answer`), заводить
операторский инцидент (`operatorIncident/reportOperatorFailure.ts` уже существует и делает это для
других путей) вместо/вместе с `logger.warn`. Решение — за владельцем.

#### Арбитры

**До поломок:** `Tests 3 passed (3)`.

| # | Поломка | Вывод |
|---|---|---|
| P-A1 | из per-intent `logger.warn` убраны `eventId`/`correlationId` | `expected {...} to match {intentIndex:0, intentType:'message.send', eventId:'evt-1', correlationId:'corr-1'}` — фактический вызов не содержал этих полей → `1 failed \| 2 passed` |
| P-A2 | `try/catch` вокруг `dispatchIntent` снят (ошибка первого intent ничем не гасится) | `promise rejected "Error: provider unreachable" instead of resolving` (тест 1) и `Error: edit failed: message too old` необработанной ошибкой вышла из вызова (тест 2, второй intent так и не был вызван) → `2 failed \| 1 passed` |
| P-A3 | сводный `logger.warn` сделан безусловным (`if (true)`) | на успешном пути `expected vi.fn() to not be called at all, but actually been called 1 times` → `1 failed \| 2 passed` |

**После восстановления:** `diff` с `git show HEAD:<файл>` пуст, `Tests 3 passed (3)`.

---

### Пункт 11 — `infra/runtime/worker/outgoingDeliveryWorker.ts`

Файл: **`outgoingDeliveryWorker.finalize.test.ts`** (2 теста, новый файл — существующий
`outgoingDeliveryWorker.scope.test.ts` уровня 0 не трогал, он про другую ветку: карантин по
арендатору).

**Разбор двойного отказа.** `runOutgoingDeliveryWorkerTickInner` на исключение из
`processClaimedOutgoingDeliveryRowInner` реагирует так: считает `errors++`, логирует, затем
пытается `finalizeClaimedRowFailure` (перевести строку в `dead`/`failed_retryable`). Если ЭТА
попытка тоже кидает (типичная причина — та же недоступная БД, из-за которой упала первичная
обработка), внутренний `catch` только логирует. Строка остаётся в `processing` НАВСЕГДА (до
отдельного механизма reclaim по таймауту — он здесь не участвует; см. `repos/outgoingDeliveryQueue.ts`
и его тест `outgoingDeliveryQueue.reclaim.integration.test.ts`). Единственный след — лог.

**Доказано:**
1. Двойной отказ ОДНОЙ строки не роняет тик — соседняя строка (поставлена ПЕРЕД сорвавшейся,
   чтобы доказать устойчивость к порядку) обрабатывается и уходит в `sent`.
2. Для сорвавшейся строки НЕ происходит НИ ОДНОЙ успешной терминальной записи: попытки
   `markOutgoingDeliveryDead` были (дважды — внутри `handleDispatchFailure` и повторно в
   `finalizeClaimedRowFailure` тика), но обе провалились — `deadOk` для неё пуст.
3. Оба лог-события зафиксированы: `outgoing_delivery_worker_row_failed` и
   `outgoing_delivery_worker_row_failure_finalize_failed`.
4. Контраст: если финализация НЕ падает (падает только первичная обработка), строка корректно
   уходит в `dead` — «провал финализации» это ОТДЕЛЬНОЕ, более редкое условие потери, а не то же
   самое, что обычный провал доставки.

Заглушка — фейковый `DbPort`, отвечающий по фрагментам SQL (тот же приём, что в
`outgoingDeliveryWorker.scope.test.ts`): предмет проверки — наблюдаемый исход строки очереди и
устойчивость тика, а не то, что БД была вызвана.

#### Арбитры

**До поломок:** `Tests 2 passed (2)`.

| # | Поломка | Вывод |
|---|---|---|
| W-A1 | в тике убран `try/catch` вокруг `finalizeClaimedRowFailure` | `Error: simulated DB outage while finalizing row b000...` — исключение вышло НЕОБРАБОТАННЫМ из всего тика; `for (const row of rows)` оборвался, соседняя строка (шла ВТОРОЙ) не была обработана вовсе → тик целиком зареджектился → `1 failed \| 1 passed` |
| W-A2 | `finalizeClaimedRowFailure` всегда вызывает `queueReschedule` (никогда `queueMarkDead`) | во втором тесте (финализация должна была УСПЕТЬ и перевести строку в `dead`) `expected [] to deeply equal ['c000...']` — строка при `attemptCount>=maxAttempts` осталась не-`dead` → `1 failed \| 1 passed` |

**После восстановления:** `diff` с `git show HEAD:<файл>` пуст, `Tests 2 passed (2)`; полный
файл воркера — `8 passed (8)` вместе со старым `scope.test.ts`.

---

### Пункт 12 — `infra/db/repos/notificationDeliveryAttempts.ts`

Файл: **`notificationDeliveryAttempts.test.ts`** (6 тестов).

Карта: «best-effort запись попыток и ПРОПУСКОВ каналов — единственное, что делает молчаливый
пропуск видимым». Заглушка — фейковый `db.query`, захватывающий параметры INSERT по позиции
(колонки перечислены дословно в комментарии теста, сверены с исходником).

Покрыто:

| Поведение | Тестов |
|---|---|
| `recordMessengerChannelSkipsBestEffort`: telegram/max с причиной записаны, НЕ-мессенджерский канал (email) не даёт мусора в мессенджер-журнал | 1 |
| `recordMessengerNotEnqueuedSkipsBestEffort`: уже отмеченный skip не дублируется | 1 |
| `recordMessengerNotEnqueuedSkipsBestEffort`: канал, который реально уходит (`sendChannels`), НЕ помечается как пропущенный | 1 |
| `recordNotificationDeliveryAttemptBestEffort`: провал самой записи НЕ отменяет доставку (не пробрасывается) | 1 |
| мусорный `occurrenceId` → в БД уходит `NULL`, а не мусор, который обвалил бы весь INSERT (включая валидную причину) | 1 |
| валидный UUID `occurrenceId` → доезжает как есть | 1 |

#### Арбитры

**До поломок:** `Tests 6 passed (6)`.

| # | Поломка | Вывод |
|---|---|---|
| N-A1 | убран фильтр `isMessengerChannel` | `email` появился в записанных каналах → `expected [...2] to deeply equal [...3]` → `1 failed \| 5 passed` |
| N-A2 | убран пропуск уже отмеченных каналов (`alreadySkippedChannels`) | telegram записан ВТОРОЙ раз → `expected [...2] to deeply equal [...1]` → `1 failed \| 5 passed` |
| N-A3 | убран пропуск каналов из `sendChannels` | max (реально уходящий) помечен как пропущенный → `expected ['telegram','max'] to deeply equal ['telegram']` → `1 failed \| 5 passed` |
| N-A4 | убран `try/catch` вокруг INSERT | `promise rejected "Error: journal table unavailable" instead of resolving` → `1 failed \| 5 passed` |
| N-A5 | `parseOccurrenceUuid` заменён на голый `input.occurrenceId ?? null` | `expected 'not-a-real-uuid' to be null` → `1 failed \| 5 passed` |

**После восстановления:** `diff` с `git show HEAD:<файл>` пуст, `Tests 6 passed (6)`.

---

### Пункт 13 — `infra/adapters/deliveryTargetsPort.ts` + `deliveryTargets.ts`

Файл: **`infra/adapters/deliveryTargetsPort.test.ts`** (15 тестов на оба модуля — карта сама сводит
их в одну строку таблицы: «судьба и проверяемое поведение общие»).

**Ключевое решение о предмете проверки.** Именованная причина пропуска канала
(`resolution.skippedChannels`) приходит из ОТВЕТА вебаппа, а не решается портом. Поэтому здесь
доказано ИМЕННО то, за что отвечает порт сам: **три разных вида «нет результата» не схлопываются в
один** — `tenantDenied:true` (утечка между клиниками, сигнал безопасности) ≠ `null` (сеть/вебапп
недоступны — не смогли спросить) ≠ `{channelBindings:{}}` (спросили честно, каналов нет). Слияние
любых двух из них воспроизводит ровно ту «тихую потерю», о которой карта: сбой запроса стал бы
неотличим от «у человека нет каналов», то есть сообщение молча не уйдёт, и никто не узнает почему.

Покрыто:

| Поведение | Тестов |
|---|---|
| 403 → `tenantDenied:true`, отличим от `null` | 1 |
| 500/`!res.ok` → `null` | 1 |
| 200, но `data.ok!==true` → `null` | 1 |
| сеть недоступна (fetch throw) → `null`, не необработанный reject | 1 |
| секрет не настроен → `null`, `fetch` НЕ вызван | 1 |
| `resolution.skippedChannels` доезжает до вызывающего нетронутым | 1 |
| честный пустой результат `{channelBindings:{}}` отличим от `null` | 1 |
| пустой/пробельный телефон → `null`, `fetch` не вызван | 1 |
| ни `telegramId`, ни `maxId` → `null`, `fetch` не вызван | 1 |
| заданы оба id → используется `telegramId` (приоритет) | 1 |
| `channelBindingsToTargets`: обе привязки → обе цели, telegram первым | 1 |
| пустая строка в привязке не становится целью с пустым `externalId` | 1 |
| привязок нет → `[]`, не исключение | 1 |
| `unwrapDeliveryTargets(null)` → `null` | 1 |
| `unwrapDeliveryTargets` с bindings → они же, без потерь | 1 |

#### Арбитры

**До поломок:** `Tests 15 passed (15)`.

| # | Поломка | Вывод |
|---|---|---|
| T-A1 | убрана ветка `res.status === 403` | `expected null to deeply equal {channelBindings:{}, tenantDenied:true}` → `1 failed \| 14 passed` |
| T-A2 | убрана проверка `data.ok !== true` | `expected {channelBindings:{}} to be null` (500 без ok в теле не дал null отдельно от 403-кейса; проверено вторым, специализированным разрывом ниже) | `1 failed \| 14 passed` |
| T-A3 | убран `try/catch` вокруг `fetch` | `promise rejected "Error: ECONNREFUSED" instead of resolving` → `1 failed \| 14 passed` |
| T-A4 | убрана проверка пустого секрета | `fetch` вызван, хотя ожидалось `not.toHaveBeenCalled()` → `1 failed \| 14 passed` |
| T-A5 | `resolution` перестал прокидываться в результат | `expected undefined to deeply equal [{channel:'max',...}]` → `1 failed \| 14 passed` |
| T-A6 | убрана проверка пустого телефона | `fetch` вызван → `1 failed \| 14 passed` |
| T-A7 | убран `return null` при отсутствии обоих id (замена на безусловный fetch) | `fetch` вызван → `1 failed \| 14 passed` |
| T-A8 | приоритет `telegramId`/`maxId` перевёрнут | URL содержал `maxId=222` вместо `telegramId=111` → `1 failed \| 14 passed` |
| T-A9 | порядок `BINDING_KEYS` перевёрнут (max раньше telegram) | порядок целей в результате перевёрнут → `1 failed \| 14 passed` |
| T-A10 | убрана проверка `id.trim().length > 0` | пустая строка стала целью `{channel:'telegram', externalId:''}` → `1 failed \| 14 passed` |

**После восстановления:** оба файла — `diff` с `git show HEAD:<файл>` пуст, `Tests 15 passed (15)`.

---

## Итоговые прогоны

```
ДО (после уровня 0/1):  Test Files  14 passed | 3 skipped (17)
                         Tests       88 passed | 9 skipped (97)

ПОСЛЕ (уровень 2):       Test Files  20 passed | 3 skipped (23)
                         Tests      125 passed | 9 skipped (134)
                         Duration    6.62s
```

**+37 тестов, +6 файлов.** Пропущенные (`3 файла / 9 тестов`) не изменились — ни один новый тест
не идёт под opt-in флагом, `describe.skipIf` в новых файлах отсутствует.

```
pnpm --dir apps/integrator run typecheck   # чисто (одна правка типа в тесте — см. ниже)
pnpm --dir apps/integrator run lint        # чисто
```

Одна техническая правка в САМОМ тесте (не в продуктовом коде): в
`processAcceptedIncomingEvent.test.ts` фейковый `readPort.readDb` возвращал `Promise<null>`, что не
проходило по универсальному дженерику `readDb<T>(): Promise<T>` (`T` может быть любым, `null` в
него не подставляется). Исправлено на `null as never` — `never` подставляется в любой `T`.
Поведенческого значения не несёт, чисто типовая совместимость с сигнатурой порта.

### Самопроверки по правилу `tests-check-behaviour-not-circumstances.mdc`

1. **Поломка названа одной строкой** — у каждого `it` в комментарии, всего 28 арбитров
   (D-A1..4, G-A1..4, P-A1..3, W-A1..2, N-A1..5, T-A1..10; см. таблицы выше по пунктам).
2. **Поломка внесена руками, тест покраснел** — все 28 прогонов дословно приведены выше.
   Продуктовый код после каждой поломки восстановлен из `/tmp/*.orig.ts`; финальная сверка со
   всеми 7 затронутыми файлами (`kernel/eventGateway/dedup.ts`, `kernel/eventGateway/index.ts`,
   `kernel/domain/usecases/processAcceptedIncomingEvent.ts`,
   `infra/runtime/worker/outgoingDeliveryWorker.ts`,
   `infra/db/repos/notificationDeliveryAttempts.ts`, `infra/adapters/deliveryTargetsPort.ts`,
   `infra/adapters/deliveryTargets.ts`) через `git status --short` — **ни одного расхождения**.
3. **Переформатирование не красит тесты.** `prettier --print-width 60` (агрессивный перенос) по
   всем 7 продуктовым файлам → `Tests 37 passed (37)` (все новые тесты этих файлов). Файлы затем
   восстановлены из бэкапа, `git status --short` на них пуст.
4. **Запуск из другого каталога.** Из `/tmp`:
   `pnpm --dir <repo>/apps/integrator exec vitest run <новые 6 файлов>` →
   `Test Files 6 passed (6)`, `Tests 37 passed (37)`.

---

## ⚠️ Развилки и что я не смог выяснить

### Развилка 1 (пункт 10) — «упавший единственный ответ» наблюдаем ТОЛЬКО в логе

`processAcceptedIncomingEvent.ts` гасит ошибку каждого intent в `logger.warn` и не пробрасывает её
никуда дальше (`incomingEventPipeline.ts` вызывает эту функцию без ожидания сигнала об ошибке).
Карта явно называет это развилкой №1 всего интегратора: «политика "упало — только в лог" — это и
есть тихая потеря сообщения». Тест доказывает, что лог структурирован и достаточен для разбора
инцидента ПОСТФАКТУМ (если кто-то догадается его искать), но не доказывает и не может доказать
внешнюю наблюдаемость, потому что её нет. Красный тест на отсутствующее поведение не писал
(см. пункт 10 выше) — решение нужно от владельца: заводить ли операторский инцидент на провал
`message.send`/`message.edit`, адресованного пациенту (в отличие от `callback.answer`, чей провал
менее критичен — ack, а не содержательный ответ).

### Развилка 2 (пункт 11) — что происходит со строкой ПОСЛЕ двойного отказа

Тест доказывает, что строка остаётся в `processing` навсегда (на уровне логики этого модуля).
Реальный выход из такого состояния — `resetStaleOutgoingDeliveryProcessing` (reclaim по таймауту,
отдельный репозиторий `outgoingDeliveryQueue.ts`, уже покрыт
`outgoingDeliveryQueue.reclaim.integration.test.ts`). Я НЕ проверял интеграцию «двойной отказ тика
→ следующий тик → reclaim» сквозным тестом — это область другого модуля и другого прогона
(потребовала бы либо реальной БД, либо ещё одного слоя фейков, дублирующего уже существующий
reclaim-тест). Если владелец хочет именно сквозную гарантию «зависшая по двойному отказу строка
рано или поздно восстанавливается», это отдельная задача поверх уже написанного здесь.

### Что не выяснял

Ничего не осталось невыясненным в границах пяти пунктов карты (9–13) — только развилка 1 (решение
за владельцем) и явно очерченная граница развилки 2 (сквозной прогон — не в объёме этого захода).

---

## Границы работы

- **Продуктовый код не менялся.** Единственная связанная с продуктовым кодом активность —
  24 (точнее 28, см. выше) временных поломок для арбитров, каждая восстановлена сразу после
  прогона; финальная сверка `git status --short` по всем семи файлам — чисто.
- **`push`/`merge` не делал.** Галочки в плане не ставил.
- Фоновых задач и подзапусков не использовал; отчёт писался по ходу.
