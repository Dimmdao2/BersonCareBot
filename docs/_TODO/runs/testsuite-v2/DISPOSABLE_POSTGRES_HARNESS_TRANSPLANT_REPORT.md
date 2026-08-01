# Б1 — перенос общего disposable PostgreSQL harness

Дата: 2026-08-01. Worktree: `wt/testsuite-b-current`, HEAD до коммита: `39d8eebb4`.

## Итог

Добавлен отдельный `postgres-integration` Vitest project. Он на каждый вызов запускает один private PostgreSQL cluster в точном `0700`-каталоге `/tmp/pbt_cluster_*`, только на Unix socket с `listen_addresses=''`; строит один template из committed A0 `schema.sql` + Drizzle ledger + `seed.sql`, затем выполняет только current pending webapp Drizzle tail через `pnpm run migrate`. Каждый test-file получает уникальный `pbt_*` clone template; shared `DATABASE_URL` и все `PG*` child-env variables очищаются до передачи URL clone тесту.

Использован существующий A0 `resolveTrustedPostgresBinaries(['initdb','pg_ctl','psql'])`; новый механизм запуска PostgreSQL, DEV/TEST/PROD, integrator migration contour и legacy `*.devDb.integration.test.ts` не затрагивались. `app_owner` получает ровно bootstrap `USAGE, CREATE` на `app`, необходимый PostgreSQL для current pending `ALTER FUNCTION ... OWNER TO app_owner`; это не заявление A1/RLS-conformance.

## Точный diff

- `apps/webapp/scripts/postgres-integration/harness-lib.ts` — cluster/template/clone/guard/cleanup lifecycle.
- `apps/webapp/scripts/postgres-integration/cli.ts` — bounded CLI для lifecycle.
- `apps/webapp/vitest.postgres.{config,globalSetup,setup}.ts` — отдельный project, one template per invocation, clone per file.
- `apps/webapp/src/app-layer/testing/pgDisposableHarness.postgres.integration.test.ts` — один pilot.
- `apps/webapp/package.json`, `package.json` — `test:postgres` / `test:webapp:postgres` entrypoints.
- `scripts/check-test-runner-visibility.mjs` — объединяет DB-free list с отдельным postgres project list; при этой механической list-проверке `POSTGRES_INTEGRATION_LIST_ONLY=1` не поднимает cluster.

## Red/green evidence

`pnpm run check:saas-a0-greenfield-baseline` в чистом checkout того же `39d8eebb4`:

```
status=PASS; manifestEntries: integrator=68, drizzle=288;
pendingCurrentMigrations: integrator=0, drizzle=10; tests=8, pass=8
```

Текущий worktree содержал до Б1 несвязанные незакоммиченные `apps/integrator/src/integrations/*/.env.example`; поэтому этот же A0 gate здесь честно останавливался на `refresh_source_worktree_dirty`, не на A0/harness-коде.

`node --input-type=module -e "...validatePackage()..."` подтвердил pending tail: `0288`–`0297`, integrator pending `0`.

После временного добавления в pending `0297_commercial_access_state_removal_local.sql`:

```
[migrate] failure migration=0297_commercial_access_state_removal_local idx=297 reason=schema_mismatch sqlstate=42P01
[postgres-integration-harness] FAILED: migration chain failed while building the disposable-PostgreSQL template
build_template_exit=1
```

Мутация и journal-след полностью убраны тем же рабочим проходом. Чистый build/test после отката: `[migrate] Drizzle migrations complete count=298`, `Test Files 1 passed (1)`, `Tests 1 passed (1)`.

Два независимых `buildTemplateDatabase()` и trusted `pg_dump --schema-only --no-owner --no-privileges --no-comments`, с нормализацией `\\restrict` tokens:

```
{ "normalizedSchemaDiff": "empty", "firstBytes": 1034567, "secondBytes": 1034567 }
```

## Parallel-clone evidence

Временный второй `*.postgres.integration.test.ts` (удалён до коммита) и
`VITEST_MAX_WORKERS=2 pnpm --dir apps/webapp exec vitest run --config vitest.postgres.config.ts`:

```
Test Files  2 passed (2)
Tests  2 passed (2)
Duration  8.53s
```

Каждый файл получил собственный unique `pbt_*` clone в top-level setup; временный probe не сохраняется, потому что не задаёт отдельного постоянного поведения.

## Cleanup evidence

Внутри private cluster `listDatabases()` (`\\l`-эквивалент через exact socket/port) дал:

```
beforeClone: [pbt_tpl_..., postgres, template0, template1]
afterClone:  [pbt_database_list_proof_..., pbt_tpl_..., postgres, template0, template1]
afterDrop:   [pbt_tpl_..., postgres, template0, template1]
```

`find /tmp -mindepth 1 -maxdepth 1 -name 'pbt_cluster_*' -printf '%f\\n'` до и после normal run, broken migration, setup guard fault и intentional test failure дал пустой список. Intentional test fault завершился `test_failure_exit=1`; setup guard fault завершился `guard_selftest_exit=1` до import/query pilot и сообщил `current_database()="postgres" is not a disposable pbt_ database`.

`DATABASE_URL='postgresql://ignored@127.0.0.1:5432/bcb_webapp_dev' pnpm --dir apps/webapp exec vitest run --config vitest.postgres.config.ts` остаётся зелёным (`1/1`, 8.18s): ambient protected URL не используется.

## Runner visibility

`pnpm --dir apps/webapp exec vitest list --config vitest.postgres.config.ts` выводит:

```
[postgres-integration] src/app-layer/testing/pgDisposableHarness.postgres.integration.test.ts >
  disposable PostgreSQL harness pilot > runs against a freshly cloned database whose schema came from the real migration chain
```

Project намеренно не добавлен в обычный DB-free `vitest.config.ts`; named command — `pnpm run test:webapp:postgres`.
`node scripts/check-test-runner-visibility.mjs` после добавления отдельного project: `webapp: диск=133, раннер=111, невидимых=22`, `OK`; 22 — зафиксированный Б3 legacy список, новый pilot в него не добавлен.

## Время

- `vitest run` (template + clone + pilot + teardown): `Duration 8.58s` (final green).
- Parallel two-file run: `Duration 8.53s`.
- Two template schema builds/diff: equal `1034567` bytes each (command above).

## НЕ СДЕЛАНО

- A1/RLS non-owner conformance, DEV/TEST parity и любой claim о production roles не сделаны.
- Б3 legacy `*.devDb.integration.test.ts` не переносились, не удалялись и не менялись.
- PostgreSQL job не включён в обычный DB-free unit project/fast shard; отдельный CI workflow job не добавлялся этим bounded Б1 scope.
- Галочка Б1 в authority не менялась: независимый blind audit остаётся за оркестратором.
- Коммит не создан: `git add <явные Б1-пути>` остановился на `EROFS` при создании общего worktree index lock (`.../.git/worktrees/bcb-wt-testsuite-b-current/index.lock`). Кроме того, до Б1 в clone уже были несвязанные незакоммиченные env-примеры; их не изменяли и не stage-или.
