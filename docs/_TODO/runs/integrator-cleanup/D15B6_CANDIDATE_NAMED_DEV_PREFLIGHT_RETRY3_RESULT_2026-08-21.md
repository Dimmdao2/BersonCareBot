# D15b/6 — rollback-only named-DEV preflight, retry 3 (result, 2026-08-21)

Role: `auditor-live` in `wt/d15b6-audit-20260821`, per
`D15B6_CANDIDATE_NAMED_DEV_PREFLIGHT_RETRY3_BRIEF_2026-08-21.md`. Repeat of the same saved live gate
after the schema-create marker fix, against the exact candidate commit. Not a new blind audit, not a
product fix, not a migration apply.

Oracle: `AGENTS.md` §1 — «До аудита и landing кандидат миграции обязан пройти owner-aware rollback-only
preflight против именованной DEV из точного candidate checkout».

## Exact candidate gate

```text
git merge-base --is-ancestor b1ac4e9ad HEAD  -> b1ac4e9ad IS ancestor of HEAD
git log --oneline b1ac4e9ad..HEAD
  44c76c453 Merge branch 'feat/doctor-ui-rebuild' into wt/d15b6-audit-20260821
  3a223f8b4 docs(orchestration): accept D15 marker fix for live gate
  052e3b049 docs(#987): brief D15 rollback preflight retry 3
  -> queue/brief docs + merge only, no migration diff

git log --oneline b1ac4e9ad..HEAD -- apps/webapp/db/drizzle-migrations/  -> (empty)

git rev-parse HEAD
  -> 44c76c453402fe05a9f8329da067e8ef3d60e9c9
git rev-parse b1ac4e9ad
  -> b1ac4e9adf716c06f658ada83a285e5928ddb2dd

git rev-parse HEAD:apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
  -> efcab698d644e93a46b1d30ab3f6c7a42246d7eb
git rev-parse b1ac4e9ad:apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
  -> efcab698d644e93a46b1d30ab3f6c7a42246d7eb
  -> exact match

git status --porcelain=v1 (before env copies, and again after cleanup)  -> (empty both times)
```

No later owner decision overrides this brief:

```text
grep -n "d15b6\|D15B6\|cut_over_canonical_contacts\|SCHEMA-CREATE" \
  docs/OWNER_DECISIONS.md docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md \
  docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md
  -> only pre-existing WORK_ORDER references to this same migration/evidence, nothing later overriding

node /home/dev/brain/tools/code-search.mjs "cut_over_canonical_contacts preflight retry3" --repo bcb -k 10
  -> only existing evidence/plan docs already accounted for; nothing newer touching this migration
```

## Mechanics

Candidate worktree carries no env. Created regular mode-0600 copies at candidate paths from the
canonical files (`/home/dev/dev-projects/BersonCareBot/.env` →
`<candidate>/.env`; `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` →
`<candidate>/apps/webapp/.env.dev`), verified neither is a symlink. A detached (`setsid`) runner script
in `/tmp` ran the wrapper with a `trap … EXIT` that deletes only those two copies, logging to
`/tmp/d15b6-candidate-preflight-retry3-20260821.log` and recording the child PID in
`/tmp/d15b6-candidate-preflight-retry3-20260821.pid`. Waited for terminal exit in this turn (process
finished in well under a minute).

Command:

```
bash deploy/host/migrate-dev.sh --preflight
```

Target: named DEV `bcb_webapp_dev` on `151.241.228.122`, via the unmodified entrypoint only (no
`--execute`, `--reapply`, direct `psql`, manual SQL, fixture, disposable DB, TEST/PROD).

## Result

**FAIL** — exit code `3`. New failure point, further than either prior retry: all 34
`CREATE OR REPLACE FUNCTION app.*` statements from the schema-create marker fix now succeed (34/34
`CREATE FUNCTION` tags observed, confirming that fix holds). The batch then proceeds past those 34
blocks, through one more `DROP INDEX` and one more `CREATE FUNCTION` (owner `app_seam_patient_booking_owner`),
and fails on the **next** statement — the first one after that point running under the default
`app_object_owner` context — with:

```
ERROR:  permission denied for language plpgsql
```

Safe last lines of the log (no env/URL/password/contact/PII values; only command tags and role-probe
columns):

```text
CREATE FUNCTION
RESET
SET
   session_user   |          current_user          | can_create_public
------------------+---------------------------------+-------------------
 bcb_dev_migrator | app_seam_patient_booking_owner | f
(1 row)

CREATE FUNCTION
RESET
SET
   session_user   |   current_user   | can_create_public
------------------+------------------+-------------------
 bcb_dev_migrator | app_object_owner | t
(1 row)

ERROR:  permission denied for language plpgsql
EXIT_CODE:3
```

This is a distinct failure signature from both prior retries: retry 1 (`d59286757` per the queue) failed
earlier in the same block category; retry 2 failed at the very first `CREATE OR REPLACE FUNCTION app.*`
with `permission denied for schema app` (missing `BCB-MIGRATION-SCHEMA-CREATE: app` marker, fixed by
`b1ac4e9ad`). This retry 3 confirms that fix and surfaces a **different** statement — not one of the 34
app.* function creates — that needs `plpgsql` language usage granted to `app_object_owner` and does not
currently get it (missing or misplaced `-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql` marker on that
statement's block, or an owner mismatch in the existing marker). Locating the exact statement/line and
fixing it is a worker task, not performed here per the auditor-live scope (`Не чинить найденный дефект в
роли аудитора`).

## Rollback / ledger evidence

The wrapper's rollback-only batch is one `psql -v ON_ERROR_STOP=1` script starting with an explicit
`BEGIN;` (observed early in the log) and ending with a literal `ROLLBACK;` statement text at the very end
of the batch. Because `ON_ERROR_STOP=1` aborts the script at the first server error, `psql` never reached
that trailing `ROLLBACK;` statement — it exited non-zero immediately after the `permission denied for
language plpgsql` error and disconnected. PostgreSQL rolls back any transaction still open on a session at
disconnect, so the still-open transaction was rolled back by the server, not by an explicit statement
reaching completion. The `INSERT INTO drizzle.__drizzle_migrations` ledger write for this migration only
happens after its DDL/backfill blocks all complete (`migrate-local.mjs` lines ~475-481); that point was
never reached, so no ledger row was written. `git status --porcelain=v1` on the candidate tree is empty
both before and after the run — no ledger, apply or other state persisted anywhere the wrapper can reach.

## Cleanup confirmation

```text
pgrep -af "migrate-dev"       -> only this audit shell's own grep invocation, no live child
ps -p <child pid>             -> no such process (terminated)
fuser /tmp/bcb-dev-migrate.*.lock -> lock not held
ls <candidate>/.env <candidate>/apps/webapp/.env.dev -> both: No such file or directory (removed by trap)
git status --porcelain=v1     -> (empty; candidate tracked tree clean)
```

## PASS|FAIL

**FAIL.** Do not land or execute. A worker must find and fix the missing/misplaced
`BCB-MIGRATION-LANGUAGE-USAGE: plpgsql` marker for the statement immediately following the last
(`app_seam_patient_booking_owner`) `CREATE FUNCTION` in
`apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql`, then this exact
rollback-only named-DEV gate must be repeated on the resulting candidate.

NOT DONE: landing / execute migration / D31 combined preflight / live login-bind-delivery gate / TEST /
deploy / push / full CI.
