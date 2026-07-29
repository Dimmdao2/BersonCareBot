# UX-03 — Independent capability architecture/security review

**Дата:** 2026-07-15
**Scope:** product operating model and future `ROLE_CAPABILITY_MATRIX`; no implementation or DB changes.
**Verdict:** **CONDITIONAL PASS for synthesis.** The repository already has a sound tenant/identity spine for the
matrix, but the final matrix must not be called settled until the owner rulings in §9 are resolved. In particular,
assistant access, clinic-wide history, handoff semantics and entitlement degradation cannot be inferred from current
routes or market patterns.

## 1. Reviewed canon and current implementation

Product/discovery inputs:

- [`REQUIREMENTS.md`](./REQUIREMENTS.md), [`ROADMAP.md`](../../archive/2026-07-plans/SAAS_PRODUCT_UX_INITIATIVE/ROADMAP.md);
- [`UX02_PRODUCT_PATTERNS.md`](./UX02_PRODUCT_PATTERNS.md),
  [`UX02_TECHNICAL_PATTERNS.md`](./UX02_TECHNICAL_PATTERNS.md);
- [`OWNER_RULINGS_2026-07-15.md`](../SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md);
- [`PLATFORM_IDENTITY_SPECIFICATION.md`](../../ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md);
- [`00_DECISIONS_AND_SCHEMA.md`](../SAAS_FOUNDATION/00_DECISIONS_AND_SCHEMA.md),
  [`P0_2_MEMBERSHIP_RESOLVER_CHECKLIST.md`](../SAAS_FOUNDATION/P0_2_MEMBERSHIP_RESOLVER_CHECKLIST.md),
  [`T0_2_REQUEST_PRINCIPAL_CONTEXT_PLAN.md`](../SAAS_FOUNDATION/T0_2_REQUEST_PRINCIPAL_CONTEXT_PLAN.md);
- [`SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`](../SAAS_FOUNDATION/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md).

Code facts checked:

- application session roles are only `client | doctor | admin` in
  [`shared/types/session.ts`](../../../apps/webapp/src/shared/types/session.ts);
- organization membership roles are independently `owner | admin | doctor | assistant` in
  [`organization-membership/ports.ts`](../../../apps/webapp/src/modules/organization-membership/ports.ts);
- the membership resolver returns exactly one active staff organization and throws
  `multiple_active_staff_memberships` otherwise in
  [`organization-membership/service.ts`](../../../apps/webapp/src/modules/organization-membership/service.ts);
- the current workspace context exposes organization, membership role, optional specialist binding and coarse
  `canManageOrganization` / `canManageAllSpecialists` flags in
  [`requireRole.ts`](../../../apps/webapp/src/app-layer/guards/requireRole.ts) and
  [`doctor-workspace/types.ts`](../../../apps/webapp/src/modules/doctor-workspace/types.ts);
- current client history reads first prove that the patient belongs to the resolved organization, then query by
  `(organizationId, platformUserId)` in
  [`clients/[userId]/history/route.ts`](../../../apps/webapp/src/app/api/doctor/clients/[userId]/history/route.ts);
- current entitlement mechanics are organization-level product switches, resolved separately from roles in
  [`org-entitlements/types.ts`](../../../apps/webapp/src/modules/org-entitlements/types.ts) and
  [`requireEntitlement.ts`](../../../apps/webapp/src/app-layer/guards/requireEntitlement.ts).

The current code is evidence of the foundation, not the final permission model. In particular,
`canManageAllSpecialists=true` for owner/admin is a coarse current flag; it must not be reused as an implicit grant to
all clinical record types.

## 2. Required authorization/composition order

The final operating model needs six separate layers. Collapsing any adjacent layers creates either IDOR risk or a UI
that promises actions the server cannot safely perform.

```text
canonical identity and tier
  -> staff membership OR patient enrollment/public entry contract
  -> server-derived organization and object ownership
  -> role/capability decision
  -> organization entitlement/mechanic decision
  -> permitted dataset
  -> UI composition and presentation filters
```

Rules:

