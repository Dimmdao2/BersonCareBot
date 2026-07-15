# SAAS R3 — Cut Invented Scope

Status: execution plan only. This stage removes invented product scope and the checks that enforce it. It is not an authorization to touch a database, environment files, services, deployment state, or production infrastructure.

## 1. Outcome and non-negotiable boundaries

The completed executable part of R3 must leave the repository smaller:

- the media worker runs as the narrow tenant-agnostic `app_worker`/infra principal, while tenant ownership is fixed before dispatch and verified at claim time (`deploy/postgres/phase4-app-worker-narrow-rls.sql:1-24`, `apps/webapp/src/infra/repos/pgMediaTranscodeJobs.ts:24-38`, `apps/webapp/src/infra/repos/pgMediaTranscodeJobs.ts:51-69`);
- one staff login resolves to exactly one active organization membership; multiple active staff memberships are a loud data-integrity failure, never a selection state (`apps/webapp/src/modules/organization-membership/service.ts:50-73`);
- `be_organizations` is no longer treated as an ordinary tenant-owned child in the design, but its runtime classification/wall change remains blocked until the owner selects the separate platform capability described in section 4 (`docs/_TODO/SAAS_FOUNDATION/scope-derivation/tiers-218.tsv:95`, `docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs:134-142`);
- the production-copy DB-state check inventories the same 163 RLS targets as the strict artifact, including the two tables added by migrations 0179 and 0180 (`docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs:15-18`, `docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs:35-50`).

This is a deletion stage. The only permitted net-new runtime protection is the media claim invariant in section 7. Do not introduce a staff organization selector, a new principal class, a new RLS framework, a new capability abstraction, a migration, or a compatibility fallback (`apps/media-worker/src/jobs/claim.ts:42-92`, `apps/webapp/src/modules/organization-membership/service.ts:23-27`).

### Global execution restrictions

- [ ] Confirm the working branch is `feat/doctor-ui-rebuild`; stop on any other branch. Do not push. Follow the repository's branch restrictions in `AGENTS.md`, section “Deploy / push”.
- [ ] Do not use TaskDB, PostgreSQL, migration runners, `/opt/env`, SSH, systemd, nginx, cron, deploy scripts, or a live dev server. Every check in this plan is static or mocked/in-process; the DB-bearing command path begins at `docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs:208-218` and MUST NOT be invoked without `--self-test-safety`.
- [ ] Before editing, record `git status --short` and preserve every pre-existing change. Stage only files named by the executable sections below; never use `git add -A` or `git add .`.
- [ ] Keep all existing RLS walls, FORCE/ENABLE state, grants, and role definitions unchanged unless a later owner-approved plan explicitly authorizes item 3. In particular, do not edit `deploy/postgres/phase4-app-worker-narrow-rls.sql:29-67`, `deploy/postgres/p0-5b-grants.sql:100-113`, or `packages/db-principal/src/index.ts:545-592`.

## 2. Canonical decisions for this plan

The worker must not re-open these decisions:

1. Media tenancy is enforced at enqueue time. Dispatch workers are tenant-agnostic infra workers with the narrow `app_worker` role; they are not clinic staff and do not receive a tenant bypass (`deploy/postgres/phase4-app-worker-narrow-rls.sql:3-17`, `apps/media-worker/src/workerTick.ts:23-48`).
2. An organization principal is unsafe for the media worker because locked principal application maps `organization` to `app_staff` via `SET ROLE` (`packages/db-principal/src/index.ts:555-563`, `packages/db-principal/src/index.ts:582-592`).
3. One staff identity belongs to one clinic. A person working for a second clinic uses a second email/login. This restriction is only about staff login membership; it does not collapse the system to one organization, prevent an organization from having multiple staff, or remove patient multi-organization enrollment (`apps/webapp/src/modules/patient-organization/service.ts:6-18`).
4. `be_organizations` is a tenant root/bootstrap directory containing non-public commercial state such as `tariff_id`, not a harmless public catalog and not an ordinary tenant child (`apps/webapp/db/schema/bookingEngine.ts:64-81`).
5. The strict renderer's count of 163 is correct. The production-copy inventory is missing two tables; do not weaken either side to manufacture agreement (`docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs:208-212`, `docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs:43-50`).

## 3. Execution order, dependencies, and pass boundaries

Execute in this order:

1. **Item 3 decision gate:** read section 4 and leave it unchecked. It does not block the other three independent items.
2. **Item 4 DB-state inventory:** lowest-risk, checker-only correction. Complete first.
3. **Item 2 staff multi-membership deletion:** localized application-contract deletion. It is safe to do in the same pass/commit as item 4 because their files and checks do not overlap.
4. **Item 1 media-worker principal deletion and claim invariant:** highest risk. Do it as a separate pass and preferably a separate commit after items 2 and 4 are green.

Do not combine item 1 with an RLS/grant change. Its security proof depends on the existing narrow wall remaining byte-for-byte unchanged (`deploy/postgres/phase4-app-worker-narrow-rls.sql:12-24`, `deploy/postgres/phase4-app-worker-narrow-rls.sql:53-63`).

