# SaaS hard migration protocol - fresh dump to TEST rehearsal

Status: **УСТАРЕЛО/ЗАМЕНЕНО 16.08.2026 → `docs/OWNER_DECISIONS.md`, B0 migration baseline.**
Оставшийся текст — историческая запись и не является исполняемым runbook; описанные disposable,
PROD A→B0, reset/restore и cutover-команды удалены из active checkout.

Заменённый протокол был: **ACTIVE OWNER-GATED TEST REHEARSAL (owner 2026-08-15).** The target is the named
`bersoncarebot_test` database restored directly from the fresh current PROD dump. There is no intermediate or
disposable database in this rehearsal. Each deploy/cutover still touches one target DB only.

**ЗАМЕНЕНО 15.08.2026:** the 12.08 instruction below that made DEV the mandatory next target and blocked the
TEST wrapper was a point-in-time guard, not a permanent prohibition. The owner explicitly ordered the final
production-transfer rehearsal on TEST now. The executable order is:
fresh dump → owner identity consolidation → identity data-fix → reviewed FIO → accepted legacy appointment
transfer → declaration-derived NOLOGIN prerequisites → **one atomic PROD-schema A → current DEV-schema B
transition** (`prod-to-target-cutover.sql`) → TEST settings overlay → generated target port-context
roles/grants/RLS → TEST runtime proof. Historical webapp/integrator migration runners, retired-role bridges and
standalone online-index steps are not invoked on this fresh-reset path.

**ЗАМЕНЕНО 12.08.2026 (runtime topology remains current; the DEV-first scheduling sentence is replaced above):** every later reference in this document to `locked` as the final runtime, to shared
DEV+TEST/bilateral cutover, to exact six cluster-global application logins, to global-admin via staff, to the old
diagnostic/delivery/scheduler/operator login closure, or to Rubitime inputs is historical data-migration context.
The final runtime is `port-context`, four runtime logins per target (staff/patient/global-admin/integrator), PostgreSQL mTLS plus
SCRAM, transaction context, native FORCE RLS and narrow SECURITY DEFINER seams. The executable authority is
the target-neutral implementation required by `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`; current shared cutover scripts
must not be used as target until replaced.

This document is a machine-checkable contract. It does not authorize an agent to run deploy, DB, env, SSH,
service, or production operations unless the owner explicitly asks for that operation. It states the only
allowed sequence once a fresh production dump is obtained.

## Canonical sources

- `deploy/host/deploy-test-full-reset.sh` - единственный публичный owner-gated TEST from-zero entrypoint.
- `deploy/host/deploy-test-saas.sh` - внутренний shared closure/full-reset engine; прямой destructive-вызов запрещён.
- `deploy/host/deploy-test.sh` - ordinary code-only TEST deploy; it never restores or recreates the database.
- `apps/webapp/scripts/cutover-legacy-appointments.ts` - current one-time, hash-bound pre-migration transfer from
  `appointment_records` into canonical appointments. It is cutover tooling, never a runtime provider integration.
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-db-cleanup-one-pass.mjs` - historical provenance only; do not execute it.
- `apps/webapp/scripts/fio-backfill/README.md` - reviewed-manifest FIO apply/rollback contract.
- `apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts` - idempotent TEST-only A/B walkthrough fixture.
- `deploy/host/saas-test-mode.sh` - TEST-only redacted mode check / dormant rollback helper.
- `scripts/deploy-saas-667.sh` - disposable/prod-copy #667 migration chain model.
- `deploy/postgres/c4d-platform-lfk-media-owner-online-index.sql` - one-time transaction-free C4D hot-index step.
- `docs/_TODO/SAAS_FOUNDATION/DEPLOY_667_SEQUENCE.md` - production-window sequence and rollback model.
- `docs/_TODO/SAAS_FOUNDATION/PHASE4_ROLLOUT_RUNBOOK.md` - strict/FORCE future cutover gates.
- `docs/archive/2026-07-rubitime-retirement/RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md` - historical provenance only; not a current entrypoint.
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md` and `deploy/HOST_DEPLOY_README.md` - host facts.

If these sources conflict, `OWNER_DECISIONS.md` and `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` win. A conflicting current
wrapper is blocked and must be fixed; его нельзя объявить каноном по факту существования.

## Как пойдёт переход прода: репетиция решает (владелец, 19.08)

Владелец 19.08:

> «Есть высокая вероятность, что на момент выкатки прода мы снова сделаем новую миграцию А→B того, что
> получится в итоге. Не будем делать никаких миграций поверх состояния прод-базы. Просто снимем свежий дамп с
> production, сделаем разницу А→B, наложим её и получим чистое состояние. Но посмотрим, сделаем репетицию с
> миграциями. Если всё ок — оставим так, если хэш базы сойдётся. Если будут проблемы — даже не пытаемся этим
> заморачиваться, просто делаем вычитание и создаём миграцию перехода.»

**Что это значит для работы.** Порядок не выбирается заранее — его выбирает результат репетиции:

1. репетиция на свежем прод-дампе прогоняется цепочкой forward-миграций, как сейчас;
2. **критерий приёмки — совпадение структуры** полученной базы с целевой (сравнение схемы/хеша, а не «прогон
   не упал»);
3. **сошлось** — оставляем цепочку миграций;
4. **не сошлось** — цепочку не чиним и время на неё не тратим: снимается разница целевой структуры и
   прод-снимка, и она накладывается ОДНОЙ переходной миграцией.

Из этого следует практическое: цепочка forward-миграций поверх `B0` ценна ровно до репетиции. Вкладываться в
её «красоту» и чинить её историю смысла нет — правило §1b 3a («переход A → B0 исполняется как одна цельная
атомарная миграция, без последовательного проигрывания истории») действует и здесь.

## Hard rules

1. Before a live TEST port-context PASS, production is not touched. A later fresh-dump rehearsal may use only the documented
   `pg_dump -Fc --no-owner --no-acl` path. No production writes, no production migrations, no production
   env edits, no service restarts, and no manual production SQL.
