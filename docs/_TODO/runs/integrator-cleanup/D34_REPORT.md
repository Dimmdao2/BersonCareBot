# D34 — отчёт: порт идемпотентности обязателен, in-memory фолбэк удалён
(run: worker-d34-idempotency-mandatory)

Источник задачи: `D34_IDEMPOTENCY_MANDATORY_BRIEF.md`, вход — `D20_FORKS_RESEARCH.md` §2.

## Что изменено

### `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`

- `BookingLifecycleRouteDeps.idempotencyPort` (строка 43): `IdempotencyPort` вместо `IdempotencyPort |
  undefined` — недостача порта теперь ошибка типов на границе роута.
- Удалены: модульная `Map`-заглушка `bookingEventDedup`, функции `isBookingEventDuplicate` и
  `rememberBookingEventKey` (были на строках 92–104 до правки) — единственный путь дедупликации остался
  Postgres-порт.
- `acquireBookingLifecycleKey` (строка 104) и `releaseBookingLifecycleKey` (строка 119): параметр
  `idempotencyPort` стал обязательным (`IdempotencyPort` вместо `IdempotencyPort | undefined`), убрана
  ветка `if (idempotencyPort) {...} else {...}` и поле `persistent` (больше нет двух путей, различать
  нечего).
- `handleBookingLifecycleEvent` (строка 564): третий параметр `options.idempotencyPort` обязателен,
  убран дефолт `= {}` — вызвать функцию без порта теперь невозможно на уровне типов.
- `handleBookingEventRequest` (строка 757): собирает `options` для `handleBookingLifecycleEvent` без
  условного `...(deps.idempotencyPort ? {...} : {})` — просто `idempotencyPort: deps.idempotencyPort`,
  потому что `deps.idempotencyPort` больше не может быть `undefined`.

### `apps/integrator/src/app/di.ts`, `apps/integrator/src/app/routes.ts`

Не менялись — проверка (§2 исследования, п. «Откуда работа») подтвердилась: `AppDeps.idempotencyPort`
(`di.ts:136`) уже был обязательным полем, `buildDeps` (`di.ts:254`) всегда конструирует боевой Postgres-порт,
`routes.ts:222-228` всегда передаёт `deps.idempotencyPort` в роут. Дыра была только в типе
`BookingLifecycleRouteDeps` внутри самого `bookingLifecycleRoute.ts` — она и закрыта.

### Тесты — `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.d14.test.ts`

- Импорт `createInMemoryIdempotencyPort` из `infra/db/repos/idempotencyKeys.ts` — это настоящая реализация
  `IdempotencyPort` (та же сигнатура `tryAcquire`/`release`, что у Postgres-порта), а не самодельная
  заглушка. Все 22 существующих вызова `handleBookingLifecycleEvent(...)`, ранее полагавшиеся на удалённый
  in-memory фолбэк (передавали `{}` или `{ webappEventsPort }` третьим аргументом), теперь передают
  `{ idempotencyPort: createInMemoryIdempotencyPort() }` — правка чисто механическая, поведение тестов не
  менялось.
- Новый `describe('D34: idempotencyPort is a mandatory dependency, not an in-memory fallback', …)`
  (в конце файла) — два новых теста:
  1. **Тип-тест «недостача порта не собирается»** — `BookingLifecycleRouteDeps` без `idempotencyPort` с
     `// @ts-expect-error`. Если поле снова станет опциональным, директива станет неиспользуемой, и
     `tsc --noEmit` покраснеет (доказательство поломкой — ниже).
  2. **Поведенческий тест дедупликации на настоящем порте** — одно и то же событие `booking.created`
     отправляется дважды через общий `createInMemoryIdempotencyPort()`; проверяется, что пациент получил
     ровно одно сообщение (фильтр по `eventId`, тот же приём, что уже использовали соседние тесты файла).

## Гейт приёмки

### Тест «маршрут без порта не собирается» — выбор: ошибка типов

Обоснование выбора (а не «падает при сборке зависимостей»): недостача теперь невозможна на уровне
*типа* `BookingLifecycleRouteDeps`/`handleBookingLifecycleEvent`, до какой-либо попытки собрать
приложение — раньше, чем рантайм-DI успеет отработать. Рантайм-проверка была бы избыточным дублированием
того, что уже гарантирует компилятор.