## 4. Item 3 — `be_organizations`: owner-decision gate, no execution in R3

### 4.1 Why a mechanical edit is forbidden

`public.be_organizations` is currently listed as `SCOPED` (`docs/_TODO/SAAS_FOUNDATION/scope-derivation/tiers-218.tsv:88-100`) and receives a special `self_org_id` descriptor (`docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs:134-142`). The enforcement model merely groups `self_org_id` with org-column scopes (`docs/_TODO/SAAS_FOUNDATION/scripts/p0-9-enforce-descriptors.mjs:33-45`), while ordinary `BOOTSTRAP` becomes `bootstrap_global` (`docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs:154-180`) and then an explicit allow-all bootstrap action (`docs/_TODO/SAAS_FOUNDATION/scripts/p0-9-enforce-descriptors.mjs:113-147`). Therefore:

- changing only `SCOPED` to `BOOTSTRAP` would create a blanket global wall and is prohibited;
- keeping `SCOPED/self_org_id` leaves the classification unsupported by a purpose-built tenant-root policy and is also not an acceptable final state;
- changing generated counts or dropping descriptor assertions would hide the defect rather than fix it (`docs/_TODO/SAAS_FOUNDATION/scripts/p0-9-enforce-descriptors.mjs:211-231`).

The precedent for recognizing pre-context bootstrap access is the correction of `be_organization_members`, but that precedent is not a license to make a tariff-bearing tenant-root table globally readable (`docs/_TODO/SAAS_FOUNDATION/R1_TABLE_TAXONOMY.md:24-30`, `apps/webapp/db/schema/bookingEngine.ts:71-77`).

### 4.2 Existing paths that the final model must preserve

- Specialist signup creates the organization before staff organization context exists through the narrow `SECURITY DEFINER` function `app.provision_specialist_owner` (`deploy/postgres/specialist-owner-provisioning-rls.sql:52-67`, `deploy/postgres/specialist-owner-provisioning-rls.sql:130-147`, `deploy/postgres/specialist-owner-provisioning-rls.sql:181-187`). Keep this path; do not replace it with general `app_staff` INSERT.
- Invite acceptance obtains the clinic title through the narrow token resolver `app.lookup_pending_org_invite` (`deploy/postgres/organization-member-invites-rls.sql:104-144`). Keep token lookup, but any future resolver must expose only the projection needed by the flow.
- Integrator first contact currently infers the sole active organization before tenant context (`apps/integrator/src/infra/db/repos/channelUsers.ts:101-131`). A blanket own-row policy would break this stopgap.
- The booking repository currently offers unrestricted `getOrganization`, `listOrganizations`, and upsert operations (`apps/webapp/src/infra/repos/pgBookingEngine.ts:129-174`), while the admin route uses list-all for GET and own-context upsert for POST (`apps/webapp/src/app/api/admin/booking-engine/organizations/route.ts:11-30`). These operations require different capabilities and must not share a general clinic-staff grant.
- `app_staff` currently receives the table through the broad generated grant set (`deploy/postgres/p0-5b-grants.sql:100-113`). Do not change this grant in isolation from the final policy/capability design.

### 4.3 Owner decisions required before any file is changed

- [ ] **OWNER DECISION REQUIRED — cross-org read capability.** Choose one explicit platform-only mechanism: (A) a separately signed platform-admin DB principal/role, (B) a narrow `SECURITY DEFINER` list resolver that validates a trusted platform-admin fact in DB state and returns a minimal projection, or (C) removal of the cross-org GET capability. Session-only `adminMode` is not by itself a DB-verifiable capability; the current route gate is at `apps/webapp/src/app/api/admin/booking-engine/_requireAdminBookingEngine.ts:23-58`, and the list query is at `apps/webapp/src/infra/repos/pgBookingEngine.ts:142-145`.
- [ ] **OWNER DECISION REQUIRED — organization update/provisioning split.** Confirm whether the current admin POST remains an own-row UPDATE-only operation or moves behind an explicit platform provisioning path. General `app_staff` INSERT must be removed in the eventual model, while `app.provision_specialist_owner` remains the authorized signup INSERT path (`apps/webapp/src/app/api/admin/booking-engine/organizations/route.ts:18-30`, `deploy/postgres/specialist-owner-provisioning-rls.sql:130-147`).
- [ ] **OWNER DECISION REQUIRED — integrator first-contact resolver.** Choose whether the single-active-organization stopgap moves behind a narrow pre-context resolver or is replaced immediately by explicit channel-to-organization binding (`apps/integrator/src/infra/db/repos/channelUsers.ts:101-125`).

### 4.4 Files explicitly frozen by this stage

