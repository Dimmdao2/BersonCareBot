# SaaS hard migration protocol - fresh dump to TEST rehearsal

Status: canonical hard protocol for the next fresh-dump rehearsal before any future production migration.

This document is a machine-checkable contract. It does not authorize an agent to run deploy, DB, env, SSH,
service, or production operations unless the owner explicitly asks for that operation. It states the only
allowed sequence once a fresh production dump is obtained.

## Canonical sources

- `deploy/host/deploy-test-saas.sh` - TEST from-zero wrapper.
- `deploy/host/saas-test-mode.sh` - TEST-only redacted mode check / dormant rollback helper.
- `scripts/deploy-saas-667.sh` - disposable/prod-copy #667 migration chain model.
- `docs/_TODO/SAAS_FOUNDATION/DEPLOY_667_SEQUENCE.md` - production-window sequence and rollback model.
- `docs/_TODO/SAAS_FOUNDATION/PHASE4_ROLLOUT_RUNBOOK.md` - strict/FORCE future cutover gates.
- `docs/OPERATIONS/RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md` - fresh dump, Rubitime R1, and no-ad-hoc-SQL entrypoint.
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md` and `deploy/HOST_DEPLOY_README.md` - host facts.

If these sources conflict, the current wrapper scripts win for executable behavior; this protocol must then
be updated in the same change.

## Hard rules

1. Production is read-only for dump acquisition only. The allowed production touch is a documented
   `pg_dump -Fc --no-owner --no-acl` path. No production writes, no production migrations, no production
   env edits, no service restarts, and no manual production SQL.
2. TEST is the rehearsal target. Use the documented TEST wrapper, not hand-written restore/migrate steps.
3. A plain `pnpm migrate`, or `restore + pnpm migrate`, is not valid proof for this migration.
4. No manual DB surgery. If a step fails, fix the repository script/protocol/checker and rerun from a fresh
   restore. Do not patch rows by hand to get past a gate.
5. Temporary privileges are allowed only inside the migration window and must be cleaned up fail-visibly.
6. Reports and evidence must be aggregate-only: no patient names, phone numbers, emails, raw payloads,
   credential-bearing URLs, or secrets.
7. The TEST wrapper owns the migration window. It may run with
   `DB_PRINCIPAL_CONTEXT_MODE=legacy-guc|shadow|locked` in the TEST env files, but DDL/backfill work must happen
   only inside the documented temporary owner-authority migration step. Runtime restart in `shadow|locked` must not
   require a dormant owner `DATABASE_URL` in `/opt/env`.
8. Integrator API startup is not a migration runner in `shadow|locked`. `apps/integrator/src/main.ts` must call the
   startup migration gate, and that gate must skip DDL migrations in `shadow|locked`, performing only non-DDL
   migration-state verification against `integrator.schema_migrations`. The gate must prove the ledger exists,
   can be read by the runtime login, and contains every discovered integrator migration from the deployed repo.
   Missing ledger, missing migration rows, connection failures, database permission denial, and table/schema SELECT
   permission denial are fatal. For `shadow|locked` runtime, the TEST wrapper must also install the repo-managed
   protected principal helper surface (`deploy/postgres/p2-b-protected-principal-context.sql`) with the same
   `DB_PRINCIPAL_SIGNING_SECRET` used by `api.test` and `webapp.test`, and verify that the discovered `api.test`
   runtime login can see and execute `app.release_principal_context()` before any TEST service restart. The TEST
   wrapper must apply the repo-managed, narrow runtime grant needed for the migration-ledger check after migrations
   and before restart: `USAGE` on schema `integrator` and `SELECT` on
   `integrator.schema_migrations` to the `api.test` `DATABASE_URL` role discovered from the env file, then verify
   that the same runtime login can `SELECT` the ledger. Direct deploy/script migration entrypoints still call `runMigrations()`.
9. `deploy/host/saas-test-mode.sh` remains TEST-only, redacted, default-dry-run, backup-before-rewrite, and useful
   only for an owner-approved dormant rollback. It must not invent locked URLs/secrets, and `--mode locked` remains
   blocked until the future full flip wrapper owns repo-known locked URLs/secrets.

## Roles

| Role class | TEST example | Purpose | End-state |
| --- | --- | --- | --- |
| Runtime owner / migration owner | `bersoncarebot_test` | Owns restored tables and runs owner-only DDL/backfills | `NOBYPASSRLS`; no temporary owner membership remains |
| Webapp migrator login | role from `webapp.test` `DATABASE_URL` | Invokes `pnpm migrate` through deploy env | No lingering membership in the runtime owner role |
| Superuser/operator | `postgres` | Restore, owner assertions, temporary grants, cleanup assertions | Not used as app runtime |
| App owner | `app_owner` in #667 model | Future protected helper/schema owner | `NOLOGIN`; migration owner membership is temporary only |
| Staff/patient runtime | `app_staff`, `app_patient` | Future locked runtime roles | `NOBYPASSRLS`; not owners |

## Allowed TEST sequence

Run the sequence as one wrapper:

```bash
bash deploy/host/deploy-test-saas.sh feat/doctor-ui-rebuild
```

The wrapper owns the full sequence below.

### 1. Assert TEST runtime mode

Before acquiring a dump or rebuilding anything, the wrapper must read only the `DB_PRINCIPAL_CONTEXT_MODE` key from
`/opt/env/bersoncarebot/api.test` and `/opt/env/bersoncarebot/webapp.test` as the deploy-readable TEST env files.
Missing mode means the application default `legacy-guc`. The accepted values are `legacy-guc`, `shadow`, and
`locked`; any other value is a preflight failure.

If either file says `shadow` or `locked`, the wrapper must continue to own migrations through the temporary
owner-authority window below, then restart TEST units under that runtime mode. It must not patch grants outside the
documented migration window and must not edit `/opt/env`. The reason this restart is valid is the integrator startup
contract: after deploy has run `pnpm migrate`, API startup skips DDL migrations in `shadow|locked` and strictly
verifies that `integrator.schema_migrations` contains every discovered integrator migration from the deployed repo.

The repo-tracked TEST-only dormant rollback helper remains available for an owner-approved rollback to `legacy-guc`,
but it is not required for a locked TEST restart:

```bash
bash deploy/host/saas-test-mode.sh --check
bash deploy/host/saas-test-mode.sh --mode dormant --dry-run
# owner/operator-approved TEST action only:
bash deploy/host/saas-test-mode.sh --mode dormant --apply --restart
```

Agents must not
edit `/opt/env` manually, run ad hoc grants, or introduce a one-off locked grants path here. The only allowed
ledger grant in this protocol is the repo-managed narrow `deploy-test-saas.sh` grant/check described in step 7.
`saas-test-mode.sh --mode locked` must fail-fast until locked URLs/secrets and the all-unit flip contract are
repo-known and owned by the future full flip wrapper.

This preflight must be read-only and must run before the `cleanup_exit` trap is installed. An unsupported-mode
failure before restore must not call `cleanup_elevation`, must not execute `ALTER ROLE`, and must not perform DB
writes. TEST deploy proof is the wrapper's migration/restart/health gate, not a manual env rollback.

### 2. Obtain a fresh dump

Default TEST behavior streams a live production dump through read-only `pg_dump`:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 bcb-clone \
  "sudo -u postgres pg_dump -Fc --no-owner --no-acl bersoncarebot" > /tmp/bcb-prod-fresh.dump
```

