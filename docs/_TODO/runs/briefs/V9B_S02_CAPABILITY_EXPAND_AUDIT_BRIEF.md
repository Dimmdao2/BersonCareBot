# В9б S02 — независимый аудит capability expand (#1081)

Тест или взгляд: **смешанный**. Disposition/DDL/ACL/no-contract — inspection; clean migration replay и executable
assertions — тест. Прочитать `AGENTS.md` §1/§5/§10/§24, authority
`docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md` S02 и worker brief
`docs/_TODO/runs/briefs/V9B_S02_CAPABILITY_EXPAND_BRIEF.md`. Candidate — product HEAD ветки
`wt/v9b-s02-capability-expand` после worker.

Источник оракула: `AGENTS.md` §5 — «Там, где к чувствительному ресурсу или проверке ведёт несколько путей,
оставлять ОДИН общий проход и механически запрещать обход»; authority задаёт безопасный порядок
«expand → adopt → contract», поэтому S02 не отзывает действующий путь.

## Проверить независимо

1. До чтения migration выписать из authority все 29 capability/ACL + 9 global/no-RLS строк. Для каждой сверить
   worker disposition с текущей схемой/кодом: exact reuse, действительно недостающий seam/ACL либо доказанное
   отсутствие relation. Итог должен содержать ровно 38 строк; агрегат без пофамильной сверки — FAIL.
2. Новая migration ровно одна, `0306`, первая строка TEMPORARY marker, journal `idx=306`, `when` строго после
   `0305`; sync и drizzle check green. Не появилось второй общей двери рядом с существующей.
3. Новые/изменённые `SECURITY DEFINER`: owner, fixed `search_path`, exact EXECUTE roles, tenant/principal checks и
   отсутствие dynamic SQL/owner-exempt tenant read. Operational ACL только из S02 matrix.
4. Scope fence: нет `REVOKE` действующих table grants, `ENABLE/FORCE RLS`, policy, caller adoption, booking
   `organization_id`/backfill, product TypeScript, новой роли/таблицы или D1 writer. S03/S04/S06/S07 границы
   сохранены.
5. Запустить journal sync, drizzle-kit check, named grant/accessor smokes, raw-SQL gate, scoped lint/typecheck и
   clean migration replay по уже существующему harness. A0 доказывает только DDL/ledger: не выдавать его за ACL/RLS
   или actor proof; DEV/TEST/PROD не трогать.
6. `git diff --check` и exact diff scope. Finding — только достижимое нарушение authority с exact row/symbol.

## Выход

Создать `docs/_TODO/runs/testsuite-v2/V9B_S02_CAPABILITY_EXPAND_INDEPENDENT_AUDIT.md` с командами, матрицей 38/38,
inspection findings и PASS/FAIL. При PASS разрешено коммитить только audit artifact/намеренный acceptance-test;
product fix не делать, plan checkbox не закрывать, DB/deploy/taskdb не трогать.
