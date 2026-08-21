# D15b/6 — repeat candidate named-DEV rollback-only preflight result (retry2, 2026-08-21)

Role: `auditor-live`. Repeat of the saved live gate after the source-origin ordering correction. Not a new
audit cycle, not a product fix, not a migration apply.

Oracle: `AGENTS.md` §1 — «До аудита и landing кандидат миграции обязан пройти owner-aware rollback-only
preflight против именованной DEV из точного candidate checkout».

## Exact candidate identity

- Product candidate SHA: `85197a08b03ebe6a011a32ff60c2192a56461f29` (`fix(db): order canonical contacts source constraint`).
- Checkout HEAD at launch: `e43dd0be2` on `wt/d15b6-audit-20260821`.

```text
git merge-base --is-ancestor 85197a08b03ebe6a011a32ff60c2192a56461f29 HEAD
-> exit 0

git status --porcelain
-> empty (tracked tree clean)

git rev-parse HEAD:apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
git rev-parse 85197a08b03ebe6a011a32ff60c2192a56461f29:apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
-> both blob 64b813c99630d1eb25c909f4627d7ad797465970

git diff --stat 85197a08b03ebe6a011a32ff60c2192a56461f29 HEAD -- apps/webapp/db/drizzle-migrations/ deploy/postgres/
-> empty

git diff --name-status 85197a08b03ebe6a011a32ff60c2192a56461f29 HEAD
-> M docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md
-> A docs/_TODO/runs/integrator-cleanup/D15B6_CANDIDATE_NAMED_DEV_PREFLIGHT_RETRY2_BRIEF_2026-08-21.md
```

Everything after the product SHA is brief/queue documentation plus integration merges; no migration and no
privilege-declaration diff.

## Target and entrypoint

- Named DEV `bcb_webapp_dev` on `151.241.228.122`. No TEST, no PROD, no fixture, no disposable database.
- Single DB entrypoint, run from the candidate worktree:

```bash
setsid bash deploy/host/migrate-dev.sh --preflight >> /tmp/d15b6-candidate-preflight-retry2-20260821.log 2>&1
```

- The detached child first installed regular mode-`0600` copies of the canonical
  `/home/dev/dev-projects/BersonCareBot/.env` and `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev`
  at the matching candidate paths, with an exit trap removing only those two copies. No env value, URL or
  password was read or printed.
- Only one migration was pending: `20260821T040000_cut_over_canonical_contacts.sql`.
- The wrapper's own relation-wall registry seed ran as designed (`DELETE 219` / `INSERT 0 219`). No
  `--execute`, no `--reapply`, no manual SQL, no ledger write; the webapp DDL transaction ended in `ROLLBACK`.

## Terminal result

- PID record `/tmp/d15b6-candidate-preflight-retry2-20260821.pid` (`2655918`), terminal — not running after wait.
- **Exit code: `3`.**
- Wrapper log: `/tmp/d15b6-candidate-preflight-retry2-20260821.log`.

Safe last lines (the log contains only psql command tags and row counts — no contact values, no `DETAIL`
or `CONTEXT` line, so nothing had to be redacted):

```text
CREATE INDEX
RESET
SET
   session_user   |       current_user        | can_create_public
------------------+---------------------------+-------------------
 bcb_dev_migrator | app_seam_org_invite_owner | f
(1 row)

ERROR:  permission denied for schema app
```

## Verdict: FAIL

The corrected ordering itself passed. Under the exact candidate blob the earlier stop is gone: the
`user_contacts_source_origin_check` drop now precedes the backfill, and the whole contacts block executed —
`ALTER TABLE` (drop), `INSERT 0 202`, `INSERT 0 126`, `UPDATE 36`, `UPDATE 328`, `ALTER TABLE` (re-add), then
both `CREATE UNIQUE INDEX` statements. No `user_contacts_source_origin_check` violation occurred.

The run then stopped on a different, previously unreached statement in the same migration file: the first
seam-owned object creation.

- Failing statement: `CREATE OR REPLACE FUNCTION app.accept_org_invite(...)` at
  `apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql:202`, executed as
  `app_seam_org_invite_owner`.
- The statement carries `-- BCB-MIGRATION-OWNER: app_seam_org_invite_owner` and
  `-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql`, but no `-- BCB-MIGRATION-SCHEMA-CREATE: app`.
- `deploy/postgres/privileges/migrate-local.mjs:449` derives the temporary
  `GRANT CREATE ON SCHEMA <schema> TO <owner>` (revoked again at `:487`) exclusively from that marker. Without
  it a seam owner never receives CREATE on schema `app`, and PostgreSQL answers `permission denied for schema app`.
- Declared, not environmental: `deploy/postgres/generated/privileges.bcb_webapp_dev.sql:9530-9531` revokes all
  on schema `app` from every seam owner and grants back only `USAGE`. The temporary marker-driven grant is the
  only intended source of CREATE — this is not the neighbouring-branch reconcile drift class.
- Scope of the gap in the candidate: 34 `CREATE OR REPLACE FUNCTION app.*` statements, 16 distinct seam owners,
  `BCB-MIGRATION-SCHEMA-CREATE` marker count `0`. Sibling migrations that create `app.*` objects under a seam
  owner all carry it, e.g.
  `20260821T001200_parameterize_integrator_outgoing_delivery_enqueue.sql:2` and
  `20260819T170216_a_public_visitor_becomes_a_client_when_identified.sql:70`.

The required owner-aware rollback-only candidate preflight did not pass, so the candidate is not land-ready.
No product fix was made in this audit role.

## Cleanup

- Detached child stopped; no `migrate-dev.sh` / `migrate-local.mjs` process remained.
- Both candidate env copies absent after exit (`.env`, `apps/webapp/.env.dev`).
- PID file removed; wrapper log retained as evidence.
- `git status --porcelain` empty after the run — candidate tracked tree clean.

## Deviation to record

One read-only `SELECT current_database();` was run through the local postgres admin socket before launch to
confirm the target database. The brief lists direct `psql` among the prohibited actions; it touched no product
table and changed nothing, but it is recorded here rather than left unstated.

NOT DONE: landing / execute migration / live login-bind-delivery gate / TEST / deploy / push / full CI