- [ ] Leave item 3 unchecked and make no edit to `docs/_TODO/SAAS_FOUNDATION/scope-derivation/tiers-218.tsv:95`, `docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs:134-180`, `docs/_TODO/SAAS_FOUNDATION/scripts/p0-9-enforce-descriptors.mjs:33-45`, `deploy/postgres/p0-5b-grants.sql:100-113`, or any migration/deploy SQL.
- [ ] Do not add a `tenant_root_directory` descriptor, policy renderer, principal, resolver, grant overlay, or migration in this deletion stage. After the three decisions above are recorded, write a separate wall/capability plan with exact policy predicates and least-privilege projections; do not improvise them here.

Item 3 is intentionally unresolved. This is not a worker blocker for items 4, 2, and 1, and the worker must not mark it complete.

## 5. Item 4 — extend production-copy DB-state inventory to 163

### 5.1 Exact edits

- [ ] In `docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs:15-18`, replace the migration inventory regex
  `^(016\d|017[0-6])_.*\.sql$`
  with
  `^(016\d|017[0-6]|0179|0180)_.*\.sql$`.
  Keep migration 0177 handled separately by `compatMigration` and do not broadly include all future migrations.
- [ ] In `docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs:208-212`, change only the static target assertion from 161 to 163.
- [ ] Keep the inventory construction itself unchanged: it must continue scanning selected migrations for literal `ENABLE ROW LEVEL SECURITY` statements and deduplicating by schema/table (`docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs:143-153`).
- [ ] Keep `docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs:35-53` unchanged. Its 163-target assertion is the correct side of the comparison.
- [ ] Do not edit either missing table's migration or policy. The two added inventory members are `public.organization_member_invites`, enabled in `apps/webapp/db/drizzle-migrations/0179_organization_member_invites.sql:41-45`, and `public.saas_org_entitlement_overrides`, enabled in `apps/webapp/db/drizzle-migrations/0180_store_entitlements.sql:22-39`.

### 5.2 Checks

- [ ] Run `node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs`.
- [ ] Run `node docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs --self-test-safety`; this exercises URL rejection only and does not connect to a DB (`docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs:326-330`).
- [ ] Run `node docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs --summary` and require a 163-target summary (`docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs:47-50`, `docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs:172-175`).
- [ ] Do **not** run `check-phase4-prod-copy-db-state.mjs` without `--self-test-safety`; the normal path parses a rehearsal DB URL and constructs a PostgreSQL client (`docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs:208-218`). Record the full DB-state gate as “not run by R3; DB access prohibited,” not as passed.

### 5.3 MUST NOT change

- [ ] Do not reduce 163, loosen uniqueness, ignore ENABLE/FORCE mismatches, or turn the checker into an allowlist that omits newly discovered migrations (`docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs:43-50`, `docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs:143-153`).
- [ ] Do not alter any RLS policy, migration, grant, table, or production-copy safety rule (`docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs:13-30`).

## 6. Item 2 — delete staff multi-membership selection

### 6.1 Service contract: delete selection, replace duplicates with a loud error

- [ ] In `apps/webapp/src/modules/organization-membership/service.ts:8-11`, delete `selectedOrganizationId` from `ResolveOrganizationForUserInput`; the input becomes exactly `{ platformUserId: string }`.
- [ ] In `apps/webapp/src/modules/organization-membership/service.ts:23-27`, delete the `membership_selection_required` and `selected_membership_not_found` variants. Keep only success and `no_active_membership`.
- [ ] In `apps/webapp/src/modules/organization-membership/service.ts:50-73`, delete the selected-organization lookup branch and delete the selection-required result branch. Replace the `memberships.length > 1` branch with exactly `throw new Error("multiple_active_staff_memberships")`. Do not sort, choose the first row, choose a default organization, or return an HTTP-oriented result from the module.
- [ ] Keep the zero-membership result and the single-membership conversion unchanged (`apps/webapp/src/modules/organization-membership/service.ts:50-54`, `apps/webapp/src/modules/organization-membership/service.ts:73-79`). Do not create a custom error class, selector DTO, or fallback.

This error is intentionally allowed to propagate from authoritative workspace resolution. Existing best-effort principal stamping may continue swallowing resolver failures because it is explicitly non-authoritative (`apps/webapp/src/app-layer/guards/requireRole.ts:98-123`); do not change that best-effort boundary.

### 6.2 Guards and callers: delete every staff selection argument and 409 branch