This creates no dump file on production and performs no production writes. `DUMP=/path/to/current.dump` may
be used only for an already-pulled fresh dump. Do not silently fall back to the local `/opt/backups` copy on
the TEST box for this hard rehearsal.

### 3. Restore to TEST or a disposable DB

TEST restore must go through `/tmp/bcb-test-setup/restore-test-db.sh`. The restored target is
`bersoncarebot_test`, and the restore path must leave the database and representative tables owned by
`bersoncarebot_test`.

Disposable prod-copy rehearsals use `scripts/deploy-saas-667.sh` through the repo-tracked disposable wrapper,
not by hand. The wrapper passes either explicit `DATABASE_URL` + `SUPERUSER_URL` URLs or explicit
`DATABASE_URL` + `SUPERUSER_SUDO_POSTGRES=1` for local peer/sudo superuser psql calls. Disposable DB names
must clearly be scratch/rehearsal/copy targets, not prod/test/dev runtime databases.

### 4. Assert owner state before data-fix

Before the doctor/admin data-fix, the wrapper must assert:

- database owner is the expected runtime owner;
- `public.platform_users` owner is the expected runtime owner;
- the webapp env `DATABASE_URL` points to the TEST DB, not another database.

Failing these assertions stops the protocol. Do not repair by manual `ALTER OWNER`; fix the restore script
or rerun from a fresh restore.

