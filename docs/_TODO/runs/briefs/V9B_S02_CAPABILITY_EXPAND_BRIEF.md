# В9б S02 — expand capability seams before tenant-wall revokes (#1081)

Прочитать `AGENTS.md` §1/§4a/§5/§10/§24. Authority:
`docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md`, строки S02 и полные матрицы 29 capability/ACL +
9 global/no-RLS rows. Product base — `wt/single-entry-integration` commit `4e336d856` или его свежий descendant.

Источник оракула: `AGENTS.md` §5 «Один общий проход» — «Там, где к чувствительному ресурсу или проверке ведёт
несколько путей, оставлять ОДИН общий проход и механически запрещать обход»; slice order в authority —
«expand → adopt → contract», поэтому S02 не отзывает текущий рабочий путь до S04.

## Последствие

Сейчас широкие table grants нельзя безопасно снять: auth, provisioning, delivery, scheduler, media и catalog
callers ещё не для каждого имеют узкую capability-door. Если сразу включить стену — рабочие пути человека и фоновые
доставки сломаются; если оставить grants — tenant boundary остаётся обходной. S02 строит только недостающие двери,
чтобы последующие adoption/revoke/FORCE могли идти без окна поломки.

## Scope

1. До файла перемерить все 38 строк authority и записать disposition: `reuse existing seam`, `expand exact ACL`,
   `add exact seam` или `relation absent/migrator-only — assertion only`. Вторую общую дверь рядом с существующей не
   создавать.
2. Создать ровно одну migration `0306_*` (номер забронирован; первая строка
   `-- TEMPORARY LOCAL MIGRATION NUMBER 0306`) и journal entry после `0305` с `idx=306` и строго большим `when`.
3. Migration содержит только необходимые capability definitions, `SECURITY DEFINER` owner/search_path/EXECUTE и
   narrow operational ACL из S02. Переиспользуемые функции не копировать; отсутствующие/retired relations не
   воскрешать.
4. Сохранить существующие roles и actors из матриц. Новую роль, таблицу, product TypeScript или второй D1 writer не
   создавать.
5. Запрещено в S02: `REVOKE` действующих direct table grants, RLS policy, `ENABLE/FORCE RLS`, caller adoption,
   booking `organization_id`/backfill (S03), contract changes (S04), TEST/DEV/PROD/deploy/taskdb.

## Приёмка и сдача

- report рядом с V9b artifacts содержит все 38 строк с disposition и exact migration symbol/ACL либо доказательство
  reuse/absence; число назвать вместе с командой;
- journal sync, `drizzle-kit check`, grant/accessor static smokes, raw-SQL gate, scoped lint и webapp typecheck green;
- existing disposable migration harness допустим ровно для clean migration replay/DDL, но не выдаётся за ACL/RLS
  proof; A1/TEST actor matrix остаётся S06/S07;
- `git diff --check`; diff только migration+journal, минимально нужные existing grant/accessor sources, report и
  точная plan status note. Коммитить разрешённый scope, не пушить и не ставить owner checkbox.

После worker нужен один независимый audit: exact 38 dispositions, no revoke/FORCE/caller change, no duplicate seam,
clean migration replay и сохранность D1/D10/S03 границ.
