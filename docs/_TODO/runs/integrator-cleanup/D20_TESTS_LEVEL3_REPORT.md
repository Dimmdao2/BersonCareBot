# D20 · тесты интегратора, уровень 3 — «двойная отправка» — отчёт

Run: `worker-d20-tests-level3`. Authority: `docs/_TODO/runs/integrator-cleanup/D20_INTEGRATOR_MAP.md`,
раздел «Уровень 3», пункты 14–18 (строки 575–583).

**Продуктовый код не менялся.** Изменены только тесты, два инфраструктурных D30-скрипта (один — новый),
`apps/integrator/package.json` (новый npm-скрипт) и `.github/workflows/ci.yml` (один новый шаг в уже
существующей работе `d30-scheduler-concurrency`). Диффы по всем пяти файлам продуктового кода, которые
пришлось мутировать для доказательства (`dispatchPort.ts`, `deliveryContract.ts`, `idempotencyKeys.ts`,
`outgoingDeliveryQueue.ts`, `bookingLifecycleRoute.ts`), после каждого прогона проверены `git diff --stat` —
пусто.

## Числа

- Vitest интегратора **до**: `Test Files 23 passed | 3 skipped (26)`, `Tests 154 passed | 9 skipped (163)`.
- Vitest интегратора **после**: `Test Files 26 passed | 3 skipped (29)`, `Tests 161 passed | 9 skipped (170)`
  (прогон полного набора, не узкого файла — `pnpm --dir apps/integrator exec vitest run`).
- Новых файлов тестов: 3 (`dispatchPort.test.ts` — 2, `deliveryContract.test.ts` — 3,
  `bookingLifecycleRoute.dedup.test.ts` — 2) = **+7 тестов**.
- Новых disposable-Postgres скриптов (санкционированный приём, не vitest-DB): 1 новый
  (`check-d30-idempotency-key-concurrency.ts`), 1 расширен третьей проверкой
  (`check-d30-outgoing-delivery-claim-concurrency.ts`, добавлена piece 4c). Оба — в уже существующей
  CI-работе `d30-scheduler-concurrency` (`.github/workflows/ci.yml`).
- `pnpm --dir apps/integrator typecheck` — чисто. `eslint` по изменённым/новым файлам — чисто.

---

## Пункт 14 — `repos/idempotencyKeys.ts`: `tryAcquire` под гонкой

**Файл теста:** `apps/integrator/src/infra/scripts/check-d30-idempotency-key-concurrency.ts` (новый),
подключён как `check:d30-idempotency-key-concurrency` в `package.json` и как новый шаг существующей
CI-работы `d30-scheduler-concurrency`.

**Почему не vitest:** `.cursor/rules/test-execution-policy.md` запрещает новую DB-механику в vitest;
санкционированный приём — одноразовый Postgres из скрипта (тот же паттерн, что уже используют
`check-d30-scheduler-lock-concurrency.ts` и `check-d30-outgoing-delivery-claim-concurrency.ts`).

**Что ловит:** два параллельных `tryAcquire` на один и тот же свежий ключ — выигрывает ровно один (piece 1);
третий acquire, пока ключ ещё жив, тоже проигрывает (piece 2, не совпадение пары).

**Доказательство поломкой:** снял guard `WHERE target.expires_at < now()` из `ON CONFLICT ... DO UPDATE`
(`idempotencyKeys.ts:53`) — оба конкурентных `tryAcquire` стали возвращать `true`
(`got 2 (first=true, second=true)`). Откат — `git diff --stat` пусто, скрипт снова `PASS`.

**Прогон:**
```
[piece 1] PASS: two concurrent tryAcquire on the same key, exactly one won
[piece 2] PASS: a further acquire on the still-live key also failed
check-d30-idempotency-key-concurrency: PASS
```

---

## Пункт 15 — `repos/outgoingDeliveryQueue.ts`: claim, `enqueueIfAbsent`, лимит reclaim

**Уже покрыто, не дублировано:** claim-race (piece 4a) и повторный `enqueueOutgoingDeliveryIfAbsent` без
дубля строки (piece 4b) уже доказаны в `check-d30-outgoing-delivery-claim-concurrency.ts` до этой задачи —
прочитано и не переписано заново.

**Чего не хватало:** лимит reclaim (dead-letter при исчерпании `maxReclaimCount`) доказан только в
`apps/integrator/src/infra/db/repos/outgoingDeliveryQueue.reclaim.integration.test.ts` — это opt-in vitest
(`RUN_OUTGOING_DELIVERY_RECLAIM_TEST=1` + `USE_REAL_DATABASE=1` + `DATABASE_URL` +
`DB_PRINCIPAL_SIGNING_SECRET`). Проверено: `RUN_OUTGOING_DELIVERY_RECLAIM_TEST` **нигде не выставлен** в
`.github/workflows/ci.yml` — ни один CI job его не запускает. По собственному критерию
`test-execution-policy.md` («защита засчитывается только по точной ссылке на реально запускающий её CI
workflow/job; скрипт/alias/выключенный workflow не считается») это мёртвая защита.

