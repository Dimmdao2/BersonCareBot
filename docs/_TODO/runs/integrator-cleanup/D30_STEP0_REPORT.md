# D30 · Ш0 — отчёт: замок планировщика и гейт решений (тесты и защита)

(run: worker-d30-step0)

**Authority:** `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md`, шаг Ш0, раздел 2a.
Продуктовое поведение доставки не менялось. `schedulerDecisionGuard` (условие 1) в этот прогон не входит —
как и было указано в брифе.

Все пять кусков сделаны. Каждый пункт ниже: что сделано → какой файл → чем доказано (внесённая поломка +
вывод прогона) → что осталось.

---

## 1. Тест захвата замка двумя экземплярами

**Файлы:**
- `apps/integrator/src/infra/db/repos/schedulerLocks.ts` — без изменений в части захвата (`tryAcquireSchedulerLock`
  как был).
- `apps/integrator/src/infra/scripts/check-d30-scheduler-lock-concurrency.ts` — новый скрипт-доказательство.
- `apps/integrator/src/infra/scripts/d30DisposablePostgres.ts` — общий хелпер: одноразовый PostgreSQL 16
  (`initdb`/`pg_ctl`/`createdb` в `/tmp`, только unix-сокет), тот же приём, что уже есть в репозитории
  (`docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md`,
  `apps/webapp/scripts/patient-invites-disposable-proof.mjs`).
- Команда: `pnpm --dir apps/integrator run check:d30-scheduler-lock-concurrency`.

**Почему не vitest `*.postgres.integration.test.ts`.** `.cursor/rules/test-execution-policy.md` §«DB/RLS —
после аудита и стабилизации БД» прямо запрещает **новую** DB/RLS test-механику в vitest до отдельного
owner-go. Concurrency-доказательства на замке и на очереди — не RLS, но чтобы не спорить о границе, взят уже
существующий в репозитории санкционированный класс — одноразовый standalone-скрипт (`node`/`tsx`), как у
`check-c4a-843-clinic-invite-concurrency.mjs`. Это не новая механика, а применение существующей к новому
объекту.

**Доказательство (сделал скриптом, а не только рассуждением):**

Зелёный прогон:
```
[piece 1] PASS: second concurrent acquire got null, post-release acquire succeeded
```

Внесённая поломка — `schedulerLocks.ts`, `tryAcquireSchedulerLock`:
```diff
-    const locked = await pgTrySessionAdvisoryLock(client, key);
+    const locked = true; // MUTATION: always report "acquired" regardless of the actual result
```
Вывод прогона (красный):
```
check-d30-scheduler-lock-concurrency: FAIL: a second concurrent acquire must return null while the first holds the lock
```
Поломка внесена и откачена командой `cp`, после отката — `git diff --stat` пуст, прогон снова зелёный.
Это ровно та поломка, которую называет бриф: «краснеет, если `tryAcquireSchedulerLock` подменить на
"всегда захватил"».

**Что осталось:** ничего по этому пункту.

---

## 2. Проверка владения замком внутри тика

**Файлы:**
- `apps/integrator/src/infra/db/pgAdvisoryLock.ts` — добавлена `pgSessionAdvisoryLockStillHeld(client, key)`:
  читает `pg_locks` по `pid = pg_backend_pid()` **этого же соединения** и реконструирует ключ
  (`classid::bigint << 32 | objid::bigint`), а не переповторяет `pg_try_advisory_lock` (он реентерабелен —
  повторный вызов на том же соединении молча продлил бы счётчик захвата вместо проверки).
- `apps/integrator/src/infra/db/repos/schedulerLocks.ts` — `DbLockHandle` получил `assertStillHeld()`,
  кидает новый `SchedulerLockLostError`. На `client` навешан `client.on('error', …)` — без этого падение
  соединения (тот сценарий, который проверяет этот пункт) роняет **весь процесс** необработанным
  `'error'`-событием раньше, чем `assertStillHeld` вообще успевает что-то заметить (см. «находка» ниже).