2. **ЗАМЕНЕНО 15.08:** current initial cutover target is the named TEST database, one DB per run, under the
   owner's direct command. Routine TEST deploy still never restores or recreates TEST; this is the one-off
   fresh-production-dump rehearsal. Shared bilateral cutover remains forbidden.
   Ordinary migration deploy остаётся fail-closed и не может возвращаться к owner-login/BYPASS path.
3. A plain `pnpm migrate`, or `restore + pnpm migrate`, is not valid proof for this migration.
4. No manual DB surgery. If a step fails, fix the repository script/protocol/checker and rerun from a fresh
   restore. Do not patch rows by hand to get past a gate.
5. Temporary owner/BYPASS authority is allowed only for the reviewed pre-cutover data stage. It must be cleaned up
   fail-visibly before target access installation and is never application runtime authority.
6. Reports and evidence must be aggregate-only: no patient names, phone numbers, emails, raw payloads,
   credential-bearing URLs, or secrets.
7. The TEST wrapper owns the migration window. DDL/backfill work happens only inside the documented temporary
   owner-authority migration step while all TEST writers are stopped. The cutover then atomically renders
   `port-context` env and removes the owner `DATABASE_URL`; target runtime restart uses the exact
   staff/patient/global-admin/integrator URLs. The four-login target is mandatory.
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
9. `deploy/host/saas-test-mode.sh` is a historical TEST-only diagnostic artifact: redacted, default-dry-run and
   backup-before-rewrite. It is not part of either supported TEST deploy path and must not be used to recover a
   failed strict TEST deployment by switching walls off. `--mode locked` remains blocked because the supported
   wrappers already own the locked closure; any exceptional owner-directed environment rewrite is a separate
   incident operation and does not count as strict TEST acceptance.
10. Every fresh TEST restore requires the hash-bound owner-reviewed FIO manifest and legacy-appointment CSV plus
    the protected `/opt/env/bersoncarebot/saas-smoke-login.env` owner-login packet. The wrapper validates all three
    before restore and converges only the three canonical owner TEST credentials before the port-context cutover.
    The retired S3 A/B walkthrough fixture is not seeded or required.

## Roles

| Role class | TEST example | Purpose | End-state |
|---|---|---|---|
| Local DB administrator | `postgres` | Stopped-writers migration/cutover only | Never application runtime |
| Migration identity | `bcb_test_migrator` (`NOLOGIN`) | Explicit owner-scoped migration steps | No login, no inherited power, no surviving temporary membership |
| Webapp logins | `bcb_test_webapp_staff`, `bcb_test_webapp_patient`, `bcb_test_webapp_global_admin` | Exact mTLS/SCRAM physical entries for the webapp port; global-admin has a separate certificate/pool because it crosses organizations | No direct table grants; only mutually isolated declared role membership and context installer |
| Integrator login | `bcb_test_integrator` | Exact mTLS/SCRAM physical entry for the integrator port | No direct table grants; only declared role membership and context installer |
| Runtime and seam roles | `app_staff`, `app_patient`, `app_integrator_request`, named seam owners | Meaning-based grants, native RLS and narrow definer power | `NOLOGIN`, `NOBYPASSRLS`, least privilege |

## Allowed sequence for the authorized TEST rehearsal

The only destructive entrypoint is `deploy/host/deploy-test-full-reset.sh --confirm-full-reset` with both the
reviewed FIO manifest and reviewed legacy-appointment CSV bound by SHA-256. It restores only
`bersoncarebot_test`, runs the ordered transition below, replaces the runtime role/grant surface with the target
port-context declaration, starts TEST and runs the closure/runtime gates. It remains forbidden for ordinary deploys.

Before its first stop/drop/restore operation, that public entrypoint runs
`pnpm run check:prod-to-target-cutover` from its own repository root. This command first verifies the generated
target snapshot and then runs `scripts/prod-to-target-cutover-executable-gate.mjs` against a private, socket-only
PostgreSQL cluster. The gate executes product-owned F1–F5/membership SQL slices on PII-free fixtures with alias and
collision shapes, then reads resulting rows for exact membership, preservation and organization attribution. Its
saved six file-copy mutants (membership; F1 specialist rewrite; F2 reminder attribution; F3 alias rewrite; F4 draft
content; F5 delivery/playback injection) are part of the focused contract test and must each report RED. A non-zero
snapshot or executable-gate result aborts the same process; a manual check from another checkout is not a substitute.

### 1. Assert TEST runtime mode

Before the one-time live transition, the wrapper must read only the `DB_PRINCIPAL_CONTEXT_MODE` key from
`/opt/env/bersoncarebot/api.test` and `/opt/env/bersoncarebot/webapp.test` as the deploy-readable TEST env files.
Missing mode means the application default `legacy-guc`, which is now a preflight failure for TEST. Both files
must agree and explicitly say either `locked` (supported source state) or `port-context` (idempotent retry/source
state). `legacy-guc`, `shadow`, disagreement and every other value are rejected before writers stop.

The wrapper owns the data stage and one A → B transition, then invokes the single-target cutover which atomically
renders the protected TEST env into `port-context` and restarts TEST on the four exact URLs. Agents must not edit
`/opt/env` manually or patch grants outside that repo-managed cutover.

The repo-tracked historical mode helper may still be inspected in dry-run mode, but it is not a recovery step for
strict TEST and is not required for a locked TEST restart:

```bash
bash deploy/host/saas-test-mode.sh --check
bash deploy/host/saas-test-mode.sh --mode dormant --dry-run
```

Agents must not
edit `/opt/env` manually, run ad hoc grants, or introduce a one-off locked grants path here. The only allowed
ledger grant in this protocol is the repo-managed narrow `deploy-test-saas.sh` grant/check described in step 7.
Neither helper mode may replace the supported wrappers. `saas-test-mode.sh --mode locked` remains fail-fast because
locked URLs/secrets and the all-unit closure are owned by `deploy-test-saas.sh` / `deploy-test.sh`, not by an env
rewriter.

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

### 3. Restore directly to TEST

TEST restore goes through repo-tracked `deploy/host/restore-test-db-from-dump.sh`, invoked only by the
owner-gated full-reset wrapper. The restored target is
`bersoncarebot_test`, and the restore path must leave the database and representative tables owned by
`bersoncarebot_test`.

