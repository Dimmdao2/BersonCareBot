# Blind audit disposable PostgreSQL harness — Б1

- Роль: `auditor-live`
- Authority: `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, Б1
- Target product commit: `5bc9a7018`
- Дата: 2026-08-01

## Blind kill-set — зафиксирован до inspection

Ниже перечислены поломки, выведенные только из authority и audit brief. До фиксации этого списка product diff,
pilot, acceptance-тесты и `DISPOSABLE_POSTGRES_HARNESS_TRANSPLANT_REPORT.md` не читались.

| ID | Конкретная поломка | Наблюдаемый отказ, который обязан поймать аудит |
| --- | --- | --- |
| K01 | Клиент первого test query берёт ambient `DATABASE_URL`/`PG*`, хотя harness выдал безопасный clone URL. Для инъекции ambient указывает на доступную non-`pbt_` базу того же приватного disposable cluster. | Run краснеет до выполнения test query по фактическому `current_database()`, а non-`pbt_` база не получает тестовых записей. |
| K02 | Pre-query guard валидирует переданную строку URL, а не реальное соединение; clone URL временно подменён на доступную non-`pbt_` базу приватного cluster. | Pilot краснеет на фактическом имени БД до первого прикладного запроса. |
| K03 | Template строится из пустого `initdb`/legacy общего migrator вместо committed A0 schema+seed+ledger и только pending webapp Drizzle migrations. | A0 gate либо schema/ledger probe краснеет; «зелёная», но иная схема не принимается. |
| K04 | Pending webapp Drizzle migration пропущена или ошибка migration проглатывается. Временная pending migration содержит заведомо неисполняемый SQL. | Template setup краснеет именно на migration; после полного отката инъекции исходная healthy chain снова зелёная. |
| K05 | Сборка зависит от случайного порядка/времени/остатка предыдущего запуска, поэтому две fresh template build дают разные normalized schema. | Сравнение двух независимо построенных normalized schema краснеет и показывает различие. |
| K06 | Имя clone/role вычисляется без invocation/file uniqueness, и два файла при `maxWorkers=2` получают одну mutable DB. | Параллельный probe с разными sentinel-значениями краснеет при cross-file visibility или конфликте имён; на исправном harness оба файла видят только свой sentinel. |
| K07 | Healthy teardown не удаляет clone/template либо останавливает cluster до завершения worker teardown. | Exact database list и exact `/tmp/pbt_cluster_*` до/после показывают утечку или teardown race. |
| K08 | Ошибка pending migration/setup обходит cleanup. | После ожидаемо красного setup exact database list и `/tmp/pbt_cluster_*` совпадают с baseline. |
| K09 | Намеренное падение тела теста обходит cleanup clone/template/cluster. | После ожидаемо красного test run exact database list и `/tmp/pbt_cluster_*` совпадают с baseline. |
| K10 | Collection/`vitest list` запускает setup, но не teardown, оставляя cluster/clone. | После list-only exact database list и `/tmp/pbt_cluster_*` совпадают с baseline. |
| K11 | Заявленный signal handler отсутствует/дублируется либо завершает процесс до cleanup. | После адресного сигнала дочернему test-runner нет новых exact cluster paths/БД; исходный exit semantics не маскируется. Если signal handling не заявлен, пункт явно помечается `НЕ ПРИМЕНИМО`. |
| K12 | PostgreSQL принимает TCP, binary выбирается через недоверенный `PATH`, socket выходит из guarded scratch либо scratch имеет mode не `0700`. | Runtime transport probe/инспекция краснеет: trusted binaries absolute, `listen_addresses` выключен, Unix socket внутри exact cluster root, mode `0700`. |
| K13 | Cleanup target строится через glob, ambient/env или непроверенный prefix; рядом создан decoy `/tmp/pbt_cluster_*`, не принадлежащий invocation. | Cleanup отказывает на неразрешённой цели и удаляет только exact registered path; decoy сохраняется. |
| K14 | `initdb`/`pg_ctl` падает после частичной инициализации, до регистрации полного runtime state. | Partial cluster path удалён без glob; посторонние guarded decoy paths не затронуты. |
| K15 | Активное соединение с template/clone переживает worker и делает `DROP DATABASE`/остановку недетерминированными. | Intentional open-connection probe не оставляет БД/cluster; teardown ordering закрывает/terminate-ит соединения до drop. |
| K16 | Global teardown начинает удалять template/cluster, пока worker clone ещё используется, либо duplicate event handlers запускают cleanup дважды. | Параллельный delayed probe не получает connection loss, cleanup выполняется идемпотентно и не маскирует первоначальный результат. |
| K17 | Pilot выпал из `vitest list`/runner-visibility gate либо попал в обычный DB-free unit project. | Явный list/visibility gate видит pilot, targeted DB project исполняет его, DB-free unit project его не запускает. |
| K18 | При трансплантации изменён/удалён хотя бы один из 22 `*.devDb.integration.test.ts` или фактически начат Б3. | Diff/state census показывает ровно 22 сохранённых файла без product diff по ним. |
| K19 | Создана конкурирующая lifecycle implementation рядом с `apps/webapp/src/app-layer/testing/pg-harness.ts`. | Import/diff review показывает один owner lifecycle; существующий helper либо переиспользуется, либо остаётся иной узкой границей без второго cluster lifecycle. |
| K20 | Harness втягивает integrator contour, legacy `run-migrations.mjs`/`loadCutoverEnv()` или выдаёт owner-role pilot за A1/RLS proof. | Diff/import/runtime review краснеет на таком участии/claim; A0 и A1 остаются отдельными gates. |

## Fault injection results

Blind kill-set: **17 killed, 2 missed, 1 not applicable**. Число получено построчной классификацией таблицы
ниже; дополнительная, найденная уже при inspection поломка остановки PostgreSQL вынесена отдельно и в blind
число не подмешана.

| ID | Результат | Точная команда и evidence |
| --- | --- | --- |
| K01 | KILLED | Временная мутация `vitest.postgres.setup.ts`: clone connection заменён на ambient `DATABASE_URL`. Команда `B1_EXPECT_CHILD_RC=1 pnpm --dir apps/webapp exec tsx scripts/postgres-integration/b1-ambient-audit-probe.ts` передала доступную private-cluster БД `audit_non_pbt`; pre-query guard дал `current_database()="audit_non_pbt"`, child `exit=1`, decoy sentinel остался `1`. Без мутации та же команда с `B1_EXPECT_CHILD_RC=0` дала child `exit=0`, sentinel `1`. Временный probe и мутация удалены. |
| K02 | KILLED | Та же точная команда K01 покраснела до импорта pilot: `Tests no tests`, ошибка на фактическом `current_database()`, а не на разборе URL. |
| K03 | **MISSED** | `pnpm run test:webapp:postgres` с сохранённым acceptance oracle: `expected [] to have a length of 68 but got 0`, `exit=1`. Ожидание `68` взято самим тестом из committed `migration-manifest.json`; команда A0 ниже независимо дала `manifestEntries.integrator=68`. Target seed-ит только Drizzle ledger. |
| K04 | KILLED | После временного добавления `SELECT * FROM b1_audit_missing_relation` в pending `0297`: `pnpm run test:webapp:postgres` → migration `0297_commercial_access_state_removal_local`, SQLSTATE `42P01`, `exit=1`, `elapsed_ms=8792`. После полного reverse-patch: та же команда → `1` file / `1` test passed, `exit=0`, `elapsed_ms=9190`. |
| K05 | KILLED | Временный probe: `pnpm --dir apps/webapp exec tsx scripts/postgres-integration/b1-schema-audit-probe.ts` → две fresh build, обе `1034891` normalized bytes, SHA-256 `3a81b7b25c4ed9addcfbd63d9e37499bc441e13544d04793907ef63ad0d07ff3`, `normalizedSchemaEqual=true`, `exit=0`, `elapsed_ms=14148`. Probe удалён. |
| K06 | KILLED | Два временных файла создавали одинаковую таблицу и разные sentinels: `VITEST_MAX_WORKERS=2 pnpm --dir apps/webapp exec vitest run --config vitest.postgres.config.ts <parallel-A> <parallel-B>` → `2` files / `2` tests passed, `exit=0`, `elapsed_ms=9898`; каждый файл увидел только своё значение. При временной мутации обоим выдано имя `pbt_b1_audit_fixed_collision`: та же команда → duplicate `pg_database_datname_index`, `1` file failed / `1` passed, `exit=1`, `elapsed_ms=10801`. Файлы и мутация удалены. |
| K07 | KILLED | Healthy `pnpm run test:webapp:postgres` → `1/1` green, `exit=0`, `elapsed_ms=10660`; delayed parallel probe K06 не потерял соединение. После всех прогонов `find "$(node -e "const os=require('node:os'); process.stdout.write(os.tmpdir())")" -mindepth 1 -maxdepth 1 -type d -name 'pbt_cluster_*' -print | wc -l` → `0`. Отдельная stop-error поломка ниже не относится к healthy path. |
| K08 | KILLED | Setup/migration faults: K04 (`exit=1`); K01/K02 guard fault (`childStatus=1`); `B1_AUDIT_CLUSTER_FAULT=after-initdb pnpm run test:webapp:postgres` → `5` отказавших попыток, `exit=1`, `elapsed_ms=4313`; `B1_AUDIT_CLUSTER_FAULT=after-pgctl pnpm run test:webapp:postgres` → `5` отказавших попыток, `exit=1`, `elapsed_ms=5735`. Exact target-`os.tmpdir()` census до/после каждого partial-start run был пуст. Hooks полностью удалены. |
| K09 | KILLED | Намеренно красный сохранённый acceptance test: `pnpm run test:webapp:postgres` → `1` failed / `1` passed, `exit=1`, `elapsed_ms=9555`; exact target-`os.tmpdir()` pre/post census пуст. |
| K10 | KILLED | `pnpm --dir apps/webapp exec vitest list --config vitest.postgres.config.ts` без list-only shortcut реально собрал template/clone, показал pilot, `exit=0`, `elapsed_ms=8553`; exact target-`os.tmpdir()` после команды пуст. Механический gate отдельно прошёл с list-only env, см. K17. |
| K11 | NOT APPLICABLE | `rg -n "process\\.on\|SIG(?:INT\|TERM\|KILL\|QUIT\|HUP)" apps/webapp/scripts/postgres-integration apps/webapp/vitest.postgres.globalSetup.ts apps/webapp/vitest.postgres.setup.ts` нашёл только `process.on('exit')`; target не заявляет signal handler. Signal run поэтому не приписан harness. |
| K12 | KILLED | Временный runtime probe: `pnpm --dir apps/webapp exec tsx scripts/postgres-integration/b1-transport-audit-probe.ts` → `listenAddresses=""`, socket внутри scratch, `scratchMode=448` (`0700`), `tcpAccepts=false`; `initdb`, `pg_ctl`, `psql` были absolute `/usr/lib/postgresql/16/bin/*`, `uid=0`, mode `493` (`0755`). Probe удалён. |
| K13 | **MISSED** | Тот же transport probe создал чужой mode-`0700` decoy с допустимым prefix и sentinel; target `teardownCluster()` удалил его: `arbitraryEnvShapedDecoyRemoved=true`. Diff связывает достижимый путь: `cli.ts` `teardown` → `clusterFromEnv()` → prefix/mode guard, но registry exact invocation отсутствует. |
| K14 | KILLED | Временные faults непосредственно после успешных `initdb` и `pg_ctl start`: точные команды из K08 оба дали красный setup и нулевой exact-path census. Stop-command failure — новая inspection-derived поломка ниже. |
| K15 | KILLED | Transport probe держал реальное соединение к clone и вызвал target `dropDisposableDatabase()`: `activeCloneStillPresent=false`, database list после drop содержал только template + `postgres`, `template0`, `template1`; итоговый `exit=0`. |
| K16 | KILLED | K06 держал оба файла в `pg_sleep(0.5)` при `maxWorkers=2`: оба завершились без раннего global teardown. Временная мутация вызвала `teardownCluster()` до worker handoff: `pnpm run test:webapp:postgres` покраснел до тестов на отсутствующем Unix socket, `exit=1`, `elapsed_ms=9046`; последующий duplicate global cleanup дал отдельный `ENOENT`, но не замаскировал первичный clone failure. Review: normal per-file `afterAll` ставит `dropped=true`, поэтому оставшиеся `exit` listeners не выполняют второй drop; достижимого normal-flow double-cleanup impact не найдено. Мутация удалена. |
| K17 | KILLED | `node scripts/check-test-runner-visibility.mjs` → integrator `39/39/0`, webapp disk `133`, runner `111`, known invisible `22`, media-worker `0/0/0`, `OK`, final `elapsed_ms=2699`. `pnpm --dir apps/webapp exec vitest list --filesOnly | wc -l` → DB-free files `110`; отдельная проверка `rg -q pgDisposableHarness...` → pilot absent. |
| K18 | KILLED | `rg --files apps/webapp/src -g '*.devDb.integration.test.ts' | wc -l` → `22`; `git diff --exit-code 5bc9a7018^ 5bc9a7018 -- ':(glob)apps/webapp/src/**/*.devDb.integration.test.ts'` → `exit=0`. |
| K19 | KILLED | `git diff --exit-code 5bc9a7018^ 5bc9a7018 -- apps/webapp/src/app-layer/testing/pg-harness.ts` → `exit=0`; новый lifecycle импортирует и применяет существующий `disposablePostgresHarness()` name contract, а старый файл остаётся contract-only без cluster lifecycle. |
| K20 | KILLED | `rg -n 'run-migrations\\.mjs\|loadCutoverEnv\\(' <target harness files>` → `0` matches; lookup `apps/webapp/package.json.scripts.migrate` → `node scripts/run-webapp-drizzle-migrate.mjs`; target diff не содержит `apps/integrator/**`. Комментарии и report явно отделяют owner-role bootstrap от A1/RLS. |