### 5. Run doctor/admin data-fix with owner authority

`deploy/postgres/p0-data-fix-doctor-admin-split.sql` runs before Drizzle/webapp migrations. On TEST the
wrapper pipes it through a superuser session with:

```sql
SET ROLE "bersoncarebot_test";
\i deploy/postgres/p0-data-fix-doctor-admin-split.sql
RESET ROLE;
```

This is required because the data-fix must behave as the runtime owner. Running it as an arbitrary deploy
login through plain `psql "$DATABASE_URL" -f ...` is not an allowed substitute.

### 6. Temporarily elevate only for migration window

Before `pnpm migrate`, the wrapper must:

- discover the webapp migrator role from `webapp.test` `DATABASE_URL`;
- fail if that role already has pre-existing owner membership residue;
- grant runtime-owner membership to the migrator only when needed;
- set `BYPASSRLS` on the runtime owner only for the migration window;
- run the migration chain with `PGOPTIONS='-c role=bersoncarebot_test'`.

The purpose is narrow: owner-only DDL must run under owner authority, while backfills under RLS/FORCE need
temporary BYPASSRLS. The temporary grant and BYPASSRLS flag must be revoked on success and through the
`EXIT` trap on failure.

### 7. Cleanup and post-cleanup assertions are mandatory

Cleanup is not best-effort. The wrapper must fail visibly if cleanup fails, and must assert after cleanup:

- runtime owner has `rolbypassrls=false`;
- migrator no longer has the temporary runtime-owner membership granted by this run;
- required Drizzle migrations are present;
- required organization columns exist.

Immediately after the migration cleanup/schema assertions and before any TEST service restart, the wrapper must:

- install/refresh the protected principal context when `DB_PRINCIPAL_SIGNING_SECRET` is configured, and require it
  when either TEST env file is `shadow|locked`;
- require `api.test` and `webapp.test` `DB_PRINCIPAL_SIGNING_SECRET` to be present, equal, at least 32 characters,
  and not printed when a signed runtime mode is selected;
- run the fixed `app_staff` / `app_patient` role split SQL as the TEST superuser, prepare the `app_owner` protected
  helper owner, normalize `pgcrypto` into `app_ext` with repo-controlled `ALTER EXTENSION pgcrypto SET SCHEMA app_ext`
  when a fresh dump already has it elsewhere, then run `deploy/postgres/p2-b-protected-principal-context.sql` from the
  version-matched deploy checkout. If `app_ext` already contains conflicting `pgcrypto` function signatures, the wrapper
  must fail before P2-B with `pgcrypto_app_ext_conflicting_functions` instead of applying manual DB surgery;
- normalize the existing migration-created `app.is_staff()` owner to `app_owner` immediately before P2-B install and
  fail before P2-B if it is missing or still owned by another role. Migration 0175 creates/replaces this helper as
  `CURRENT_USER`; P2-B runs `CREATE OR REPLACE FUNCTION app.is_staff()` under `SET ROLE app_owner`, so the owner handoff
  must be repo-controlled rather than a manual `ALTER FUNCTION`;
- verify through the `api.test` runtime `DATABASE_URL` that `app.release_principal_context()` exists and is
  executable by the runtime login, because infra/bootstrap scheduler paths clear the protected context before
  touching the DB in `shadow|locked`;
- discover the integrator runtime role from `api.test` `DATABASE_URL`;
- assert that the URL points to the TEST DB and that the discovered role name is a simple PostgreSQL identifier;
- grant only `USAGE` on schema `integrator` and `SELECT` on table `integrator.schema_migrations` to that role;
- verify through the `api.test` runtime `DATABASE_URL` that `SELECT count(*) FROM integrator.schema_migrations`
  succeeds and returns at least one row.

Do not add broad `integrator.*` table grants for the runtime login to fix startup. Do not route this through
P0.5b `app_staff`/`app_patient` DML grants: those intentionally exclude migration ledgers from the app DML surface.

Leaving BYPASSRLS or owner membership behind is a protocol failure even if migrations succeeded.

### 8. TEST-only override and send-safety

After migrations, apply the repo-tracked `deploy/postgres/test-settings-override.sql`. This is the only
allowed TEST override path for maintenance, dev mode, test account identifiers, OAuth redirects, and
admin/doctor allowlist normalization. It must stay version-matched to the deploy checkout.