**Historical only:** disposable prod-copy runners remain available for isolated diagnostics, but they are not a
stage of the authorized TEST rehearsal and must not be inserted between the dump and `bersoncarebot_test`.

### 4. Assert owner state before data-fix

Before the doctor/admin data-fix, the wrapper must assert:

- database owner is the expected runtime owner;
- `public.platform_users` owner is the expected runtime owner;
- protected runtime env is either the complete four-login `port-context` projection or the supported legacy
  locked projection. `port-context` intentionally has no aggregate `DATABASE_URL`.

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

### 6. Run the prepared data through one atomic A → B transition

After the identity/FIO/legacy-appointment data stage passes, the wrapper installs only the
declaration-derived `NOLOGIN` role prerequisites required to parse the target policies. It then invokes
`deploy/postgres/prod-to-target-cutover.sql` once as the TEST database owner. That single transaction:

- replaces source schema A with the version-matched DEV schema B from `deploy/postgres/generated/prod-to-target/`;
- copies the prepared patient, clinic, specialist, clinical, communication, tariff and billing data;
- records the exact target webapp and integrator ledgers;
- removes the retired legacy schemas/tables; and
- runs the target shape/data assertions before commit.

The wrapper must not run `pnpm migrate`, historical Drizzle/integrator migration chains,
`pre-migration-legacy-role-bridge.sql`, `pre-migration-target-bridge.sql`, or the standalone C4D online-index step
on top of the restored dump. `pnpm run check:prod-to-target-cutover` is executed by the same wrapper before its
first destructive action and proves both snapshot freshness and the executable A → B contract.

### 7. Install generated target access and prove cleanup

After A → B commits, the wrapper applies the TEST reset settings overlay and invokes the single-target
port-context cutover. `initial-cutover.mjs` checks that
`deploy/postgres/generated/privileges.bersoncarebot_test.sql` matches the declaration, zeroes legacy access,
installs that exact generated artifact in one transaction and runs catalog closure. No manual grant or separate
strict-finalizer command is part of this path.

Cleanup is not best-effort. The wrapper must fail visibly if cleanup fails, and must assert after cleanup:

- runtime owner has `rolbypassrls=false`;
- runtime owner no longer has the temporary `app_owner` membership granted by this run;
- migrator no longer has the temporary runtime-owner membership granted by this run;
- required Drizzle migrations are present;
- required organization columns exist.

The older `p0-5b-role-split-staff-patient.sql`-first wording below is **SUPERSEDED HISTORICAL PROVENANCE — DO NOT
EXECUTE**. Exact database ACL and four runtime logins are installed only by the final single-target port-context
cutover.

The historical locked closure used to:

- run the fixed `app_staff` / `app_patient` role split SQL as the TEST superuser for every accepted runtime mode,
  including `legacy-guc` without a signing secret;
- apply the repo-managed P0.5b app wall grant artifact `deploy/postgres/p0-5b-grants.sql` after creating
  `app_staff`/`app_patient` and before any locked runtime smoke. A fresh restore has no durable grants on those
  global roles; skipping this artifact makes `SET ROLE app_staff`/`app_patient` fail on normal product reads;
- install/refresh the protected principal context when `DB_PRINCIPAL_SIGNING_SECRET` is configured, and require it
  when either TEST env file is `shadow|locked`. In `legacy-guc` with no signing secret, only this signed P2-B helper
  step is skipped; the preceding role split/P0.5b grants and the following dedicated overlays/D3.4 base-login
  grants remain mandatory;
- require `api.test` and `webapp.test` `DB_PRINCIPAL_SIGNING_SECRET` to be present, equal, at least 32 characters,
  and not printed when a signed runtime mode is selected;
- prepare the `app_owner` protected
  helper owner, normalize `pgcrypto` into `app_ext` with repo-controlled `ALTER EXTENSION pgcrypto SET SCHEMA app_ext`
  when a fresh dump already has it elsewhere, then run
  `deploy/postgres/p2-b-protected-principal-context.sql` from the version-matched deploy checkout. If `app_ext`
  already contains conflicting `pgcrypto` function signatures, the wrapper must fail before P2-B with
  `pgcrypto_app_ext_conflicting_functions` instead of applying manual DB surgery;
- normalize the existing migration-created `app.is_staff()` owner to `app_owner` immediately before P2-B install and
  fail before P2-B if it is missing or still owned by another role. Migration 0175 creates/replaces this helper as
  `CURRENT_USER`; P2-B runs `CREATE OR REPLACE FUNCTION app.is_staff()` under `SET ROLE app_owner`, so the owner handoff
  must be repo-controlled rather than a manual `ALTER FUNCTION`;
- before protected overlays, run the shared exact owner handoff
  `deploy/postgres/runtime-overlay-app-owner-handoff.sql`. A `--no-owner` restore can leave the existing Web Push
  accessor and both public-booking resolver functions owned by the current database owner, while their reviewed
  overlays replace them under `SET ROLE app_owner`. The artifact may transfer only those three exact signatures,
  accepts only the current database owner or existing `app_owner` as the source owner of each function that already
  exists, and fails closed on any other existing owner. A missing exact function is valid because its next canonical
  overlay creates it under `SET ROLE app_owner` and pins the final owner explicitly. The handoff postcheck therefore
  proves ownership only for existing targets and does not claim that absent targets are already complete. It does
  not rewrite a schema and does not provision or change cluster-global roles;