- [ ] In `apps/webapp/src/app-layer/guards/requireRole.ts:93-95`, remove the `organization_selection_required`/409 special case; denied workspace results use 403.
- [ ] In `apps/webapp/src/app-layer/guards/requireRole.ts:148-180`, remove the `selectedOrganizationId` parameter, remove `organization_selection_required` from the return union, pass only `platformUserId` to the membership resolver, and delete the mapping from `membership_selection_required` to `organization_selection_required`. Leave `no_active_membership -> doctor_workspace_membership_required` and the existing role/management projection unchanged.
- [ ] In `apps/webapp/src/app-layer/guards/requireRole.ts:183-193`, `apps/webapp/src/app-layer/guards/requireRole.ts:208-223`, `apps/webapp/src/app-layer/guards/requireRole.ts:225-243`, and `apps/webapp/src/app-layer/guards/requireRole.ts:245-271`, delete the optional selection option from all four exported workspace/management guards and call the resolver without an organization argument. Rewrite the clinic-management comment so it says the sole active staff membership is resolved; remove all mention of a selected organization.
- [ ] Keep role checks, `adminMode`, management-capability checks, redirects, principal stamping, and patient guards unchanged (`apps/webapp/src/app-layer/guards/requireRole.ts:183-205`, `apps/webapp/src/app-layer/guards/requireRole.ts:225-271`).
- [ ] Do not change the direct resolver callers that already pass only `platformUserId`: analytics at `apps/webapp/src/app/app/doctor/analytics/page.tsx:41-44` and best-effort session principal resolution at `apps/webapp/src/app-layer/principal/sessionPrincipal.ts:30-51`.

### 6.3 Tests: delete the imagined UX and prove the hard error

- [ ] In `apps/webapp/src/modules/organization-membership/service.test.ts:65-114`, replace the three multi-selection tests with one test that supplies two active memberships and expects rejection with `multiple_active_staff_memberships`. Keep the zero-membership, single-membership, role capability, and member-directory tests unchanged.
- [ ] In `apps/webapp/src/app-layer/guards/requireRole.doctorWorkspaceContext.test.ts:80-119` and `apps/webapp/src/app-layer/guards/requireRole.doctorWorkspaceContext.test.ts:221-260`, remove selection arguments and assert the resolver receives only `{ platformUserId }`.
- [ ] In `apps/webapp/src/app-layer/guards/requireRole.doctorWorkspaceContext.test.ts:166-183`, delete the 409 selection-response test and replace it with a test that makes the resolver reject with `new Error("multiple_active_staff_memberships")`, then asserts `requireDoctorWorkspaceApiContext()` rejects with that same error. This proves “hard and loud,” not a silent 403/409 conversion.
- [ ] In `apps/webapp/src/app-layer/guards/requireRole.doctorWorkspaceContext.test.ts:351-368`, delete the selected cross-org membership test. Do not replace it with a selector test.
- [ ] In each staff-route denial fixture below, replace `organization_selection_required`/409 with `doctor_workspace_membership_required`/403. These tests only prove guard-response propagation and must not preserve a nonexistent selector state:
  - doctor routes: `apps/webapp/src/app/api/doctor/clients/[userId]/warmup-schedule/route.test.ts:110`, `apps/webapp/src/app/api/doctor/clients/[userId]/symptom-trackings/route.test.ts:75`, `apps/webapp/src/app/api/doctor/clients/[userId]/block/route.test.ts:52`, `apps/webapp/src/app/api/doctor/clients/[userId]/supplementary-contacts/route.test.ts:115`, `apps/webapp/src/app/api/doctor/clients/[userId]/archive/route.test.ts:76`, `apps/webapp/src/app/api/doctor/clients/[userId]/booking-profile/route.test.ts:57`;
  - patient-management routes under the doctor workspace: `apps/webapp/src/app/api/doctor/patients/[userId]/files/route.test.ts:73`, `apps/webapp/src/app/api/doctor/patients/[userId]/payments/route.test.ts:61`, `apps/webapp/src/app/api/doctor/patients/[userId]/payment-timeline/route.test.ts:61`, `apps/webapp/src/app/api/doctor/patients/[userId]/acquiring-charge/route.test.ts:61`, `apps/webapp/src/app/api/doctor/patients/[userId]/route.test.ts:59`, `apps/webapp/src/app/api/doctor/patients/[userId]/physical/route.test.ts:59`, `apps/webapp/src/app/api/doctor/patients/[userId]/appointments/route.test.ts:33`, `apps/webapp/src/app/api/doctor/patients/[userId]/fio/route.test.ts:59`, `apps/webapp/src/app/api/doctor/patients/[userId]/diagnosis-catalog/route.test.ts:61`, `apps/webapp/src/app/api/doctor/patients/[userId]/visits/route.test.ts:62`, `apps/webapp/src/app/api/doctor/patients/[userId]/comorbidities/route.test.ts:61`;
  - admin routes: `apps/webapp/src/app/api/admin/audit-log/route.test.ts:87`, `apps/webapp/src/app/api/admin/audit-log/resolve/route.test.ts:95`, `apps/webapp/src/app/api/admin/users/[userId]/profile/route.test.ts:136`, `apps/webapp/src/app/api/admin/operator-incidents/resolve-all/route.test.ts:102`, `apps/webapp/src/app/api/admin/health-failure-archive/clear/route.test.ts:145`.

### 6.4 Live planning docs: remove the future-selector contract

