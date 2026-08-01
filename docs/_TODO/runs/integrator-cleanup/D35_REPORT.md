# D35 — отчёт: политика отказа доставки (классификация, инцидент, короткая лестница)
(run: worker-d35-failure-policy)

Источник задачи: `D35_DELIVERY_FAILURE_POLICY_BRIEF.md`, практика — `D20_FORKS_RESEARCH.md` §1.
Решение владельца по существу («доставляем в любом случае») не пересматривалось; числа и разводка —
инженерное решение лида по практике §1, как и предписано брифом.

## Главная мысль реализации

Строить новую машинку не пришлось — она уже существовала: `recordOperatorFailureIncident` +
`enqueueOutgoingDeliveryIfAbsent` (обе работают на `relayOutboundRoute.ts`/`sendSmsRoute.ts` и
`outgoingDeliveryWorker.ts`). Работа целиком в том, чтобы:

1. завести новый вид очереди `inbound_reply` со своей короткой лестницей (не трогая общую лестницу
   напоминаний/рассылок/операторских алертов — она используется той же функцией с прежним поведением
   по умолчанию);
2. подключить к нему уже существующую в воркере классификацию «постоянный/временный отказ»
   (`classifyRecipientBlockedBotError`) — она сработала «бесплатно», как только новый `kind` перестал
   попадать в исключение `row.kind !== 'operator_alert'`;
3. добавить инцидент на исчерпании лестницы именно для этого вида;
4. подключить путь `processAcceptedIncomingEvent` (единственный, где ответ человеку раньше уходил
   только в лог) к этой очереди, классифицируя `callback.answer` отдельно (без ретрая вовсе).

## Таблица: пункт брифа → файл → поведение → доказательство поломкой

| № | Пункт брифа | Файл (поведение) | Как проверено поломкой |
|---|---|---|---|
| 1 | Постоянный отказ — без ретрая, без инцидента, канал помечается | `infra/runtime/worker/outgoingDeliveryWorker.ts`, `handleDispatchFailure` (строки ~536-552): `row.kind !== 'operator_alert'` уже включает новый `inbound_reply`, поэтому `classifyRecipientBlockedBotError` → `finalizeRecipientBlockedBotDelivery` (маркирует канал, `dead` с `failure_class='recipient_blocked_bot'`, без вызова `recordOperatorFailureIncident`) | `outgoingDeliveryWorker.inboundReply.d35.test.ts`, тест «постоянный отказ»: добавил `row.kind !== INBOUND_REPLY_QUEUE_KIND` в исключение — тест покраснел (`deadCalls` стало `[]`, строка ушла в обычный retryable-путь вместо блокировки). Возвращено. |
| 2 | Временный отказ, исчерпавший попытки, → инцидент | `infra/runtime/worker/outgoingDeliveryWorker.ts`, новая `recordInboundReplyDeliveryDeadIncident()`, вызывается из `finalizeOutgoingDeliveryDead()` | Тот же файл, тест «инцидент оператора»: закомментировал вызов `recordInboundReplyDeliveryDeadIncident()` — `incidentRecorder` перестал вызываться (0 раз вместо 1), тест покраснел. Возвращено. |
| 3 | Служебный ответ — короткая лестница, не общая | `infra/delivery/deliveryContract.ts`: новый `INBOUND_REPLY_QUEUE_KIND`, `INBOUND_REPLY_RETRY_BACKOFF_SEC = [15, 60, 180]`, `retryBackoffLadderForKind()`; `retryDelaySecondsAfterFailure(attempt, kind)` теперь принимает `kind` (оба вызова в воркере — `handleDispatchFailure`, `finalizeClaimedRowFailure` — передают `row.kind`) | `deliveryContract.d35.test.ts` + `outgoingDeliveryWorker.inboundReply.d35.test.ts` (тест reschedule): заставил `retryBackoffLadderForKind()` всегда возвращать общую лестницу — все три теста `deliveryContract.d35.test.ts` покраснели (15→60 и т.д.), плюс тест reschedule в воркере (delaySeconds 15→60). Возвращено. |
| 4 | Подтверждение нажатия — не ставится в очередь вовсе | `kernel/domain/usecases/processAcceptedIncomingEvent.ts`: `ACK_INTENT_TYPES = Set(['callback.answer'])`, условие постановки в очередь исключает эти типы | `processAcceptedIncomingEvent.d35.test.ts`, тест «callback.answer»: убрал `!ACK_INTENT_TYPES.has(intent.type)` из условия — `enqueueOutgoingDeliveryIfAbsent` начал вызываться и для `callback.answer` (было 0, стало 1), тест покраснел. Возвращено. |
| 5 | Отказ отправки ответа виден не только в логе | `kernel/domain/usecases/processAcceptedIncomingEvent.ts`: `enqueueFailedReplyForRetry()` ставит провалившийся не-ack intent в `outgoing_delivery_queue` (`kind: 'inbound_reply'`, `maxAttempts: INBOUND_REPLY_DELIVERY_MAX_ATTEMPTS`), вызывается из цикла доставки intents рядом с прежним `logger.warn` (лог не убран — остаётся диагностикой, очередь добавляет наблюдаемость вовне) | `processAcceptedIncomingEvent.d35.test.ts`, тест «message.send»: отключил условие постановки в очередь (`if (false && …)`) — `enqueueOutgoingDeliveryIfAbsent` не вызван (было 1, стало 0), тест покраснел. Возвращено. |