### Inspection-derived fault injection (не добавлялся задним числом в blind kill-set)

| ID | Результат | Точная команда и evidence |
| --- | --- | --- |
| F21 | **MISSED** | `pnpm --dir apps/webapp exec tsx scripts/postgres-integration/b1-stop-failure-audit-probe.ts` подменил только stop-command на `/usr/bin/false`. Target `stopCluster()` проигнорировал status, удалил scratch и вернул success, пока exact private postmaster PID был жив: `aliveAfterReportedTeardown=true`, `scratchExistsAfterReportedTeardown=false`, `exit=0`, `elapsed_ms=6716`. Probe затем адресно завершил только этот PID (`postmasterAliveAfterAuditCleanup=false`) и был удалён. |

## Diff/state review

### Target и A0 freshness

- `git rev-parse 5bc9a7018^{commit}` → `5bc9a70180fc5a0bc72dd81ec130765dbc8a6647`.
- Audit HEAD был `d21ff67608373988c3a06440a68075aa4fb1349b`; `git diff --name-status 5bc9a7018..HEAD`
  показал только audit/brief docs, а
  `git diff --exit-code 5bc9a7018 HEAD -- docs/ARCHITECTURE/DB_DUMPS/a0-greenfield scripts/a0-greenfield-baseline-lib.mjs apps/webapp/db/drizzle-migrations`
  дал `exit=0`. Значит A0 package и pending Drizzle chain на audit HEAD совпадают с product target.