**Файл теста:** `apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts`
(расширен), новая **piece 4c** в уже подключённой CI-работе — новый CI-шаг не понадобился.

**Что ловит:** «зависшая» строка `processing` на пределе `reclaim_count` уходит в `dead` с
`failure_class = 'reclaim_limit_exceeded'`, а не возвращается в `pending` (что означало бы бесконечный
цикл повторной отправки при вечно падающем воркере).

**Доказательство поломкой:** заменил `q.reclaim_count + 1 >= ${cap}` на `> ${cap}` (off-by-one) в
`resetStaleOutgoingDeliveryProcessing` (`outgoingDeliveryQueue.ts:124` и соседние `CASE`) — строка на самом
пределе капа перестала dead-летториться (`deadLettered=0`, осталась бы `pending` навсегда). Откат — `git
diff --stat` пусто, скрипт снова `PASS`.

**Прогон:**
```
[piece 4a] PASS: two concurrent claims on one due row, exactly one won
[piece 4b] PASS: repeated enqueue with the same event_id did not create a second row
[piece 4c] PASS: a stale row at the reclaim cap was dead-lettered, not recycled
check-d30-outgoing-delivery-claim-concurrency: PASS
```

Существующий opt-in `outgoingDeliveryQueue.reclaim.integration.test.ts` не тронут (не расширялся, не
удалялся) — вопрос о его судьбе (удалить как мёртвую защиту или подключить флаг в CI) вынесен в развилки.

---

## Пункт 16 — `bersoncare/bookingLifecycleRoute.ts`: дедуп событий

**⚠️ Важная поправка к карте и к постановке владельца.** И карта (строки 579–580), и сегодняшняя
постановка утверждают: «дедупликация событий живёт в памяти процесса — после рестарта повтор пройдёт
заново». Это было верно **до** коммита `ea284a033f` (2026-07-14, автор dimmdao) — с этого коммита
`acquireBookingLifecycleKey` (`bookingLifecycleRoute.ts:119-140`) при наличии `idempotencyPort` использует
**персистентный** порт (переживает рестарт), и in-memory `Map` — это только fallback для вызовов без порта.
`app/di.ts:254` всегда собирает `idempotencyPort = input.idempotencyPort ?? createPostgresIdempotencyPort(dbPort)`
и `app/routes.ts:226` передаёт именно этот `deps.idempotencyPort` в
`registerBersoncareBookingLifecycleRoute`. То есть **в реально задеплоенной проводке fallback-ветка (та,
что теряет дедуп при рестарте) сегодня не используется вообще** — она достижима только если кто-то
сконструирует route deps без `idempotencyPort` (тестовый путь).

Тест зафиксировал ОБА поведения как есть, ничего не меняя:

**Файл теста:** `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.dedup.test.ts` (новый).

**Что ловит:**
1. С персистентным портом (та самая проводка `di.ts` с 2026-07-14) — повтор события гасится **даже после
   симулированного рестарта** (`vi.resetModules()` + повторный `import` даёт свежий модуль/свежую
   in-memory `Map`, но один и тот же внешний персистентный порт — ровно то же самое, что даёт реальный
   Postgres после рестарта процесса).
2. Без порта (fallback) — повтор гасится в пределах одного процесса, но **проходит заново после
   симулированного рестарта** — это и есть риск, который называет карта; поведение зафиксировано как есть,
   не изменено (развилка №2 карты остаётся открытой, ответа владельца по-прежнему нет — но теперь понятно,
   что она относится только к недостижимой в проде fallback-ветке).

**Доказательство поломкой (тест 1, персистентный путь):** убрал ветку `if (idempotencyPort)` из
`acquireBookingLifecycleKey` (`bookingLifecycleRoute.ts:128-134`), оставив только in-memory fallback — тест
1 покраснел (`Number of calls: 2`, второй вызов после симулированного рестарта отправил письмо повторно).
Откат — `git diff --stat` пусто.

**Доказательство поломкой (тест 2, fallback-путь):** обнулил тело `rememberBookingEventKey` — тест 2
покраснел на «в пределах одного процесса второй вызов не должен отправлять повторно» (`Number of calls: 2`).
Откат — `git diff --stat` пусто.

**Прогон (вместе с уже существующими тестами того же файла, для проверки отсутствия конфликта моков):**
```
Test Files  3 passed (3)
     Tests  28 passed (28)
```

---

## Пункт 17 — `adapters/dispatchPort.ts`: провал аудита не должен приводить к повторной отправке

**Файл теста:** `apps/integrator/src/infra/adapters/dispatchPort.test.ts` (новый).

**Что ловит:**
1. Отправка прошла успешно, но запись аудита (`logDeliveryAttempt` → `writePort.writeDb`) упала —
   `dispatchOutgoing` всё равно возвращает реальный результат отправки, адаптер вызван ровно один раз
   (внешний вызывающий код — воркер очереди — не увидит здесь ошибку и не поставит уже доставленное
   сообщение на повторную отправку).
2. Отправка провалилась у провайдера, и аудит той же неудачи тоже упал — наружу уходит именно исходная
   ошибка провайдера (не ошибка аудита), адаптер по-прежнему вызван один раз.

