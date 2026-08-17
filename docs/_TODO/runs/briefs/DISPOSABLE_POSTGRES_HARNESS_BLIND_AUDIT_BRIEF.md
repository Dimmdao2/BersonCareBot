# Б1 — независимый blind audit disposable PostgreSQL harness `5bc9a7018`

## Роль, порядок, границы

Ты `auditor-live`. Прочитай `AGENTS.md` §1, §6, §7, §9, §10/§10a/§10b и §24. Authority —
`docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, Б1. Target product commit: `5bc9a7018`; ветка
`wt/testsuite-b-current` уже синхронизирована с актуальным `feat`.

**Тест или взгляд:** lifecycle/изоляция/cleanup/фактическая схема — повторяемое поведение, проверять disposable
runtime и fault injection; отсутствие удалений Б3, второй инфраструктуры, integrator/RLS claims — разовое
состояние, проверять diff/импортами/командами, не source-text unit test.

До чтения product diff, pilot и worker report составь и запиши blind kill-set по authority: какая конкретная
поломка оставит DB-тест на shared DEV, соберёт неверную схему, столкнёт два test-file или оставит cluster/clone.
Только после фиксации списка открывай `5bc9a7018` и
`DISPOSABLE_POSTGRES_HARNESS_TRANSPLANT_REPORT.md`. Worker report — карта заявлений, не evidence.

DEV/TEST/PROD, общую PostgreSQL бокса, env-файлы, deploy и push не трогать. Разрешён только приватный disposable
cluster из target-кода в guarded `/tmp/pbt_cluster_*`. Продуктовый fix не делать. Временные поломки полностью
откатить; постоянными могут остаться только acceptance tests/audit artifact.

## Обязательные классы проверки

1. Fresh current feat: A0 package/ledger актуальны; template = committed A0 schema+seed+ledger + только pending
   webapp Drizzle migrations. Legacy `run-migrations.mjs`/`loadCutoverEnv()` и integrator contour не участвуют.
2. Две последовательные сборки дают одинаковую normalized schema; healthy chain green, временная broken pending
   migration red именно на migration и после полного отката снова green.
3. Ambient protected `DATABASE_URL`/`PG*` не используется. До первого test query реальный `current_database()`
   обязан быть `pbt_*`; временная подмена clone URL на доступную non-`pbt_` database красит run.
4. Private transport: trusted absolute binaries, Unix socket, TCP off, scratch mode 0700; cleanup target строится
   из разрешённого exact path, не glob/env/unresolved variable.
5. One template per invocation, unique clone per test-file. Два параллельных files при `maxWorkers=2` не делят
   mutable DB и не сталкиваются именами/ролями.
6. Cleanup после: healthy run, broken migration/setup, intentional test failure, collection/list-only и signal,
   если target заявляет signal handling. До/после снять exact private-cluster database list и `/tmp/pbt_cluster_*`.
7. Pilot виден `vitest list` и общему runner-visibility gate, но обычный DB-free unit project его не запускает.
8. Все 22 `*.devDb.integration.test.ts` сохранены без изменений; Б3 не выполнялся. Упрощённая owner-role модель
   не выдаётся за A1/RLS. Existing `docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` не превращён во вторую
   конкурирующую lifecycle implementation.
9. Проверь race/error paths глазами: teardown ordering между workers/globalSetup, `process.on('exit')`, активные
   connections к template/clone, partial initdb/pg_ctl failure, duplicate event handlers. Finding существует
   только с достижимым сценарием и impact.

## Итог и сдача

Прогоны минимум: A0 gate; pilot; parallel clone probe; runner visibility; targeted typecheck/lint; named fault
injections. Полный CI не нужен. Числа только рядом с командами.

Отчёт `docs/_TODO/runs/testsuite-v2/DISPOSABLE_POSTGRES_HARNESS_BLIND_AUDIT_REPORT.md`:

- blind kill-set (до inspection);
- таблица fault → killed/missed + точная команда;
- diff/state review;
- verdict `PASS` или `FAIL` с числом убитых/непойманных;
- `НЕ ПРОВЕРЕНО`.

Если PASS — один audit commit `#1081`, чистое дерево. Если FAIL — acceptance tests должны краснеть на текущем
product либо finding должен иметь exact runtime/diff evidence; product не чинить, галочку Б1 не ставить.