- Из-за environment-owned character-device масок `.env.example` A0 checker в основном worktree честно считал бы
  source dirty. Точная чистая проверка выполнена в temporary local clone:

  ```bash
  git clone --local --no-hardlinks --quiet . "$audit_clone_path"
  node "$audit_clone_path/scripts/check-a0-greenfield-baseline.mjs"
  node --test "$audit_clone_path/scripts/a0-greenfield-baseline.test.mjs"
  ```

  Результат первой команды: `status=PASS`, schema census `tables=241`, `functions=196`, `policies=244`, manifest
  `integrator=68`, `drizzle=288`, pending `integrator=0`, `drizzle=10`, `elapsed_ms=3341`. Вторая команда:
  `tests=8`, `pass=8`, `fail=0`, `elapsed_ms=7345`. Temporary clone удалён.

### Реальная template/schema chain

- Target действительно использует committed A0 `schema.sql`, synthetic `seed.sql`, A0 validation и только
  webapp `run-webapp-drizzle-migrate.mjs`; legacy `run-migrations.mjs`, `loadCutoverEnv()` и integrator migrator не
  участвуют.
- Две fresh build дали одинаковую normalized schema. В обеих команда runtime probe получил Drizzle ledger `298`
  (`288` A0 + `10` pending), seed organization `1`, но integrator ledger `0` вместо manifest `68`. Это реальный
  разрыв Б1, а не claim worker report.