- `apps/integrator/src/infra/runtime/scheduler/schedulerLockedTick.ts` — новый: одна проверяемая функция
  `runSchedulerLockedTick`, которая делает `assertLockStillHeld()` **до** обоих тел тика.
- `apps/integrator/src/infra/runtime/scheduler/schedulerLockedTick.unit.test.ts` — чистый unit (без БД),
  два теста: проверка блокирует оба тика при потере замка; проверка идёт первой при живом замке.
- `apps/integrator/src/infra/runtime/scheduler/main.ts` — `while(true)` вызывает `runSchedulerLockedTick`;
  `SchedulerLockLostError` ловится отдельно от обычных ошибок тика и ведёт к `releaseLock()` + `process.exit(1)`
  (не к «залогировать и продолжить», как остальные ошибки).
- `apps/integrator/src/infra/scripts/check-d30-scheduler-lock-concurrency.ts` — тот же скрипт, что и в п.1,
  вторая половина (`[piece 2]`): `pg_terminate_backend` на бэкенде, держащем замок, затем `assertStillHeld()`.

### 2а. Unit-тест на порядок проверки (без БД)

Зелёный прогон:
```
✓ runSchedulerLockedTick > does not run either tick body when the lock ownership check fails
✓ runSchedulerLockedTick > runs the ownership check before both tick bodies when the lock is held
```
Внесённая поломка — переставил проверку **после** обоих тиков в `schedulerLockedTick.ts`:
```diff
-  await deps.assertLockStillHeld();
   await deps.runOrganizationTicks();
   await deps.runOperatorHealthProbeTick();
+  await deps.assertLockStillHeld();
```
Вывод (красный, оба теста):
```
✗ does not run either tick body when the lock ownership check fails
  expect(runOrganizationTicks).not.toHaveBeenCalled()  — called
✗ runs the ownership check before both tick bodies when the lock is held
  expected ['organization','operatorHealth','assert'] to equal ['assert','organization','operatorHealth']
```
Откачено, зелёный прогон подтверждён повторно.

### 2б. Реальный обрыв соединения (disposable Postgres)

Зелёный прогон:
```
[piece 2] PASS: assertStillHeld() threw SchedulerLockLostError after connection loss, lock was re-acquirable
```
Внесённая поломка — `assertStillHeld` превращён в no-op:
```diff
-      assertStillHeld: async () => {
-        if (connectionErrored !== undefined) { throw new SchedulerLockLostError(key, ...); }
-        ...
-      },
+      assertStillHeld: async () => { return; },
```
Вывод (красный):
```
check-d30-scheduler-lock-concurrency: FAIL: assertStillHeld() must throw SchedulerLockLostError after the holding connection was terminated
```
Откачено, `git diff --stat` после отката = точная разница с оригиналом (51 добавленная/изменённая строка —
только моя фича, без остатков мутации), зелёный прогон подтверждён.

### Находка, сделанная тестированием (не была в брифе буквально, но напрямую в его предмете)

Пока строил живой прогон п.2б, поймал живьём: **исключение, брошенное внутри слушателя `'error'` у
`EventEmitter`, ничем не перехватывается и валит процесс целиком** — это тот самый режим отказа, ради
предотвращения которого слушатель и ставится (комментарий в коде это и объясняет). У `logger.error` внутри
такого слушателя нет права бросить — обёрнуто в `try/catch` по образцу уже существующего в этом репозитории
`logDbError` (`apps/integrator/src/infra/db/client.ts`) — «logging must never throw past the original error»,
только здесь — «past the original connection error». Без этой обёртки живой прогон п.2б либо ронял весь
Node-процесс необработанным исключением, либо (после первой правки) зависал навсегда: `pool.end()` в
`closeDb()` не резолвится, если удержанный клиент с мёртвым соединением не был явно `release()`-нут — узнал
это эмпирически (безрезультатный `beforeExit`/`exit` без осевших колбэков), почему скрипт п.2б теперь
явно зовёт `third.release()` после проверки потери замка, как это уже делает `main.ts` в
`SchedulerLockLostError`-ветке.