Плюс инфраструктурная правка, без которой пп. 1-5 не работают против реальной БД (см. «Скрытая
зависимость» ниже): `infra/db/repos/outgoingDeliveryScope.ts` (тип `OutgoingDeliveryScope` принимает
`queueKind: 'operator_alert' | 'inbound_reply'`, резолюция `operator_global` расширена на оба) +
миграция `0287_inbound_reply_delivery_scope.sql` (SQL-функция `app.resolve_outgoing_delivery_scope`
получает ветку `inbound_reply` → `operator_global`, без организации — ответ адресован получателю по
chatId/userId, а не клинике) + синхронная правка `deploy/postgres/c4-operational-runtime.sql` (см. ниже).
Проверено тестом (мок-уровень, как и остальные тесты этого резолвера в репозитории —
`outgoingDeliveryWorker.scope.test.ts` не бьёт по реальной БД): новый `it` «D35: строка вида inbound_reply
резолвится как operator_global» — без ветки в `resolveOutgoingDeliveryScope()` строка ушла бы в карантин
(`TENANT_SCOPE_...`), тест бы покраснел на пустом `dispatched`.

## Обоснование чисел лестницы (`INBOUND_REPLY_RETRY_BACKOFF_SEC`, `INBOUND_REPLY_DELIVERY_MAX_ATTEMPTS`)

Источник: `D20_FORKS_RESEARCH.md` §1. Практика (Sidekiq 25 ретраев/≈20 дней, Stripe до 3 суток, SQS DLQ
после `maxReceiveCount`, Google SRE «ограничить число ретраев на процесс») **не даёт числа для
интерактивного ответа человеку** — все три системы ретраят фоновые задания, где получателю (серверу)
всё равно, когда пришло событие. Здесь получатель — человек, который ждёт секунды; §1 прямо формулирует
вывод: «Ответ, доставленный через 20 минут, — это уже не ответ». Бриф прямо предписывает для этого
случая: «если практика не даёт числа — выбрать минимально разумное, объяснив».

Выбрано: **`[15, 60, 180]` секунд, максимум 4 попытки** (первая — синхронная в
`processAcceptedIncomingEvent`, ещё до постановки в очередь; далее до 4 попыток очереди по лестнице).
Обоснование:

- Форма (растущий, но короткий шаг) сохраняет паттерн общей лестницы `[60, 300, 900, 3600]` — не
  изобретается новый принцип, только масштаб;
- Худший случай до `dead` — `15+60+180 = 255` секунд (≈4.25 минуты), что на порядок короче даже первого
  шага общей лестницы (60 c у неё — это первая пауза, а не итог) и `уложиться в минуты, а не в часы`
  выполнено с большим запасом;
- Число попыток (4) даёт две-три короткие попытки пережить сетевую заминку (Google SRE: «randomized
  exponential backoff» — джиттер не добавлен, поскольку его нет и в существующей общей лестнице, решение
  сохраняет консистентность стиля, а не вносит новый принцип, не запрошенный брифом).

## Файлы — что изменено