1. Identity proves who acts; it does not choose an organization.
2. Membership/enrollment proves a relationship to an organization; it does not grant every action inside it.
3. Object ownership must agree with the resolved organization. Body/query/Host/slug/filter values are not authority.
4. Capability answers whether the actor may perform the action or read the record class.
5. Entitlement answers whether the organization bought/enabled the product mechanic. It cannot grant a role,
   membership, enrollment or broader clinical visibility.
6. Filters operate only on the already-authorized dataset. `Мои` and `Все` must never be authorization predicates by
   themselves.

This ordering must be visible in the final matrix. A single cell such as “owner: full access” is insufficient.

## 3. Hard invariants by actor/context

### 3.1 Global admin

- Global admin is a platform actor (`session.role=admin`, explicit platform/admin mode), not an organization owner
  with a magic organization switcher.
- Cross-organization operations require dedicated platform capabilities/ports and audit attribution. They must not be
  implemented by selecting an organization in the ordinary specialist shell, faking membership, or relying on a DB
  bypass.
- Owner ruling permits platform owner access to the whole database; the UX restriction is therefore not “data is
  technically forbidden.” The boundary is purpose and surface: platform analytics is about organizations, billing,
  usage and load, while clinical intervention must be an explicit, auditable support/operations action rather than a
  silent drill-down or impersonation.
- Platform organization list/detail, tariff construction, billing/entitlements, lifecycle, system health and repair
  queues form a separate IA surface. Global admin must not inherit routine clinical authoring merely because the
  underlying operator can access data.

### 3.2 Organization owner

- `owner` is an organization membership role, not a second global session role.
- The organization must always retain an active owner. Ownership transfer, closing/deletion, commercial terms and
  other irreversible account actions require owner-specific capabilities and stronger confirmation/audit.
- Owner may also be a specialist, but clinical capabilities require a valid specialist binding or another explicit
  clinical actor contract. Ownership alone must not create authorship or the right to sign clinical records.
- Solo owner-specialist and clinic owner-specialist can share identity and components; team, handoff, seats and
  organization-wide controls are capability-/practice-shape-driven blocks, not a duplicated product.

### 3.3 Organization admin

- `admin` may manage organization operations and may simultaneously be a bound specialist.
- Management access and clinical access remain independent. A non-specialist admin must not appear as the author of a
  visit, note, program or clinical decision.
- The final matrix must explicitly distinguish owner-only account actions from delegated organization administration;
  current `canManageOrganization` intentionally does not provide this granularity.

### 3.4 Specialist

- Specialist access is always within the one resolved staff organization and, where authorship/assignment matters,
  the bound `specialistId`.
- A specialist can see/action `own`, `assigned`, `care-team` and `organization-wide` data only through distinct
  capabilities. “Doctor role” must not be shorthand for clinic-wide clinical history.
- Authorship is historical fact. Transfer, deactivation, role changes and filters must not rewrite it.
- Solo specialist does not need empty team abstractions. Clinic specialist receives collaboration actions only when
  organization shape and capability make them real.

### 3.5 Assistant

- Assistant is a recognized membership role but currently has no broad management permission. This is a fail-closed
  baseline, not an incomplete invitation to reuse admin routes.
- Scheduling, contact/invite, payments and messaging are separate candidate capabilities. None automatically grants
  clinical notes, diagnoses, program content, full history, exports or clinical authorship.
- Until an owner ruling exists, the matrix must mark assistant clinical-history and clinical-write cells
  `needs_decision` or denied. It must not choose a permissive template from market precedent.

### 3.6 Patient, onboarding patient and public

- `client` is the application session role; access tier is independently `onboarding` or `patient`. A confirmed web
  identity may be patient without a phone, while booking can still require a trusted phone.
- Onboarding is an activation allowlist, not a limited patient dashboard. It cannot execute ordinary business actions.
- Patient identity is global, but care access is organization/resource-scoped. One patient may have multiple active
  organization enrollments without duplicate accounts.
- Public means no session. Public landing, published organization data, booking and trusted invite entry must use
  explicit public contracts; public access never implies enrollment or clinical data visibility.
- Host, branding, invite presentation and last-used organization may propose context only. The server must revalidate
  active enrollment and the target resource before data is returned.

