# D20 уровень 3 · отчёт по закрытию находок аудита F1–F5

Бриф: `worker-d20-level3-fix` (запуск 2, продолжение после салважа `33005b007`). Аудит:
`docs/_TODO/runs/integrator-cleanup/D20_LEVEL3_AUDIT.md`.

## Первый шаг — состояние салважа

`git show 33005b007` разобран перед началом работы. Три скрипта-доказательства уже получили
самопроверку числа пройденных piece (F5) и начало правки F1/F3; `bookingLifecycleRoute.dedup.test.ts`
уже был поджат под D34. Но салваж **оставил живой продуктовый баг**: строка `FOR UPDATE SKIP LOCKED`
была снята из `claimDueOutgoingDeliveries` (`outgoingDeliveryQueue.ts:202` на момент аудита) ради
F2-эксперимента и не была возвращена — это осталось в закоммиченном HEAD (`git show
HEAD:.../outgoingDeliveryQueue.ts` не содержал строки). Восстановлено первым делом, до любой другой
работы; `git diff --stat` после восстановления показывает ровно одну добавленную строку.

Также найдено, что F2-барьер из салважа (прогрев соединений + промис-барьер) **не давал устойчивого
красного** — три прогона поломки «снят SKIP LOCKED» после салважа дали 3/3 **зелёных**, хуже, чем
собственный результат аудитора (2/3 красных с одним прогревом, без барьера). Расследовано и
переделано — см. F2 ниже.

## Таблица F1–F5

| # | Статус | Файл(ы) | Поломка | Вывод ДО отката (красный) | Подтверждение отката (зелёный / diff) |
|---|---|---|---|---|---|
| **F1** | Закрыто | `infra/scripts/check-d30-idempotency-key-concurrency.ts`, piece 3 (уже добавлен в салваже, доведён до typecheck-чистоты) | `idempotencyKeys.ts:58` — `release()` заменён на `DELETE FROM integrator.idempotency_keys` без `WHERE` (снос всей таблицы, буквально находка аудита) | `check-d30-idempotency-key-concurrency: FAIL: releasing key A must not free key B — a re-acquire of the still-live key B must fail` | Правка отменена; скрипт → `PASS` (piece 1/2/3); `git diff --stat` на `idempotencyKeys.ts` пуст |
| **F2** | Закрыто (переделано) | `infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts`, piece 4a — промис-барьер и прогрев заменены на DB-триггер `CLAIM_RACE_DELAY_DDL` | Обе поломки аудитора повторены отдельно — см. раздел ниже | См. раздел «Повтор обеих поломок аудитора» | См. раздел «Повтор обеих поломок аудитора» |
| **F3** | Закрыто (уже в салваже) | `infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts`, piece 4c — контрольная строка `sent` добавлена | `outgoingDeliveryQueue.ts:117` — `WHERE status = 'processing'` заменено на `WHERE status IN ('processing', 'sent')` | `FAIL: reclaim must not touch an already-sent row, got status=pending sent_at=...` | Правка отменена; скрипт → `PASS`; `git diff --stat` на `outgoingDeliveryQueue.ts` показывает только восстановленную F2-строку (см. выше), F3-диффа нет |
| **F4** | **Уже закрыто, работа не повторялась** | `bookingLifecycleRoute.ts:43` (тип обязателен), `bookingLifecycleRoute.d14.test.ts:461-473` (тест D34) | `bookingLifecycleRoute.ts:43` — `idempotencyPort: IdempotencyPort;` заменено на `idempotencyPort?: IdempotencyPort;` (ровно та поломка, что называет аудит и что предотвращает `@ts-expect-error` в D34-тесте) | `tsc --noEmit`: `TS2578: Unused '@ts-expect-error' directive` (`bookingLifecycleRoute.d14.test.ts:466`) + `TS2322: Type 'IdempotencyPort \| undefined' is not assignable...` (`bookingLifecycleRoute.ts:776`) | Правка отменена; `tsc --noEmit` чист; `git diff --stat` на `bookingLifecycleRoute.ts` пуст |
| **F5** | Закрыто (уже в салваже, доведено до typecheck-чистоты) | Все три `check-d30-*.ts` скрипта — счётчик `passedPieces` + проверка после `main()` | Во всех трёх — `return;` первой строкой `main()` (пустой прогон) | Все три: `FAIL: expected all of [...] to report PASS, missing: [...] (a piece was skipped, or main() returned before reaching it)`, exit code 1 | Правка отменена во всех трёх; все три → `PASS`; `git diff --stat` пуст |