- [ ] In `docs/_TODO/SAAS_FOUNDATION/P0_2_MEMBERSHIP_RESOLVER_CHECKLIST.md:44-87`, remove `selectedOrganizationId`, both selection result variants, the dormant future-switcher rationale, and the “multiple memberships require selection” behavior. Replace them with the one-staff-login/one-active-membership rule and the exact `multiple_active_staff_memberships` hard error.
- [ ] In `docs/_TODO/SAAS_FOUNDATION/P0_2_MEMBERSHIP_RESOLVER_CHECKLIST.md:173-179`, remove guard mappings for both selection reasons and state that duplicate active staff memberships propagate as a data-integrity failure.
- [ ] In `docs/_TODO/SAAS_FOUNDATION/T0_2_REQUEST_PRINCIPAL_CONTEXT_PLAN.md:94-100`, delete the instruction to handle `membership_selection_required`; state that the resolver must never select a first/default membership and instead throws on duplicates.
- [ ] Do not rewrite historical audit/log files solely to erase old facts. The live contract is the service plus the two planning documents above.

### 6.5 Checks

- [ ] Run `pnpm --dir apps/webapp test src/modules/organization-membership/service.test.ts src/app-layer/guards/requireRole.doctorWorkspaceContext.test.ts`.
- [ ] Run `pnpm --dir apps/webapp typecheck`.
- [ ] Run targeted ESLint: `pnpm exec eslint apps/webapp/src/modules/organization-membership/service.ts apps/webapp/src/modules/organization-membership/service.test.ts apps/webapp/src/app-layer/guards/requireRole.ts apps/webapp/src/app-layer/guards/requireRole.doctorWorkspaceContext.test.ts`.
- [ ] Run `rg -n 'membership_selection_required|selected_membership_not_found|selectedOrganizationId' apps/webapp/src/modules/organization-membership apps/webapp/src/app-layer/guards docs/_TODO/SAAS_FOUNDATION/P0_2_MEMBERSHIP_RESOLVER_CHECKLIST.md docs/_TODO/SAAS_FOUNDATION/T0_2_REQUEST_PRINCIPAL_CONTEXT_PLAN.md` and require zero matches.
- [ ] Run `rg -n 'organization_selection_required' apps/webapp/src/app/api --glob '*.test.ts'` and require zero matches. Do not require a repository-wide zero: the patient organization resolver has a separate multi-organization product contract at `apps/webapp/src/modules/patient-organization/service.ts:6-18` and is out of scope.

### 6.6 MUST NOT change

- [ ] Do not change patient enrollment/organization selection, public booking organization selection, organization membership tables, invitation SQL, signup provisioning, or any RLS wall (`apps/webapp/src/modules/patient-organization/service.ts:6-18`, `deploy/postgres/organization-member-invites-rls.sql:104-150`, `deploy/postgres/specialist-owner-provisioning-rls.sql:52-67`).
- [ ] Do not add a uniqueness migration or a new invite-acceptance check in R3. This stage removes the resolver/guard/UX mechanism and loudly exposes invalid existing data; write-time enforcement would be a separate additive DB change, which this deletion stage does not authorize.

## 7. Item 1 — restore tenant-agnostic media worker and add claim invariant

### 7.1 Runtime principal deletion

- [ ] In `apps/media-worker/src/runMediaWorkerSql.ts:5-12`, delete imports used only by the optional organization wrapper: `createDbOrganizationPrincipal`, `runWithDbPrincipal`, and `runWithDbOrganizationPrincipal`. In `apps/media-worker/src/runMediaWorkerSql.ts:73-85`, delete `runWithOptionalMediaWorkerOrganizationPrincipal` in full. Keep `runWithMediaWorkerInfraPrincipal` unchanged (`apps/media-worker/src/runMediaWorkerSql.ts:65-71`).
- [ ] In `apps/media-worker/src/processTranscodeJob.ts:6-8`, remove `buildDbPrincipalApplyOptionsFromEnv` if it becomes unused. In `apps/media-worker/src/processTranscodeJob.ts:25-27`, replace the optional organization helper import with `runWithMediaWorkerInfraPrincipal`.
- [ ] In `apps/media-worker/src/processTranscodeJob.ts:229-243`, delete the locked-mode missing-org check and the optional organization wrapper. Restore the function body to `runWithMediaWorkerInfraPrincipal("media-worker:process-transcode-job", () => processTranscodeJobInner(ctx, job))`. Keep all FFmpeg, S3, status, retry, and duration logic below `apps/media-worker/src/processTranscodeJob.ts:245` unchanged.
- [ ] In `apps/media-worker/src/withClient.ts:18-36`, change the `organization` case from allowed to a locked-mode rejection with the exact message `DB organization principal is not allowed on media-worker pool in locked mode`. Keep `media-worker:tick` as the sole allowed locked infra source (`apps/media-worker/src/withClient.ts:12-27`). Do not add `media-worker:process-transcode-job` to the allowed set: production processing is nested under the tick infra principal (`apps/media-worker/src/workerTick.ts:23-48`), and `runWithMediaWorkerInfraPrincipal` preserves an existing infra principal (`apps/media-worker/src/runMediaWorkerSql.ts:65-71`).
- [ ] Do not remove generic organization-aware transaction support from `runMediaWorkerSql`; it is not the process principal selector and is retained from the pre-regression model (`apps/media-worker/src/runMediaWorkerSql.ts:37-63`). Locked media-worker checkout now rejects organization principals before DB access through `apps/media-worker/src/withClient.ts:39-48`.

