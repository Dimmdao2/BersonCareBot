# AUDIT — LEDGER DOWN-OP (`--unapply`) + DEV `log_statement=mod`

- **Subject:** commit `c4f610266` ("feat(migrate-local): --unapply ledger op + DEV log_statement=mod")
- **Branch / HEAD at audit:** `wt/migration-timestamp-20260819` @ `f4c5b46d8` (the 4 subject files at HEAD are
  byte-identical to `c4f610266` for the audited content: `migrate-local.mjs`/`.test.mjs` unchanged;
  later commit `5c5d202d1` edited `declaration.ts` + the two generated artifacts for the unrelated
  org `is_active` seam, but `git diff c4f610266..HEAD` shows it did **not** touch a single `log_statement`
  / `databaseLevel` line — verified by grep).
- **Role:** independent adversarial auditor. Code written by another agent (Sonnet 5). The executor report
  `docs/REPORTS/LEDGER_DOWN_OP_2026-08-20.md` was read as a defendant's plea, not as evidence.
- **Live target:** `bcb_webapp_dev` (DEV, zero prod risk). PROD (135.106.162.170) not touched.

## Verdict: **PASS** (one non-blocking observation → owner question, below)

All seven required points hold. The `--unapply` operation is a single ledger `DELETE`, triple-gated, and
the gates are proven real by fault injection (not by reading). `log_statement='mod'` is dev-only in the
declaration and the generated artifact; `bersoncarebot_test` is untouched in declaration, artifact and live.
`--check` is byte-clean. Every temporary injection was reverted and the tree is clean.

## Claims — assertion | command | output | verdict

| # | Assertion | Command | Output | Verdict |
|---|---|---|---|---|
| 1 | `--unapply` can emit nothing but a `DELETE` of one ledger row (no DDL, no rollback, no multi-row, no wrong tag) | read `migrate-local.mjs:190,206,283-304,418`; `unapplyStatements` only ever receives `DELETE FROM drizzle.__drizzle_migrations WHERE tag = <sqlLiteral(tag)>`. Tag is `values('unapply')`, gated by `appliedByTag.get(tag)` (must be an applied row) **and** `migrations.find(tag)` (must be a folder file, i.e. name-gate-clean YYYYMMDDTHHMMSS/legacy) **and** `file.hash===row.hash`; `sqlLiteral` doubles `'`. `--unapply` requires `--drizzle-folder` (`:213`), which forbids `--step/--owner/--migration` (`:217`), so no legacy SQL path co-exists. | The only statement the branch can produce is one `DELETE … WHERE tag = '<escaped>'`. Tag is doubly-constrained (applied ledger row ∧ folder file) and escaped, so injection / wrong-tag / DDL are structurally impossible. `WHERE tag=` deletes every row with that exact tag; tags are unique in practice (`drizzle_migrations_tag_key`) — no pre-existing dup was introduced by this op. | **PASS** |
| 2a | Gate "hash equality" reddens | `sed if(file.hash!==row.hash)→if(false && …)`; `node --test migrate-local.test.mjs` | `not ok 24 - unapply refuses when the file content has drifted`; `# pass 25 # fail 1`. Reverted; `git status` clean. | **PASS** |
| 2b | Gate "tag applied" reddens | `if(!row)→if(false && !row)`; re-run | `not ok 25 - unapply refuses a tag the database never applied`; `# pass 25 # fail 1`. Reverted. | **PASS** |
| 2c | Gate "file exists / else drop-foreign" reddens | `if(!file)→if(false && !file)`; re-run | `not ok 26 - unapply refuses a foreign ledger row and points to --drop-foreign`; `# pass 25 # fail 1`. Reverted. | **PASS** |
| 3 | Tests cover *this* path, not a neighbour | each of the three injections above reddens *exactly* the matching test and no other; clean run `node --test` | `# pass 26 # fail 0` clean; each break → exactly one red test with the asserted stderr. A green test on broken code was not observed. | **PASS** |
| 4a | `log_statement='mod'` dev-only in declaration | `grep -n log_statement declaration.ts` | `declaration.ts:7568: ...(name === 'bcb_webapp_dev' ? { databaseLevel: { bcb_webapp_dev: ["log_statement='mod'"] } } : {})` — guarded by ternary **and** keyed by db name; `generate.mjs:1847` reads `databaseLevel?.[dbName]`, so double-keyed to dev. | **PASS** |
| 4b | Generated dev artifact carries exactly one new line; test artifact carries none | `grep -rn log_statement deploy/postgres/generated/`; `grep -c log_statement …bersoncarebot_test.sql` | dev: `privileges.bcb_webapp_dev.sql:9525: ALTER DATABASE "bcb_webapp_dev" SET "log_statement" TO 'mod';` (one line, after `RESET ALL`); test artifact: `0`. | **PASS** |
| 4c | `bersoncarebot_test` untouched **live** | `psql -d bersoncarebot_test SHOW log_statement`; `SELECT count(*) FROM pg_db_role_setting` | test = `none`; total stored db/role settings across cluster = `0` → test never carried the setting. | **PASS** |
| 5 | Live `bcb_webapp_dev`: no manual ledger DML; `pending=0 total=58 foreign-ledger-rows=1` | `node migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres` | `already current for "bcb_webapp_dev": pending=0 total=58 verified-objects=90 foreign-ledger-rows=1`. Ledger row count = 59 = 58 files + 1 foreign; reconciles exactly. `grep` of postgres log for `__drizzle_migrations` DELETE/UPDATE/INSERT → empty; no runnable raw-DML path in tree (confirmed by prior reaudit `74715d158`). | **PASS** |
| 6 | `generate-cli.mjs --check` exit + text | `node deploy/postgres/privileges/generate-cli.mjs --check; echo EXIT=$?` | 4×`ok … совпадает побайтно` + `--check: артефакты соответствуют декларации побайтно.` `EXIT=0` | **PASS** |
| 7 | Full revert of all injections | `git status --short`; `git diff --stat`; `node --test` | empty status, empty diff, `# pass 26 # fail 0` | **PASS** |

