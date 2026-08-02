# Platform quota usage: patients and files — worker brief

## Authority and outcome

Read `AGENTS.md` §1/§4a/§5/§10b/§24, then
`docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a stage 6.2 and the current implementation below.

Owner-plan requirement: the platform clinic report shows who is over a configured quota and on which access rung.
The existing implementation already shows `clinic_team` and `branches`, but deliberately omits `patient_count` and
`files` because the platform principal must not receive cross-clinic row access.

Human break: the platform operator sees a clinic blocked or warned by patient/file quota but cannot see the usage
number that caused it, explain the restriction, or issue a measured override.

Branch/worktree: `wt/platform-quota-usage` / its isolated worktree. No migration number is required: this is an
update to the existing re-runnable `c5a-platform-operations-runtime.sql` overlay and existing TypeScript port/UI.

## Measured current seam

- `deploy/postgres/c5a-platform-operations-runtime.sql` owns the existing
  `app.read_org_enforced_quota_usage(uuid)` SECURITY DEFINER accessor. It currently returns only
  `clinic_team_used`.
- `apps/webapp/src/infra/repos/pgOrgEntitlements.ts#getEnforcedQuotaUsage` combines that value with the already
  permitted active-branch count and explicitly omits `patient_count`/`files`.
- The clinic-side `getOwnQuotaUsage` is the behavior oracle: patient usage is `org_enrollments` in
  `invited|active`; file usage is `COALESCE(SUM(patient_files.size_bytes), 0)`.
- `resolveOrgQuotaProjections` and the existing platform `UsageSection` already render any returned mechanic. Do not
  add a screen, component or second resolver.

## Required product change

Extend the one accessor to return:

- `clinic_team_used integer` with its current exact formula;
- `patient_count_used integer`, counting only this organization’s `org_enrollments` whose status is `invited` or
  `active`;
- `files_used bigint`, summing only this organization’s `patient_files.size_bytes`, with empty usage reported as
  zero.

Update `getEnforcedQuotaUsage` to map those fields to `clinic_team`, `patient_count` and `files`; convert PostgreSQL
`bigint` safely to the existing numeric quota representation. Keep the existing active-branch Drizzle read.

The accessor remains owned by `app_owner`. Grant that owner only the SELECT privileges required by the three count
sources. `app_platform_settings` receives only EXECUTE on the accessor and must receive no direct table/column grant
or RLS policy on `organization_member_invites`, `org_enrollments` or `patient_files`.

Update the existing exact-wall in `c5a-platform-operations-runtime.sql` and the existing TEST closure in
`deploy/host/deploy-test-saas.sh` so all three sensitive relations and all required app_owner grants are checked.
Update the existing disposable PostgreSQL proof that extracts this accessor; do not create a new harness. Its fixture
must prove exact organization scoping, invited/active patient statuses, byte sum, empty zero, and absence of direct
platform row access. Remove any stale expectation that this numeric accessor returns a toggle-only `courses_used`.

Update `pgOrgEntitlements.test.ts` and existing service/UI tests only as necessary to prove that the platform
projection receives and displays both numbers. No new UI entity is needed.

In the same final product commit, update stage 6.2 in the canonical tariff plan: retain the original requirement,
replace the admitted omission with exact evidence, and do not close any unrelated quota or billing checkbox.

## Boundaries

- No new table, migration, accessor, screen, quota mechanic, direct platform grant, raw SQL in TypeScript, billing
  change, seat work, file-deletion workflow, DEV/TEST/PROD mutation or deploy.
- Do not enable clinic-side `files` enforcement: its separate product prerequisite (ordinary deletion of a completed
  patient file) remains open.
- Do not add a permanent source-text test. Existing overlay extraction/runtime proof may be extended because it runs
  the real function and ACL behavior.
- Do not push the worker branch.

## Acceptance and delivery

Before editing tests, derive a kill-set for: omitted patient count; wrong patient statuses/org; omitted/wrong byte
sum; NULL instead of zero; direct platform table visibility; missing app_owner grant; loss of clinic-team or branch
numbers.

Run the focused port/service/UI tests, the existing disposable PostgreSQL quota proof, shell syntax for the edited
deploy script, scoped ESLint/typecheck, raw-SQL gate and `git diff --check`. Commit explicit paths with `#1069` and
report exact commands, counts, SHA and any remaining limit.
