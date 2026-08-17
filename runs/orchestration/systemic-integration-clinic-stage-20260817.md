# Systemic integration — clinic stage — 2026-08-17

## Scope and boundary

- Worktree: `/home/dev/dev-projects/bcb-wt-systemic-integration-20260817`.
- Branch/base: `wt/systemic-integration-20260817` at patient/B0 head `9ebea6963bd0cc3a4914b51b99518bcffede08b9`.
- Integrated only the audited clinic chain. Global Admin commits were not touched.
- No DB, DEV, TEST, PROD, environment, deploy, push, or merge-to-feat action was run.
- Ten pre-existing root-owned character-device env mounts were not read, changed, or staged. Ignored offline dependency links and local workspace build outputs were test preparation only.

## Preserved cherry-pick chain

1. `git cherry-pick 14da19c624e1afa201fadcc6f1b21b5e6696244c`
   - Produced integration commit `89f39b07c` (`fix(clinic): complete owner management paths`).
   - Conflicts: `apps/webapp/db/drizzle-migrations/meta/_journal.json` and the two generated privilege SQL files.
2. `git cherry-pick 02ea3eaf3ac561a9cbd6398bc033fb601796cf03`
   - Produced integration commit `de1611165` (`test(audit): verify clinic owner systemic paths`).
   - Applied without conflict.

## Exact conflict resolutions

- `_journal.json`: retained the patient/B0 `0016_patient_self_action_capabilities` and
  `0017_patient_shared_core_capabilities` entries during the product cherry-pick. The clinic branch's parallel
  `idx=16` entry was not allowed to replace or duplicate them. The reconciliation change adds the clinic migration
  at `idx=18`, `when=1800000018000`, tag `0018_clinic_owner_tariff_branch_quotas`.
- Generated privilege SQL: retained the patient-generated sides during the cherry-pick instead of accepting the
  clinic branch's older counters/function inventory. The auto-merged authority files already contained both the
  patient roots and the two clinic billing-period roots. After renumbering, the exact combined declaration was
  regenerated with `node deploy/postgres/privileges/generate-cli.mjs --all`; both environment privilege artifacts
  now include the combined roots and match the declaration byte-for-byte.
- Migration: `git mv apps/webapp/db/drizzle-migrations/0016_clinic_owner_tariff_branch_quotas.sql apps/webapp/db/drizzle-migrations/0018_clinic_owner_tariff_branch_quotas.sql`.
  Its marker is `-- TEMPORARY LOCAL MIGRATION NUMBER 0018`, retained because this branch is still a parallel
  worktree and has not been merged into `feat`. No replay, A0, disposable, post-zero, or historical executor was
  introduced.
- Live source reference: the tariff validation comment now names migration `0018`. The original clinic worker and
  audit reports keep `0016` because that was the exact filename at their audited SHAs; rewriting those historical
  reports would falsify their evidence.
- Migration parser: replaced the deleted historical `0449` fixture reference with the active B0-forward `0018`
  migration and its exact one-backfill/two-owner-function shape.
- Exact catalogs: updated only combined fixed oracles measured from the merged declaration:
  `368/366` SECURITY DEFINER functions, `384/382` total functions, `210` capability rows,
  `176+34` runtime descriptors, and `195` named roots. Callsite discovery independently passes with both patient
  and clinic roots.

## Offline test preparation

The copy initially had no `node_modules`. Existing ignored dependency links were copied from the audited clinic
worktree, then the four current workspace packages were built locally:

```text
pnpm --filter @bersoncare/operator-db-schema build
pnpm --filter @bersoncare/db-principal build
pnpm --filter @bersoncare/error-tracking build
pnpm --filter @bersoncare/platform-merge build
```

All four builds passed. No network or runtime environment was contacted.

## Final green evidence

### Clinic acceptance and application checks

- The audit-defined Vitest command over the 19 existing clinic paths, including
  `pgSaasBilling.periodCatalogRoots.unit.test.ts`: **19 files / 181 tests PASS**.
- `pnpm --dir apps/webapp typecheck`: **PASS**.
- App-local ESLint over every changed webapp TypeScript/TSX path and root ESLint over every other changed
  TypeScript/MJS path: **PASS**.

### Patient preservation suites

