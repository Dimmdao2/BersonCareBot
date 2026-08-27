# Systemic access independent audit — 2026-08-27

## Scope and oracle

- Role: independent `auditor-live`.
- Candidate: `25ecc614707b42ab5d564ad72785ea79d9faed37`.
- Diff base: `3e40130e5`.
- Oracle read before candidate tests: `AGENTS.md` §10a, §10b, §24 and DB/migration rules;
  `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md` A1–A5, stages 1 and 6;
  `docs/OWNER_DECISIONS.md` DB roles/walls and timestamp-migration rulings; active Track D, SaaS isolation,
  DB privilege-layer and Therapysto/branding contracts referenced by that authority.
- Forbidden evidence at blind-set time: candidate-added tests and
  `docs/_TODO/runs/systemic-access/BLIND_KILL_SET_2026-08-27.md` were not read.

## Independent blind kill-set (fixed before candidate diff/tests)

| ID | Class | Named reachable fault and impact | Required independent proof |
|---|---|---|---|
| K-A1-1 | Test + live DB/RLS | An `org: true` relation grants a tenant role without `organization_id = current_org_id()`; clinic A can read clinic B rows/secrets. | Generator invariant must fail under predicate-removal injection; named DEV A/B probe must return only own rows. |
| K-A1-2 | View + live DB/RLS | A cluster-wide worker/infra principal is mistakenly given a tenant predicate even though it has no organization principal; legitimate dispatch/maintenance becomes empty or fail-closed for the wrong reason. | Inspect role/relation classification and generated policies; positive DEV control for the actual cluster worker door without fabricating an org. |
| K-A1-3 | View + live DB/RLS | A tenant-capable role retains relation access but no tenant wall, including a specialized policy that merely checks the current role. | Enumerate every permissive policy for in-scope entitlement relations/roles and introspect DEV catalog after rollback-only candidate reconcile. |
| K-A2-1 | Live DB/RLS | Staff in clinic A can read entitlement rows of clinic B, including tokens or integrator metadata. | Two-clinic DEV transaction proves cross-clinic zero rows and own-clinic positive control. |
| K-A2-2 | Live DB/RLS | A patient can read another patient, another clinic, revoked or expired entitlement; paid/private content leaks. | DEV matrix: own active visible; other patient/org, revoked and expired invisible. |
| K-A2-3 | Live DB/RLS | Patient SQL can select service-only columns such as token hashes/integrator identifiers even if row RLS is correct. | DEV column-level privilege/queries: required projection succeeds; forbidden columns are denied. |
| K-A2-4 | Test + view | A real patient-only callsite reaches `EntitlementsService` through a staff/default principal or has no executable patient principal, causing 42501/SSR 500 or wider access. | Import/wiring census covers all actual patient-only callsites and fails under a planted missing/wrong door; inspect runtime composition. |
| K-A3-1 | Test + view | Missing or invalid `DB_PRINCIPAL_CONTEXT_MODE` silently selects legacy role mapping. | Public config boundary rejects both states; inspect all production selection sites for a fallback. |
| K-A3-2 | Test + view | Product runtime or internal cron can still map organization/infra work to unscoped `app_staff`. | Fault injection at the remaining selector must fail a gate; inspect all runtime role-selection callsites and locked cron sources. |
| K-A4-1 | Test + CI view | Declaration or generated privilege SQL drifts while CI remains green. | Plant stale generated output and prove `generate-cli.mjs --check` fails; verify an active GitHub job invokes it. |
| K-A4-2 | Test + CI view | Tenant predicate/access-census logic is bypassed or its test file is not selected, so A1/A2 regressions merge green. | Plant one tenant-wall and one patient-door mutation; each named CI command/job must fail independently and have no zero-file path. |
| K-A5-1 | Test + view | A newly added migration reuses an existing timestamp and ordering becomes ambiguous. | Add a temporary colliding filename and prove the migration-order gate/CI command fails. |
| K-A5-2 | View | Existing applied migration identities are renamed to remove historical collisions, causing ledger mismatch/reapply. | Compare base/candidate migration names and verify historical collision groups remain byte-for-byte named. |
| K-A5-3 | Test + view | One real migration runner omits collision validation, or a migration changes grants/policies, so runtime order/access differs from the audited path. | Inspect every active runner and candidate migrations; fault collision must fail each applicable runner, and migration SQL must contain no access mutations. |

