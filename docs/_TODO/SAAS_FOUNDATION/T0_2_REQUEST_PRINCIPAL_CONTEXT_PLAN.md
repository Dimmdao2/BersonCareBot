# T0.2 Request Principal And Context Propagation Plan

Status: T0.2 design artifact, 2026-07-09.

T0.2 defines the central webapp contract for turning a resolved tenant source into the existing
DB principal carrier. It does not convert route families. T0.3 slices must use this contract instead
of adding ad hoc `runWithDbOrganizationPrincipal(...)` calls at arbitrary points.

## Source Facts

- `packages/db-principal/src/index.ts` stores only `organizationId` in AsyncLocalStorage and applies
  `SELECT set_config('app.org', $1, true)` inside transaction chokepoints.
- `app.patient_user_id` exists only in descriptor/smoke artifacts. Runtime code does not carry it.
- `requireDoctorWorkspaceContext` and `requireDoctorWorkspaceApiContext` already resolve a doctor/admin
  workspace `organizationId` through `organizationMembership.resolveOrganizationForUser(...)`.
- `requireAdminBookingEngine` and `requireDoctorBookingEngine` already build on the doctor workspace
  API context and pass `organizationId` to booking services.
- `requirePatientApiBusinessAccess` and `requirePatientAccessWithPhone` prove patient business access,
  but return only `AppSession`; they do not resolve a tenant organization.
- `resolvePlatformAccessContext` resolves canonical patient identity and tier, not patient enrollment org.
- Public booking currently has legacy/default-org behavior in at least one post-create merge-candidate path.
- Signed integrator-origin webapp routes authenticate the M2M boundary, but event payloads can touch rows
  owned by different organizations and must derive org per event/resource.

## Non-Goals For T0.2

- No mass route/action conversion.
- No new session shape and no org stored in auth cookie.
- No default organization fallback for tenant-scoped work.
- No patient-wall enforcement claim until the runtime carrier/API for patient/user principal is explicitly
  designed in T0.5.
- No production, dev, or test application DB writes.

## Principal Wrapper Contract

New webapp principal helpers should live in app-layer, not modules:

- `apps/webapp/src/app-layer/principal/withDoctorWorkspacePrincipal.ts`
- `apps/webapp/src/app-layer/principal/withPatientResourcePrincipal.ts`
- `apps/webapp/src/app-layer/principal/withExplicitOrganizationPrincipal.ts`

Allowed import direction:

```text
route.ts / page.tsx / actions.ts
  -> app-layer/guards or app-layer/principal
  -> modules/* service ports
  -> infra repos
```

Only app-layer/principal helpers and tightly scoped infra compatibility shims may call
`runWithDbOrganizationPrincipal` directly in new webapp code. Route handlers, pages, actions, and modules
should call a named principal helper instead.

Proposed API shape:

```ts
type PrincipalRunOptions = {
  source: string;
  allowMissingPrincipal?: false;
};

type TenantPrincipalContext = {
  organizationId: string;
  source: string;
};

async function withExplicitOrganizationPrincipal<T>(
  ctx: TenantPrincipalContext,
  fn: () => Promise<T>,
): Promise<T>;
```

`allowMissingPrincipal` must stay false for SCOPED paths. Legacy/global/telemetry paths should be classified
outside the wrapper instead of passing an empty organization.

## Doctor/Admin Workspace Rules

Source of org:

- RSC/pages/actions: `requireDoctorWorkspaceContext(...)`.
- Route handlers: `requireDoctorWorkspaceApiContext(...)`.
- Booking engine admin/doctor helpers: `requireAdminBookingEngine()` / `requireDoctorBookingEngine()`.

Wrapper shape for T0.3:

```ts
async function withDoctorWorkspacePrincipal<T>(
  workspace: DoctorWorkspaceAccessContext,
  fn: () => Promise<T>,
): Promise<T>;
```

Rules:

- Resolve workspace before entering the DB principal.
- Do not use `session.user.role` or `adminMode` as a tenant source.
- Do not choose the first/default org; duplicate active staff memberships throw `multiple_active_staff_memberships`.
- API membership denial remains 403; duplicate membership errors propagate as data-integrity failures.
- The wrapper may be added to existing workspace helpers so route families can migrate incrementally.

First T0.3 candidates:

- Existing booking engine helpers, because they already centralize org resolution.
- Server actions that already call `requireDoctorWorkspaceContext`.
- Doctor route DB-signal files from `T0_DB_ACCESS_SURFACE.md`.

## Patient Resource Rules

Patient session/tier is not enough to choose tenant. T0.3 patient slices need an explicit resource-to-org
resolver before entering the principal.

Allowed org sources:

- Treatment program instance or stage item belongs to an assigned patient/program org.
- Booking/appointment belongs to its canonical appointment org.
- Patient media/program-submission upload belongs to the target program/submission org.
- Diary/reminder/notification preference paths need an enrollment or patient-home ownership rule before
  conversion.

Forbidden org sources:

- Session role `client`.
- Patient phone, messenger binding, or canonical user id alone.
- First/default organization.
- A route pathname prefix.

Wrapper shape for T0.3:

```ts
async function withPatientResourcePrincipal<T>(
  input: {
    session: AppSession;
    resource: "program_instance" | "appointment" | "media_submission" | "patient_enrollment";
    resourceId: string;
    source: string;
  },
  fn: (ctx: TenantPrincipalContext) => Promise<T>,
): Promise<T>;
```

Open design item for T0.5:

- If patient-wall RLS must distinguish the current patient user from another patient in the same org,
  `app.org` is not enough. Do not claim patient-wall enforcement until a runtime patient/user GUC or an
  equivalent DB-side predicate contract is added and tested.

## Public/Booking Rules

Public/booking routes must derive organization from the booking surface itself:

- Public widget host/profile/link/branch-service mapping may be an org source when it maps to exactly one
  active organization.
- Existing default-org behavior is legacy compatibility only and must be classified before RLS enforcement.
- Public create may resolve or create a platform user before tenant is known, but any SCOPED booking write
  must run under a derived booking organization or stay blocked as `needs_decision`.
- Merge-candidate/audit side effects after public booking must use the same derived booking org, not a
  default org lookup.

T0.3 must not convert public booking writes until the org source is explicit in code and tests.

## M2M / Integrator-Origin Webapp Rules

Signed M2M authentication proves caller identity, not tenant identity.

Allowed org sources:

- Payload carries a trusted organization id from integrator for an event type that is declared single-org.
- Payload references a resource that can be resolved to exactly one org before scoped writes.
- Per-event handler derives org per affected row/job.

Forbidden org sources:

- M2M signature alone.
- Integrator process default org.
- Candidate user ids without resolving the target scoped resource.

Rules:

- Mixed-org events must split into per-org principal runs or remain pre-T0 legacy/global.
- Idempotency lookup/cache can stay INFRA only if its tables are classified that way and do not require org.
- Conflict/audit side effects need explicit classification: org-scoped audit under derived org, or global
  operator/security telemetry if the descriptor says INFRA/TELEMETRY.

## Wrapper Placement And Test Expectations

T0.3 wrapper implementation should include tests before route conversion:

- doctor/admin helper test: calls `runWithDbOrganizationPrincipal` with workspace org and never on denied gate;
- patient helper test: rejects missing/ambiguous resource org and never falls back to default org;
- public booking resolver test: branch/link/profile org source must be exact-one or blocked;
- M2M helper test: signed request without event/resource org does not enter principal;
- transaction smoke/fake-client test: `SELECT set_config('app.org', ...)` happens after `BEGIN` for scoped writes.

## Stage Mapping

| Stage | Use this T0.2 contract for |
|---|---|
| T0.3.1 | Doctor/admin workspace helpers and server actions |
| T0.3.2 | Patient resource-bound APIs and actions |
| T0.3.3 | Media upload/multipart/program-submission routes |
| T0.3.4 | Public booking/payment routes after org-source classification |
| T0.3.5 | Integrator-origin webapp routes |
| T0.5 | Extend carrier beyond `app.org` only if patient-wall enforcement needs it |

## Hard Stops For Later Slices

- If org source is missing, the slice is `needs_decision`; do not silently downgrade to legacy behavior.
- If a path needs scoped writes, it must use transaction-safe DB paths under the principal.
- If a route can touch multiple orgs, it must split work per org or remain unconverted.
- No service/module may import `@/infra/db/*`, `@/infra/repos/*`, or `runWithDbOrganizationPrincipal` to
  solve tenant context locally.