- `pnpm --dir apps/webapp exec vitest --run src/app/app/patient/treatment/postProgramItemComplete.unit.test.ts src/app/app/patient/treatment/programItemExecutionDisplay.unit.test.ts src/modules/treatment-program/progress-service.completion.unit.test.ts src/modules/patient-home/patientGreetingPersonalizedName.unit.test.ts src/shared/ui/charts/PositiveSizeResponsiveContainer.unit.test.tsx`
  -> **5 files / 13 tests PASS**.
- `pnpm --dir apps/webapp exec vitest --run src/modules/patient-booking/catalogRemovalB14.unit.test.ts src/modules/patient-booking/service.d14.test.ts`
  -> **2 files / 12 tests PASS**; `pnpm --dir apps/webapp exec vitest --run src/modules/patient-booking/canonicalCreate.d14.test.ts`
  -> **1 file / 5 tests PASS**. Combined catalog/create/service gate: **3 files / 17 tests PASS**.
- `pnpm --dir apps/webapp exec vitest --run src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.acceptance.test.ts src/modules/payments/service.test.ts src/modules/payments/bookingPaymentSettings.unit.test.ts`
  -> **3 files / 16 tests PASS**.

### Privilege, capability, migration, and SaaS gates

- `pnpm exec tsc -p deploy/postgres/privileges/tsconfig.json --noEmit`: **PASS**.
- `node deploy/postgres/privileges/generate-cli.mjs --check`: **PASS**, four generated artifacts byte-identical.
- `node deploy/postgres/privileges/generate-cli.mjs --census`: **PASS** for both targets,
  **219 ACTIVE relations / 3210 production source files** each.
- `node --test deploy/postgres/privileges/relation-access.test.mjs`: **39/39 PASS**.
- `node --test deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/port-context-catalog.test.mjs deploy/postgres/privileges/port-context-callsite-catalog.test.mjs deploy/postgres/privileges/migrate-local-parse.test.mjs`:
  final per-file evidence is function census **6/6 PASS**, port-context catalog **15/15 PASS**, callsite oracle
  **5/5 PASS**, migration parser **4/4 PASS**. The catalog was rerun alone after its last fixed-root count update.
- `node scripts/check-b0-migration-baseline.mjs`: **PASS**, B0 roots + **18 webapp / 0 integrator** forward migrations; no legacy chain.
- `node --test scripts/check-b0-migration-baseline.audit.test.mjs`: **2/2 PASS** black-box negative fixtures.
- `node scripts/check-saas-db-regression.mjs`: **PASS** through the complete maintained SAAS P0.4-P0.13,
  locked-policy, S5-2, D1, and D8 sequence including self-tests.
- `node scripts/check-no-new-raw-sql.mjs`, webapp infra-boundary + self-test, transaction-quota boundary +
  self-test, `apps/webapp/scripts/check-legacy-migrations-frozen.sh`, and
  `apps/webapp/scripts/check-drizzle-journal-sync.sh`: **PASS**.
- Exact raw-DML oracle:
  `rg '^GRANT .*\b(INSERT|UPDATE|DELETE|TRUNCATE)\b.* TO "app_patient";' deploy/postgres/generated/privileges.bcb_webapp_dev.sql | wc -l`
  -> **0**; the same command for `privileges.bersoncarebot_test.sql` -> **0**.
- `gitleaks git . --no-banner --redact --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore --report-format sarif --report-path /tmp/bcb-systemic-integration-clinic-stage-gitleaks.sarif`:
  **PASS**, 7279 commits / about 184.91 MB, no leaks found.
- `git diff --check 9ebea6963..HEAD` and `git diff --check -- <the eight reconciliation files plus this report>`:
  **PASS**. The explicit pathset avoids the ten injected character-device env mounts.

## Failed-attempt ledger and resolution

- Before combined count reconciliation, function census reported `368 != 317`; catalog reported `210 != 208`
  and then `195 != 193`. These were stale fixed oracles from the pre-integration declaration. The measured combined
  values above were installed and the exact gates passed.
- Before offline workspace packages were built, the clinic run had **15 files / 106 tests PASS** and four suite
  import failures for `@bersoncare/db-principal`; typecheck failed for the same missing package entrypoints and an
  absent integrator `luxon` link. After copying existing offline links and building current packages, the unchanged
  product reached **19/181 PASS** and typecheck PASS.
- No clinic audit assertion remained red, and no product code was weakened to satisfy a stale test.

## Blockers and unclaimed runtime state

There is no repository blocker for this clinic integration stage. Named DEV/TEST behavior, migration application,
service restart, browser traversal, and PROD transition remain unexecuted and unclaimed because this brief
explicitly forbids those environments and actions.