- Healthy pilot на чистом product target до добавления acceptance oracle:
  `pnpm run test:webapp:postgres` → `1` file / `1` test passed, `exit=0`, `elapsed_ms=10660`.
- Broken pending migration красит именно template migration step и после полного rollback healthy chain снова
  зелёная — K04.

### Isolation, transport и cleanup

- One template per invocation обеспечен `globalSetup`; per-file top-level setup создаёт random 40-bit clone name.
  Parallel sentinel probe K06 доказал отсутствие общей mutable DB при `maxWorkers=2`.
- Фактический `os.tmpdir()` audit process:
  `node -e "const os=require('node:os'); process.stdout.write(os.tmpdir())"` →
  `/tmp/brain-agent-audit-disposable-harness-current-first-2760165`. Target roots имели вид
  `<этот exact root>/pbt_cluster_*`; это environment-isolated подкаталог `/tmp`, не общая PostgreSQL бокса.
- Unix-only transport, root-owned trusted binaries, TCP-off, `0700`, active-connection termination и cleanup
  healthy/migration/setup/test/list paths подтверждены runtime. Финальная команда
  `find "$audit_tmp_root" -mindepth 1 -maxdepth 1 -type d -name 'pbt_cluster_*' -print | wc -l` → `0`.
- Exact ownership cleanup не доказан: guard принимает любой canonical mode-`0700` path с prefix, а CLI получает
  coordinates из env. Runtime decoy был удалён (K13).