## 4. One active staff organization invariant

The existing and owner-approved invariant is: **one staff login has exactly one active organization membership**.

- zero active memberships: deny workspace access;
- one active membership: resolve it server-side;
- more than one: loud `multiple_active_staff_memberships` integrity failure;
- a second organization requires a separate staff login; there is no staff organization switcher;
- selected specialist, URL, local storage and a custom Host cannot override resolved membership organization;
- global-admin cross-org navigation is a separate platform capability and does not weaken this invariant.

The final operating model may still support navigation between organization settings and clinical work for an
owner/admin who is also a specialist. Product labels remain **«Настройки»** and the clinical destination name; this is
navigation inside the same resolved organization, not a tenant switch and not a second authorization session.

## 5. Organization-scoped patient record and history

The strongest candidate remains one global patient identity + one enrollment per organization + one
organization-scoped patient card. Architecture can support this safely only with the following invariants:

- every clinical/history object has an organization ownership path;
- every authored object stores immutable author identity and, when applicable, specialist identity; display-name
  changes do not erase historical attribution;
- visits, notes, programs, files, messages, tasks and payments retain their own record-type visibility rules;
- history composition first intersects all applicable permissions, then sorts/groups/filters the result;
- a filter for `my`, `all available` or a named specialist can only reduce the permitted result;
- the UI must not infer that one visible visit grants access to all patient history;
- direct IDs, export, print, search, counts and previews obey the same visibility contract as the main timeline;
- the patient must be actively enrolled or covered by an explicit legally retained/read-only relationship; retention
  must not silently behave like active treatment access;
- organization A and B histories are never merged into one cross-org clinical feed merely because they share the same
  `platformUserId`.

Current `ClientTimelineItem` does not expose a normalized author/specialist or visibility descriptor for all event
types. Therefore the final matrix may define the required contract, but must record a data/API gap rather than claim
the current timeline already satisfies authored shared history.

### Required visibility dimensions

At minimum, each final history capability must state:

| Dimension             | Required values/decision                                                          |
| --------------------- | --------------------------------------------------------------------------------- |
| Organization relation | active staff membership in the same organization                                  |
| Patient relation      | active/retained enrollment and object belongs to it                               |
| Record class          | visit, note, program, file, message, payment, task, intake, audit/export          |
| Actor relation        | author, responsible specialist, care-team member, other specialist, admin/support |
| Visibility            | author-only, care-team, organization-clinical, management-only, patient-visible   |
| Operation             | list, direct read, create, amend, reassign, export, delete/archive                |
| Result shaping        | default filter and available filters after permission calculation                 |

One organization-wide boolean such as `card_visibility_policy=all|assigned` may be a coarse policy input, but cannot
replace record-class permissions or private/authored-entry rules.

## 6. Handoff model and auditability

The final matrix must not contain a generic `transfer_patient` capability. It must model four different operations:

1. change primary/responsible specialist;
2. add/remove a care-team member;
3. reassign a concrete appointment, task, program or other work item;
4. establish a new cross-organization relationship/controlled transfer.

Hard invariants:

- an in-organization handoff changes current responsibility, not patient identity, organization ownership or
  historical authorship;
- cross-organization transfer never mutates existing rows from `organization_id=A` to `B`; it requires a new
  enrollment/share/copy workflow with explicit source/destination and consent/retention rules;
- deactivating a specialist must preflight future appointments, tasks, primary assignments and care-team membership;
  authored history remains readable according to policy;
- assignment/care-team state and work-item ownership are independent; changing one must not silently change all;
- every transition is server-authorized, idempotent where retries are possible, and audit-visible.

Minimum audit event for handoff/reassignment:

```text
organization_id
patient canonical id
operation type and affected object id (when any)
old and new responsible specialist/care-team/work-item assignee
actor identity and actor membership
requested_at / accepted_at / completed_at or rejected_at
reason/category
correlation/idempotency id
```

The audit must not place clinical narrative, raw invite tokens or unrelated PII in general operational logs. The UI
must distinguish `pending`, `accepted`, `rejected`, `cancelled` and `completed` if acceptance is part of the chosen
contract.