### 7.2 The only allowed addition: exact claim-time invariant and quarantine behavior

Modify only `claimNextJob` in `apps/media-worker/src/jobs/claim.ts:42-103` as follows:

- [ ] Change the locked candidate SELECT at `apps/media-worker/src/jobs/claim.ts:46-53` to select `j.id`, `j.organization_id AS job_organization_id`, and `mf.organization_id AS media_organization_id` from `media_transcode_jobs AS j LEFT JOIN media_files AS mf ON mf.id = j.media_id`. Preserve pending/due ordering and use `FOR UPDATE OF j SKIP LOCKED LIMIT 1` so only the job row is locked.
- [ ] Immediately after reading the candidate and before marking it processing, validate: both organization IDs are non-null/non-empty and exactly equal. Use ordinary TypeScript string comparison after null checks; do not use `COALESCE`, a default organization, or a context-derived organization.
- [ ] On missing or mismatched organization, quarantine the locked job in the same transaction with one parameterized UPDATE: set `status = 'failed'`, increment `attempts`, set `locked_at = now()`, set `locked_by = $2`, set `last_error = 'organization_invariant_violation'`, set `next_attempt_at = NULL`, set `processing_started_at = NULL`, set `finished_at = now()`, and set `updated_at = now()` for `id = $1::uuid AND status = 'pending'`. Commit and return `null`. Do not read or update any other product table, do not log organization IDs, and do not retry a quarantined invariant violation.
- [ ] On a valid equal pair, replace the current UPDATE at `apps/media-worker/src/jobs/claim.ts:59-80` with a job-only UPDATE. Delete the `FROM media_files` clause and delete `organization_id = COALESCE(...)`; leave `organization_id` unchanged, set the existing processing/lock/timestamp fields, increment attempts, and return the existing `ClaimedJob` fields.
- [ ] Preserve rollback/release behavior at `apps/media-worker/src/jobs/claim.ts:81-103`. A race that produces no updated row still rolls back and returns `null`; SQL errors still roll back and rethrow.

This invariant replaces the weaker claim-time backfill. Organization ID remains job audit metadata; it is not converted into a worker tenant principal.

### 7.3 Runtime tests

- [ ] In `apps/media-worker/src/jobs/claim.test.ts:38-67`, update the successful-claim mock to return both candidate organization fields, assert the SELECT contains `LEFT JOIN media_files`, `FOR UPDATE OF j SKIP LOCKED`, and assert the claim UPDATE does not contain `COALESCE` or assign `organization_id`.
- [ ] In `apps/media-worker/src/jobs/claim.test.ts:69-89`, delete “preserves missing organization as dormant no-op context.” Add table-driven cases for (a) null job organization, (b) null media organization, and (c) unequal non-null organizations. Each case must assert: returned job is `null`; quarantine SQL contains `status = 'failed'` and the stable `organization_invariant_violation` marker; parameters contain only job ID and worker ID; transaction commits; no processing UPDATE runs.
- [ ] Keep and adapt the no-job and concurrent-race tests at `apps/media-worker/src/jobs/claim.test.ts:20-36` and `apps/media-worker/src/jobs/claim.test.ts:91-104`; do not weaken rollback assertions.
- [ ] In `apps/media-worker/src/processTranscodeJob.principal.test.ts:27-72`, replace the organization-principal assertion with a test that calls `processTranscodeJob` inside `runWithMediaWorkerInfraPrincipal("media-worker:tick", ...)` and asserts every DB observation sees `kind === "infra"`, source `media-worker:tick`, and no organization ID. Keep the post-call context-cleanup assertion.
- [ ] In `apps/media-worker/src/processTranscodeJob.principal.test.ts:74-105`, delete the locked missing-org process test. Missing/mismatch rejection now belongs exclusively to claim tests; do not recreate it in the processor.
- [ ] In `apps/media-worker/src/withClient.test.ts:19-39`, add organization to `rejectedLockedDbPrincipals` using the existing `runWithDbOrganizationPrincipal`, and expect `DB organization principal is not allowed on media-worker pool in locked mode`. Keep shadow-mode transaction/cleanup tests such as `apps/media-worker/src/withClient.test.ts:84-108`; they test generic connection cleanup, not the locked worker principal model.
- [ ] Keep `apps/media-worker/src/runMediaWorkerSql.test.ts:20-80` unless imports become unused after checker cleanup. It tests the generic SQL chokepoint in unset/shadow organization context; it must no longer be cited as proof that the media processor uses an organization principal.

### 7.4 Remove every checker that pins the invented principal; replace only with owner-model invariants

