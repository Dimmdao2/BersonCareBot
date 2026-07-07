# P0.2 Membership Resolver And Doctor Workspace Contract

Purpose: close the smallest useful SaaS/doctor-UI contract so `codex/saas-roadmap-foundation`
can continue tenant-engine work while `feat/doctor-ui-rebuild` can continue multi-specialist UI work
without guessing organization/member semantics.

This checklist extends the canonical P0.2 spine in `CORRECTED_PLAN.md`. It does not start P0.3
enrollments, P0.4 broad `org_id` rollout, RLS, billing, org lifecycle, invites, or UI redesign.

## Current Baseline

- `public.be_organization_members` exists and is seeded for the current single organization.
- `modules/organization-membership/ports.ts` defines the read-only `OrganizationMembershipPort`.
- `infra/repos/pgOrganizationMembership.ts` implements read-only lookup by platform user.
- Current generic doctor gates:
  - `app-layer/guards/requireRole.ts`:
    - `requireDoctorAccess()` returns `AppSession` for RSC/pages.
    - `requireDoctorApiSession()` returns `{ ok, session }` for API routes.
  - `modules/auth/requireAdminMode.ts` checks `role === "admin"`.
- Booking-engine doctor/admin gates still resolve the default organization:
  - `app/api/doctor/booking-engine/_requireDoctorBookingEngine.ts`
  - `app/api/admin/booking-engine/_requireAdminBookingEngine.ts`
- `app/app/doctor/layout.tsx` is the natural RSC entry point for a doctor workspace context.
- `modules/doctor-cabinet/service.ts` is still a placeholder and can receive the stable workspace contract later.
- Existing `booking-catalog` specialists are appointment/catalog specialists. Do not treat them as staff membership rows.

## Shared Contract Terms

### Organization Membership Roles

Source of truth: `modules/organization-membership/ports.ts`.

- `owner`
- `admin`
- `doctor`
- `assistant`

Initial permission interpretation for P0.2:

- `owner` / `admin`: may manage organization-wide doctor workspace surfaces.
- `doctor`: may work as one bound specialist when `specialistId !== null`.
- `assistant`: recognized membership role, but no broad management permission until an owner decision defines assistant powers.

### Resolution Input

The resolver should accept:

```ts
type ResolveOrganizationForUserInput = {
  platformUserId: string;
  selectedOrganizationId?: string | null;
};
```

`selectedOrganizationId` is dormant for the current single-clinic app, but it prevents a future UI org switcher
from inventing a different contract.

### Resolution Result

Use a discriminated union instead of throwing for expected access outcomes:

```ts
type OrganizationResolution =
  | {
      ok: true;
      context: {
        membershipId: string;
        organizationId: string;
        platformUserId: string;
        role: OrganizationMembershipRole;
        specialistId: string | null;
        canManageOrganization: boolean;
        canManageAllSpecialists: boolean;
      };
    }
  | { ok: false; reason: "no_active_membership" }
  | { ok: false; reason: "membership_selection_required"; organizationIds: string[] }
  | { ok: false; reason: "selected_membership_not_found" };
```

Behavior:

- Zero active memberships: `no_active_membership`.
- One active membership and no selection: resolve it.
- Multiple active memberships and no selection: `membership_selection_required`; do not silently pick the first org.
- Selection provided: resolve only if the selected organization is one of the user's active memberships.
- `canManageOrganization` and `canManageAllSpecialists` are `true` only for `owner` / `admin`.

## P0.2.2 — Resolver Service

Goal: implement `resolveOrganizationForUser` inside the module layer, over the existing port.

Allowed scope:

- `apps/webapp/src/modules/organization-membership/service.ts`
- `apps/webapp/src/modules/organization-membership/service.test.ts`
- Narrow additive type exports in `apps/webapp/src/modules/organization-membership/ports.ts`.
- `docs/_TODO/SAAS_FOUNDATION/LOG.md`
- `docs/_TODO/SAAS_FOUNDATION/README.md` status line after completion.

Forbidden:

- No imports from `@/infra/db/*` or `@/infra/repos/*` inside `modules/organization-membership`.
- No route/page changes.
- No `buildAppDeps` wiring.
- No migrations or DB writes.
- No dev/prod DB reads.
- No UI changes.

Implementation checklist:

- [ ] Export resolver input/result types from module-owned files.
- [ ] Implement `createOrganizationMembershipService({ membershipPort })`.
- [ ] Implement `resolveOrganizationForUser(input)`.
- [ ] Keep resolver deterministic and side-effect free.
- [ ] Preserve strict TypeScript; no `any`.
- [ ] Unit-test zero memberships.
- [ ] Unit-test one active membership.
- [ ] Unit-test multiple active memberships without selection.
- [ ] Unit-test selected organization success.
- [ ] Unit-test selected organization not found.
- [ ] Unit-test permission flags for `owner`, `admin`, `doctor`, `assistant`.

