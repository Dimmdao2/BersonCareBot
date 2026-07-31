# D20 уровень 2 · закрытие находок повторного аудита N1–N9 — отчёт

Run: `worker-d20-level2-fix2`. Брифинг: `D20_LEVEL2_FIX2_BRIEF.md`. Аудит: `D20_LEVEL2_REAUDIT.md`.

**Гейт приёмки исполнен по каждой закрытой находке**: внесена ровно та поломка, что названа в
аудите, прогнан **полный** набор интегратора (`pnpm --dir apps/integrator exec vitest run`, не
узкий файл), показано красное (падает именно и только новый/расширенный тест), поломка откатана
через `git checkout -- <файл>`, показано зелёное. Продуктовый код по итогу **не изменён** — все
правки только в `*.test.ts`.

Числа тестов: **до** — `Test Files 20 passed | 3 skipped (23)` · `Tests 130 passed | 9 skipped (139)`.
**После** — `Test Files 20 passed | 3 skipped (23)` · `Tests 137 passed | 9 skipped (146)`.
(+7 новых `it`: N1 добавил 2, N4 добавил 1, N6 добавил 1, N7 добавил 1, N9/N11 добавили 0; N2/N3/N5/N8
расширили существующие `it`, новых счётных единиц не дали, кроме N2/N3, которые тоже добавили по 1
новому `it` — см. построчно ниже.)

## N1–N9

| # | Закрыто | Файл : строка | Поломка (внесена в продуктовый код для проверки, затем откачена) | Вывод полного прогона (красное → откат → зелёное) |
|---|---|---|---|---|
| **N1** | ✅ | `kernel/eventGateway/dedup.test.ts` — 2 новых `it` | `dedup.ts:23`: `${event.meta.source}:${event.type}:${serialized}` → `${event.type}:${serialized}` (M12, выброшен `source`); отдельно → `${event.meta.source}:${serialized}` (M13, выброшен `type`) | M12: `1 failed \| 131 passed \| 9 skipped (141)`, падает ровно новый тест «РАЗНЫЙ meta.source». M13: `1 failed \| 131 passed \| 9 skipped (141)`, падает ровно новый тест «РАЗНЫЙ type». Откат обоих → `132 passed \| 9 skipped (141)`, чисто |
| **N2** | ✅ | `infra/db/repos/notificationDeliveryAttempts.test.ts` — 1 новый `it` | `notificationDeliveryAttempts.ts:49-52`: обёртка принципала → голый `return fn(db);` (M5); отдельно → `${input.organizationId ?? null}::uuid` → `${null}::uuid` (M4, organization_id всегда NULL) | M5: `1 failed \| 132 passed \| 9 skipped (142)` — падает на `seenOrgAtInsert` (принципал не выставлен). M4: `1 failed \| 132 passed \| 9 skipped (142)` — падает на значении колонки `organization_id`. Откат обоих → `133 passed \| 9 skipped (142)`, чисто |
| **N3** | ✅ | `infra/db/repos/notificationDeliveryAttempts.test.ts` — 1 новый `it` | `notificationDeliveryAttempts.ts:67`: список колонок `..., channel, status, reason,` → `..., channel, reason, status,` (VALUES не тронуты) | `1 failed \| 133 passed \| 9 skipped (143)` — падает ровно новый тест, `expected 'muted' to be 'skipped'` (значение реально попало не в ту колонку, что называет текст запроса). Откат → `134 passed \| 9 skipped (143)`, чисто |
| **N4** | ✅ | `infra/runtime/worker/outgoingDeliveryWorker.finalize.test.ts` — 1 новый `it`, новый `describe` для `claimDueOutgoingDeliveries` | `outgoingDeliveryQueue.ts:206`: `attempt_count = q.attempt_count + 1,` → `attempt_count = q.attempt_count,` (инкремент убран) | `1 failed \| 134 passed \| 9 skipped (144)` — падает ровно новый тест: в тексте выполняемого UPDATE инкремента нет. Откат → `135 passed \| 9 skipped (144)`, чисто |
| **N5** | ✅ | `infra/runtime/worker/outgoingDeliveryWorker.finalize.test.ts` — расширены тесты 2 и 3 (dead/reschedule), новых `it` не добавлено | `outgoingDeliveryWorker.ts:115`: `const safeError = truncateDeliveryErrorMessage(message);` → `const safeError = '';` | `2 failed \| 133 passed \| 9 skipped (144)` — падают ровно два расширенных теста (dead-ветка и reschedule-ветка), оба на `expected '' to be 'advisory function unavailable'`. Откат → `135 passed \| 9 skipped (144)`, чисто |
| **N6** | ✅ | `infra/adapters/deliveryTargetsPort.test.ts` — 1 новый `it` | `deliveryTargets.ts:36`: `out.push({ channel, externalId: id.trim() });` → `out.push({ channel, externalId: id });` (`.trim()` убран из формирования значения, оставлен в условии) | `1 failed \| 135 passed \| 9 skipped (145)` — падает ровно новый тест, `externalId: ' 111 '` вместо `'111'`. Откат → `136 passed \| 9 skipped (145)`, чисто |
| **N7** | ✅ | `kernel/eventGateway/eventGateway.test.ts` — 1 новый `it` | `eventGateway/index.ts:48-55`: блок `if (!rate.allowed) { return {...}; }` удалён целиком | `1 failed \| 136 passed \| 9 skipped (146)` — падает ровно новый тест, `{status:'accepted'}` вместо `{status:'rejected', reason:'RATE_LIMITED_TEST'}`. Откат → `137 passed \| 9 skipped (146)`, чисто |
| **N8** | ✅ | `kernel/eventGateway/eventGateway.test.ts` — расширен первый тест (дубль по fingerprint), нового `it` не добавлено | `eventGateway/index.ts:89`: `return { status: 'accepted', dedupKey, event };` → `return { status: 'accepted', dedupKey: 'static:dedup-key', event };` | `1 failed \| 136 passed \| 9 skipped (146)` — падает ровно расширенный тест: `dedupKey` в ответе не совпадает с ключом, реально занятым в `idempotencyPort`. Откат → `137 passed \| 9 skipped (146)`, чисто |
| **N9** | ❌ не закрыто | `kernel/domain/usecases/processAcceptedIncomingEvent.ts:47` | — (тест не писался) | — |