The kill-set has five authority classes (A1–A5) and fourteen independent named faults. There is no percentage
threshold: every row must be killed or represented by a reachable finding.

## Evidence and fault injections

### Candidate identity and inspected surface

- Exact audited SHA: `25ecc614707b42ab5d564ad72785ea79d9faed37`; base: `3e40130e5`.
- `git rev-parse 25ecc614707b42ab5d564ad72785ea79d9faed37` returned the same full SHA.
- `git diff --check 3e40130e5..25ecc614707b42ab5d564ad72785ea79d9faed37` returned no output.
- The full diff, declaration, generated DEV/TEST privilege SQL and allowlists, runtime role selection,
  patient entitlement callsites, GitHub wiring, both migration runners and the active migration folder were read.

### Kill-set disposition

| ID | Classification actually used | Result |
|---|---|---|
| K-A1-1 | Test + live DB/RLS | Killed. The in-memory predicate-removal injection reddens generation; DEV staff org A saw its four fixtures and zero org-B rows/secrets. |
| K-A1-2 | View + live DB/RLS | **Reached — F1.** The candidate puts cluster-wide `app_worker` behind `organization_id = current_org_id()` on SaaS billing relations; an accepted unscoped worker context saw zero of six real subscriptions. |
| K-A1-3 | Test + view + live DB/RLS | Killed for tenant principals. The invariant covers every permissive tenant policy and the live staff/patient controls remained behind their organization wall. F1 is the converse classification error, not an unscoped tenant role. |
| K-A2-1 | Live DB/RLS | Killed: `A2_STAFF|4|4|0|0`. |
| K-A2-2 | Live DB/RLS | Killed: own active positive; revoked, expired, other patient and other organization all zero. |
| K-A2-3 | Live DB/RLS | Killed: allowed projection succeeded; `token_hash`, `integrator_grant_id`, and `integrator_user_id` had no patient `SELECT` privilege, and a direct forbidden-column query returned `permission denied`. |
| K-A2-4 | Test + view | Killed. All exact patient entitlement consumers found under `apps/webapp/src/app/app/patient/**` are in the census; the planted missing-door case reddens it. Content/help stamp the patient organization context before the call; the section path uses the patient principal wrapper. |
| K-A3-1 | Test + view | Killed. A physical bypass of the product-mode rejection made eight assertions fail; restored candidate passed all 19 targeted assertions. |
| K-A3-2 | Test + view | Killed. `withClient` consumes the single resolved mode, product mode accepts only `port-context`, and infra cron maps to service/`app_worker`, not old unscoped `app_staff`. |
| K-A4-1 | Test + CI view | Killed. A one-line stale generated-artifact mutation reddened `--check`; restored artifacts matched byte-for-byte and the command is in an independent CI job. |
| K-A4-2 | Test + CI view | Killed. Tenant-predicate and missing patient-door injections are selected by `test:db-privileges`; the executable census is selected by `privileges-generated`. |
| K-A5-1 | Test + runner view | **Partially reached — F2.** The static gate reddens a fresh collision, but the active webapp runner does not. |
| K-A5-2 | View | Killed. Base/candidate contain no migration filename change; the four closed historical groups are unchanged. |
| K-A5-3 | Test + view | **Reached — F2.** One active runner omits timestamp-collision validation. The separate migration-rights half passed: the candidate changes no migration SQL. |

### A1/A2 live proof on named DEV

Only `bcb_webapp_dev` was used. Both candidate relation blocks, capability fixtures and row fixtures were applied
after `BEGIN` through `sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d bcb_webapp_dev` and ended with
`ROLLBACK`; no disposable database, TEST or PROD was touched. The relation SQL was extracted from the exact
candidate artifact `deploy/postgres/generated/privileges.bcb_webapp_dev.sql` rather than from live drift.

The staff probe printed:

```text
A2_STAFF|4|4|0|0
```

Fields are `visible | own_org | other_org | foreign_secret`; staff had a positive own-clinic control and no
foreign clinic rows or secrets.

The patient probe selected only the product projection and printed:

```text
A2_PATIENT|1|1|0|0|0|f|f|f
```

