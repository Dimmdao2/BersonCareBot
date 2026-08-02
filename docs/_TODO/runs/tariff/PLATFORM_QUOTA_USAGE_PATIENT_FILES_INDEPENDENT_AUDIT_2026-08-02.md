# Platform quota usage: patients and files — independent audit

## Blind kill-set (recorded before reading candidate tests)

Authority: `docs/_TODO/runs/briefs/PLATFORM_QUOTA_USAGE_PATIENT_FILES_BRIEF.md` and the owner audit brief.

1. Omitted platform projection: the platform operator does not receive all three independent usage values — occupied clinic-team seats, patients, and file bytes — while the existing branch count remains intact.
2. Organization scoping: patient enrollments, member invites, or patient files belonging to another organization change the requested organization's counters.
3. Patient semantics: `invited` or `active` enrollment is omitted, an out-of-contract status is counted, or an invited/active specialist is counted differently from the existing clinic-team contract.
4. File aggregation: file sizes are omitted, summed with the wrong unit/value, or aggregated from the wrong organization.
5. Empty organization: a missing aggregate row or SQL `NULL` escapes instead of integer zero for patient/file usage.
6. Direct platform visibility: `app_platform_settings` can directly read `organization_member_invites`, `org_enrollments`, or `patient_files`, or receives an RLS/direct-grant bypass instead of accessor-only access.
7. Accessor execution/owner grants: `app_platform_settings` lacks `EXECUTE` on the shared accessor, or `app_owner` lacks one of the minimum source-table grants required for the SECURITY DEFINER function to execute.
8. Existing usage regression: the current clinic-team formula or active-branch Drizzle read is lost or changed while patient/file values are added.
9. Architecture/scope escape: the application adds raw SQL or a second read seam instead of the existing Drizzle port, or introduces clinic-side file enforcement, a table, migration, screen, separate accessor, or separate PostgreSQL harness.

## Result

**FAIL** — one reachable mandatory-gate finding remains. Product code was not changed.

## Test or look classification

- Behavioral PostgreSQL proof: organization scoping, invited/active enrollment semantics, byte aggregation, empty-zero behavior, clinic-team preservation, accessor execution, and absence of direct platform row reads.
- Behavioral TypeScript tests: accessor-row mapping into `clinic_team`, `patient_count`, `files`, preservation of the active-branch Drizzle read, quota projection, and generic UI rendering.
- Look/mechanical gates: exact candidate diff, runtime/deploy grants and policies, one existing Drizzle port/no second application read seam, no new migration/table/screen/harness/clinic-side enforcement.

## Finding

### F1 — `c5a`'s in-overlay exact wall does not cover the newly sensitive relations

Impact: a stale or accidental column grant plus platform RLS policy on `org_enrollments` or `patient_files` can survive the C5A overlay and the overlay's own `c5a_platform_enforced_quota_usage_exact_wall` still reports success. In that reachable state `app_platform_settings` can read the granted patient/file columns directly instead of receiving only `EXECUTE` on the aggregate accessor. The TEST closure would reject this later, but the required re-runnable runtime wall itself is a false-negative.

Evidence command:

```bash
nl -ba deploy/postgres/c5a-platform-operations-runtime.sql | sed -n '704,770p'
```

The wall's `expected` CTE contains only `organization_member_invites`; it requires only the existing `be_organization_members` and invite grants for `app_owner`; and it has no column-ACL inventory. By contrast, the updated TEST closure at `deploy/host/deploy-test-saas.sh:1541` inventories all three relations and their column ACLs.

Reachable reproduction class: grant `app_platform_settings` a patient-file column and a matching permissive SELECT policy, then apply the C5A overlay. `REVOKE ALL PRIVILEGES ON TABLE` does not revoke a column-level grant, the overlay drops no `patient_files`/`org_enrollments` platform policy, and the current wall never inventories either relation.

Violated requirements:

- audit kill-set item 4: platform runtime gets only `EXECUTE` on the shared accessor and no direct invite/enrollment/file read;
- worker brief: update the existing exact wall in `c5a-platform-operations-runtime.sql` so all three sensitive relations and all required `app_owner` grants are checked;
- `AGENTS.md` §5: one mechanically enforced chokepoint, not a convention that an unchecked second path will not exist.

No product fix was made, as required by the audit brief.

## Baseline and restored-tree validation

- Candidate scope: `git diff --stat a9228257b^ a9228257b` → 7 files changed, 149 insertions, 28 deletions. `git diff --name-status 0e2b09745..HEAD` → only `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` and the audit brief; candidate product files did not change after the named merge.
- Focused tests: `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgOrgEntitlements.test.ts src/modules/org-entitlements/service.test.ts src/app/app/settings/BillingSection.ui.test.tsx` → 3 files passed, 55 tests passed, exit 0.
- Real disposable PostgreSQL: `node apps/webapp/scripts/check-cms-pages-quota-race.mjs` → `CMS pages quota race proof: OK`, exit 0.
- Scoped ESLint: `pnpm --dir apps/webapp exec eslint scripts/check-cms-pages-quota-race.mjs src/infra/repos/pgOrgEntitlements.ts src/infra/repos/pgOrgEntitlements.test.ts src/modules/org-entitlements/service.test.ts src/app/app/settings/BillingSection.ui.test.tsx` → exit 0.
- Scoped typecheck: `pnpm --dir apps/webapp run typecheck` → exit 0.
- Raw-SQL gate: `node scripts/check-no-new-raw-sql.mjs` → exit 0; command reported 7 integrator manifest files and 21 webapp manifest files.
- Deploy shell syntax: `bash -n deploy/host/deploy-test-saas.sh` → exit 0.
- Whitespace: `git diff --check && git diff --check a9228257b^ a9228257b` → exit 0.

## Fault injection evidence

Every mutation below was temporary and was reverted before the restored-tree gates above.

1. Platform mapping: removed `patient_count` from `getEnforcedQuotaUsage`, then ran `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgOrgEntitlements.test.ts` → 1 failed / 3 passed; the exact platform-usage equality missed `patient_count: 7`.
2. Existing branch mapping: removed `branches` from `getEnforcedQuotaUsage`, then ran the same command → 1 failed / 3 passed; the equality missed `branches: 2`.
3. Organization filter: changed the enrollment predicate from `organization_id = p_organization_id` to non-null, then ran `node apps/webapp/scripts/check-cms-pages-quota-race.mjs` → exit 1; accessor returned `patient_count_used: 3` instead of 2.
4. Invited/active semantics: changed the accepted statuses to `active` only, then ran the same PostgreSQL command → exit 1; accessor returned `patient_count_used: 1` instead of 2.
5. File-byte aggregation: replaced `sum(size_bytes)` with `count(*)`, then ran the same PostgreSQL command → exit 1; accessor returned `files_used: "2"` instead of `"1000"`. The restored baseline also asserts the empty organization returns `"0"`.
6. Direct table privilege: temporarily granted `app_platform_settings` direct SELECT on `org_enrollments` in the disposable fixture, then ran the same PostgreSQL command → exit 1 with `platform role retained direct sensitive row SELECT beside the count-only accessor`.

Uncaught behavioral faults in the required kill-set: 0. F1 is a look-only exact-wall finding and must not be converted into a permanent source-text test.