- after any optional P2-B replacement, rehydrate the dedicated runtime overlays from
  `deploy/postgres/organization-member-invites-rls.sql`,
  `deploy/postgres/store-p0-entitlements-rls.sql`,
  `deploy/postgres/patient-course-assignment-wall.sql`,
  `deploy/postgres/patient-visible-catalog-rls.sql`,
  `deploy/postgres/specialist-signup-public-bootstrap-rls.sql`, and
  `deploy/postgres/specialist-owner-provisioning-rls.sql`. When P2-B is installed, also rehydrate
  `deploy/postgres/reference-catalog-rls.sql` and
  `deploy/postgres/patient-web-push-vapid-public-key-accessor.sql`,
  `deploy/postgres/public-booking-bootstrap-resolver.sql`, and
  `deploy/postgres/public-clinic-slug-bootstrap-resolver.sql`, whose owner contracts require the P2-B
  `app_owner`; skip those protected overlays in `legacy-guc` without a signing secret/app owner. The fresh
  `pg_dump --no-acl` restore does not
  preserve grants to global `app_staff`/`app_patient` roles. The first two artifacts remain the reviewed grant
  owners for `organization_member_invites`, `saas_org_entitlement_overrides`, and `saas_tariffs`; they must not be
  broadened into P0.5b incidentally. The public-bootstrap overlay must run after P2-B because P2-B drops and
  recreates `app.current_org_id()` and `app.current_patient_user_id()`, which removes the narrow EXECUTE grants
  that the overlay gives to its SECURITY DEFINER table owners. In locked patient routes the overlay supplies
  helpers such as `app.get_public_config_bool(text)` and `app.current_patient_has_password_credentials()` without
  granting `app_patient` broad access to `system_settings`, password hashes, or OAuth binding rows. All
  public/pre-auth SECURITY DEFINER functions use table/app owners, `search_path=pg_catalog`, explicit object names,
  PUBLIC revocation, and reviewed caller grants. Staff-security functions invoke sibling protected helpers by
  schema-qualified name, so this overlay grants effective `USAGE` on schema `app` only to the derived
  `staff_security_profiles` owner and fails its own postcheck otherwise; it does not add schema, function, table or
  role-membership grants to runtime/base logins;
- require migrations `0182_reference_catalog_snapshots`, `0183_reference_catalog_snapshot_receipts`, and
  `0184_reference_catalog_org_insert_hook` before
  the specialist-owner provisioning and reference-catalog RLS overlays. Provisioning calls
  `app.seed_reference_catalog_snapshot(uuid)` inside the same SECURITY DEFINER transaction that creates the
  organization. The immutable per-organization receipt makes every later seed attempt a strict no-op; newer
  baseline versions apply only to organizations created later and never supplement existing catalogs. Migration
  0184 takes an organization-table INSERT lock before installing the canonical AFTER INSERT hook and running
  helper-based catch-up, so every committed organization has a snapshot even during a live cutover;
- verify through the `api.test` runtime `DATABASE_URL` that `app.release_principal_context()` exists and is
  executable by the runtime login, because infra/bootstrap scheduler paths clear the protected context before
  touching the DB in `shadow|locked`;
- discover the integrator runtime role from `api.test` `DATABASE_URL`;
- assert that the URL points to the TEST DB and that the discovered role name is a simple PostgreSQL identifier;
- apply `deploy/postgres/integrator-server-runtime-config.sql`: normalize that API base-login to `NOINHERIT` and,
  for PostgreSQL 16, normalize its three existing runtime membership edges to `INHERIT FALSE, SET TRUE`,
  revoke any direct SELECT residue on `public.app_runtime_settings` / `public.system_settings`, and grant only
  EXECUTE on `app.read_global_server_runtime_setting(text)`,
  `app.read_integrator_smtp_outbound_setting()` and the narrow
  `app.record_global_email_delivery_attempt(...)` SECURITY DEFINER capability, plus idempotent
  `app.release_principal_context()` needed by bootstrap/infra cleanup before any role switch. The API login keeps no
  direct INSERT/sequence privilege on `integrator.delivery_attempt_logs`. Ambient `install_signed_context`,
  reset/current helpers and identity maintenance remain denied; scoped install/release stays behind classified
  `SET ROLE`. Membership needed for classified locked `SET ROLE` remains intact; ambient base-login access through
  inherited role ACLs is forbidden. Final readiness must make an actual base-login release call and prove helper
  denials, `NOINHERIT`, table denials, exact accessor/capability ACL and a valid redacted HTTP(S)-shape result before
  services restart;
- grant only `USAGE` on schema `integrator` and `SELECT` on table `integrator.schema_migrations` to that role;
- verify through the `api.test` runtime `DATABASE_URL` that `SELECT count(*) FROM integrator.schema_migrations`
  succeeds and returns at least one row.
- apply the D3.4 bootstrap/base-login grant closure from
  `deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql` to the discovered `webapp.test`
  `DATABASE_URL_NONSTAFF` role, falling back to `DATABASE_URL` only when dual-pool URLs are absent, before any TEST
  service restart or product smoke. Media-worker has no DB login and is not passed to this artifact. After the final
  helper recreation/grants, the invocation must use the actual `DATABASE_URL_STAFF` and `DATABASE_URL_NONSTAFF`
  paths to prove that only the staff runtime can call
  `app.staff_user_has_password_credentials(uuid)`; the probe uses a synthetic UUID and emits no returned value.
  This repo artifact grants the proven bootstrap direct
  read surface plus the composed D2 FB#1 phone/contact write surface and EXECUTE on the narrow pre-auth
  email/invite/signup accessors.
  It deliberately does not grant clinical/media/content/full-settings or credential table access to the bootstrap
  base login. Before restart the overlay must normalize only that nonstaff login to `LOGIN NOINHERIT NOBYPASSRLS`,
  remove every unexpected direct membership, and rebuild exactly one direct `app_patient` edge with
  `ADMIN FALSE, INHERIT FALSE, SET TRUE`; the separate staff-pool login is not passed to or changed by this step.
  Before invoking the mutating SQL, the TEST wrapper must discover the exact staff, migrator, API,
  operational, diagnostic, and operator logins and reject any equality with the nonstaff login; it must also reject
  a missing, non-login, or superuser target. These identity checks are read-only and must finish before `psql -f`.
  Final catalog proof must reject every transitive role other than `app_patient`, protected-table owner membership,
  effective reads of both `public.system_settings` and `public.app_runtime_settings`, and PUBLIC execution of the E1
  accessors, while preserving direct base-login EXECUTE on the public/server accessors and the explicit
  `SET ROLE app_patient` lifecycle. The narrow SECURITY DEFINER
  `app.resolve_public_booking_organization(uuid,uuid,uuid)` is the third direct bootstrap accessor: it resolves one
  tenant before tenant-owned reads, retains the intentional `app_patient` EXECUTE, and must not add table grants.
  `app.resolve_public_organization_by_slug(text)` is the fourth direct bootstrap accessor: it resolves a published,
  active clinic from the canonical `/book/{publicSlug}` path before tenant context exists, retains the intentional
  `app_patient` EXECUTE, and must not add table grants. All four accessor ACLs must first
  revoke stale base-login privileges and grant options, then restore plain EXECUTE; the final four direct base-login rows have
  `is_grantable=false`, PUBLIC is absent, and only the two booking resolvers may additionally retain `app_patient`.
  It is not final D3.4 PASS until the owner-authorized locked TEST
  product smoke reruns.