- `stopCluster()` не проверяет `spawnSync(pg_ctl ...).error/status`, сразу удаляет data root. Fault F21 оставил
  live postmaster без data root и вернул success.
- Partial init/start cleanup работает. Template connections закрываются до clone; active clone connections
  terminate before drop. Delayed parallel workers не встретили ранний global teardown.
- `process.on('exit')` регистрируется per file и не снимается, но после normal `afterAll` closure уже `dropped=true`;
  с текущей поверхностью достижимого двойного cleanup/impact не найдено. Signal handlers не заявлены.

### Runner/state boundaries

- Pilot виден отдельному postgres project и общему visibility gate; default DB-free project его не видит — K17.
- Все `22` legacy `*.devDb.integration.test.ts` сохранены без diff — K18; Б3 не выполнялся.
- `pg-harness.ts` не менялся и используется как name-contract; конкурирующей второй cluster lifecycle там нет.
- Новый owner bootstrap не назван A1/RLS proof; A1 остаётся отдельным gate. Integrator source/migrations target diff
  не затронул.
- `pnpm --dir apps/webapp typecheck` → `exit=0`, `elapsed_ms=7145`.
- Первый root-level ESLint вызов был отброшен как evidence, потому что ignore пропустил `6` webapp files.
  Фактический targeted lint:
  `pnpm --dir apps/webapp exec eslint --no-ignore scripts/postgres-integration/cli.ts scripts/postgres-integration/harness-lib.ts vitest.postgres.config.ts vitest.postgres.globalSetup.ts vitest.postgres.setup.ts src/app-layer/testing/pgDisposableHarness.postgres.integration.test.ts`
  → `files=6`, `exit=0`, `elapsed_ms=2190`. Root `scripts/check-test-runner-visibility.mjs` отдельно был реально
  проверен ESLint без ignore и runtime gate K17.