Local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/organization-membership/service.test.ts --reporter verbose && pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp exec eslint src/modules/organization-membership/ports.ts src/modules/organization-membership/service.ts src/modules/organization-membership/service.test.ts"
git diff --check
```

Definition of Done:

- Resolver tests are green.
- Module isolation invariant holds for `modules/organization-membership`.
- `LOG.md` records checks and skipped scope.
- Commit is local unless this is the agreed sync checkpoint.

## P0.2.3 — App-Layer Doctor/Admin Gate Wiring

Goal: introduce organization-aware doctor workspace access without broad route churn.

Allowed scope:

- `apps/webapp/src/app-layer/guards/requireRole.ts`
- `apps/webapp/src/app-layer/guards/*.test.ts`
- `apps/webapp/src/app-layer/di/buildAppDeps.ts`
- `apps/webapp/src/infra/repos/pgOrganizationMembership.ts`
- `apps/webapp/src/infra/repos/inMemoryOrganizationMembership.ts`
- `apps/webapp/src/app/api/doctor/booking-engine/_requireDoctorBookingEngine.ts`
- `apps/webapp/src/app/api/admin/booking-engine/_requireAdminBookingEngine.ts`
- Focused tests for the touched gates:
  - `apps/webapp/src/app-layer/guards/requireRole.doctorWorkspaceContext.test.ts`
  - `apps/webapp/src/app/api/doctor/booking-engine/_requireDoctorBookingEngine.test.ts`
  - `apps/webapp/src/app/api/admin/booking-engine/_requireAdminBookingEngine.test.ts`
- Initiative docs/log.

Forbidden:

- Do not change the return type of `requireDoctorAccess()` or `requireDoctorApiSession()` in a way that forces broad call-site churn.
- Do not rewrite all doctor routes.
- Do not add ESLint allowlist entries.
- Do not use default organization fallback in newly organization-aware gates once resolver wiring is available.
- No RLS/GUC context yet.
- No UI org switcher yet.

Implementation checklist:

- [ ] Add an in-memory membership port for Vitest/build fallback.
- [ ] Wire `organizationMembership` service into `buildAppDeps()`.
- [ ] Add an app-layer helper for RSC/page contexts, for example `requireDoctorWorkspaceContext()`.
- [ ] Add an app-layer helper for API contexts, for example `requireDoctorWorkspaceApiContext()`.
- [ ] Keep existing role-only gates backward compatible.
- [ ] Map resolver outcomes to RSC redirects or API responses:
  - `no_active_membership` -> forbidden / access denied.
  - `membership_selection_required` -> forbidden or explicit `organization_selection_required`.
  - `selected_membership_not_found` -> forbidden.
- [ ] Replace `bookingEngine.organization.getDefaultOrganizationId()` in doctor/admin booking-engine gates with resolved `organizationId`.
- [ ] Add `membershipRole`, `membershipId`, `specialistId`, and permission flags to the new gate context.
- [ ] Preserve current single-clinic behavior in tests.

Local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app-layer/guards/requireRole.doctorWorkspaceContext.test.ts src/app-layer/guards/requireRole.doctorStaffAccess.test.ts src/app/api/doctor/booking-engine/_requireDoctorBookingEngine.test.ts src/app/api/admin/booking-engine/_requireAdminBookingEngine.test.ts --reporter verbose && pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp exec eslint src/app-layer/guards/requireRole.ts src/app-layer/guards/requireRole.doctorWorkspaceContext.test.ts src/app-layer/guards/requireRole.doctorStaffAccess.test.ts src/app-layer/di/buildAppDeps.ts src/infra/repos/inMemoryOrganizationMembership.ts src/app/api/doctor/booking-engine/_requireDoctorBookingEngine.ts src/app/api/admin/booking-engine/_requireAdminBookingEngine.ts"
git diff --check
```

Definition of Done:

- Current doctor/admin single-clinic gate behavior remains unchanged for seeded users.
- New organization-aware context is available to later doctor UI work.
- Booking-engine staff gates no longer use default org when a resolved membership context exists.
- No broad route migration happened.

## P0.2.4 — Doctor Workspace UI Contract

Goal: provide a stable UI-facing context for parallel doctor UI work, without redesigning screens.

Allowed scope:

- `apps/webapp/src/modules/doctor-workspace/types.ts`
- `apps/webapp/src/app/app/doctor/layout.tsx`
- `apps/webapp/src/shared/ui/doctor/shell/DoctorWorkspaceShell.tsx`
- Initiative docs/log.

Forbidden:

- No sidebar/navigation redesign.
- No large doctor page refactor.
- No persisted org selection.
- No new DB tables.
- No client-side authorization decisions.

Stable context shape:

```ts
type DoctorWorkspaceContext = {
  organizationId: string;
  organizationName: string | null;
  membershipId: string;
  membershipRole: OrganizationMembershipRole;
  specialistId: string | null;
  canManageOrganization: boolean;
  canManageAllSpecialists: boolean;
  selectedSpecialistId: string | null;
};
```

Rules:

- `selectedSpecialistId` defaults to `specialistId` for bound doctors.
- `selectedSpecialistId` may be `null` for admin/owner clinic-wide views.
- UI may display this context, but authorization remains server-side.
- `organizationName` can be `null` until a read port for organization metadata is added; do not fake names.

Implementation checklist:

- [ ] Define and export `DoctorWorkspaceContext`.
- [ ] Build context from the P0.2.3 gate context in `app/app/doctor/layout.tsx`.
- [ ] Pass only stable display-safe fields to `DoctorWorkspaceShell`.
- [ ] Keep existing shell rendering unchanged unless a prop is needed.
- [ ] Document which fields UI may rely on for multi-specialist work.
- [ ] Keep tests focused on changed behavior; do not add broad page snapshots.

Local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp exec eslint src/modules/doctor-workspace src/app/app/doctor/layout.tsx src/shared/ui/doctor/shell/DoctorWorkspaceShell.tsx"
git diff --check
```

Definition of Done:

- Doctor UI has one documented context type for org/member/specialist state.
- Existing layout still renders in single-clinic mode.
- No UI page starts making tenant decisions independently.

## P0.2.5 — Read-Only Organization Specialist/Member Listing

Goal: provide the minimum read model for multi-specialist UI controls.

Allowed scope:

- `apps/webapp/src/modules/organization-membership/ports.ts`
- `apps/webapp/src/modules/organization-membership/service.ts`
- `apps/webapp/src/infra/repos/pgOrganizationMembership.ts`
- `apps/webapp/src/infra/repos/inMemoryOrganizationMembership.ts`
- `apps/webapp/src/app/api/doctor/workspace/directory/route.ts`
- `apps/webapp/src/app/api/doctor/workspace/directory/route.test.ts`
- Focused tests for repo/service/route.
- Initiative docs/log.

Forbidden:

- No invite/create/update/deactivate member flows.
- No specialist CRUD.
- No booking-catalog rewrite.
- No writes to `be_organization_members`.
- No dev/prod DB reads in tests.
- Do not print names/phones/emails from dev DB.

Read model:

```ts
type DoctorWorkspaceSpecialist = {
  id: string;
  fullName: string;
  isActive: boolean;
  isCurrentUserSpecialist: boolean;
};

type DoctorWorkspaceMember = {
  membershipId: string;
  platformUserId: string;
  role: OrganizationMembershipRole;
  specialistId: string | null;
  status: OrganizationMembershipStatus;
  displayName: string | null;
};
```

Rules:

- Specialists come from `be_specialists` scoped by `organizationId`.
- Members come from `be_organization_members` scoped by `organizationId`.
- `booking-catalog` specialists stay separate unless a route explicitly needs appointment catalog data.
- Admin/owner may receive all active specialists.
- Bound doctor receives only their own bound specialist in P0.2.5. Broader display for peer specialists requires a later explicit permission decision.

Implementation checklist:

- [x] Add read-only port methods for organization-scoped memberships.
- [x] Add read-only specialist listing for the workspace read model, either in the same module or a clearly named `doctor-workspace` module.
- [x] Keep joins minimal and typed; use Drizzle for new queries where possible.
- [x] Add service-level filtering based on `DoctorWorkspaceContext`.
- [x] Add `GET /api/doctor/workspace/directory` for client-side UI controls.
- [x] Route must use the P0.2.3 organization-aware API gate.
- [x] Unit-test admin/owner sees all active specialists.
- [x] Unit-test doctor-bound context defaults to own specialist.
- [x] Unit-test no writes are exposed.

Local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/organization-membership/service.test.ts src/infra/repos/pgOrganizationMembership.test.ts src/app/api/doctor/workspace/directory/route.test.ts --reporter verbose && pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp exec eslint src/modules/organization-membership src/infra/repos/pgOrganizationMembership.ts src/infra/repos/inMemoryOrganizationMembership.ts src/app/api/doctor/workspace/directory/route.ts src/app/api/doctor/workspace/directory/route.test.ts"
git diff --check
```

Definition of Done:

- UI has a read-only source for current organization specialists/members.
- No write or invite surface was introduced.
- Server-side gates remain the source of access control.

## P0.2 Sync Checkpoint

Run this after P0.2.2-P0.2.5 are complete and committed locally.

Checklist:

- [x] Review `git diff origin/codex/saas-roadmap-foundation...HEAD`.
- [x] Confirm `rg` shows no new module imports from `@/infra/db` or `@/infra/repos` in non-test module files.
- [x] Confirm no new ESLint allowlist entries.
- [x] Confirm no migrations were added unless explicitly justified.
- [x] Run phase-level webapp checks through the wrapper:

```bash
bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp run lint && pnpm --dir apps/webapp test -- src/modules/organization-membership src/app-layer/guards src/app/api/doctor/workspace"
```

- [x] If remote push is required at this checkpoint, follow the repository pre-push policy once, not after every micro-stage.
- [x] Fast-forward or merge `codex/saas-roadmap-foundation` into `feat/doctor-ui-rebuild`.
- [x] Verify both branch refs point to the same commit after sync.

Parallel-safe exit criteria:

- `resolveOrganizationForUser` is the only membership resolver.
- Doctor/admin gate context exposes resolved `organizationId`.
- Doctor UI has a stable `DoctorWorkspaceContext`.
- Doctor UI has read-only specialist/member data for current organization.
- Single-clinic behavior remains unchanged.
- No RLS/enforcement/broad org columns have started in P0.2.