- session role reconciliation must read the six global admin/doctor Telegram, MAX, and phone allowlists only from
  the `server` audience of `public.app_runtime_settings` through
  `app.read_webapp_server_runtime_setting(text,text)`. The accessor allowlist is closed, the webapp uses a nested
  bootstrap checkout, and E1 telemetry classifies failures as `webapp/auth_role_config`. JSON string and JSON-array
  setting shapes are both supported; a present empty array is authoritative, while a missing/denied projection
  retains the legacy environment fallback. Never fix this path by granting `app_patient`, `app_staff`, or the
  nonstaff base login direct `SELECT` on `public.system_settings`.
- after strict policy installation, apply `deploy/postgres/c4-operational-runtime.sql` using the three distinct
  logins discovered from API `DATABASE_URL_DIAGNOSTIC`, `DATABASE_URL_DELIVERY_WORKER`,
  `DATABASE_URL_SCHEDULER`. Media-worker must instead contain `MEDIA_WORKER_CONTROL_URL` and the webapp-matching
  `INTERNAL_JOB_SECRET`, with no DB/PG/principal credential. Apply the overlay again after any strict finalizer that
  recreates the media policies. Before restarting DB operational processes, each of the three DB base logins must
  call release directly, then `SET ROLE` only its own SET-only capability; positive exact-surface probes and
  cross-contour negatives must pass. Authenticated media-control readiness is deliberately later: stop any old
  media-worker, restart the new webapp, prove its authenticated control route, automatically retire the exact legacy
  media DB login, and only then restart media-worker. Full readiness against a stopped or old webapp is invalid.
  On the first production rollout, root/DB-admin must run
  `deploy/host/provision-c4-operational-runtime.sh` after the schema is current, the new webapp control route is live,
  and the root-owned API/media env files contain the three distinct operational DB URLs and the control-only media
  configuration. The script must run the shared C2 preflight against
  `webapp.prod`/`api.prod`/`media-worker.prod` before any role/password mutation, rejecting reuse of any ambient or
  operator login, then full readiness and automatic exact legacy-login retirement. Ordinary `deploy-prod.sh`
  remains readiness-only: it must not create
  roles, set passwords, or gain broader sudo. The overlay must scrub stale direct/column/type/default ACLs catalog-wide,
  reject managed-role ownership including independent types and other owner dependencies, exclude only structurally
  autogenerated array types (never user domains over arrays), rebuild the exact allowlist, and pass its catalog
  assertion before DB operational restart. `bootstrap-systemd-prod.sh` and `deploy-prod.sh` must both enter the same
  shared media-control cutover helper; neither may directly start media-worker around that order.
- after migration `0185_saas_isolation_diagnostics` and runtime-role discovery, apply
  `deploy/postgres/saas-isolation-telemetry.sql` with the discovered `webapp.test`
  `DATABASE_URL_NONSTAFF` role (falling back to `DATABASE_URL`), the `api.test` `DATABASE_URL` role, and the
  distinct login from webapp `SAAS_ISOLATION_OPERATOR_DATABASE_URL`. The operator URL is infrastructure config,
  must point to the same TEST DB, and must not reuse staff/nonstaff/API/app roles. This overlay
  runs after P0.5b/P2-B role/helper setup and reviewed runtime overlays, but before the strict base-policy render,
  safe specialized policy overlays, FORCE, and final semantic assertions. It moves the two true-global telemetry
  tables behind a NOLOGIN owner. Ambient runtime logins receive only the closed event-writer function; they cannot
  read diagnostics or record/resolve E2 coverage. Only the separate operator login inherits the NOLOGIN
  `saas_telemetry_operator` read/coverage functions. Direct table access remains revoked from every login.

Do not add broad `integrator.*` table grants for the runtime login to fix startup. Do not route this through
P0.5b `app_staff`/`app_patient` DML grants: those intentionally exclude migration ledgers from the app DML surface.

Leaving BYPASSRLS or owner membership behind is a protocol failure even if migrations succeeded.

### 8. TEST-only override and send-safety

After migrations, apply the repo-tracked `deploy/postgres/test-settings-override.sql`. This is the only
allowed TEST override path for maintenance, dev mode, test account identifiers, OAuth redirects, and
admin/doctor allowlist normalization. It must stay version-matched to the deploy checkout. Every caller passes an
explicit validated mode: ordinary code-only closure uses `test_settings_overlay_mode=code-only` and preserves the
canonical global DB-backed `smtp_outbound` while aligning its integrator mirror; fresh/reset and disposable
fresh-rehearsal paths use `test_settings_overlay_mode=reset` and scrub that value in both schemas. Missing/invalid
mode fails before lock mutation. SMTP is intentionally excluded from TEST lock arrays so the existing
Settings/`updateSetting` path can configure it; the rest of the TEST safety locks remain unchanged.
Trigger removal, all settings mutations, and trigger recreation are one transaction, so any `ON_ERROR_STOP`
failure rolls the entire overlay back and preserves the previously installed locks.

### 9. Canonical identity and FIO normalization

The former runtime Rubitime integration and its mirror tables remain retired. The owner-authorized 2026-08-15
cutover is different: before migrations drop those legacy tables, the hash-bound reviewed CSV is used once to
transfer accepted legacy appointments into the canonical booking tables. The transfer must finish with zero live
unresolved rows and does not recreate any runtime mirror or provider-specific read/write path.

Specialist consolidation is a write-path over owner-owned booking tables and must not run as any runtime login.
The full-reset wrapper runs it through the same local OS `postgres` → `SET ROLE bersoncarebot_test` channel as
owner-only migration work:

- run the version-matched deploy checkout with `PGOPTIONS='-c role=bersoncarebot_test'`;
- never write an aggregate URL into `api.test` or `webapp.test`;
- keep the `EXIT` trap active so failure paths still assert cleanup;
- fail visibly if cleanup leaves `BYPASSRLS` or owner membership behind.