## Blockers

**None.**

## Non-blocking observation → owner question (NOT fixed, no scope opened)

The executor report `LEDGER_DOWN_OP_2026-08-20.md` (and the queue line) states `log_statement='mod'` was
**"Applied live via migrate-dev.sh --execute … Verified live: show log_statement → mod"**. As of this audit
that is **not reproducible**: live `bcb_webapp_dev` reads `log_statement = none`, and
`SELECT count(*) FROM pg_db_role_setting = 0` (the cluster has **no** stored `ALTER DATABASE … SET` row at
all). So the observability the finding-2 wanted is **not in effect on DEV right now**.

This is **not a code defect** and does not impeach the commit: the declaration and the generated dev artifact
are correct and dev-only, `--check` is byte-clean, and the setting would take effect on the next full
privileges-reconcile of the dev artifact. Two things are worth the owner's eye, neither a blocker:

1. The setting lives in the **privileges** artifact (`privileges.bcb_webapp_dev.sql`), applied by the
   privileges reconcile — not by `migrate-dev.sh`, which runs Drizzle DDL. The report's "applied via
   migrate-dev.sh" is therefore mechanically doubtful; the most likely truth is it was set at commit-time
   and later **reset by a competing privileges-reconcile** from another branch on the shared DEV box (known
   churn: multiple worktrees reconcile `bcb_webapp_dev`), or the dev privileges artifact was simply never
   deployed. Either way the live-verification line in the report cannot be reproduced now.
2. Consequence: if the DEV ledger-mutation observability is treated as "done", note that it is currently
   **off** on DEV. Re-applying the dev privileges artifact (or deploying it) restores it. Whether/when to do
   that is an owner call — I did not run it (not in this audit's scope; a live privileged apply is a
   port-agent action).

Per canon: a finding with no line in the owner's plan is a **question**, not work. Surfaced here, not fixed,
no scope opened.

## What I did NOT touch

PROD; the live `bcb_webapp_dev` state (only read-only probes + one `already-current` report run, no writes);
the `tag IS NULL` foreign row; TEST db. All three code injections were reverted; tree is clean.