- [ ] In `docs/_TODO/SAAS_FOUNDATION/scripts/check-c4-scheduler-media-cron-fanout.mjs:235-342`, delete all required fragments for `COALESCE`, `runWithOptionalMediaWorkerOrganizationPrincipal`, locked missing-org processor failure, organization-principal process tests, and organization-principal documentation. Require instead: enqueue stamps `organizationId: media.organization_id`; claim source contains the explicit job/media equality check and `organization_invariant_violation`; processor uses `runWithMediaWorkerInfraPrincipal("media-worker:process-transcode-job"`; locked media pool rejects an organization principal; the principal test asserts infra/tick context.
- [ ] In the C4 self-test at `docs/_TODO/SAAS_FOUNDATION/scripts/check-c4-scheduler-media-cron-fanout.mjs:420-449`, delete mutations of the optional organization helper/source. Add two negative mutations: one removes/breaks the claim equality invariant and one removes/breaks the processor infra wrapper. The self-test must fail on each mutation and pass only when both owner-model protections exist.
- [ ] In `docs/_TODO/SAAS_FOUNDATION/scripts/check-t0-4-media-worker-org.mjs:7-16`, keep the historical filename but update its file set only as needed for claim, processor, and locked-pool tests. At `docs/_TODO/SAAS_FOUNDATION/scripts/check-t0-4-media-worker-org.mjs:55-94`, delete requirements for `COALESCE`, dormant null context, the optional organization wrapper, and organization-principal executor tests. Require the enqueue stamp, the exact equality/quarantine invariant, the infra processor wrapper, and locked organization-principal rejection. Update its `--self-test` at `docs/_TODO/SAAS_FOUNDATION/scripts/check-t0-4-media-worker-org.mjs:97-108` to prove it detects removal of the enqueue stamp and the claim invariant.
- [ ] In `docs/_TODO/SAAS_FOUNDATION/scripts/check-b4-locked-runtime-wiring.mjs:326-328`, delete the media-process `runWithOptionalMediaWorkerOrganizationPrincipal` assertion in full. Do not replace it in B4; media-worker behavior is owned by the C4/T0 checks above. Keep all other B4 checks unchanged.

### 7.5 Correct live documentation that the checkers read

- [ ] In `docs/_TODO/SAAS_FOUNDATION/SAAS_C4_SCHEDULER_MEDIA_CRON_FANOUT.md:28-39`, rewrite only the media-worker row: enqueue is tenant-filtered; claim requires non-null equal job/media organizations and quarantines violations; processing runs as infra/`app_worker`; job organization remains audit metadata. Delete the claimed-org principal, locked missing-org processor, and legacy missing-org fallback statements.
- [ ] In `docs/_TODO/SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md:25`, replace the `COALESCE`/optional-organization description with enqueue stamping plus claim equality/quarantine plus infra processing. At `docs/_TODO/SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md:31-34`, state that the media worker is the explicit exception to tenant-principal worker processing because it is a narrow tenant-agnostic dispatcher.
- [ ] Keep the canonical architecture statement unchanged: `docs/_TODO/SAAS_FOUNDATION/TENANT_ISOLATION_ARCHITECTURE.md:12-18`, `docs/_TODO/SAAS_FOUNDATION/TENANT_ISOLATION_ARCHITECTURE.md:23-30`, and `docs/_TODO/SAAS_FOUNDATION/TENANT_ISOLATION_ARCHITECTURE.md:39-51` already specify enqueue filtering plus narrow infra workers.

### 7.6 Checks

- [ ] Run focused media tests:
  `pnpm --dir apps/media-worker test src/jobs/claim.test.ts src/processTranscodeJob.principal.test.ts src/withClient.test.ts src/runMediaWorkerSql.test.ts src/workerTick.test.ts` (`apps/media-worker/package.json:6-12`).
- [ ] Run `pnpm --dir apps/media-worker typecheck` (`apps/media-worker/package.json:8-12`).
- [ ] Run targeted ESLint:
  `pnpm exec eslint apps/media-worker/src/jobs/claim.ts apps/media-worker/src/jobs/claim.test.ts apps/media-worker/src/processTranscodeJob.ts apps/media-worker/src/processTranscodeJob.principal.test.ts apps/media-worker/src/runMediaWorkerSql.ts apps/media-worker/src/withClient.ts apps/media-worker/src/withClient.test.ts`.