**Доказательство поломкой** (внёс руками, прогнал, откатил):

```
// вернул: idempotencyPort?: IdempotencyPort; в BookingLifecycleRouteDeps
$ pnpm --dir apps/integrator exec tsc --noEmit -p .
src/integrations/bersoncare/bookingLifecycleRoute.d14.test.ts(466,5): error TS2578: Unused '@ts-expect-error' directive.
src/integrations/bersoncare/bookingLifecycleRoute.ts(776,7): error TS2322: Type 'IdempotencyPort | undefined' is not assignable to type 'IdempotencyPort'.
  Type 'undefined' is not assignable to type 'IdempotencyPort'.
```

Красных строк две, не одна: самотест (`@ts-expect-error` стал лишним) и сама боевая проводка в
`handleBookingEventRequest` (строка 776 — `idempotencyPort: deps.idempotencyPort`). То есть поломка ловится
не только специально написанным тестом, но и типом самого маршрута — ровно то, что просил бриф.

### Тест «повторное событие с тем же ключом не создаёт вторую доставку» — на настоящем порте

**Доказательство поломкой** (внёс руками, прогнал, откатил): в `acquireBookingLifecycleKey` заменил
`return { acquired: await idempotencyPort.tryAcquire(...), storageKey }` на безусловное
`acquired: true` (порт дергается, но его ответ игнорируется — имитация «порт есть, а дедуп сломан»):

```
$ pnpm --dir apps/integrator exec vitest run src/integrations/bersoncare/bookingLifecycleRoute.d14.test.ts
 ❯ D34: idempotencyPort is a mandatory dependency, not an in-memory fallback
   × the same event id, delivered twice through the real port, reaches the patient exactly once
AssertionError: expected [ …(2) ] to have a length of 1 but got 2
- Expected: 1
+ Received: 2
```

Оба файла возвращены в исходное состояние сразу после снятия красного вывода (`diff` против бэкапа —
идентичны).

### Полный прогон интегратора

| | Test Files | Tests | Skipped |
|---|---|---|---|
| До правки | 23 passed, 3 skipped (26) | 158 passed | 9 |
| После правки | 23 passed, 3 skipped (26) | 160 passed | 9 |

`pnpm --dir apps/integrator run test` — зелёный, `+2` теста (новый describe-блок D34), ни один
существующий тест не менял поведение (правка вызовов — чисто механическая передача порта).
`pnpm --dir apps/integrator exec tsc --noEmit -p .` и `eslint` на оба изменённых файла — чисто.

## Развилки (найдено при проверке остальных потребителей порта — п.3 брифа)

`apps/integrator/src/kernel/eventGateway/index.ts:17` — `EventGatewayDeps.idempotencyPort?: IdempotencyPort`
тоже опционален, и при отсутствии порта `handleIncomingEvent` тихо пропускает дедуп целиком (`if
(idempotencyPort) { ... }`, без какого-либо фолбэка — то есть отсутствие порта там даже опаснее, дедуп не
происходит вообще никак). В проде порт передаётся всегда (`di.ts:279-282`, тот же
`createPostgresIdempotencyPort`), так что риск сегодня нулевой, тот же класс «тихая деградация типом»,
что чинили здесь.

**Не тронуто сознательно** — граница брифа прямым текстом выводит `eventGateway/dedup.ts` за периметр:
«Не трогать дедупликацию шлюза (`eventGateway/dedup.ts`) — это другой механизм». `eventGateway/index.ts`
использует `idempotencyPort` как часть этого же шлюзового механизма (валидация → rate-limit → dedup по
`buildDedupKey`), а не как отдельный потребитель booking-lifecycle порта — чинить его в этом прогоне
значило бы залезть за периметр без отдельного запроса. Строка — владельцу: чинить тем же приёмом (сделать
`idempotencyPort` обязательным в `EventGatewayDeps` и его потребителе) или оставить как есть, раз риск
сегодня нулевой.

## Чего не смог

Ничего не осталось несделанным по гейту брифа. Пункт «окно 24 часа против горизонта ретраев вебаппа» из
§2 исследования — вне периметра D34 (это не про фолбэк, а про длину TTL), информация об этом уже
зафиксирована в `D20_FORKS_RESEARCH.md` §2 самим исследованием и не была частью «что сделать» этого прогона.
