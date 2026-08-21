# D15b/6 — candidate named-DEV rollback-only preflight result (2026-08-21)

## Scope and identity

- Candidate SHA: `5e39a82ce15f0e5e2b39b79ac8c6207266aa5ad7`
- Candidate checkout HEAD at launch: `5a747903cff6a1695b62acc9344e0eea9a2460f6`
- Target: named DEV host `151.241.228.122`, database `bcb_webapp_dev`.
- Preflight only: no `--execute`, `--reapply`, direct `psql`, manual SQL, TEST, PROD, fixture, deploy, landing, or push.

## Candidate gates before launch

```text
git merge-base --is-ancestor 5e39a82ce15f0e5e2b39b79ac8c6207266aa5ad7 HEAD
-> exit 0

git status --short
-> empty

git ls-tree HEAD apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
git ls-tree 5e39a82ce15f0e5e2b39b79ac8c6207266aa5ad7 apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
-> both blob 76c04eeb4e922bceb57d192f0411512fa13adbe9

git diff --name-status 5e39a82ce15f0e5e2b39b79ac8c6207266aa5ad7..HEAD -- apps/webapp/db/drizzle-migrations
-> empty
```

## Launch and terminal result

The detached child copied the two required source env files into the candidate at mode `0600`, installed an exit trap that removed only those two copies, then ran this exact command from the candidate checkout:

```bash
setsid bash deploy/host/migrate-dev.sh --preflight >> /tmp/d15b6-candidate-preflight-20260821.log 2>&1
```

- PID record: `/tmp/d15b6-candidate-preflight-20260821.pid` (`2617103`); terminal/not running after wait.
- Exit code: `3`.
- Both candidate env copies were absent after the child exited.
- `git status --short` was empty after preflight.

Last safe wrapper-log lines:

```text
SET
RESET
RESET
```

The next log record is `ERROR: new row for relation "user_contacts" violates check constraint "user_contacts_source_origin_check"`. Its detail contains contact data and is intentionally not reproduced here.

## Verdict: FAIL

The required owner-aware rollback-only candidate preflight did not pass. No product fix was made in this audit role.

NOT DONE: landing / execute migration / live login-bind-delivery gate / TEST / deploy / push.