**Что осталось:** ничего продуктового. Технический долг: сам факт, что `pool.end()` без явного
`release()` мёртвого клиента виснет навсегда — не проверен отдельным тестом (обнаружен только эмпирически
при написании прогона). Не добавлял отдельного теста на это осознанно: это поведение библиотеки `pg`, а не
код этого репозитория, и `main.ts` уже вызывает `releaseLock()` (→ `lockHandle.release()`) в ветке потери
замка, так что продукт этой ловушки не касается.

---

## 3. `process.exit(1)` vs `Restart=on-failure` — решено, не только описано

**Решение:** оставить `process.exit(1)` и `Restart=on-failure`/`RestartSec=5` **как есть** — это
единственный сегодняшний механизм подхвата лидерства (raздел 5 плана прямо называет его «путь подхвата
лидерства, который обязан быть протестирован» после переезда заданий). Отказаться от него (выйти нулевым
кодом) означало бы, что живой процесс, проигравший гонку за замок, никогда больше не попытается стать
лидером — а второй экземпляр появляется только при ручном рестарте. Явную политику подхвата лидерства
(раздельный сервис-наблюдатель и т.п.) в брифе строить не просили и это была бы лишняя машинерия для Ш0.

**Что было неверно и исправлено — не поведение, а комментарий.** Старый комментарий утверждал, что
ненулевой код «avoids a tight restart loop» — это буквально наоборот: ненулевой код это ровно то, что
**вызывает** restart loop у systemd. Поправлено в двух местах `main.ts`:

1. Строка про «не захватил замок при старте» (было `main.ts:54`):
   > «этот ненулевой exit — сама leader-election-гонка: `Restart=on-failure` + `RestartSec=5`... превращает
   > каждый проигравший экземпляр в standby, который перезаходит на гонку каждые 5с».
2. Новая ветка «потерял замок в цикле» (п.2 выше) — тот же смысл, симметрично.

**Гейт, который пином фиксирует фактическое поведение файла** — раздел 5 ниже (`Restart=on-failure` в
`deploy/systemd/bersoncarebot-scheduler-prod.service` теперь проверяется тестом, а не только словами в
комментарии кода).

**Что осталось:** развилка №1 плана (свести `worker`+`scheduler` в один процесс с одним замком) — вопрос
владельцу, не Ш0.

---

## 4. Тест конкурентного захвата строки очереди

**Файлы:**
- `apps/integrator/src/infra/db/repos/outgoingDeliveryQueue.ts` — без изменений (код уже правильный;
  тест это доказывает поломкой, а не переписыванием).
- `apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts` — новый скрипт,
  тот же disposable-Postgres приём. DDL для `public.outgoing_delivery_queue` собран из реальных миграций
  `0060_outgoing_delivery_queue.sql` + `0107_messenger_bot_blocked.sql` (`failure_class`) +
  `0280_outgoing_delivery_queue_reclaim_count_local.sql` (`reclaim_count`) — не выдуман.
- Команда: `pnpm --dir apps/integrator run check:d30-outgoing-delivery-claim-concurrency`.

**Доказательство, часть а — два конкурентных `claim` одной due-строки:**