Specialist consolidation does not require `BYPASSRLS`; if it is ever added for this step, that must be
documented and checked as a separate protocol change.

After provider-neutral identity normalization, apply the immutable owner-reviewed FIO manifest. This is not a parser rerun:
the exact decisions are bound by SHA-256 and every row carries expected-before and desired-after state. The apply
must verify the exact loopback TEST database, reject unknown drift, create a durable rollback artifact with mode
`0600` before commit, update conditionally in one transaction, and print aggregate PII-free output. Rollback is
conditional and may restore a row only while its current state still equals the recorded post-apply state.

If the FIO manifest, either approved hash, safe FIO apply entrypoint, or rollback artifact cannot be validated, a
future full-reset wrapper must stop with writers stopped and must not print a DB/schema/runtime-ready `DONE`. Manual SQL, parser
recomputation, or silently skipping FIO is forbidden.

The end-state assertions must include:

- exactly one active specialist;
- no appointments on `NULL` or inactive specialists;
- the owner doctor keeps role `doctor`;
- TEST `admin_phones` is `[]`;
- appointment counts on the canonical specialist are reported as aggregate counts only;
- provider-neutral identity/data-cleanup gates passed;
- FIO reviewed-manifest reconciliation passed with aggregate-only output.

The atomic A → B transition also owns these fail-closed data gates:

- **OWNER DECISION 2026-08-15 (replaces the narrower B0 patient-domain criterion):** expected membership is every
  `platform_users` row that is `role='client'`, canonical after owner identity consolidation
  (`merged_into_id IS NULL`), and active (`is_archived=false`). No appointment, Rubitime, chat, clinical history,
  assigned/promotional program, or other patient-domain fact may filter this set. Data copy reconstructs exactly one
  active enrollment in the canonical organization and exactly one active canonical-specialist link for every such
  client. The pre/post oracle rejects a missing, extra/duplicate, wrong-organization, or wrong-specialist active
  endpoint. The reviewed 18 patient-domain relations plus live appointments remain a separate reference-closure
  oracle, not a membership eligibility filter; merged aliases are not enrolled and must already resolve through the
  consolidation path;
- before the duplicate specialist card is deleted, `consolidate-owner-identity.sql` inventories every live
  single-column FK to `be_specialists`, merges only equivalent unique scheduling scopes deterministically, rewrites
  every remaining reference (including soft-deleted history), and proves source-derived total/canonical counts. The
  A→B final gate repeats that reference-class census after the source schemas have gone. Cascades and `SET NULL`
  are never a migration mechanism;
- `reminder_occurrence_history.platform_user_id` is derived from its `integrator_user_id` through the terminal
  `platform_users.merged_into_id` graph. Every mechanically attributable source row must land on that terminal user;
  `NULL` survives only for a source identity with no platform-user mapping, and source/attributed/honest-NULL counts
  are checked before and after source-schema removal;
- live subject/ownership UUID references named `platform_user_id`, `patient_user_id`, `user_id`, `owner_user_id`, or
  `doctor_user_id` are discovered from the copied target catalog and canonicalized through the complete merge graph.
  Unique channel-preference collisions keep the latest complete state per canonical user/channel; first-playback
  collisions keep the earliest observation per canonical user/media. Author/actor/audit provenance columns are not
  included in this subject rewrite. The final gate rejects any reviewed live subject column still pointing at an
  alias and separately checks the dual channel-preference keys;
- actionable `integrator.message_drafts` are transformed into the canonical support-conversation path, not retired.
  A deterministic patient/channel conversation holder is created only when no source conversation exists; the
  pending payload is kept under the conversation's organization and canonical patient identity. The transition
  compares row count and every content field without printing content, then repeats count/scope checks after the
  legacy schemas are gone;
- `integrator.delivery_attempt_logs` and `public.media_playback_stats_hourly` have an organization discriminator in
  schema B and tenant-aware privilege/RLS declarations. Every copied fresh-dump row is assigned the canonical
  organization, and source/target counts plus zero wrong/NULL attribution are checked before and after source removal.
  Clinic delivery-attempt writes preserve their supplied organization; genuinely global/pre-login future audit may
  remain honestly `NULL`. Media aggregate writes key their upsert by organization, hour, and delivery;
- every source-only relation must appear in the reviewed `transform` / `intentionally_retire` registry in
  `prod-to-target-cutover-data.sql`. A new unexplained source-only class and a stale registry entry both abort the
  transaction; there is no manual row patch or silent generic-copy skip;
- `scripts/prod-to-target-baseline-policy.mjs` permits exactly the four reviewed product tariff IDs. The explicit
  environment-owned fixture-ID registry removes `DEV Trial` and the three `*-delete-me`/audit fixtures from the
  generated target baseline without deleting them from DEV. Unknown tariffs and active rows missing price,
  currency, mechanics, seats, or billing period fail generation/check.

SMTP preservation proves only static configuration readiness. Before snapshot and again before restore,
`validate-smtp-outbound-snapshot.mjs` requires non-empty host/user/password/from, an email-shaped from address,
an explicit boolean `secure`, and port 1–65535; it never prints the value. The wrapper success state is
`DB/schema/runtime ready; external delivery unverified` until a separately authorized provider round-trip exists.
After cutover an operator may explicitly opt in with authenticated global-admin
`POST /api/admin/smtp-test` and an allowlisted TEST mailbox. The response returns `probeRef=smtp-test:<uuid>`;
acceptance then requires that same reference through the existing delivery-attempt path plus provider/mailbox
receipt. This package does not send that probe and does not claim Telegram/MAX/SMS/webpush delivery.

### 10. B1, A2, and product smoke gates

The wrapper must run the B1 doctor/admin identity assertion after the end-state checks. B1 reads owner-owned
identity tables and uses the same local OS `postgres` → `SET ROLE bersoncarebot_test` channel as specialist
consolidation:

- run the deploy checkout command with `PGOPTIONS='-c role=bersoncarebot_test'`;
- pass `--allow-test-target`, the process-local Unix-socket migration URL, and
  `--required-current-user=bersoncarebot_test` to the B1 checker;