## F2 — расследование и починка барьера

Аудитор нашёл, что голая гонка (`Promise.all` двух вызовов `claimDueOutgoingDeliveries`) не гонка:
локальная задержка каждого вызова (доли миллисекунды) означает, что один вызов полностью коммитится
до того, как второй доходит до сервера — второй легитимно видит статус уже `processing` и корректно
пропускает строку. Салваж попытался закрыть это прогревом пула и клиентским барьером (обе async-
функции ждут один и тот же resolved-promise, чтобы стартовать в один тик). Мой прогон этого барьера
трижды подряд дал **зелёный** результат на поломке «снят `FOR UPDATE SKIP LOCKED`» — барьер не решил
проблему, а частично замаскировал её ещё сильнее, чем отсутствие барьера у аудитора.

Причина выяснена прямым экспериментом с ручным управлением транзакциями (`BEGIN`/`COMMIT` через два
`pg.Client`, без пула и без промисов): при снятой блокировке PostgreSQL действительно допускает
двойной захват, но НЕ из-за порядка старта запросов, а из-за документированного поведения read
committed для `UPDATE ... FROM` — сторона `FROM`/CTE замораживается на снимке начала команды. Если
транзакция B успевает начать свой оператор ДО коммита A, но её `UPDATE` блокируется на строке, которую
уже держит A, то после коммита A PostgreSQL пересчитывает JOIN только для целевой стороны (`q`), а не
пересчитывает саму `due`-CTE — та остаётся с исходным (устаревшим) id, условие `q.id = due.id`
по-прежнему истинно, и B тоже обновляет строку. Проблема не в том, кто раньше СТАРТОВАЛ (это и пытался
чинить клиентский барьер), а в том, держит ли A физическую блокировку строки в момент, когда B
пытается её захватить — а локальный `UPDATE` без искусственной задержки завершается за микросекунды,
и это окно почти никогда не совпадает с сетевым джиттером промис-барьера.

Прямой эксперимент (вне тестового скрипта, только для диагностики, не сохранён в репозитории):
```
A claimed rows: [ { id: 1 } ]
B claimed rows: [ { id: 1 } ]
```
— тот же id захвачен дважды, детерминированно, при удержании A незакоммиченной блокировки строки.

**Починка**: клиентский барьер и прогрев убраны, вместо них — `BEFORE UPDATE`-триггер на диспозабл-БД
скрипта (`CLAIM_RACE_DELAY_DDL`), который держит блокировку строки 400 мс именно на переходе
`… → processing` (не задевает piece 4b/4c, где такого перехода нет). Это гарантирует реальное
перекрытие в БД независимо от джиттера Node/сети, а не полагается на угаданную клиентскую
синхронизацию. Piece 4a теперь — простой `Promise.all` двух вызовов `claimDueOutgoingDeliveries`.

### Повтор обеих поломок аудитора (обязательное требование брифа)

**Поломка 1 — снят `FOR UPDATE SKIP LOCKED`** (`outgoingDeliveryQueue.ts:202`, строка убрана из CTE):

| Прогон | Результат |
|---|---|
| 1 | `FAIL: expected exactly one concurrent claim to win the due row, got 2` |
| 2 | `FAIL: expected exactly one concurrent claim to win the due row, got 2` |
| 3 | `FAIL: expected exactly one concurrent claim to win the due row, got 2` |

3/3 красных. Откат → `PASS` (piece 4a/4b/4c), `git diff --stat` на `outgoingDeliveryQueue.ts`
восстанавливается к одной строке (сама F2-правка, см. таблицу выше).