Fields are `visible | own_active | revoked | expired | other_patient_or_org | token_hash_select |
integrator_grant_id_select | integrator_user_id_select`. Thus the only visible fixture was the patient's own
active current-clinic grant and no service-only column was granted.

The independent worker control printed:

```text
A1_WORKER|6|t|0
```

Fields are `postgres_visible_subscriptions | accepted_context_exists | app_worker_visible_subscriptions`. The
same transaction installed the candidate subscription relation block and a declared relation capability for an
unscoped service context. Six existing subscriptions were visible before `SET LOCAL ROLE app_worker`; the
accepted context existed; `app_worker` then saw zero. This is a wrong organizational predicate, not the intended
accepted-context denial.

Rollback cleanup was checked with the exact command:

```bash
sudo -n -u postgres psql -X -qAt -d bcb_webapp_dev -c "SELECT count(*) FROM public.content_access_grants_webapp WHERE integrator_grant_id LIKE 'AUDIT-SA-%';"
```

Result: `0`.

### F1 — reachable A1 worker outage

`deploy/postgres/privileges/declaration.ts:8190-8216` declares cluster-scope roles but omits `app_worker`.
The four SaaS relations are now `org: true` (`declaration.ts:1341-1355`), so the generated subscription policy at
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql:17494` puts `app_worker` in the tenant branch:
`organization_id = app.current_org_id()`.

This path is live:

- `apps/webapp/src/app/api/internal/saas-billing/renewal/tick/route.ts:42-62` enters an infra/service principal
  without an organization and invokes the renewal service.
- `apps/webapp/src/infra/repos/pgSaasBilling.ts:1910-1919` uses the cross-tenant named root only to enumerate due
  subscriptions.
- The loop then calls direct repository methods; for example the direct subscription lookup begins at
  `pgSaasBilling.ts:1922-1938` under the same unscoped `app_worker` context.
- The candidate's own declaration comment at `declaration.ts:5209-5229` correctly states that this is a
  cross-tenant tick and an org predicate gives `app_worker` the wrong wall.

Reachable impact: the named root can return a due subscription, but the subsequent direct subscription/invoice
work sees no row (or fails from that missing row), so the automatic renewal cannot complete. This violates A1's
explicit requirement not to invent an org predicate for cluster workers.

### A3 fault injection: old runtime fallback

Temporary product mutation (reverted before the final green run):

```diff
-  if (declared !== WEBAPP_RUNTIME_DB_PRINCIPAL_CONTEXT_MODE) {
+  if (false && declared !== WEBAPP_RUNTIME_DB_PRINCIPAL_CONTEXT_MODE) {
```

Exact red command:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/config/envDatabaseRuntime.unit.test.ts"
```

Result under the mutation: one test file red, eight failed and eleven passed; missing mode, all legacy spellings,
and product module startup stopped rejecting. After revert, the same test file passed all 19 assertions.

### A4 fault injections and CI wiring

Temporary mutation (reverted): appended `-- AUDIT FAULT: stale generated artifact` to the committed DEV privilege
artifact. Exact red command:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm check:db-privileges-generated"
```

Result: exit 1, `КРАСНЫЙ bcb_webapp_dev/privileges`, exactly one drift; after revert all four generated artifacts
matched the declaration byte-for-byte.

Exact executable invariant command:

```bash
/home/dev/brain/host-orch/run-tests.sh "node --test deploy/postgres/privileges/tenant-predicate-invariant.test.mjs"
```

Result: five of five passed. That file executes the independent injuries, including removed tenant predicate,
weakened patient-self branch and missing patient door; it does not inspect source text as the acceptance result.

`.github/workflows/ci.yml:55-80` independently invokes `pnpm test:db-privileges`, `pnpm test:scripts`,
`pnpm check:db-privileges-generated`, and `pnpm check:db-privileges-census`; none has a zero-file test-discovery path.

### A5 fault injection: the static gate works, one real runner bypasses it

Two temporary, validly headed migration files (both removed before the final green run) were added:

```text
20991231T235959_audit_collision_one.sql
20991231T235959_audit_collision_two.sql
```

Exact red static-gate command:

```bash
/home/dev/brain/host-orch/run-tests.sh "node --test deploy/postgres/privileges/migration-order.test.mjs"
```

Result under the mutation: 26 passed, two failed. Both failures named timestamp `20991231T235959` and both exact
new filenames.

Exact active-runner fault command, deliberately pointed at closed local port 1 so no database could be changed:

```bash
DATABASE_URL='postgresql://audit:audit@127.0.0.1:1/audit' node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs
```

Result: it did **not** report a timestamp collision. It proceeded to the connection attempt and returned
`[migrate] failure migration=unknown idx=unknown reason=migration_failed sqlstate=unknown`. The runner imports and
calls `findMigrationNameViolations` (`run-webapp-drizzle-migrate.mjs:21-29,264-279`) but neither imports nor calls
`findMigrationTimestampCollisions`. This is the active `apps/webapp/package.json:24` `migrate` entrypoint.

This is directly inside the oracle: `AGENTS.md:373-378` requires the same migration-order module in both runners,
and plan stage 6 requires timestamp uniqueness. The plan's candidate status itself leaves this exact runner open
at `SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md:395-396`.

After deleting both injected files, the migration-order command passed all 28 tests. Exact current-state command:

```bash
node --input-type=module -e "import { APPLIED_MIGRATION_TIMESTAMP_COLLISION_BASELINE as baseline, findMigrationTimestampCollisions, readMigrationFolder } from './deploy/postgres/privileges/migration-order.mjs'; const migrations = readMigrationFolder('./apps/webapp/db/drizzle-migrations'); console.log('A5_STATE|historical_groups=' + Object.keys(baseline).length + '|fresh_collisions=' + findMigrationTimestampCollisions(migrations).length);"
```

Result: `A5_STATE|historical_groups=4|fresh_collisions=0`.

### Foreground validation commands and results

- `/home/dev/brain/host-orch/run-tests.sh "pnpm test:db-privileges && pnpm test:scripts && pnpm test:db-principal"`
  — green: DB privileges `312` tests (`172` passed, `140` skipped, `0` failed); scripts `39/39`; DB principal
  `31/31`. These figures are from this exact command, after `pnpm install --offline --frozen-lockfile` supplied the
  checkout's missing local dependencies.
- `pnpm check:db-privileges-census` — green for both declared databases; each scan reported `208` active
  relations and `3263` source files, with `379` patient-only modules and `117` relations carrying a patient door.
- `pnpm --dir apps/webapp exec vitest run src/config/envDatabaseRuntime.unit.test.ts src/infra/db/portContextRuntime.test.ts`
  — two files, `38/38` passed.
- `pnpm --dir packages/platform-merge build && pnpm --dir packages/error-tracking build && pnpm --dir apps/webapp typecheck`
  — green.
- Final restored-state command
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/config/envDatabaseRuntime.unit.test.ts && pnpm check:db-privileges-generated && node --test deploy/postgres/privileges/migration-order.test.mjs"`
  — `19/19`, four byte-identical artifacts, `28/28`.

## Migration rights analysis

Exact command:

```bash
git diff --name-status 3e40130e5..25ecc614707b42ab5d564ad72785ea79d9faed37 -- apps/webapp/db/drizzle-migrations
```

Result: no output. The candidate adds no migration, renames no applied migration and introduces no `GRANT`,
`REVOKE`, role or policy mutation through migration SQL. Privilege changes are confined to the declaration and
generated reconcile artifacts, as required.

## Verdict

**FAIL, NOT FOR LAND.** A1 and A5 each have one independent reachable blocker. A2, A3 and A4 have independent
positive controls and red fault-injection evidence, but green classes cannot override either reached fault.

## Remaining findings

1. **F1 / A1 — cluster `app_worker` is incorrectly tenant-bound on SaaS billing relations.** The renewal route
   enters an unscoped service principal, enumerates due subscriptions through a named root, then performs direct
   subscription/invoice work. Candidate RLS gives that worker `organization_id = current_org_id()`; live DEV
   showed accepted context plus `6 → 0` subscriptions. Automatic renewals cannot complete.
2. **F2 / A5 — the active webapp migration runner accepts a fresh duplicate timestamp.** The static/CI gate
   reddens the planted collision, but `apps/webapp/scripts/run-webapp-drizzle-migrate.mjs` passes it and attempts a
   DB connection. A direct invocation of the supported runner can therefore apply ambiguously ordered migration
   files despite the two-runner contract.
