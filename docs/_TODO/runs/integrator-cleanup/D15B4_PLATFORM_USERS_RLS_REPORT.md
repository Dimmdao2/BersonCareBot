# D15b/4 — RLS on `public.platform_users` (report)

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D15b/4; census
`docs/_TODO/runs/integrator-cleanup/D15B1_IDENTITY_CENSUS_2026-08-03.md` §1. Branch `wt/d15b4-platform-users-rls`,
migration `apps/webapp/db/drizzle-migrations/0353_platform_users_rls_d15b4_local.sql` (temporary local number).

## 1. Re-measured before work (DEV, `bcb_webapp_dev`)

```sql
SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='platform_users';
```
→ `f | f` (confirmed still off, matching the census). Direct SELECT grants confirmed unchanged:
`app_owner` (SELECT, UPDATE), `app_staff` (SELECT/INSERT/UPDATE/DELETE), `app_patient` (SELECT +
column-scoped UPDATE on `calendar_timezone`/`reminder_muted_until`), plus the dead
`app_operational_web_push_reminder` policies (`c4_web_push_reminder_discovery`/`_user`) still physically
present but inert.

## 2. Policy design — every principal walked

| Principal | Policy | Predicate |
|---|---|---|
| The person | `platform_users_self_select`/`_update` (`TO app_patient`) | `id = app.current_patient_user_id()` |
| Staff of the org | `platform_users_staff_org_{select,update,delete}` (`TO app_staff`) | `app.is_staff() AND app.current_org_id() IS NOT NULL AND (EXISTS org_enrollments OR EXISTS be_organization_members matching organization_id = app.current_org_id())` |
| Staff creating a new row | `platform_users_staff_insert` (`TO app_staff`) | `app.is_staff()` — nothing to leak on INSERT |
| The platform role | *(no branch)* | Untouched: `app_platform_settings` has **no** grant on this table (asserted by `deploy-test-saas.sh`/`e1-webapp-runtime-config.sql`) and only reads via existing `app_owner`-owned SECURITY DEFINER accessors (0261, 0267, 0342…), which bypass RLS via `app_owner`'s BYPASSRLS |
| Operational workers | *(no branch)* | None read `platform_users` directly today (census + live grep of `apps/integrator/src/infra/runtime/worker/**`) |
| Migrator/bootstrap paths | `platform_users_identity_bootstrap_{select,insert,update}` (no `TO`, explicit `pg_has_role(current_user,'app_identity_bootstrap','member')`) | Login-by-phone/email/oauth candidate lookup + the shared identity write engine (`packages/platform-merge`), before any org/self context exists |

Dead policies dropped: `c4_web_push_reminder_discovery`, `c4_web_push_reminder_user` (role
`app_operational_web_push_reminder` retired 2026-08-03, commit `ff9b17e1121`; zero references left in
`apps/**`/`deploy/**`/`packages/**`).

FORCE applied (`ALTER TABLE ... FORCE ROW LEVEL SECURITY`), matching `be_organizations`/`saas_tariffs`/
`admin_audit_log` (`deploy/postgres/c5a-platform-operations-runtime.sql`).

## 3. The hard problem: two structurally different bare logins, one policy set