**Поломка 2 — двухфазный захват** (`claimDueOutgoingDeliveries` временно переписан на раздельные
`SELECT id ...` + `UPDATE ... WHERE q.id IN (...)`, ноль блокировок, ровно то, что описал аудит):

| Прогон | Результат |
|---|---|
| 1 | `FAIL: expected exactly one concurrent claim to win the due row, got 2` |
| 2 | `FAIL: expected exactly one concurrent claim to win the due row, got 2` |
| 3 | `FAIL: expected exactly one concurrent claim to win the due row, got 2` |

3/3 красных. Откат к исходной CTE-реализации с `FOR UPDATE SKIP LOCKED` → `PASS`; `git diff --stat`
на `outgoingDeliveryQueue.ts` — снова только восстановленная строка, продуктовый код идентичен
дореволюционному (кроме самой найденной и починенной пропажи).

Обе поломки теперь ловятся устойчиво (3/3), что и было условием приёмки.

## F4 — почему работа не повторялась

Аудит проверял клон до слияния D34 (`065564d8e`, «порт идемпотентности обязателен»). В текущей ветке
`BookingLifecycleRouteDeps.idempotencyPort` — обязательное поле (`bookingLifecycleRoute.ts:43`), и
`bookingLifecycleRoute.d14.test.ts:461-473` уже содержит тест-арбитр: конструирует
`BookingLifecycleRouteDeps` без `idempotencyPort` под `@ts-expect-error` — если поле снова станет
опциональным, `tsc --noEmit` красный (директива становится неиспользуемой + несовместимость типов на
`routes.ts`-эквивalente присвоении). Проверено прямой поломкой (см. таблицу) — красный получен именно
в этих двух местах, откат чист. Новой работы не делалось, находка помечена «уже закрыто» согласно
указанию брифа.

## Границы

- Продуктовый код тронут в одном месте и с одним обоснованием: `outgoingDeliveryQueue.ts:202`
  (`FOR UPDATE SKIP LOCKED`) — это не новая правка по брифу, а исправление бага, оставленного
  предыдущим (прерванным) прогоном в закоммиченном состоянии; без него `claimDueOutgoingDeliveries`
  в проде был бы уязвим к двойному захвату прямо сейчас. F3 не потребовала правки условия возврата —
  контрольная строка добавлена только в тест.
- Другие уровни не расширялись, границы аудита не превышены.
- Развилок не возникло.

## Итоговый прогон интегратора

Команда: `pnpm --dir apps/integrator run typecheck` и `pnpm --dir apps/integrator run test`.

| | Test Files | Tests | typecheck |
|---|---|---|---|
| Baseline после восстановления бага и до правок F1–F5 (салваж + восстановленная строка) | 27 passed \| 3 skipped (30) | 167 passed \| 9 skipped (176) | чист |
| После всех правок и откатов всех временных поломок | 27 passed \| 3 skipped (30) | 167 passed \| 9 skipped (176) | чист |

(167, не 161/165 — расхождение с числом в исходном брифе объясняется тем же, что и в аудите: мёрж
и добавление piece 3 F1 в салваже дают +2 к прежним 165.)

Три скрипта-доказательства — все `PASS` на итоговом (чистом) продуктовом коде:
`check:d30-idempotency-key-concurrency`, `check:d30-scheduler-lock-concurrency`,
`check:d30-outgoing-delivery-claim-concurrency`.

`git diff --stat -- 'apps/integrator/src/**/*.ts'` (финальное состояние, все временные поломки
отменены):

```
 .../src/infra/db/repos/outgoingDeliveryQueue.ts    |  1 +
 .../check-d30-idempotency-key-concurrency.ts       |  3 +-
 ...heck-d30-outgoing-delivery-claim-concurrency.ts | 62 ++++++++++++----------
 3 files changed, 38 insertions(+), 28 deletions(-)
```

`bookingLifecycleRoute.dedup.test.ts` и `check-d30-scheduler-lock-concurrency.ts` не в этом диффе —
салваж уже донёс их до финального состояния без дополнительных правок с моей стороны (кроме
временных проб для F5/F4, все отменены, `git diff --stat` по ним пуст).