### Findings

1. **MUST FIX — template не переносит committed A0 integrator ledger.** `harness-lib.ts` строит SQL только из
   `manifest.ledgers.drizzle.entries`; runtime clone имеет `integrator.schema_migrations=0` при committed manifest
   `68`. Impact: DB-тесты получают фактически неверный A0 state и могут зеленеть на состоянии, которого нет после
   canonical A0 restore; любой ledger-aware path увидит исторические integrator migrations как неприменённые.
   Сохранённый acceptance test красный на target: `0` вместо `68`. Integrator migrations запускать для исправления
   не требуется и нельзя — нужен transplant committed ledger rows.
2. **MUST FIX — cleanup не владеет exact invocation path.** `clusterFromEnv()` принимает все coordinates из env,
   `cli.ts teardown` передаёт их в `teardownCluster()`, а guard проверяет только canonical temp prefix, `data`
   child и mode `0700`. Runtime decoy с подходящей формой был удалён. Impact: stale/cross-wired coordinates могут
   остановить и удалить private cluster другого параллельного invocation, ломая isolation и чужой run.
3. **MUST FIX — stop failure проглатывается и оставляет PostgreSQL process.** `stopCluster()` игнорирует
   `spawnSync` error/status и безусловно удаляет scratch. При injected stop failure target сообщил cleanup success,
   удалил data root и оставил exact postmaster PID живым. Impact: setup/test run может завершиться с ложным cleanup,
   оставив orphan process; повторные прогоны накапливают процессы, а исходная причина скрывается.

## Verdict

**FAIL.** Blind kill-set: **17 killed / 2 missed / 1 not applicable**. Дополнительно после inspection найден и
runtime-подтверждён **1 missed** stop-failure variant (F21). Product fix не выполнялся; галочка Б1 не ставилась.

Постоянно оставлены только:

- красный acceptance oracle в
  `apps/webapp/src/app-layer/testing/pgDisposableHarness.postgres.integration.test.ts`;
- этот audit artifact.

Все временные SQL/TypeScript probes и product mutations удалены. Финальный expected-red прогон acceptance:
`pnpm run test:webapp:postgres` → `1` passed / `1` failed, `exit=1`, `elapsed_ms=9555`; failure — exact A0 integrator
ledger `0` вместо committed `68`. Финальный exact private-cluster census → `0`.

## НЕ ПРОВЕРЕНО

- `pnpm run check:saas-a1-rls-conformance` не запускался: Б1 не заявляет RLS, а brief разрешает только private
  cluster target-кода с `pbt_cluster_*`; A1 создаёт отдельный `/tmp/bcb_saas_a1_verify_*` contour.
- `pnpm run verify:saas-a0-greenfield-baseline` не запускался по той же path-boundary: он создаёт
  `/tmp/bcb_saas_a0_verify_*`. Статический A0 package/ledger gate `8/8` выполнен, а реальный target harness build
  многократно прошёл A0 schema/seed + pending Drizzle chain.
- Signal cleanup не запускался: target не устанавливает и не заявляет signal handler; `process.on('exit')` не
  переименован в signal guarantee.
- DEV/TEST/PROD, host PostgreSQL `:5432`, repository env-файлы, deploy и push не открывались и не изменялись.
- Full CI не запускался: brief требует targeted gate и прямо говорит, что full CI не нужен.
