# Б1/Б3 — независимый аудит первого product-test disposable PostgreSQL (#1081)

Тест или взгляд: **смешанный**. Harness lifecycle/CI wiring — inspection; product concurrency oracle и cleanup —
тест с fault injection. Прочитать `AGENTS.md` §1b.3/§5/§10/§24, authority
`docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` Б1/Б3, worker brief
`docs/_TODO/runs/briefs/DISPOSABLE_POSTGRES_PRODUCT_PILOT_BRIEF.md` и предыдущий blind audit artifact.
Candidate — product HEAD `wt/disposable-pg-product-pilot` после worker.

Источник оракула: `AGENTS.md` §1b.3 — disposable нужен, чтобы «доказать transaction/concurrency/parallel-test
isolation без влияния общего состояния»; email OTP oracle — из двух конкурентных consume ровно один успешен,
второй получает `expired_code`.

## Проверить независимо

1. До чтения нового test составить kill-set: ambient DEV URL не используется; отдельный clone создан до import;
   две транзакции действительно конкурируют на principal-row lock без sleep; ровно один success; challenge удалён;
   file-clone/cluster cleanup при pass/fail/collection; TEST/PROD недостижимы.
2. Product conversion — ровно один legacy `.devDb.integration.test.ts` переименован; нет opt-in/DEV allowlist,
   raw `pg.Pool.query`/SQL-text bypass или локального GRANT/BYPASS. Query идёт через существующий webapp Drizzle
   port/fragments; новая DB abstraction отсутствует.
3. На свежем candidate запустить A0 baseline и postgres project. Manifest/pending counts сравнить с фактическим
   migration tail; две harness self-test + один product file видны и выполняются. В9б `0306`, если уже доступна в
   product base, должна replay-иться; если нет — честно указать SHA/tail и не выдавать старый tail за current.
4. Независимо внести named atomicity fault (снять решающий principal lock/read-then-delete) только во временной
   production copy/в disposable schema, получить RED, полностью откатить. Проверить `\l`/ownership cleanup до/после.
5. CI реально исполняет `pnpm run test:webapp:postgres` с PostgreSQL 16 отдельным job/step; не только list, не
   включено в fast shard. YAML синтаксис/скоуп green.
6. Inspection active docs: Б2 не заявляет старые устранённые blockers, Б3 остаётся открытым (1 из 22); A0 не
   назван ACL/RLS proof. Raw-SQL gate, runner visibility, scoped lint/typecheck, `git diff --check` green.

## Выход

Создать `docs/_TODO/runs/testsuite-v2/DISPOSABLE_POSTGRES_PRODUCT_PILOT_INDEPENDENT_AUDIT.md` с named kill-set,
командами/counts и PASS/FAIL. При PASS разрешено коммитить только audit artifact/намеренный acceptance test;
product fix/DB/DEV/TEST/PROD/deploy/taskdb/plan checkbox запрещены.