| Файл | Что |
|---|---|
| `apps/integrator/src/infra/delivery/deliveryContract.ts` | `OutgoingDeliveryKind` +`'inbound_reply'`; `INBOUND_REPLY_QUEUE_KIND`, `INBOUND_REPLY_DELIVERY_MAX_ATTEMPTS`, `INBOUND_REPLY_RETRY_BACKOFF_SEC`; `retryDelaySecondsAfterFailure(attempt, kind?)` — второй параметр опционален, старое поведение (без kind или для прежних видов) не изменилось |
| `apps/integrator/src/infra/db/repos/outgoingDeliveryScope.ts` | `OutgoingDeliveryScope['operator']['queueKind']` расширен на `'inbound_reply'`; резолюция `operator_global` принимает оба вида |
| `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts` | Новая ветка `processOutgoingDeliveryRow` для `INBOUND_REPLY_QUEUE_KIND` (dispatch → sent/handleDispatchFailure, без обязательного `incidentId`, в отличие от `operator_alert`); `recordInboundReplyDeliveryDeadIncident()`, вызывается из `finalizeOutgoingDeliveryDead`; оба вызова `retryDelaySecondsAfterFailure` теперь передают `row.kind` |
| `apps/integrator/src/kernel/domain/usecases/processAcceptedIncomingEvent.ts` | Новый опциональный `db?: DbPort` в зависимостях; `ACK_INTENT_TYPES`, `isQueueableReplyChannel()`, `enqueueFailedReplyForRetry()`; провал не-ack intent на telegram/max ставится в очередь (идемпотентно по `eventId:queued:index`), лог остаётся как был + поле `queuedForRetry` |
| `apps/integrator/src/kernel/eventGateway/incomingEventPipeline.ts` | `IncomingEventPipelineDeps.db?: DbPort`, прокинут в `processAcceptedIncomingEvent` |
| `apps/integrator/src/app/di.ts` | `createIncomingEventPipeline({ …, db: dbPort })` — боевой DI всегда передаёт порт |
| `apps/webapp/db/drizzle-migrations/0287_inbound_reply_delivery_scope.sql` + `meta/_journal.json` | `CREATE OR REPLACE FUNCTION app.resolve_outgoing_delivery_scope` с веткой `inbound_reply` → `operator_global` |
| `deploy/postgres/c4-operational-runtime.sql` | Та же ветка добавлена в дублирующее «золотое» определение функции (см. «Скрытая зависимость») |
| Тесты (новые) | `infra/delivery/deliveryContract.d35.test.ts`, `infra/runtime/worker/outgoingDeliveryWorker.inboundReply.d35.test.ts`, `kernel/domain/usecases/processAcceptedIncomingEvent.d35.test.ts`, +1 `it` в `outgoingDeliveryWorker.scope.test.ts` |
| Тесты (обновлены) | `processAcceptedIncomingEvent.test.ts` — обновлён комментарий шапки (снята устаревшая пометка «карта требует… этого в коде нет», указано, что D35 закрыла эту развилку, ссылка на новый файл) |

## Скрытая зависимость, найденная по ходу (не в брифе, но необходима для корректности)

`outgoingDeliveryWorker.ts` резолвит арендатора КАЖДОЙ строки очереди через SQL-функцию
`app.resolve_outgoing_delivery_scope` (см. `D20`-тесты карантина, `outgoingDeliveryWorker.scope.test.ts`):
любой вид очереди, не описанный в этой функции, получает `resolution='unsupported_queue_kind'` →
`{kind:'invalid'}` → строка немедленно уходит в карантин (`dead`) БЕЗ единой попытки доставки — раньше,
чем успевает сработать что-либо из пп. 1-5. Без миграции `0287` новый `inbound_reply` был бы мёртв на
реальной БД при полностью зелёных unit-тестах (они мокают `db.query` и не видят реальную SQL-функцию).
Решено так же, как для `operator_alert`: `operator_global` (без организации) — ответ адресован
получателю по `chatId`/`userId`, а не клинике, дополнительный lookup арендатора не нужен.

Дополнительно найдено: та же функция **продублирована** в `deploy/postgres/c4-operational-runtime.sql`
(строки ~481-565 до правки) — отдельный «золотой» файл least-privilege-контракта, применяемый
`deploy/host/provision-c4-operational-runtime.sh` (root-only, TEST/PROD). Без синхронной правки там
повторный прогон provisioning тихо откатил бы функцию к версии без `inbound_reply`. Синхронизировано в
этом прогоне (см. таблицу файлов); сам provisioning-скрипт не запускал (см. «Чего не смог»).

## Полный прогон интегратора — числа до/после

- **До** (`npx vitest --run`, чистое дерево apps/integrator): `Test Files 24 passed | 3 skipped (27)`,
  `Tests 161 passed | 9 skipped (170)` — совпадает с числом из брифа (161).