Зелёный прогон:
```
[piece 4a] PASS: two concurrent claims on one due row, exactly one won
```
Первая внесённая поломка — снял только `SKIP LOCKED`, оставив `FOR UPDATE` — **прогон остался зелёным**
(зафиксировано честно, а не скрыто): без параллельных воркеров, съедающих очередь, `FOR UPDATE` просто
сериализует два вызова, а фильтр `status IN ('pending','failed_retryable')` во втором вызове после коммита
первого сам по себе не даёт повторно забрать ту же строку — `SKIP LOCKED` в этом узком сценарии влияет на
пропускную способность, а не на защиту от двойного захвата. Это не бесполезная находка: она показывает, что
именно защищает от двойной отправки — фильтр по статусу внутри одного атомарного `UPDATE`, а не `SKIP LOCKED`
сам по себе. Настоящая поломка, воспроизводящая двойной захват:
```diff
 WHERE status IN ('pending', 'failed_retryable')
-  AND next_retry_at <= now()
+  AND next_retry_at <= now()
```
(убрал именно `status IN (...)`, оставив `FOR UPDATE SKIP LOCKED`). Вывод (красный):
```
check-d30-outgoing-delivery-claim-concurrency: FAIL: expected exactly one concurrent claim to win the due row, got 2
```
Откачено, `diff` с бэкапом пуст, зелёный прогон подтверждён повторно.

**Доказательство, часть б — повторный `enqueue` с тем же `event_id`:**

Зелёный прогон:
```
[piece 4b] PASS: repeated enqueue with the same event_id did not create a second row
```
Внесённая поломка — убран `ON CONFLICT (event_id) DO NOTHING`:
```diff
     ) VALUES (...)
-    ON CONFLICT (event_id) DO NOTHING
     RETURNING true AS inserted`,