### 9. Specialist consolidation

Run the existing specialist consolidation path with the pinned canonical specialist used by the wrapper.
This command is a write-path over owner-owned booking tables and must not run as the raw runtime
`DATABASE_URL` role. The TEST wrapper must run it under the same controlled temporary owner-role context as
owner-only migration work:

- discover or reuse the webapp migrator role from `webapp.test` `DATABASE_URL`;
- grant runtime-owner membership to that login only when the login is not already the runtime owner;
- run the deploy checkout command with `PGOPTIONS='-c role=bersoncarebot_test'`;
- revoke the temporary membership immediately after the consolidation step;
- keep the `EXIT` trap active so failure paths still assert cleanup;
- fail visibly if cleanup leaves `BYPASSRLS` or owner membership behind.

Specialist consolidation does not require `BYPASSRLS`; if it is ever added for this step, that must be
documented and checked as a separate protocol change.

The end-state assertions must include:

- exactly one active specialist;
- no appointments on `NULL` or inactive specialists;
- the owner doctor keeps role `doctor`;
- TEST `admin_phones` is `[]`;
- appointment counts on the canonical specialist are reported as aggregate counts only.

### 10. B1, A2, and product smoke gates

The wrapper must run the B1 doctor/admin identity assertion after the end-state checks. B1 reads owner-owned
identity tables and must use the same controlled temporary owner-role context as specialist consolidation:

- discover or reuse the webapp migrator role from `webapp.test` `DATABASE_URL`;
- grant runtime-owner membership to that login only when the login is not already the runtime owner;
- run the deploy checkout command with `PGOPTIONS='-c role=bersoncarebot_test'`;
- pass `--allow-test-target`, explicit `--database-url "$DATABASE_URL"`, and
  `--required-current-user=bersoncarebot_test` to the B1 checker;
- revoke the temporary membership immediately after the B1 assertion;
- keep the `EXIT` trap active so failure paths still assert cleanup;
- fail visibly if cleanup leaves `BYPASSRLS` or owner membership behind.

B1 must not run as the raw TEST runtime `DATABASE_URL` role. The checker must verify `current_user` before
reading `public.platform_users`, and the database URL must remain explicit and unprinted. B1 does not require
`BYPASSRLS`; if it is ever added for this step, that must be documented and checked as a separate protocol
change.

It must then restart TEST units and run:

- health check for `https://test.bersoncare.ru/api/health`;
- repo-managed TEST nginx apply path before A2:
  `bash deploy/host/apply-test-nginx-webapp.sh --apply`;
- the TEST nginx apply script must remain TEST-only, default-dry-run unless `--apply`, refuse production-looking
  paths/upstreams, render the TEST vhost from audited repo content, include `proxy_set_header X-Forwarded-Host $host`
  and `proxy_set_header X-Forwarded-Proto $scheme` in the webapp `location /`, backup active TEST nginx config,
  run `nginx -t`, reload nginx only on success, and run the A2 checker against `nginx -T`;
- A2 nginx forwarded-host preflight against active `nginx -T`;
- A1/product smoke when `SAAS_PRODUCT_SMOKE_FIXTURE` is supplied;
- `awg-quick@awg0` active check, because the production Telegram relay on the TEST host must remain untouched.

Do not claim a TEST deploy passed unless the wrapper has actually run and these gates have passed.

### 11. D2 FB#1 and future strict/FORCE gates

D2 FB#1 static and scratch-package checks are repo gates, not live TEST proof. Keep running:

```bash
pnpm run check:saas-d2-fb1-bootstrap-phone-write
```

The future strict+FORCE cutover remains separate from dormant TEST deploy. It is gated by
`PHASE4_ROLLOUT_RUNBOOK.md`, `deploy/postgres/phase4-force-rls-cutover.sql`, and the Phase 4 FORCE checkers.
Do not bundle strict/FORCE into the fresh-dump dormant rehearsal.

## Failure policy

- Stop at the first failed gate.
- Do not continue by manually changing DB rows, grants, owners, RLS flags, or settings.
- Fix the repo script, SQL, checker, or protocol that produced the failure.
- Rerun from a fresh restore or fresh disposable DB.
- If a temporary privilege cleanup failure occurs, treat it as the primary incident until post-cleanup
  assertions prove the target is clean.

## DEV/disposable dormant wrapper

