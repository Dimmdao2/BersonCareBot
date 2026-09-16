# Systemic integration — Global Admin stage — 2026-08-17

## Scope and authority

- Worktree: `/home/dev/dev-projects/bcb-wt-systemic-integration-20260817`.
- Branch/base: `wt/systemic-integration-20260817` at audited patient+clinic head
  `42174a80d95f3d3e794267e72e64fc04e6c0d0ac`.
- Source chain: `global-source/wt-global-admin-systemic-20260817`, final audited correction head
  `fa3c23f45319736d82b54f89da311f10b7a9108a`.
- Canon for this action: the owner brief, `AGENTS.md` core and §§0,1,4a,5,7,9,10/10a/10b,15–24,
  `README.md`, `docs/README.md`, `docs/ORCHESTRATION_BINDINGS.md`, the clinic integration report, every
  Global Admin worker/audit/correction report in the source tree, and the byte-identical independent re-audit2
  report from its separate full clone.
- No database, named DEV, TEST, PROD, environment content, deploy, push, or merge-to-feat action was performed.
  The ten root-owned character-device env mounts were not read or changed. Their local index entries were marked
  `skip-worktree`, as in the source audit evidence, so Git status describes repository changes instead of the
  sandbox projection.

## Preserved cherry-pick chain

Each source commit was cherry-picked separately and in the required order:

1. `git cherry-pick 3c750e534` → integration commit
   `105b42ea382de08215eac9b650f7717402d781db`.
2. `git cherry-pick cd35e5b41` → integration commit
   `02814fef611b335c51c551e0321b2630e188582d`.
3. `git cherry-pick 63844034b` → integration commit
   `d41eb8020fe446f2005a75c379a994760507a7d9`.
4. `git cherry-pick b4f4217b9` → integration commit
   `3327511fb9f70280b878add4179f4841a8108f38`.
5. `git cherry-pick fa3c23f45` → integration commit
   `e45594c9f74241a82268285472ca24d140bd4b77`.

All worker, audit1, correction1, re-audit2, correction2 reports and all acceptance tests from the chain remain in
the integration history.

## Conflict and reconciliation

- The first cherry-pick had one `add/add` conflict:
  `apps/webapp/src/app/api/admin/settings/route.route.test.ts`. The production settings route merged
  automatically.
- The test conflict was resolved as one executable route-test composition, retaining both sides:
  - Global Admin Unicode readback, exactly two intentional fallback exceptions, one atomic modes batch,
    duplicate refusal, global material-ratings ownership and clinic booking scoping;
  - clinic-owner save/readback of `booking_allow_doctor_unlink_past_package_sessions` for both boolean values and
    refusal of a non-boolean.
- The merged production route retains the clinic key exactly once in `ADMIN_BOOLEAN_SETTING_KEYS` and once in
  `ADMIN_SCOPE_KEYS`, while preserving the Global Admin platform/clinic authorization and fallback behavior.
- The later audit commit added a call through the source helper name `patch(...)`; the first conflict resolution
  had temporarily named the shared helper `patchSettings(...)`. Post-chain source comparison exposed this
  incompatibility before the definitive focused run. The separate reconciliation commit
  `046188c21fca1edef13d715f6d4a595f44111e53` restores the source helper name across the combined test and leaves
  the final settings route test at **10/10 PASS**.
- Exact comparison against `fa3c23f45` over every Global Admin product/evidence path reports only the two intended
  shared differences: `admin/settings/route.ts` and `admin/settings/route.route.test.ts`. All other final Global
  Admin product files, audit tests and reports are identical to the audited source correction head.

## Preserved behavior boundaries

- Platform settings keep only `patient_booking_url` and `notifications_topics` as explicit NULL-org fallback
  exceptions; clinic writes remain organization-scoped and atomic.
- Error-tracking remains a separate platform-only DSN route with atomic enabled+DSN persistence and presence-only
  readback.
- Global Admin specialist self-binding remains refused before dependency/workspace/provisioning work; the clinic
  owner path remains available.
- Global Admin password change retains verified-email/current-password behavior, credential replacement,
  session-epoch rotation and exactly one replacement session.
- Manual invoice retains fiscal fail-closed behavior, deterministic idempotency, persisted checkout readback and
  safe public mappings. Plain/provider `Error.code` values `PWN42`, `42501` and `ECONNREFUSED` cannot establish
  provenance. Only failures branded inside the exact DB or provider-transport catch boundaries keep bounded
  infrastructure classification.
- `material_ratings_enabled=false` prevents patient stars/feedback mount and GET/PUT/feedback requests; clinic
  settings cannot write the global switch.
- Patient direct DML remains zero, privilege/capability catalogs remain closed, clinic behavior remains green,
  and no historical replay, A0 or disposable path was introduced.

## Migration sequence

Command:

```bash
git diff --exit-code 42174a80d..HEAD -- \
  apps/webapp/db/drizzle-migrations/0016_patient_self_action_capabilities.sql \
  apps/webapp/db/drizzle-migrations/0017_patient_shared_core_capabilities.sql \
  apps/webapp/db/drizzle-migrations/0018_clinic_owner_tariff_branch_quotas.sql \
  apps/webapp/db/drizzle-migrations/meta/_journal.json
```