- [ ] Run `pnpm run check:saas-c4-scheduler-media-cron-fanout`; the script includes syntax, positive, and self-test gates (`package.json:52`).
- [ ] Run `node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-t0-4-media-worker-org.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-t0-4-media-worker-org.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-t0-4-media-worker-org.mjs --self-test`.
- [ ] Run `node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-b4-locked-runtime-wiring.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-b4-locked-runtime-wiring.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-b4-locked-runtime-wiring.mjs --self-test`.
- [ ] Run `rg -n 'runWithOptionalMediaWorkerOrganizationPrincipal|media-worker:optional-organization-principal' apps/media-worker/src docs/_TODO/SAAS_FOUNDATION/scripts docs/_TODO/SAAS_FOUNDATION/SAAS_C4_SCHEDULER_MEDIA_CRON_FANOUT.md docs/_TODO/SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md` and require zero matches.
- [ ] Run `rg -n 'organization_id = COALESCE\(j\.organization_id, mf\.organization_id\)' apps/media-worker/src docs/_TODO/SAAS_FOUNDATION/scripts docs/_TODO/SAAS_FOUNDATION/SAAS_C4_SCHEDULER_MEDIA_CRON_FANOUT.md docs/_TODO/SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md` and require zero matches.
- [ ] Run `git diff --exit-code -- deploy/postgres/phase4-app-worker-narrow-rls.sql packages/db-principal/src/index.ts apps/webapp/src/infra/repos/pgMediaTranscodeJobs.ts` to prove the kept security model did not move.

### 7.7 MUST NOT change

- [ ] Do not edit tenant-filtered enqueue or its tests except if a checker reference requires no source edit; keep the readable-media check and `organizationId: media.organization_id` (`apps/webapp/src/infra/repos/pgMediaTranscodeJobs.ts:24-38`, `apps/webapp/src/infra/repos/pgMediaTranscodeJobs.ts:51-69`).
- [ ] Do not edit the narrow `app_worker` RLS exception, role grants, or FORCE/ENABLE walls (`deploy/postgres/phase4-app-worker-narrow-rls.sql:1-24`, `deploy/postgres/phase4-app-worker-narrow-rls.sql:53-67`).
- [ ] Do not alter `organization` principal behavior globally; other processes may legitimately use it. The contradiction is the media worker selecting it, not the shared implementation at `packages/db-principal/src/index.ts:555-592`.
- [ ] Do not grant the worker access to any table beyond `media_files` and `media_transcode_jobs`; the existing wall intentionally limits the surface to those two tables (`deploy/postgres/phase4-app-worker-narrow-rls.sql:12-17`, `deploy/postgres/phase4-app-worker-narrow-rls.sql:53-63`).
- [ ] Do not add a schema migration or change the Drizzle column in this stage. Claim-time non-null/equality validation is the only new runtime invariant; existing migration audit already detects nulls and parent mismatches in historical data (`apps/webapp/db/drizzle-migrations/0152_p0_4_p7_reminders_media_org.sql:723-753`, `apps/webapp/db/drizzle-migrations/0152_p0_4_p7_reminders_media_org.sql:755-772`).

## 8. Final static gate, review, and commits

Run only after executable items 4, 2, and 1 are individually green:

- [ ] Run every DB-free command listed in sections 5.2, 6.5, and 7.6 once; do not substitute a DB-backed smoke test.
- [ ] Run `git diff --check`.
- [ ] Run `git diff --stat` and verify the executable implementation is net-deleting or approximately neutral outside the one claim invariant. Any new abstraction, selector, policy framework, or migration is a stop condition.
- [ ] Inspect `git diff --name-only` and verify every changed file is named in sections 5, 6, or 7. Item 3 files from section 4.4 must not appear.
- [ ] Confirm no DB, service, environment, deploy, or production command was run. Record the production-copy DB-state check as not run because the plan forbids DB access (`docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs:208-218`).
- [ ] Commit items 4 and 2 together only after their checks pass. Commit item 1 separately after all media checks pass. Use path-limited `git add -- <explicit paths>` and do not push.
- [ ] Leave item 3 and its three owner-decision boxes unchecked in the handoff. Report the exact unanswered choices from section 4.3; do not claim R3 fully complete until the owner authorizes a separate `be_organizations` wall/capability stage.

## 9. Definition of done for the executable R3 cut

- [ ] No staff resolver, guard, live plan, or staff-route test exposes organization selection; duplicate active staff memberships throw `multiple_active_staff_memberships` (`apps/webapp/src/modules/organization-membership/service.ts:50-73`).
- [ ] No media runtime or checker selects `runWithOptionalMediaWorkerOrganizationPrincipal`; locked media-worker checkout rejects organization principals (`apps/media-worker/src/runMediaWorkerSql.ts:65-85`, `apps/media-worker/src/withClient.ts:18-48`).
- [ ] Claim succeeds only when job and media organization IDs are both present and equal; missing/mismatch rows become terminal failed quarantine records with `organization_invariant_violation` (`apps/media-worker/src/jobs/claim.ts:42-103`).
- [ ] Enqueue stamping, audit metadata, the narrow two-table `app_worker` wall, and every other RLS wall remain unchanged (`apps/webapp/src/infra/repos/pgMediaTranscodeJobs.ts:24-69`, `deploy/postgres/phase4-app-worker-narrow-rls.sql:1-24`).
- [ ] Production-copy static inventory is 163 and includes migrations 0179/0180 without weakening the strict artifact (`docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-prod-copy-db-state.mjs:15-18`, `docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs:47-50`).
- [ ] Item 3 is explicitly not done and carries the three owner decisions; no blanket `be_organizations` wall was introduced (`docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs:134-180`).
