# D15b/6 — app_object_owner DO-block language-usage marker fix — RESULT (2026-08-21)

Роль: same-branch mechanical migration-metadata worker в `wt/d15b6-audit-20260821`, per
`D15B6_LANGUAGE_USAGE_MARKER_FIX_BRIEF_2026-08-21.md`. Base commit at start: `50142af0d`.

## Owner-decision check

Прочитано `AGENTS.md` §«Как решать, что делать» (строки 57-113), §1 «Миграции schema B» / statement-owner
contract (строки 352-455), §7 «Git: коммит и пуш», §10 «Test execution and audit policy», §24. Поиск более
поздних owner-решений:

- `node /home/dev/brain/tools/code-search.mjs "LANGUAGE-USAGE marker fix" --repo bcb -k 5` — совпадения:
  `RUNTIME_MIGRATION_WRAPPER_AUDIT_2026-08-17.md`, `migrate-local-parse.test.mjs`,
  `migrate-integrator-local.mjs`, целевой SQL-файл, `migration-order`-адъяcент тест. Ничего датированного
  позже brief и заменяющего его не найдено.
- `ls docs/_TODO/runs/integrator-cleanup/ | grep -i language` — только сам brief и лог запуска этого хода
  (`d15-language-usage-marker-fix-20260821.log`, содержит только строки старта текущего run, не более раннюю
  попытку).
- Result-файл для этого фикса ранее не существовал (только brief).

Оракул brief подтверждён: retry-3 commit `fb52b0acf` упал на `DO $d15b6_dependencies$` без
`BCB-MIGRATION-LANGUAGE-USAGE` после явного `BCB-MIGRATION-OWNER: app_object_owner`. Brief не заменён.

## Exact change

Файл: `apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql`.

Добавлена ровно одна строка `-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql` непосредственно после
`-- BCB-MIGRATION-OWNER: app_object_owner`, перед `DO $d15b6_dependencies$` (было L4272, теперь diff на той
же позиции):

```diff
 --> statement-breakpoint
 -- BCB-MIGRATION-OWNER: app_object_owner
+-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
 DO $d15b6_dependencies$
 DECLARE
   v_dependents text[];
```

SQL/DO body, statement order, owners, schema-create markers, function bodies, другие миграции — не менялись.

## Gate commands and results

1. `git diff --check -- apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql`
   → exit `0`, чистый вывод (нет whitespace-конфликтов).

2. Exact diff проверен `git diff` на тот же файл — единственный hunk, ровно +1 строка, никакой другой
   контент не тронут (см. diff выше, идентичен реальному выводу).

3. Byte-identical executable SQL after stripping `BCB-MIGRATION-*` comment lines:

   ```
   git show HEAD:apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql \
     | grep -v '^-- BCB-MIGRATION-' > /tmp/before_stripped.sql
   grep -v '^-- BCB-MIGRATION-' apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql \
     > /tmp/after_stripped.sql
   diff /tmp/before_stripped.sql /tmp/after_stripped.sql
   ```
   → `IDENTICAL after stripping markers` (diff exit 0, no output before the echo).

4. Focused migration parser/order/privilege tests (marker handling):

   ```
   node --test deploy/postgres/privileges/migrate-local-parse.test.mjs \
     deploy/postgres/privileges/migration-order.test.mjs
   ```
   → `# tests 28 / # pass 28 / # fail 0 / # cancelled 0`.

   ```
   node --test deploy/postgres/privileges/migrate-local.test.mjs
   ```
   → `# tests 29 / # pass 29 / # fail 0 / # cancelled 0`.

   Никакого нового теста не написано; full CI не запускался (не в скоупе brief).

## Staged and committed

`git add` только:
- `apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql`
- `docs/_TODO/runs/integrator-cleanup/D15B6_LANGUAGE_USAGE_MARKER_FIX_RESULT_2026-08-21.md`

`git add -A` не использовался. Commit — последнее действие хода.

## NOT DONE

- named-DEV preflight retry 4
- landing
- execute
- D31 combined preflight
- TEST
- deploy
- push
- full CI