**Доказательство поломкой (тест 1):** убрал `try/catch` вокруг `logDeliveryAttempt` на успешной ветке
(`dispatchPort.ts:352-358`) — ошибка аудита стала фактическим результатом промиса `dispatchOutgoing`
(`Error: audit_write_failed`) вместо успешного возврата. Откат — `git diff --stat` пусто.

**Доказательство поломкой (тест 2):** убрал `try/catch` вокруг `logDeliveryAttempt` в ветке
`catch (providerError)` (`dispatchPort.ts:336-349`) — наружу стала уходить ошибка аудита
(`audit_write_failed`) вместо исходной ошибки провайдера (`provider_rejected`). Откат — `git diff --stat`
пусто.

**Прогон:**
```
Test Files  1 passed (1)
     Tests  2 passed (2)
```

---

## Пункт 18 — `delivery/deliveryContract.ts` + `runtime/worker/retryPolicy.ts`: две лестницы отступов

**Целевая лестница определена по коду и уже закрытому решению владельца, догадки нет.** В коде сегодня
живут ОБЕ (`worker/main.ts` реально гоняет оба цикла параллельно: `jobQueueLoop` через
`runner.ts`/`decideRetry`/`retryPolicy.ts` над `integrator.message_retry_jobs`, и `outgoingDeliveryLoop`
через `outgoingDeliveryWorker.ts`/`retryDelaySecondsAfterFailure`/`deliveryContract.ts` над
`public.outgoing_delivery_queue`). Но это не «развилка без ответа»: она уже закрыта пунктом **№11** карты
(«Закрыто») и подробно расписана в `D30_SCHEDULER_REVERSAL_PLAN.md` (строка 181: «Остаётся
`public.outgoing_delivery_queue`. Вырезается `integrator.message_retry_jobs`», Ш7 — ещё не выполнен, отсюда
и оба живых цикла сегодня). Целевая лестница — `deliveryContract.ts`'s `retryDelaySecondsAfterFailure`.

Тест на `retryPolicy.ts`/`decideRetry` (лестницу уходящей `message_retry_jobs`) **не писан** — по аналогии с
правилом уровня 7 карты (строка 611: тест на то, что УЕЗЖАЕТ/УДАЛЯЕТСЯ, фиксирует ровно то поведение,
которое приказано убрать, и не нужен).

**Файл теста:** `apps/integrator/src/infra/delivery/deliveryContract.test.ts` (новый).

**Что ловит:** лестница отступов эскалирует `60 → 300 → 900 → 3600` секунд по номеру проваленной попытки
(не мгновенный повтор — иначе то же сообщение может уйти повторно раньше, чем известен исход первой
попытки), выходит на плато на `3600` вместо сброса на `60`, и для некорректного номера попытки (`0`, `-1`,
`NaN`) откатывается на кратчайшую задержку, а не на нулевую.

**Доказательство поломкой:** заменил первый элемент `RETRY_BACKOFF_SEC` с `60` на `0`
(`deliveryContract.ts:27`) — 2 из 3 тестов покраснели (`expected 0 to be 60`). Откат — `git diff --stat`
пусто.

**Прогон:**
```
Test Files  1 passed (1)
     Tests  3 passed (3)
```

---

## Развилки (без ответа владельца)

Ничего нового сверх уже открытых развилок карты (`D20_INTEGRATOR_MAP.md`, раздел «Развилки»). По пункту 16
развилка №2 остаётся открытой, но её практический охват сузился: она относится только к
route-конструкциям без `idempotencyPort` (сегодня недостижимо через `app/di.ts`), а не к реально
задеплоенному пути.

Новая точка, вынесенная этим прогоном, не оформлена как развилка карты (там уже нет свободного номера,
предназначенного под неё), а зафиксирована здесь как факт для владельца:

- **`outgoingDeliveryQueue.reclaim.integration.test.ts` — мёртвая защита.** Существующий opt-in vitest-тест
  никогда не запускается в CI (флаг `RUN_OUTGOING_DELIVERY_RECLAIM_TEST` нигде не выставлен). Поведение
  теперь доказано доступным CI-путём (piece 4c нового скрипта), но сам файл остался как есть — решение о
  его судьбе (удалить / подключить флагом в CI как ещё один прогон) не входило в scope этого захода.

## Чего не смог

- Не проверял поведение реального `public.system_settings`-конфига `outgoing_delivery_reclaim_config` —
  оба D30-скрипта (старый и новый) намеренно создают только минимальную DDL нужной таблицы, поэтому конфиг
  ретеншна/reclaim читается с дефолтом (`outgoing_delivery_reclaim_config_defaulted` в логах, ожидаемо и не
  является ошибкой) — это тот же путь, что уже был в скрипте до этой задачи.
- Не проверял поведение `message_retry_jobs`/`retryPolicy.ts` под нагрузкой в реальности — только прочитал
  код и подтвердил через `grep`/чтение `main.ts`, что оба цикла сегодня живые; сам вырез (Ш7 плана D30) не
  входит в scope этой задачи и не выполнялся.