- keep the `EXIT` trap active so failure paths still assert cleanup;
- fail visibly if cleanup leaves `BYPASSRLS` or owner membership behind.

B1 must not run as a TEST runtime login. The checker must verify `current_user` before reading
`public.platform_users`, and the process-local database URL must remain unprinted. B1 does not require
`BYPASSRLS`; if it is ever added for this step, that must be documented and checked as a separate protocol
change.

**SUPERSEDED HISTORICAL BLOCK — DO NOT EXECUTE:** the paragraphs below through the fixture capability gate
describe the former locked overlay/fixture closure. The current fresh-reset path does not call the separate
strict-finalizer or synthetic A/B fixture seeder; generated access is already installed and verified by §7.

Historically, before fixture reconciliation, the wrapper ran the TEST strict finalizer
`deploy/postgres/test-strict-rls-finalizer.sql`. It reapplies the generated helper-based strict policy set, applies
FORCE to the exact canonical 163-table inventory, and fails unless every target has both ENABLE and FORCE. Migration
0177 remains historical compatibility provenance; its NO FORCE end-state is not accepted on TEST. The finalizer runs
after migrations, data cleanup, settings, runtime roles/grants, reviewed overlays, specialist consolidation, and B1.
The runtime owner must already be `NOBYPASSRLS`, and temporary membership/BYPASS cleanup is asserted again after the
finalizer. Recovery means fixing code/policy and rerunning; TEST walls are never switched off.