## 7. Patient multi-organization context

- Global identity and account recovery are platform-level; clinical relationships are enrollment-level.
- The active organization must be explicit in the patient shell whenever more than one usable enrollment exists.
- A remembered/last-used organization is only a preference. On every entry it must still be active and authorized;
  otherwise route to chooser/recovery without leaking the old organization data.
- Deep links resolve the target resource first and then verify that the current patient has access to its
  organization. A manually selected context cannot open a resource from another organization.
- Notifications, messages and appointments show organization and specialist attribution so the patient knows who
  sent the item and where a reply/action goes.
- Deactivated, suspended and retained enrollments need separate states. An organization billing problem must not be
  presented as wrong patient credentials or silently delete patient history.
- A patient-facing “all activity” aggregate may summarize non-clinical navigation across organizations only if each
  item is independently authorized and clearly attributed. A combined raw clinical timeline is unsafe by default.

## 8. Entitlements and IA

Entitlements influence whether an organization can use a product mechanic; they do not answer who may use it.

Required decision order:

```text
authenticated actor
  AND valid organization relationship/context
  AND action capability
  AND enabled mechanic/grant
  => action may reach the domain service
```

Hard rules for the final matrix:

- list the relevant mechanic separately from the role capability;
- entitlement enabled + capability denied remains denied;
- capability granted + entitlement disabled produces an entitlement/recovery state, not broader fallback access;
- tariff/override from organization A never affects B;
- client-supplied organization/tariff/mechanic is never authority;
- package/content grant and general mechanic are separate checks where both apply;
- entitlement loss does not delete identity, enrollment, authored history or organization data;
- lifecycle policy must define whether each mechanic becomes hidden, read-only, grace-enabled or blocked. This is a
  product/billing decision, not something the sidebar should infer from a boolean;
- owner/admin billing and recovery surfaces remain reachable when a paid clinical mechanic is unavailable;
- global admin tariff management is a platform capability, not an entitlement belonging to the currently selected
  clinic.

Current `default true` fallback and partial route-by-route `requireEntitlement()` coverage are compatibility facts,
not the target UX contract. The final matrix must describe target enforcement and identify current coverage gaps.

## 9. Owner rulings still required

These decisions materially change data access or IA and cannot be silently settled by this review:

1. **Clinic record model:** approve one organization-scoped card as default, with explicit episodes/cases only where
   a real privacy/billing boundary exists, or require separate specialist/specialty cards.
2. **Meaning of `Мои`:** primary responsibility, care-team membership, future appointment, authored history, active
   work item, or a defined union of these.
3. **Clinic-wide history:** which roles/capabilities may request `all available`, and which record classes remain
   author-only/private even then.
4. **Assistant baseline:** exact schedule, invite/contact, messaging, payment and clinical-history capabilities;
   whether organization-defined custom templates are launch scope.
5. **Handoff launch scope:** primary specialist, care team, work-item reassignment and/or cross-org transfer.
6. **Handoff acceptance:** immediate authorized change or acceptance by destination specialist; former specialist
   visibility after completion.
7. **Owner vs admin:** owner-only irreversible/billing/ownership operations and which may be delegated.
8. **Owner/admin clinical mode:** one shell with grouped sections or explicit management/clinical mode switch.
9. **Patient multi-org default:** chooser on every login or last-used active organization with a persistent switcher.
10. **Entitlement degradation:** per mechanic, hidden vs read-only vs grace vs blocked and the recovery owner/CTA.
11. **Global-admin support intervention:** diagnostics/repair only, explicit auditable support session, or restricted
    impersonation; owner ruling permits DB access but does not yet choose the product workflow.
12. **Patient roster visibility:** full care team, current responsible specialists only, or attribution only on each
    event/object.

Until ruled, corresponding cells in `ROLE_CAPABILITY_MATRIX` must carry `needs_decision` plus the safe temporary
default (normally deny or read-only). They must not be marked “allowed by industry standard.”

## 10. Unsafe shortcuts to reject