### N9 — почему не закрыто

Разбор: `handleIncomingEvent.ts:360-381` строит `intents: OutgoingIntent[]` исключительно через
`intents.push(...result.intents)` — плотным append, без индексного присваивания. При такой
конструкции `domainResult.intents[i]` физически не может быть `undefined` в проде: массив всегда
плотный. Проверка `if (intent === undefined) continue;` в `processAcceptedIncomingEvent.ts:47` —
защита на случай появления «дырки» в будущем (или уступка `noUncheckedIndexedAccess`), а не
покрытие реально достижимого сегодня пути.

Чтобы тест поймал замену `continue` на `break`, пришлось бы искусственно подсунуть
`domainResult.intents` с настоящей дырой — то есть подменить `handleIncomingEvent` моком, которого
`processAcceptedIncomingEvent.ts` не принимает как зависимость (функция вызывается напрямую, не
через DI-порт). Это был бы тест теоретического сценария без действительного пути в сегодняшнем
коде — прямое нарушение правила «теоретические edge cases без actual path — не находки»
(`AGENTS.md`, раздел «Не высасывай проблемы из пальца»). Аудит сам оценил N9 как L и явно оставил
его на усмотрение владельца («отдельного теста, возможно, не стоит»), что совпадает с этим
разбором.

**Развилка владельцу:** закрывать ли N9 тестом теоретического сценария (потребует либо
рефакторинга `processAcceptedIncomingEvent` под DI `handleIncomingEvent`, либо `vi.mock` на
`../../handleIncomingEvent.js`), либо оставить как есть, раз реального пути к поломке нет. Работа
не заведена без ответа владельца — по границам брифа.

## N10 — исправление формулировки (не тест)

**Файл:** `kernel/eventGateway/eventGateway.test.ts:197-201` (комментарий последнего `it`).
**Было:** «Единственный продовый вызов (scheduler:handle-tick-event) всегда передаёт
`options.runPipeline`» — без упоминания двух других вызовов.
**Стало:**

```
// Все шесть тестов выше зовут handleIncomingEvent БЕЗ options. Продовых вызовов handleIncomingEvent
// три: telegram/webhook.ts:382 и max/webhook.ts:329 зовут его БЕЗ options (принципал ставится
// снаружи, вокруг всего вызова); scheduler:handle-tick-event (organizationTicks.ts:30,43-45) —
// единственный, что передаёт `options.runPipeline`, оборачивая исполнение в
// runWithOrganizationPrincipal — без этого пропуск в проде побежит без принципала арендатора.
```

Проверено `grep -n handleIncomingEvent` по не-тестовым файлам интегратора: ровно три вызывающих
(`integrations/telegram/webhook.ts:382`, `integrations/max/webhook.ts:329`,
`infra/runtime/scheduler/organizationTicks.ts:30`), только последний передаёт `options`. Сам тест
не менялся, только формулировка обоснования в комментарии.

## N11 — долг, не находка (работа не заведена)

Аудит сам классифицировал это как унаследованный от `scope.test.ts` уровня 0 риск сопровождения, а
не дефект: harness в `outgoingDeliveryWorker.finalize.test.ts` (строки 159/171/179 после правок
N4/N5) маршрутизирует по подстроке SQL (`sql.includes("status = 'dead'")` и т.д.), поэтому переписывание
`outgoingDeliveryQueue.ts:283` без смены поведения (например, замена литерала `'failed_retryable'`
на эквивалентную конструкцию) даст ложное красное — тест покраснеет не потому, что заметил
поломку поведения, а потому что харнесс не нашёл нужную подстроку.

Малой правкой заглушки это не закрывается: сам аудит прямо пишет — «чинить — только вместе с
[`scope.test.ts` уровня 0], отдельной задачей» (тот же приём маршрутизации по SQL-тексту
унаследован оттуда). Уровень 0 — вне границ этого прогона («не расширять область: уровни 0/1/3 и
остальные тесты не трогать»). Строка зафиксирована здесь, работа не заводилась.

## Границы соблюдены

- Продуктовый код не изменён: `git diff --stat -- apps/integrator/src` (за вычетом
  device-артефактов `.env.example`, не относящихся к этому прогону — см. `D20_LEVEL2_REAUDIT.md`,
  раздел «Состояние репозитория») показывает изменения только в пяти `*.test.ts` файлах.
- Уровни 0/1/3 и остальные тесты не тронуты.
- N9 не закрыт без правки кода — строка выше с точной причиной, а не тихая правка/красный тест.
- Развилка по N9 сформулирована владельцу, новых требований не изобретено.