- **После**: `Test Files 27 passed | 3 skipped (30)`, `Tests 171 passed | 9 skipped (180)`. +10 тестов
  (3 в `deliveryContract.d35.test.ts`, 3 в `outgoingDeliveryWorker.inboundReply.d35.test.ts`, 1 в
  `outgoingDeliveryWorker.scope.test.ts`, 3 в `processAcceptedIncomingEvent.d35.test.ts`), 0 падений,
  0 новых skip.
- `npx tsc --noEmit` (apps/integrator) — чисто.
- `npx eslint` по всем изменённым/новым файлам — чисто.
- Каждая из пяти строк таблицы выше проверена ручной поломкой соответствующего продуктового условия с
  возвратом файла к исходному состоянию после красного вывода (см. таблицу).

## Границы (соблюдены)

- Доставка напоминаний и рассылок не тронута: `retryDelaySecondsAfterFailure` без `kind` или с
  `kind ∈ {reminder_dispatch, doctor_broadcast_intent, operator_alert}` возвращает прежнюю лестницу —
  доказано отдельным `it` в `deliveryContract.d35.test.ts`.
- Второй механизм инцидентов/очереди не заведён — использованы существующие
  `recordOperatorFailureIncident`/`enqueueOutgoingDeliveryIfAbsent`/`outgoingDeliveryWorker`.
- Числа лестницы обоснованы практикой (см. раздел выше), а не вкусом.

## Развилки — владельцу/лиду

1. **Классификация intent-типов внутри `processAcceptedIncomingEvent` — по принципу «ack/не ack», а не
   по каждому типу отдельно.** В брифе явно назван только `callback.answer` как ack-класс. Реально через
   этот путь проходят также `message.edit`, `message.replyMarkup.edit`, `message.delete`, `message.copy`
   (подтверждено грепом фактических `intents.push` в `executeAction.ts`/`handlers/*.ts` — других типов
   через этот путь не бывает). Все они теперь тоже ставятся в очередь на исчерпание короткой лестницы
   вплоть до инцидента, включая `message.delete` (например, «убрать протухшее сообщение с кнопками
   напоминания») — отказ такого действия при интерактиве через кнопку тоже интерпретируется как «ответ
   человеку». Если это избыточно (напр. для чистого `message.delete` инцидент оператора — шум), нужна
   более тонкая классификация по типу, а не только по ack/не-ack — брифом это не запрошено и не
   запрещено, оставляю как решение лида/владельца.
2. **`errorClass` для инцидента `inbound_reply` берётся из общего `classifyOutboundProviderErrorClass`**
   (пакет `@bersoncare/operator-db-schema`), спроектированного изначально для email/SMS-провайдеров
   (квота/кредиты/auth). Для telegram/max большинство реальных ошибок сегодня попадут в дефолтный
   `provider_send_failed` — это не хуже дефолта, которым уже пользуется `relayOutboundRoute.ts` для
   `sms`/`email`, но специфической для мессенджеров классификации (rate-limit Telegram, `403` MAX и т.п.)
   в этом прогоне не заводил — вне заявленной границы брифа («не изобретать требований»).

## Чего не смог

- **Не применил миграцию `0287` к реальной dev-БД.** `bash deploy/host/migrate-dev.sh --preflight`
  требует канонического checkout с `apps/webapp/.env.dev` как настоящим файлом
  (`assert_canonical_file`); текущий рабочий каталог — воркер-worktree `bcb-wt-fmtcut` без этого файла
  (`.env.dev` там не существует — подтверждено `ls`). Миграция и правка `_journal.json` подготовлены и
  протипчекнуты по содержимому (SQL зеркалирует уже рабочую `0260`-миграцию 1:1, кроме добавленной
  ветки), но накатить их должен прогон из канонического checkout (судя по merge-коммитам в логе —
  `/home/dev/dev-projects/BersonCareBot`) через штатный `migrate-dev.sh --preflight` → `--execute`.
- **Не запускал `deploy/host/provision-c4-operational-runtime.sh`.** Это root-only скрипт для TEST/PROD
  с отдельным owner-гейтом на прод-действия (`AGENTS.md` §1 «Production-хост… агент не выполняет там
  `sudo`»); правка golden-файла подготовлена (см. выше), но применение — вне прав и вне scope этого
  прогона.
- Не проверял поведение живьём через `pnpm dev` (нет доступа к каноническому dev-checkout с реальным
  ботом/БД в этой рабочей копии) — все доказательства даны юнит-тестами с ручной поломкой, как и
  предписывает гейт брифа.
