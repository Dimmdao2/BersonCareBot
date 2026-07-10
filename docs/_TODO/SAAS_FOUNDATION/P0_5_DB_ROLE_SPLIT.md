# P0.5 DB role split contract

Status: P0.5 / B5 materialized dormant ops artifact. Dormant; no runtime role flip.

## Purpose

P0.5 defines the database-role boundary required before RLS enforcement:

- migration/owner roles may perform DDL and backfills;
- application runtime roles must be non-owner, DML-only, and `NOBYPASSRLS`;
- production deploy docs must not switch runtime env wiring until that fact is confirmed on the host.

Current production documentation still describes the confirmed runtime state: `api.prod` and `webapp.prod`
use one unified `DATABASE_URL` to the same PostgreSQL database. This stage does not change that fact and
does not introduce new env variables.

## Materialized artifact

Repeatable ops SQL: [`../../../deploy/postgres/p0-5-role-split.sql`](../../../deploy/postgres/p0-5-role-split.sql).

The SQL is generated from the SaaS tier descriptor model by
[`scripts/p0-5-role-split-sql.mjs`](scripts/p0-5-role-split-sql.mjs) and is checked by
[`scripts/check-p0-5-role-split.mjs`](scripts/check-p0-5-role-split.mjs). The generated grant target is
exactly the current `SCOPED` + `BOOTSTRAP` table set:

- `157` `SCOPED` tables;
- `26` `BOOTSTRAP` tables;
- `0` `INFRA`, `LEGACY`, or `TELEMETRY` tables.

The SQL is parameterized with operator-chosen role names:

- `p0_5_owner_role` — no-login owner/DDL role;
- `p0_5_migrator_role` — deploy-only login role, member of owner, `BYPASSRLS`;
- `p0_5_app_role` — future application login role, `NOBYPASSRLS`.

Assumption for B5: concrete host role names are intentionally not hardcoded in the repository. The
repeatable artifact defines the role classes and grants; the operator chooses role names when running it.
Because owner/migrator roles use `BYPASSRLS`, the SQL must be run by a superuser-capable operator role.

## Target role classes

| Role class | Login | Owns schemas/tables | RLS bypass | Used by |
|---|---:|---:|---:|---|
| Owner role | No | Yes | `BYPASSRLS` allowed; not a runtime login | Table/schema ownership and grant target. |
| Migrator role | Yes, deploy-only | Member of owner where needed | `BYPASSRLS`; not used by runtime | Migrations, DDL, strict backfills, policy changes. |
| App runtime role | Yes | No | **Must be `NOBYPASSRLS`** | webapp, integrator API, worker, scheduler, media-worker after cutover. |

## Invariants

1. The app runtime role is never the owner of SCOPED tables.
2. The app runtime role has `rolbypassrls = false`.
3. The app runtime role has only runtime privileges: schema `USAGE`, table DML as needed, sequence usage as needed.
4. The app runtime role is not a member of the owner/migrator role.
5. RLS policies use the dormant request principal (`app.org`) later wired by P0.6/P0.7.
6. Runtime role switching is not performed in P0.5/B5; it is a later cutover after P0.8/P0.9/P0.10 gates.

## Grant contract

`deploy/postgres/p0-5-role-split.sql` grants the app role:

- `CONNECT` on the current database;
- `USAGE` on schemas that contain `SCOPED` or `BOOTSTRAP` tables (`public`, `integrator`);
- `SELECT, INSERT, UPDATE, DELETE` on every `SCOPED` and `BOOTSTRAP` table from the descriptor model;
- `USAGE, SELECT` on sequences owned by those granted tables.

It does not grant the app role `SUPERUSER`, `CREATEROLE`, `BYPASSRLS`, schema `CREATE`, owner/migrator
membership, or any permission that bypasses RLS. It does not grant `INFRA`, `LEGACY`, or `TELEMETRY`
tables in this B5 artifact.

The owner role receives schema `USAGE, CREATE` on schemas represented by the grant set. The migrator role
is granted membership in the owner role for deploy-only DDL/backfill execution.

## Rollback

The same SQL file contains a down block. Re-run it with `-v p0_5_down=1` and the same three role-name
variables to revoke the app grants/memberships and drop the roles when PostgreSQL dependency checks allow
it. The rollback intentionally does not run `REASSIGN OWNED` or `DROP OWNED`, because those are destructive
ownership operations and must remain owner-gated.

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

- No changes to `/opt/env/bersoncarebot/*`.
- No app runtime `DATABASE_URL` change.
- No runtime role switch.
- No RLS policy migration for real tables.
- No dev/prod DB write.