The same file is also the prod-cutover walls installer (owner-gated `-v allow_authorized_prod_target=1` unlock,
otherwise byte-for-byte the same TEST-only refusal) — exact invocation, ordering proof, and readiness-matrix status
are in `SAAS_PROD_DEPLOY_PROCESS.md` §3.5 (item #9), which points back to this §10 for the after-grants/
before-restart ordering.

The wrapper must then reconcile the S3 walkthrough fixture through
`apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts` in a separate controlled TEST-only fixture
reconciliation window. This happens after migrations, runtime overlays, TEST settings,
specialist consolidation, and B1. The contract is:

- secret packet path: `/opt/env/bersoncarebot/saas-test-fixture.env`, non-symlink regular file, exact owner/group/mode
  `root:deploy 0640`;
- explicit opt-in key: `SAAS_TEST_FIXTURE_ENABLED=1`;
- required secret keys, names only:
  `SAAS_TEST_FIXTURE_CLINIC_A_EMAIL`, `SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD`,
  `SAAS_TEST_FIXTURE_CLINIC_B_EMAIL`, `SAAS_TEST_FIXTURE_CLINIC_B_PASSWORD`;
- parser accepts exactly those five keys once each as JSON-quoted strings. Unknown/duplicate keys, unquoted or
  malformed lines, command substitution/backticks, `DATABASE_URL`, `PGOPTIONS`, and every other override fail
  before restore. The packet is never sourced by a shell;
- the seeder queries `current_database()` before any write and accepts exactly `bersoncarebot_test`; URL-shape
  matching alone is not sufficient;
- two synthetic verified email+password owners are active `owner`/clinic-admin members with active specialists;
- manifest v2 gives Clinic A three staff accounts (owner/manager plus two specialists) and five patients, while
  solo Clinic B has one owner/specialist and three patients. The extra Clinic A specialists, one representative
  patient in each clinic, and the shared A/B patient have separate reserved `.test` email logins; they reuse their
  clinic's protected TEST-only password, so the five-key packet does not grow. Non-secret login refs, exact A/B
  organization/enrollment refs, public routes and desktop/mobile viewports are versioned under
  `SAAS_TEST_FIXTURE_MANIFEST.operatorRefs`;
- both fixture emails must use the reserved non-deliverable `.test` top-level domain;
- both clinics have deterministic past/future appointments with canonical services. Representative patients also
  have an active package ledger, a treatment program, exercise completion history (weighted, bodyweight and
  metric-less variants), events, and rolling diary snapshots for doctor/patient graphs;
- reconciliation is transactional and deterministic for repo-reserved fixture IDs; reruns repair the same rows
  rather than appending duplicates. Cleanup is limited to reserved fixture personas and manifest IDs and must never
  delete every appointment/enrollment merely because it belongs to a fixture organization;
- because locked/FORCE policies correctly reject an unscoped runtime write, the wrapper temporarily grants the
  webapp migrator membership in `bersoncarebot_test` and temporarily sets that owner role `BYPASSRLS` only for
  the seeder command. It immediately reuses `cleanup_elevation` to revoke both, and the existing `EXIT` trap plus
  post-cleanup assertions make residue fatal on success or failure;
- no real PII, message delivery, notification, S3, HTTP, or other external write path is used;
- stdout is aggregate-only and never contains fixture email, password, cookie, token, or opaque row ID.

Immediately after fixture reconciliation and privilege cleanup, the shared strict closure must run the canonical
`deploy/postgres/test-patient-identity-capability-gate.sql`. In a rollback-only transaction it installs the existing
signed principal context for the two representative fixture patients and one unrelated fixture patient through the
actual locked topology: the discovered webapp nonstaff `LOGIN NOINHERIT NOBYPASSRLS` role must have exactly one
direct `app_patient` membership with `ADMIN FALSE, INHERIT FALSE, SET TRUE`; the gate authenticates as that base
login, executes `SET ROLE app_patient`, installs the signed context, and calls only the existing
`app.is_current_patient_test_account()` capability. The required result is `patientA=true`, `patientB=true`, and
`unrelated=false`; any other result aborts before the owner-ready matrix or service restart. Output contains only
those labels and booleans, never fixture identifiers or restricted settings. The canonical P0.5b role wall keeps
`app_patient` itself as restricted `LOGIN NOBYPASSRLS` without provisioning a credential; `NOLOGIN` is not its
invariant and must not be asserted by this gate.

The TEST settings override enables and locks the mirrored global `specialist_signup_enabled=true` row for the
owner walkthrough. This is TEST-only: production remains default-off. On TEST, clean public/login, combined
specialist+clinic registration and booking are reached at `/app`, `/app` → `Я специалист`, and `/book` in a
cookie-free profile. DEV-only `/api/auth/dev-public` helpers are not valid TEST evidence. Exact scenarios and
viewports are in `OWNER_READY_TEST/ST-02_WALKTHROUGH.md`.

This fixture packet is TEST operator input, not application runtime/integration configuration. It must not be
added to `api.test`, `webapp.test`, `system_settings`, git, screenshots, shell history, or captured evidence.
The fixture reconciliation privilege window is also not runtime and must never be reused by an application unit.

**CURRENT runtime gates:** after the generated single-target closure, the fresh-reset wrapper installs/asserts the
TEST media-worker unit, restarts `api`, `worker`, `scheduler`, `webapp` and `media-worker`, verifies that all five
units are active, and requires `https://test.bersoncare.ru/api/health` to return both `ok=true` and `db=up`.
Nginx apply/A2 and `awg-quick@awg0` checks belong to the superseded strict-closure branch and are not claimed by
the current fresh-reset wrapper. Product page/Console/Network traversal is the explicit post-deploy acceptance
stage, not an implicit deploy-wrapper fixture gate.

Do not claim a TEST deploy passed unless the wrapper has actually run and these gates have passed.
Fixture-based A1/product smoke выведен из deploy решением владельца 30.07.2026. Временный
`/run/bersoncarebot/saas-smoke.fixture` не является входом миграции или runtime closure. Продуктовые сценарии
проверяются отдельными целевыми тестами без сохранённых deploy-cookie/refs.

### 11. Strict/FORCE TEST gate and D2/D3.4 checks

D2 FB#1 and D3.4 static/scratch-package checks are repo gates, not live TEST proof. Keep running:

```bash
pnpm run check:saas-d2-fb1-bootstrap-phone-write
pnpm run check:saas-d3-4-bootstrap-base-login-grants
```

Strict+FORCE is mandatory in both supported TEST deploy paths, but neither path installs it through a separate
`test-strict-rls-finalizer.sql` call. Fresh restore (`deploy-test-full-reset.sh`) performs the one A → B transition
and then `initial-cutover.mjs` installs the exact generated TEST privilege artifact and proves catalog closure.
Code-only deploy (`deploy-test.sh`) applies stationary migrations and then `reconcile-access.mjs` verifies and
reinstalls the same declaration-generated access state. Both keep writers stopped until the target state and
runtime gates pass. The disposable historical runner is not TEST acceptance.

## Failure policy

- Stop at the first failed gate.
- Do not continue by manually changing DB rows, grants, owners, RLS flags, or settings.
- Fix the repo script, SQL, checker, or protocol that produced the failure.
- For this authorized rehearsal, rerun the wrapper from a fresh restore directly into the named
  `bersoncarebot_test` target. Do not insert a disposable/intermediate database.
- If a temporary privilege cleanup failure occurs, treat it as the primary incident until post-cleanup
  assertions prove the target is clean.
- Fresh-reset `DONE` means the five TEST units are active and `/api/health` proves `ok=true` and `db=up` after the
  generated port-context closure. It does not claim nginx/A2, E1, external delivery or product-page acceptance.
  The owner-required three-account page/Console/Network traversal is a separate post-deploy gate and must be
  reported separately. `awg-quick@awg0` is a separately operated PROD-relay dependency on the shared host and is
  not part of TEST deployment readiness.

## DEV/disposable dormant wrapper

### Current DEV migration policy

Owner decision 2026-07-30 supersedes the former DEV restore/rehydrate procedure: TEST→DEV refresh,
`dev-runtime-overlay-rehydrate` and recreation of `bcb_webapp_dev` are not supported development steps.
Pending shared migrations are applied to the existing DEV database through
`bash deploy/host/migrate-dev.sh --preflight`, then `bash deploy/host/migrate-dev.sh --execute`. This wrapper
validates exact local `bcb_webapp_dev`/`bcb_webapp_dev_user` and runs the ordinary repository migration chain; it
does not copy TEST, restore a dump or test RLS walls. Only for the migration window it grants the DEV database
owner membership in `app_owner` and `BYPASSRLS`, then revokes and verifies both on success, failure or signal.

After `migrate-dev.sh --execute` reports PASS, refresh and immediately verify the one A→B target snapshot:

```bash
pnpm run refresh:prod-to-target-cutover
pnpm run check:prod-to-target-cutover
```

The refresh command is fixed to the existing local `bcb_webapp_dev`, requires an explicit confirmation token,
checks that its Drizzle ledger reaches the repository journal, and rewrites only the four tracked files under
`deploy/postgres/generated/prod-to-target/`. It does not create, restore, drop or migrate a database.
It applies the reviewed target-baseline policy while rendering: environment-owned tariff fixture IDs and the
retired linked-phone strategy setting are not target data, while an unknown tariff or incomplete active tariff
aborts rendering. Do not run
the two internal owner-ordered migrators directly as an operator sequence: only `migrate-dev.sh` also completes
the declaration reconcile and catalog audit required before schema B is captured. The fresh-dump rehearsal then
uses the single owner-gated `deploy-test-full-reset.sh` command documented above; it never replays the historical
migration chain on top of the restored dump.

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

For a fresh walkthrough-fixture convergence proof, use the same wrapper with
`--prove-test-fixture --drop-on-success`. This explicit mode accepts only a new local
`bcb_saas_*_rehearsal_*` database, refuses `--replace-existing`, applies the canonical
E1 patient-runtime capability overlay and TEST settings override inside that disposable
database, runs the fixture double-seed,
proves the exact public/integrator identifier mirror plus patient A=true, patient B=true
and an unrelated patient=false, and always removes the disposable database and role.
The ordinary TEST seeder target remains exact `bersoncarebot_test`; the rehearsal
exception is fail-closed behind `SAAS_TEST_FIXTURE_REHEARSAL_MODE=1`, a guarded database
name attested again through `SAAS_TEST_FIXTURE_REHEARSAL_DATABASE`, and a loopback database
URL whose path must match that attestation. These values are supplied only by this wrapper.
The dormant `#667` base intentionally does not grant the patient E1 capability; fixture proof
therefore creates a separate disposable runtime role and rehydrates the same reviewed E1 overlay
before the settings override, matching the strict TEST closure instead of adding an ad hoc grant.

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