Result: exit 0 before and after the Global Admin chain. Exact hashes remained:

```text
ee27964656459dc46415b28e3732c019226cb0581e60bc01cea4ebf59404e317  0016_patient_self_action_capabilities.sql
f360a1c0314a49a39fa53503326271cfc4cbe9b26da484784cfcd275230a2a33  0017_patient_shared_core_capabilities.sql
58d7226a3e4281b35be8c543bad43051eaa529a2b742d1634942d14713ef467d  0018_clinic_owner_tariff_branch_quotas.sql
287d663d7a2553d5816c69d9c5c7cc5234303861e20fd90ead30f400b475dae3  meta/_journal.json
```

## Behavioral suites

### Global Admin integrated gate

```bash
pnpm --dir apps/webapp exec vitest run --reporter=dot \
  src/app/api/account/first-run/bind-specialist/route.route.test.ts \
  src/app/api/admin/saas-billing/payments/manual/route.route.test.ts \
  src/app/api/admin/settings/route.route.test.ts \
  src/app/api/patient/material-ratings/route.route.test.ts \
  src/app/api/platform/error-tracking/route.route.test.ts \
  'src/app/app/patient/content/[slug]/PatientContentMaterialRating.ui.test.tsx' \
  src/app/app/account/StaffSecuritySection.ui.test.tsx \
  src/shared/ui/patient/material-rating/MaterialRatingBlock.ui.test.tsx \
  src/modules/auth/passwordAuth.route.test.ts \
  src/modules/auth/passwordChange.unit.test.ts \
  src/modules/saas-billing/service.test.ts \
  src/modules/system-settings/platformGlobalFallback.unit.test.ts \
  src/app/api/tariffMechanics.route.test.ts
```

Result: **13 files / 167 tests PASS**. The audited Global Admin baseline is 164; the integrated count is exactly
three higher because the shared settings file also retains the three clinic-owner assertions from the conflict.

```bash
pnpm --dir apps/webapp exec vitest run --reporter=dot \
  src/infra/payments/yookassaPaymentProvider.unit.test.ts
```

Result: **1 file / 4 tests PASS**.

### Clinic preservation gate

```bash
pnpm --dir apps/webapp exec vitest --run --reporter=dot \
  src/app/api/admin/booking-engine/branches/route.route.test.ts \
  src/app/api/admin/booking-engine/form-fields/route.route.test.ts \
  src/app/api/admin/booking-engine/policies/route.route.test.ts \
  src/app/api/admin/settings/route.route.test.ts \
  src/app/api/admin/saas-billing/payments/manual/route.route.test.ts \
  src/app/api/clinic/billing/route.route.test.ts \
  src/app/api/clinic/slug/route.route.test.ts \
  src/app/api/doctor/booking-engine/appointments/manual-patient-visit/route.route.test.ts \
  src/app/api/doctor/booking-engine/appointments/manual/route.route.test.ts \
  src/app/api/doctor/settings/route.route.test.ts \
  src/app/app/doctor/calendar/DoctorCalendarEventPanel.ui.test.tsx \
  src/app/app/settings/BookingPoliciesSection.ui.test.tsx \
  src/app/app/settings/DoctorScreensToggleSection.ui.test.tsx \
  src/app/app/settings/SettingsForm.ui.test.tsx \
  src/modules/booking-policies/policyResolver.test.ts \
  src/modules/org-entitlements/service.test.ts \
  src/modules/saas-billing/service.test.ts \
  src/modules/system-settings/clinicOwnerSettingsBatch.unit.test.ts \
  src/shared/ui/doctor/shell/doctorClinicalPolling.ui.test.tsx \
  src/infra/repos/pgSaasBilling.periodCatalogRoots.unit.test.ts
```

Result: **20 files / 208 tests PASS**. At the clinic-only stage this exact path list had 20 arguments but only 19
present files / 181 tests: the optional Global Admin manual-invoice route test did not yet exist. The Global Admin
chain intentionally supplies that audit test and adds shared settings/manual-invoice/service assertions, so the
fully integrated gate executes all 20 files and is strictly stronger than the historical 19/181 baseline.

### Patient preservation gates

```bash
pnpm --dir apps/webapp exec vitest --run --reporter=dot \
  src/app/app/patient/treatment/postProgramItemComplete.unit.test.ts \
  src/app/app/patient/treatment/programItemExecutionDisplay.unit.test.ts \
  src/modules/treatment-program/progress-service.completion.unit.test.ts \
  src/modules/patient-home/patientGreetingPersonalizedName.unit.test.ts \
  src/shared/ui/charts/PositiveSizeResponsiveContainer.unit.test.tsx
```

Result: **5 files / 13 tests PASS**.

```bash
pnpm --dir apps/webapp exec vitest --run --reporter=dot \
  src/modules/patient-booking/catalogRemovalB14.unit.test.ts \
  src/modules/patient-booking/service.d14.test.ts \
  src/modules/patient-booking/canonicalCreate.d14.test.ts
```

Result: **3 files / 17 tests PASS**.

