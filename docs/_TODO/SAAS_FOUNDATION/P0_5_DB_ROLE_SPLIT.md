# P0.5.1 DB role split contract

Status: P0.5.1 contract/proof stage. Dormant; no runtime role flip.

## Purpose

P0.5.1 defines the database-role boundary required before RLS enforcement:

- migration/owner roles may perform DDL and backfills;
- application runtime roles must be non-owner, DML-only, and `NOBYPASSRLS`;
- production deploy docs must not claim concrete split role names or env wiring until those facts are confirmed on the host.

Current production documentation still describes the confirmed runtime state: `api.prod` and `webapp.prod`
use one unified `DATABASE_URL` to the same PostgreSQL database. This stage does not change that fact and
does not introduce new env variables.

## Target role classes

| Role class | Login | Owns schemas/tables | RLS bypass | Used by |
|---|---:|---:|---:|---|
| Owner role | No | Yes | No required bypass | Table/schema ownership and grant target. |
| Migrator role | Yes, deploy-only | May be member of owner where needed | Not used by runtime | Migrations, DDL, strict backfills, policy changes. |
| App runtime role | Yes | No | **Must be `NOBYPASSRLS`** | webapp, integrator API, worker, scheduler, media-worker after cutover. |

## Invariants

1. The app runtime role is never the owner of SCOPED tables.
2. The app runtime role has `rolbypassrls = false`.
3. The app runtime role has only runtime privileges: schema `USAGE`, table DML as needed, sequence usage as needed.
4. The app runtime role is not a member of the owner/migrator role.
5. RLS policies use the dormant request principal (`app.org`) later wired by P0.6/P0.7.
6. Runtime role switching is not performed in P0.5.1; it is a later cutover after P0.8/P0.9/P0.10 gates.

## Scratch proof

Proof SQL: [`P0_5_DB_ROLE_SPLIT_PROOF.sql`](P0_5_DB_ROLE_SPLIT_PROOF.sql).

The proof creates synthetic roles and a synthetic scoped table in one transaction, enables `FORCE ROW LEVEL
SECURITY`, switches to the app role, and verifies that `app.org` gates rows by organization. It rolls back
at the end.

Safety guard: the script refuses to run unless `current_database()` looks like a scratch/SaaS proof database
(`bcb_saas_*` or a name containing `scratch`). Do not run it on dev/prod PII databases.

Example for a scratch database only:

```bash
bash /home/dev/orch/run-tests.sh "psql \"$SCRATCH_DATABASE_URL\" -v ON_ERROR_STOP=1 -X -f docs/_TODO/SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT_PROOF.sql"
```

## Non-goals

- No production role creation.
- No changes to `/opt/env/bersoncarebot/*`.
- No app runtime `DATABASE_URL` change.
- No RLS policy migration for real tables.
- No dev/prod DB write.
