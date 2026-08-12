# C0 locked topology ADR

> **УСТАРЕЛО/ЗАМЕНЕНО 12.08.2026:** это доказательство старого two-login locked contour, не текущий target.
> Текущий target имеет два software ports и четыре runtime DB-login, включая отдельный webapp-owned
> global-admin certificate/pool; см. `DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md` revision 11.

Status: Phase C0 contract for Tenant Hard Mode. Repo-side ADR and executable scratch proof only; no
application runtime flip.

## Decision

Use two runtime login roles and two pools:

- `app_runtime_staff_login LOGIN NOINHERIT NOBYPASSRLS`
- `app_runtime_nonstaff_login LOGIN NOINHERIT NOBYPASSRLS`

Do not use a `SECURITY DEFINER` role-switch bridge.

`app_runtime_staff_login` is a member only of `app_staff`. Staff and organization principals must check
out the staff pool and locked runtime must execute `SET ROLE app_staff`.

`app_runtime_nonstaff_login` is a member only of `app_patient`. Patient and integrator principals must
execute `SET ROLE app_patient`. Bootstrap also uses the nonstaff pool but remains the base login after
`RESET ROLE`, so `app.is_staff()` is false and only direct bootstrap grants are available.
Both runtime membership edges are SET-only (`ADMIN FALSE, INHERIT FALSE, SET TRUE`); this is the exact
topology normalized by D3.4 and exercised by the locked patient identity gate.

Owner and migrator roles remain maintenance-only. They are not application `DATABASE_URL` roles and no
request pool may be granted `BYPASSRLS`.

## Canonical Inputs

- [`SAAS_ENFORCE_ROADMAP.md`](SAAS_ENFORCE_ROADMAP.md) Phase C0.
- [`../../../deploy/postgres/p0-5-role-split.sql`](../../../deploy/postgres/p0-5-role-split.sql) for
  owner/migrator/app role class boundaries.
- [`../../../deploy/postgres/p0-5b-role-split-staff-patient.sql`](../../../deploy/postgres/p0-5b-role-split-staff-patient.sql)
  for the fixed `app_staff` / `app_patient` role wall.
- [`scripts/smoke-b4-locked-runtime-principal.mjs`](scripts/smoke-b4-locked-runtime-principal.mjs) for
  prior protected-principal runtime proof. That smoke is not a C0 topology proof because its disposable
  staff login is a member of both wall roles.

## Required Assertions

The C0 executable proof must assert:

- both runtime login roles are `LOGIN`, `NOINHERIT`, and `NOBYPASSRLS`;
- `app_runtime_staff_login` is a member of `app_staff` and not `app_patient`;
- `app_runtime_nonstaff_login` is a member of `app_patient` and not `app_staff`;
- each runtime login cannot `SET ROLE` to the other wall role, owner role, or migrator role;
- nonstaff `app.is_staff()` is false after `RESET ROLE`;
- staff `app.is_staff()` is true only on the staff connection;
- bootstrap DML is exactly allowlisted on the nonstaff base login and does not leak scoped-table DML.

## Proof Artifact

Executable proof:

```bash
pnpm run smoke:saas-c0-locked-topology
```

Static contract check:

```bash
pnpm run check:saas-c0-locked-topology
```

The smoke creates a private local PostgreSQL cluster under `/tmp/bcb_saas_*_scratch_*`, starts it with
Unix-socket-only `trust` auth, applies the real P0.5b role-wall SQL, creates the two C0 runtime login roles,
runs the positive and negative SQL assertions, then stops and removes the private cluster.

The proof deliberately does not read `DATABASE_URL`, `PG*` environment variables, `/opt/env/*`, SSH, TEST,
PROD, or dev databases.

## Non-goals

- No app pool provider changes.
- No runtime env or credential provisioning.
- No TEST/PROD/prod-copy validation.
- No replacement for owner-authorized disposable deployment gates in B1/B2 and later C phases.