```bash
pnpm --dir apps/webapp exec vitest --run --reporter=dot \
  src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.acceptance.test.ts \
  src/modules/payments/service.test.ts \
  src/modules/payments/bookingPaymentSettings.unit.test.ts
```

Result: **3 files / 16 tests PASS**.

## Type and lint

```bash
pnpm --dir apps/webapp typecheck
```

Result: PASS.

Focused lint used every changed webapp TypeScript/TSX path from the audited base:

```bash
mapfile -t global_lint_files < <(
  git diff --name-only 42174a80d..HEAD -- apps/webapp \
    | sed 's#^apps/webapp/##' \
    | rg '\.(ts|tsx)$'
)
pnpm --dir apps/webapp exec eslint --no-warn-ignored -- "${global_lint_files[@]}"
```

Result: **22 changed files PASS**.

## Privilege, capability and migration gates

Commands and results:

```bash
pnpm exec tsc -p deploy/postgres/privileges/tsconfig.json --noEmit
# PASS

node deploy/postgres/privileges/generate-cli.mjs --all
# four generated privilege/allowlist artifacts written identically; git status remained clean

node deploy/postgres/privileges/generate-cli.mjs --check
# PASS: all four artifacts byte-identical to the declaration

node deploy/postgres/privileges/generate-cli.mjs --census
# PASS: 219 ACTIVE relations / 3267 production source files

node --test deploy/postgres/privileges/relation-access.test.mjs
# 39/39 PASS

node --test \
  deploy/postgres/privileges/function-census.test.mjs \
  deploy/postgres/privileges/port-context-catalog.test.mjs \
  deploy/postgres/privileges/port-context-callsite-catalog.test.mjs \
  deploy/postgres/privileges/migrate-local-parse.test.mjs
# 30/30 PASS: function census 6, migration parser 4, callsite catalog 5, port-context catalog 15
```

The fixed combined declaration remains the clinic-stage catalog: 210 capability rows, 176+34 runtime
descriptors, 195 named roots, 368/366 SECURITY DEFINER functions and 384/382 total functions. The executable fixed
oracles above passed without catalog edits.

## B0, SaaS and architecture gates

```bash
node scripts/check-b0-migration-baseline.mjs
# PASS: B0 roots + 18 webapp / 0 integrator forwards; no legacy chain

node --test scripts/check-b0-migration-baseline.audit.test.mjs
# 2/2 PASS

node scripts/check-saas-db-regression.mjs
# PASS: complete maintained P0.4–P0.13, locked policy, S5-2, D1 and D8 sequence

node scripts/check-no-new-raw-sql.mjs
# PASS: production debt 0

node scripts/check-webapp-infra-import-boundary.mjs
node scripts/check-webapp-infra-import-boundary.mjs --self-test
# PASS; seven bypass forms rejected and canonical port consumer accepted

node scripts/check-transaction-quota-port-boundary.mjs
node scripts/check-transaction-quota-port-boundary.mjs --self-test
# PASS; four bypass forms rejected and canonical port writer accepted

node docs/_TODO/SAAS_FOUNDATION/scripts/check-s5-2-settings-security.mjs
# PASS

bash apps/webapp/scripts/check-legacy-migrations-frozen.sh
bash apps/webapp/scripts/check-drizzle-journal-sync.sh
# PASS
```

Exact direct-patient DML oracle:

```bash
rg '^GRANT .*\b(INSERT|UPDATE|DELETE|TRUNCATE)\b.* TO "app_patient";' \
  deploy/postgres/generated/privileges.bcb_webapp_dev.sql | wc -l
# 0

rg '^GRANT .*\b(INSERT|UPDATE|DELETE|TRUNCATE)\b.* TO "app_patient";' \
  deploy/postgres/generated/privileges.bersoncarebot_test.sql | wc -l
# 0
```

## Gitleaks and diff checks

```bash
gitleaks git . --no-banner --redact --config .gitleaks.toml \
  --gitleaks-ignore-path .gitleaksignore --report-format sarif \
  --report-path /tmp/bcb-systemic-integration-global-stage-gitleaks.sarif
```

Result: PASS, **7291 commits / about 185.20 MB / no leaks found**.

```bash
git diff --check 42174a80d..HEAD
git diff --check fa3c23f45..HEAD
```

Result: both PASS before this report; the final report-only delta is checked separately before commit.

## Failed-attempt ledger

- Direct execution `apps/webapp/scripts/check-legacy-migrations-frozen.sh` returned permission denied because the
  local projected mode is `600`. This was a command-form failure, not a gate failure. The script's content was not
  changed; the canonical explicit interpreter form `bash apps/webapp/scripts/check-legacy-migrations-frozen.sh`
  passed, followed by `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` PASS.
- No behavioral, type, lint, privilege, catalog, migration, architecture or secret gate remained red.

## Blockers and unclaimed runtime state

There is no repository blocker for the Global Admin integration stage. Named DEV/TEST behavior, live database
state, service restart, browser traversal, deploy, PROD and merge-to-feat remain deliberately unexecuted and
unclaimed. The resulting integration head is ready for the two requested independent full-scope auditors.