`app.is_staff()`/`app.current_org_id()`/`app.current_patient_user_id()` are the current repo idiom
(migration 0344 etc.), reused here. But every USING/WITH CHECK referencing them requires the querying
role to hold EXECUTE on them, checked at plan time for every **applicable** policy regardless of
short-circuiting. Two bare, NOINHERIT, never-`SET ROLE`'d login roles read this table before any session
exists — the webapp's nonstaff/bootstrap login and the integrator's login — and the integrator's login
was **already, deliberately** stripped of EXECUTE on all three functions
(`deploy/postgres/integrator-login-public-identity-grants.sql` lines ~354–364): granting it back
previously took TEST down (2026-07-24 incident, documented in that file's own header) because it violates
`assert_api_runtime_can_release_principal_context` (`deploy/host/deploy-test-saas.sh:483-488`).

Proven live against DEV (`bcb_test_integrator_login`, NOINHERIT member of `app_staff`, zero EXECUTE on a
probe function referenced by a `TO app_staff` policy) that a `TO <role>` policy is only **applicable** to a
session whose *current* role literally is that role (via `SET ROLE`) — not merely a NOINHERIT member of it.
The query returned a clean empty result, not 42501 — the policy was skipped entirely, not evaluated.

This is why the self/staff-org policies above are scoped `TO app_patient`/`TO app_staff` (real sessions
always reach those via explicit `SET ROLE`, confirmed live: `current_user` becomes literally `app_staff`
after `SET ROLE app_staff` on the DEV staff pool login), while the bootstrap branch has **no** `TO` clause
and gates itself with `pg_has_role(..., 'member')`, which — unlike `TO` applicability — does resolve pure
role-graph membership regardless of INHERIT. Net effect: the integrator's bare login never touches
`is_staff()`/`current_org_id()`/`current_patient_user_id()` at all (its existing REVOKE stays exactly as
it is), and still gets bootstrap read/insert/update access through role membership alone.

## 4. New role: `app_identity_bootstrap`

`deploy/postgres/d15b4-platform-users-identity-bootstrap-role.sql` (new, `sudo -u postgres` overlay,
idempotent): creates the role, grants it EXECUTE on the three principal-context functions (needed because
its own SELECT still shares the table with the other applicable policies) and `SELECT, INSERT, UPDATE` on
`platform_users`. `CREATE ROLE` needs CREATEROLE/superuser, which neither the Drizzle migrator nor its
temporary `app_owner` membership holds (`deploy/host/migrate-dev.sh` asserts `app_owner` is itself
NOCREATEROLE) — matching every other new role in this repo, it cannot live in the Drizzle migration itself.

Membership is granted (not defined) by the two existing bare-login overlays that already run with the
right `-v` role substitution, via `\ir` include (psql precedent: `deploy/postgres/e1-webapp-runtime-config.sql`):
- `deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql` → webapp nonstaff/bootstrap login
- `deploy/postgres/integrator-login-public-identity-grants.sql` → integrator login

Both files' DOWN/rollback branches got a matching `REVOKE app_identity_bootstrap FROM ...`.

`deploy/host/deploy-test-saas.sh` was **not** changed: its only `platform_users`-specific assertions are
(a) table owner = `$DBROLE` (unaffected — ownership unchanged) and (b) `app_platform_settings` has **no**
grant on the table (unaffected — I never touch that role). Checked for an "exact ACL closure" assertion
that might reject a newly-appearing grantee; none exists for this table. No app_owner-owned function was
added, so the running SECURITY DEFINER function-count reconciliation comments are untouched.

## 5. Live proof (DEV, `bcb_webapp_dev`, real PostgreSQL, `sudo -u postgres` + `SET SESSION AUTHORIZATION`)

Two clinics, two patients (one per clinic), one staff member of clinic A, `app.principal_context` rows
installed directly (same table `app.install_signed_context` would write, keyed by `pg_backend_pid()`) to
simulate each session, all in scratch rows deleted afterward:

| # | Test | Result |
|---|---|---|
| 1a | Patient A sees own row | 1 |
| 1b | Patient A reads Patient B (cross-clinic) directly by id | **0 — closed** |
| 1c | Patient A unfiltered `SELECT *` total visible | 1 |
| 1d | Patient A self-UPDATE own `calendar_timezone` | 1 row updated |
| 1e | Patient A UPDATE targeting Patient B | **0 rows — closed** |
| 2a/2c/2d | Staff-A sees own-org patient + own-org staff | 1 each (correct identities) |
| 2b | Staff-A reads Patient B (cross-clinic) directly by id | **0 — closed** |
| 2e | Staff-A INSERT new client row | 1 |
| 2f | Staff-A UPDATE targeting Patient B | **0 rows — closed** |
| 3a | Staff-B sees only Patient B among the seeded rows | confirmed (own-org visibility, cross-org excluded) |
| 4a/4b | `app_patient`/`app_staff` with **no** principal_context row at all | 0 rows each — fail-closed |
| 5a/5b | Bare owner login (member of `app_identity_bootstrap`, no `SET ROLE`, no principal_context) — phone candidate lookup / full visibility | 1 / 4 — bootstrap read works |
| 5c/5d | Same bare login — INSERT brand-new person (zero org/self context) + UPDATE (enrich) | 1 row each |
| 6a | Same bare login, `app_identity_bootstrap` membership **revoked** | **0 — branch is actually gated, not free-for-all** |
| 7a | Authenticated Patient-A session (real `SET ROLE app_patient`) — confirmed **not** a member of `app_identity_bootstrap`, cross-clinic read of Patient B | **0 — no escape hatch through the bootstrap branch** |
| — | `app_platform_settings` (platform role) SELECT on `platform_users` | still `has_table_privilege = false`, untouched |
| — | `app.list_platform_organization_members(...)` (existing `app_owner` accessor) | still returns correct rows — RLS-bypass path unaffected |

`run-webapp-drizzle-migrate.mjs` (no flags) applied cleanly (`count=352 direct=344 reconciled=8`), a second
run was a clean no-op (idempotent), `--self-test` passed, `check-drizzle-journal-sync.sh` passed.

## 6. Callers checked — what would have broken, and why it didn't need code changes

Per the D15b/1 census (§2.2/§5) and independent live-grep, these run with **zero** principal set (ambient,
pre-session) and would have silently started returning `[]`/throwing 42501 the moment FORCE RLS landed:

- `apps/webapp/src/infra/repos/pgUserByPhone.ts` (login-by-phone)
- `apps/webapp/src/infra/repos/pgEmailAuth.ts` (login-by-email)
- `apps/webapp/src/infra/repos/pgOAuthUserResolve.ts` (OAuth resolve)
- `apps/webapp/src/infra/repos/pgIdentityResolution.ts`
- `packages/platform-merge/src/identityProjectionWrite.ts` (`collectIdentityProjectionCandidates`,
  `insertIdentityProjection`, `enrichIdentityProjection` — the one shared write engine, called by both
  apps' `user.upsert`/OAuth/self-registration paths)

All five run on the **nonstaff pool** (webapp, `DATABASE_URL_NONSTAFF` → `bcb_dev_runtime_nonstaff_login`
on DEV / `bcb_test_nonstaff_login` on TEST) or the **integrator's own login**
(`bcb_test_integrator_login`) with no `SET ROLE`. Granting both bare login roles membership in
`app_identity_bootstrap` (via the deploy overlays, §4) fixes all five **without touching any TypeScript**
— confirmed live in §5 tests 5a–5d, which exercise exactly this connection shape (bare login, no
`SET ROLE`, no `principal_context` row).

**Pre-existing, unrelated gap found and confirmed NOT caused by this migration:**
`apps/webapp/src/infra/repos/pgAdminPlatformUserStats.ts` (global registration-stats admin panel,
`/api/admin/platform-user-registration-stats`, gated by `requirePlatformOperationsApiContext` → `SET ROLE
app_platform_settings`) issues raw `SELECT ... FROM platform_users`. Live-tested on DEV: `SET SESSION
AUTHORIZATION app_platform_settings; SELECT count(*) FROM platform_users;` → `ERROR: permission denied for
table platform_users` — a plain GRANT-level 42501, reproducible with RLS **disabled** too (it is a missing
table grant, not a policy decision). This endpoint was already broken before this migration; out of scope
here, flagged for separate triage (it should likely read through a narrow `app_owner` SECURITY DEFINER
accessor, matching the sibling `app.is_platform_registration_analytics_user_excluded`/
`app.list_platform_organization_members` pattern, rather than get a raw table grant).

No dev/ops script (`fio-backfill`, `migrate-fio-dev.ts`, `purge-placeholder-bookings.ts`,
`user-phone-admin.ts`, `seed-saas-test-walkthrough-fixtures.ts`) needed a change either: on DEV they all
connect via the plain `DATABASE_URL` (the table owner, `bcb_webapp_dev_user`), which was also granted
`app_identity_bootstrap` membership directly (§7) for exactly this reason.

## 7. DEV-specific operational step (not code, done live, must be repeated after any DEV role reset)

DEV has no role split for the integrator (`apps/integrator`'s root `.env` uses the plain owner
`DATABASE_URL=postgres://bcb_webapp_dev_user`, unlike TEST's dedicated `bcb_test_integrator_login`) — a
pre-existing DEV/TEST topology difference, not introduced here. Applied directly via `sudo -u postgres` so
DEV's integrator dev-server keeps working under the new RLS:

```sql
GRANT app_identity_bootstrap TO bcb_dev_runtime_nonstaff_login;
GRANT app_identity_bootstrap TO bcb_webapp_dev_user;
```

(`deploy/postgres/d15b4-platform-users-identity-bootstrap-role.sql` was also applied directly via
`sudo -u postgres` on DEV, ahead of the Drizzle migration, per its own header note.)

## 8. Typecheck / lint / journal

- `pnpm --dir apps/webapp typecheck` — clean (after building workspace packages `db-principal`,
  `platform-merge`, `operator-db-schema`, `error-tracking`, missing only because this worktree was freshly
  created — pre-existing, unrelated to this change).
- `pnpm --dir apps/integrator typecheck` — clean.
- No TypeScript/JavaScript source file changed by this work (the whole fix is DB-level: policies + one new
  role + two overlay edits) — no ESLint scope to run.
- `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` — OK.
- `node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test` — OK.

## NOT DONE / left for the lead

- TEST deploy (`deploy/host/deploy-test-saas.sh`) was not run — out of boundary for this branch ("TEST
  deploy is the lead's step after land"). The two overlay files were syntax/parse-checked by direct `\ir`
  inclusion on DEV but the full `deploy-test-saas.sh` orchestration (with its own role-topology
  preconditions) was not exercised end-to-end.
- `pgAdminPlatformUserStats.ts` pre-existing 42501 (§6) — not fixed, flagged for separate triage.
- Final migration number: this branch's migration keeps its temporary local number `0353`; renumbering is
  the lead's step at land time per AGENTS.md "Миграции".