```
Вывод (красный — здесь поломка проявляется как исключение, а не как несовпадение утверждения, что даже
нагляднее: без идемпотентности повтор не тихо дублирует строку, а **падает** на живом уникальном индексе):
```
check-d30-outgoing-delivery-claim-concurrency: FAIL: duplicate key value violates unique constraint "uq_outgoing_delivery_queue_event_id"
```
Откачено, `diff` с бэкапом пуст, зелёный прогон подтверждён повторно.

**Что осталось:** DDL в скрипте собран вручную из трёх миграций и требует ручной синхронизации, если схема
`outgoing_delivery_queue` изменится (например, в Ш1 добавится `organization_id`). Не стал автоматизировать
вычитку миграций в скрипт — это увеличило бы машинерию ради Ш0, где схема ещё не меняется.

---

## 5. Тест по файлам `deploy/systemd/*.service`

**Файлы:**
- `apps/integrator/src/infra/runtime/scheduler/deploySystemdSchedulerUnitGate.ts` — анализатор (не
  regex-пиннинг текста целиком, а структурная проверка трёх независимых свойств):
  1. ровно один unit на среду (группировка по суффиксу `-prod`/`-test`/… перед `.service`);
  2. `Restart=on-failure` присутствует;
  3. пин хоста на месте (`ConditionHost=` **и** `ExecCondition=...hostname...` — оба вместе).
- `apps/integrator/src/infra/runtime/scheduler/deploySystemdSchedulerUnitGate.test.ts` — тест на реальные
  файлы репозитория + самотесты «сломай специально» на фикстурах для каждого из трёх свойств отдельно.
- Тот же приём, что у `apps/webapp/src/modules/org-entitlements/ladderConstants.ts` (упомянут в брифе как
  образец): пути считаются от `import.meta.url`, не от cwd.

**Доказательство — не только на фикстурах, но и на реальных файлах репозитория** (полноценная поломка внесена
в `deploy/systemd/`, не только в тестовые строки):

Зелёный прогон (7/7):
```
✓ finds no violation in the real repository deploy/systemd files
✓ there is exactly one scheduler unit file in the repository today
✓ catches a second scheduler unit silently added for the same environment
✓ catches a scheduler unit missing Restart=on-failure
✓ catches a scheduler unit that dropped its host pin
✓ does not fire on a clean single-unit fixture
✓ ignores non-scheduler unit files entirely
```

Поломка 1 — скопирован реальный файл в `deploy/systemd/bersoncarebot-scheduler-standby-prod.service`
(второй prod-unit планировщика). Красный вывод:
```
× finds no violation in the real repository deploy/systemd files
  → 2 scheduler units declared for environment "prod", expected exactly 1
× there is exactly one scheduler unit file in the repository today
```
Откачено (`rm`), `git status --porcelain deploy/systemd/` пуст.

Поломка 2 — из настоящего `bersoncarebot-scheduler-prod.service` вырезана строка `Restart=on-failure`.
Красный вывод:
```
× finds no violation in the real repository deploy/systemd files
  → bersoncarebot-scheduler-prod.service: missing "Restart=on-failure"
```
Откачено (`cp` бэкапа), `git status --porcelain deploy/systemd/` пуст, зелёный прогон подтверждён.

**Что осталось:** ничего по этому пункту.

---

## Точечный прогон, командой и выводом

```
$ pnpm --dir apps/integrator typecheck
(пусто — успех)

$ pnpm --dir apps/integrator test
 Test Files  16 passed | 3 skipped (19)
      Tests  97 passed | 9 skipped (106)

$ pnpm --dir apps/integrator run check:d30-scheduler-lock-concurrency
[piece 1] PASS: second concurrent acquire got null, post-release acquire succeeded
[piece 2] PASS: assertStillHeld() threw SchedulerLockLostError after connection loss, lock was re-acquirable
check-d30-scheduler-lock-concurrency: PASS

$ pnpm --dir apps/integrator run check:d30-outgoing-delivery-claim-concurrency
[piece 4a] PASS: two concurrent claims on one due row, exactly one won
[piece 4b] PASS: repeated enqueue with the same event_id did not create a second row
check-d30-outgoing-delivery-claim-concurrency: PASS
```

Оба `check:d30-*` скрипта — opt-in standalone-команды (как существующие `check:c4a-843-...` в
`apps/webapp/package.json`), не входят в `pnpm run ci` автоматически. Это осознанный выбор — см. раздел 1
выше про границу с `.cursor/rules/test-execution-policy.md`. Если владелец захочет, чтобы они гоняли в
CI/pre-push — это отдельная строка в `.cursor/rules/pre-push-ci.mdc`, не делал самовольно, т.к. это
расширение зоны действия full CI не входило в бриф.

---

## Развилки (вопросы владельцу; сам не решаю)

Новых развилок в ходе Ш0 не возникло — все найденные вопросы уже перечислены в плане (раздел «Развилки»,
пункты 1–6) и не блокируют сделанное здесь. Единственное уточнение по существующей развилке №1 (топология
процессов): сделанный в этом прогоне механизм подхвата лидерства (п.3 выше) работает одинаково что при
одном процессе, что при двух — решение развилки №1 этот факт не меняет и им не блокируется.

---

## Чего я не смог выяснить

1. **Использует ли прод `DATABASE_URL_SCHEDULER` пул через pgbouncer в transaction-режиме.** Advisory-локи
   (и то, на чём стоит вся защита из п.2) официально несовместимы с transaction-pooling — если сессия
   планировщика на проде идёт через такой pooler, `pg_try_advisory_lock`/`assertStillHeld` могут вести себя
   не так, как в этом прогоне (сессия, которую видит наше приложение, физически не гарантированно та же, что
   держит замок в постгресе). Доступа к `/opt/env/bersoncarebot/api.prod` у меня нет и быть не должно;
   нужен ответ владельца или того, у кого есть доступ к прод-конфигурации пула.
2. **Фактическая частота обрывов соединения планировщика на проде** (как часто случается тот сценарий,
   который проверяет п.2) — не в репозитории, не проверял.
3. **Поведение `pool.end()` в `pg` при неосвобождённом мёртвом клиенте** (находка из п.2, «Находка, сделанная
   тестированием») — воспроизвёл эмпирически, но не нашёл и не читал документацию/исходники `pg`, которая бы
   объясняла это осознанно, а не по наблюдению. Не блокирует продукт (main.ts уже вызывает `release()` в
   нужной ветке), но при появлении похожего кода в будущем стоит иметь в виду.