- Map application `admin` directly to both global admin and organization owner/admin permissions.
- Use `adminMode`, platform DB access or a selected organization ID as ordinary clinic membership.
- Add a staff organization switcher or silently choose the first of multiple active memberships.
- Treat owner/admin membership as clinical authorship without a specialist binding.
- Treat `canManageAllSpecialists` as permission to read every clinical note/message/file.
- Use `specialistId`, patient ID, route path, Host, slug, local storage or query parameter as tenant authority.
- Implement `Мои / Все` by trusting a client filter or by hiding rows after an unscoped API response.
- Return counts/search suggestions/export rows from records the detailed view would deny.
- Duplicate patient identities/cards per specialist as a convenience before the record-model ruling.
- Reparent history to another specialist or organization during handoff.
- Let a custom domain, branding tier or entitlement create membership/enrollment/clinical access.
- Let an entitlement denial masquerade as a role denial or login failure.
- Let billing suspension delete or globally archive patient identity/history.
- Give assistant broad admin or doctor routes while calling it “temporary.”
- Build global-admin clinical drill-down into ordinary platform analytics without a purpose-specific audited action.

## 11. Acceptance checks for `ROLE_CAPABILITY_MATRIX`

### 11.1 Required columns

Every matrix row must identify:

1. actor/surface (`global admin`, `owner`, `admin`, `specialist`, `assistant`, `patient`, `onboarding`, `public`);
2. application session role/tier;
3. organization membership/enrollment prerequisite;
4. specialist binding/actor relation when applicable;
5. capability/action, not only screen name;
6. target object and ownership source;
7. record class and visibility level for history actions;
8. required entitlement/mechanic/grant, or `not applicable`;
9. server enforcement point/target contract;
10. UI surface and default presentation filter;
11. denied, suspended, read-only and empty states;
12. audit requirement;
13. status: `approved`, `current_fact`, `proposal`, `needs_decision`;
14. source/provenance.

### 11.2 Mandatory scenario tests

The matrix is not accepted until it can answer all of these without contradictory cells:

- zero/one/multiple active staff memberships;
- owner with and without specialist binding;
- organization admin with and without specialist binding;
- specialist A: own patient/history, clinic patient without assignment, private entry by B, permitted shared entry by B;
- assistant: schedule/contact action versus direct clinical-history URL/export;
- patient with onboarding tier, patient tier with one enrollment, patient tier with A+B enrollments, revoked B;
- direct object ID from another organization for every actor family;
- `Мои`, `Все доступные`, named-specialist filter, search/count/export parity;
- primary handoff pending/accept/reject/complete and deactivated source/destination specialist;
- care-team add/remove without deleting authorship;
- work-item reassignment without changing the entire patient relationship;
- attempted cross-org reparent versus explicit new enrollment/transfer flow;
- entitlement enabled/disabled/grace/read-only for the same otherwise-authorized actor;
- enabled mechanic but denied capability; granted capability but missing mechanic/package grant;
- global-admin organization repair versus clinical intervention, with audit actor visible;
- public/invite/custom-domain entry trying to override organization encoded in trusted server record.

### 11.3 Consistency gates

- No `allow` cell depends only on a UI filter, route prefix, Host or client-supplied organization.
- Every write has an actor, target ownership path, capability and audit rule.
- Every cross-org read/write is either explicitly platform-scoped or denied; no implicit staff crossover.
- Every clinical history row distinguishes list/direct/export behavior and private/shared record classes.
- Every management capability distinguishes owner, admin and specialist binding.
- Every entitlement-dependent screen has a recovery state and never changes authorization scope.
- All unresolved rows appear in the owner decision packet; no proposal is mislabeled as an owner ruling.

## 12. Review conclusion

UX-03 can safely synthesize an operating model around one organization account, one active staff organization per
login, composable management/clinical capabilities, global patient identity with explicit enrollments, and a
preferred organization-scoped patient card. The patient-card choice remains a proposal until ruled.

The decisive architecture constraint is separation: **relationship and scope determine where the actor may operate;
capability determines what they may do; entitlement determines whether the organization has the mechanic; filters
only shape what is already allowed.** The final role matrix should be rejected if it collapses these layers.