The DEV/disposable rehearsal path is now repo-tracked and separate from TEST services:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/run-saas-disposable-dormant-rehearsal.mjs \
  --dry-run \
  --dump=/path/to/fresh-prod.dump \
  --db=bcb_saas_dormant_rehearsal_YYYYMMDD
```

Full disposable execution is still owner-authorized because it creates and restores a PostgreSQL database.
When authorized, use one of the two allowed execute forms below with a safe disposable DB name. Do not run
manual SQL, `createdb`, `dropdb`, `pg_restore`, or `scripts/deploy-saas-667.sh` directly; the wrapper owns
the sequence.

URL superuser transport:

```bash
SAAS_DISPOSABLE_SUPERUSER_URL='postgres://<superuser>@localhost/postgres' \
node docs/_TODO/SAAS_FOUNDATION/scripts/run-saas-disposable-dormant-rehearsal.mjs \
  --execute \
  --dump=/path/to/fresh-prod.dump \
  --db=bcb_saas_dormant_rehearsal_YYYYMMDD \
  --replace-existing
```

Local peer/sudo superuser transport:

```bash
SAAS_DISPOSABLE_SUPERUSER_SUDO_POSTGRES=1 \
node docs/_TODO/SAAS_FOUNDATION/scripts/run-saas-disposable-dormant-rehearsal.mjs \
  --execute \
  --superuser-sudo-postgres \
  --dump=/path/to/fresh-prod.dump \
  --db=bcb_saas_dormant_rehearsal_YYYYMMDD \
  --replace-existing
```

The sudo transport is explicit opt-in and local-only by construction: superuser operations run as
`sudo -n -u postgres psql` / `sudo -n -u postgres pg_restore` against the guarded disposable DB name chosen by
the wrapper. The #667 sudo psql path must run through `env -i` and must not accept ambient `PGHOST`,
`PGDATABASE`, `PGSERVICE`, `PGOPTIONS`, or `DATABASE_URL` host/database overrides.
When #667 applies repo-tracked `deploy/postgres/*.sql` through sudo psql, the current shell user must read the
repo file and pipe it through stdin; do not rely on the `postgres` OS user being able to traverse the dev repo
for `psql -f`.
For the #667 child process, the wrapper passes an explicit disposable owner `DATABASE_URL` and
`SUPERUSER_SUDO_POSTGRES=1`; it does not require or print a superuser URL in this mode.

Default behavior preserves the disposable DB for audit. Add `--drop-on-success` only when the operator
explicitly wants the wrapper to drop the disposable DB and owner role after all assertions pass.

The wrapper owns the disposable sequence:

1. refuse ambient prod/test/dev-shaped DB hints and sanitize child process DB env;
2. validate the dump path and `pg_restore --list` custom-format readability when a dump is supplied;
3. create or recreate only a guarded `bcb_saas_*_scratch_*` or `bcb_saas_*_rehearsal_*` database;
4. restore with `pg_restore --no-owner --no-acl --no-comments --role=<disposable-owner>`;
5. treat any non-zero `pg_restore` exit as a failed restore gate; representative row-count assertions are
   post-restore sanity checks only and must not turn a non-zero restore into a pass;
6. assert database owner and `public.platform_users` owner before migration;
7. run the canonical `scripts/deploy-saas-667.sh` chain with explicit disposable `DATABASE_URL` plus either
   `SUPERUSER_URL` or `SUPERUSER_SUDO_POSTGRES=1`;
8. assert cleanup: disposable runtime owner is `NOBYPASSRLS` and has no temporary `app_owner` membership;
9. run disposable DB-state checks through `run-phase4-prod-copy-rehearsal.mjs --mode=db-state`;
10. leave TEST services, TEST env, production services, and production DB untouched.

This wrapper closes the previous DEV/disposable dormant-wrapper gap. It does not touch TEST services and
does not claim TEST deploy proof. Full disposable execution is restore+migration proof only after an
owner-authorized executor runs `--execute` on a fresh dump and captures aggregate-only evidence.

## Static validation

This protocol is enforced by:

```bash
pnpm run check:saas-hard-migration-protocol
pnpm run check:saas-disposable-dormant-wrapper
```

These checkers are intentionally DB-free. They verify this document, the TEST wrapper, the disposable
wrapper, the D2 checker hook for wrapper cleanup, and package script wiring. Static preflight success is
not restore+migration proof and does not prove TEST deploy success.
