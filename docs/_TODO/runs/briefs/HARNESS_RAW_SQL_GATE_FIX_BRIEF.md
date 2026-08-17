# Б1 harness — убрать четыре прямых `.query` из pilot-теста (#1081/#1082)

## Роль и authority

Ты bounded worker. Прочитай `AGENTS.md` §5, §7, §10 и §24,
`docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` Б1,
`docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` пункт 1 и принятый harness report
`docs/_TODO/runs/testsuite-v2/DISPOSABLE_POSTGRES_HARNESS_BLIND_AUDIT_REPORT.md`.

Target — текущая `wt/single-entry-integration`, где merge harness создал достижимый integration failure:

```text
node scripts/check-no-new-raw-sql.mjs
New raw .query(...) SQL outside the frozen D18c debt list:
docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md:40,45,53,63
```

Источник оракула: пункт 1 требует «к базе — только через порт приложения на Drizzle; новый сырой SQL и
`.query` мимо порта запрещены». Harness behavior не меняется: тест доказывает имя per-test clone, наличие
`platform_users`, применённый Drizzle ledger и точное совпадение committed integrator ledger.

## Scope

Измени только `docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` и при
необходимости его существующий harness report. Используй уже приземлённый pattern из
`saasBillingTariffSnapshot.devDbProof.test.ts`: один dedicated `PoolClient`,
`getWebappSqlFromPgClient(client)` и параметризованные Drizzle `sql` fragments/`.execute()`. Освободи client и pool
в `afterAll`; не создавай второй DB-port/helper, не используй legacy `runWebappPgText`, `sql.raw`, allowlist,
миграцию или новый harness.

DB/DEV/TEST/PROD/deploy/push запрещены. Disposable local test разрешён через существующую команду.

## Acceptance

- `node scripts/check-no-new-raw-sql.mjs` → exit 0;
- `pnpm run test:webapp:postgres` → те же 2 файла / 3 теста green;
- webapp typecheck, targeted ESLint и scoped `git diff --check` → exit 0;
- temporary fault: возврат одного `pool.query` обязан снова уронить raw-SQL gate; после доказательства откатить.

Коммитить только названный test/report с `#1081 #1082`, exact commands и пометкой, что runtime contract не
менялся. Не закрывать весь Б1/пункт 1 этим bounded fix.
