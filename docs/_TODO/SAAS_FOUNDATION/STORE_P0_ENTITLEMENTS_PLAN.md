# Store P0 — entitlement foundation (dormant, backward-compatible)

> **Статус:** historical P0 checklist, не текущий product plan. Реализованные schema/resolver facts переиспользуются,
> но product defaults, конечный mechanic list и `manual tariff / no billing` заменены
> [`../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md`](../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md)
> и [`SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`](./SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md).

Owner model (2026-07-13): **tariff → entitlements (per-mechanic toggles) → clinic**; prices + inclusions are
ADMIN-CONFIGURED DATA. Decisions: no real billing yet (admin manually assigns tariff); tariff sets defaults + PER-CLINIC
OVERRIDE; full per-mechanic constructor; store packages admin-curated only. Build SELF/Sol, NOT Codex. Adversarial
audit before "done".

P0 scope = the load-bearing data + resolver ONLY. **Dormant: zero behavior change** — nothing is gated yet (that is
P1 `requireEntitlement`). Enforcement OFF; every org resolves to ALL-mechanics-enabled until a tariff is assigned AND
P1 lands.

## Canonical mechanic list (single source of truth, code constant)
`booking`, `exercise_catalog`, `exercise_packages`, `courses`, `cms_pages`, `files`, `patient_card`,
`subscriptions` (абонементы), `payments`, `mailings`, `patient_app`, `patient_app_paid_subscription`, `branding`,
`custom_domain`. (Extendable; TS union is the source of truth; a new mechanic defaults to enabled until a tariff
excludes it.)

## Schema (drizzle migration, dormant + RLS under enforce)
- [ ] `saas_tariffs`: id uuid pk, name text, description text, price_minor int NULL, currency text NULL,
      mechanics jsonb NOT NULL default '{}' (map mechanic→bool; absent key = default enabled), is_active bool default true,
      created_at/updated_at. Platform-global (no org). Owned by global admin.
- [ ] `be_organizations.tariff_id uuid NULL references saas_tariffs(id) ON DELETE SET NULL`.
- [ ] `saas_org_entitlement_overrides`: id uuid pk, organization_id uuid NOT NULL references be_organizations(id)
      ON DELETE CASCADE, mechanic text NOT NULL, enabled bool NOT NULL, created_at/updated_at; UNIQUE(organization_id, mechanic).
- [ ] RLS (match the enforce walls): `saas_org_entitlement_overrides` FORCE RLS, policy = staff-in-own-org
      (`app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()`), same idiom as
      be_specialists. `saas_tariffs` = global read for staff (grants; global-admin write via app layer). Grants for
      app_staff (+ app_patient read of the resolved-entitlement only if the patient app ever needs it — NOT now).
      Deploy overlay in deploy/postgres/ if SECURITY DEFINER accessors are needed for any pre-session read (likely none
      in P0 — entitlement reads happen under a staff/org principal).

## Resolver (module `modules/org-entitlements`; do NOT collide with existing content `modules/entitlements`)
- [ ] `MECHANICS` constant + `OrgMechanic` type.
- [ ] port `OrgEntitlementsPort`: `getTariffForOrg(orgId)`, `listOverrides(orgId)`.
- [ ] `resolveOrgEntitlements(orgId): Record<OrgMechanic, boolean>` = for each mechanic:
      override.enabled ?? tariff.mechanics[mechanic] ?? **true** (default-on = dormant/backward-compat).
- [ ] `isMechanicEnabled(orgId, mechanic)` convenience.
- [ ] Pure unit tests of the resolution precedence (override > tariff > default-true).

## Backward-compat / dormancy (must not break the live tenant)
- [ ] Existing clinic (Точка Здоровья) + demo clinics have tariff_id NULL → resolver returns ALL enabled. No route
      is gated in P0. Verified: app behaves identically after migration.

## Verification (live, against reality)
- [ ] Migration applies clean to bersoncarebot_test (idempotent-safe); tables + column + RLS present.
- [ ] psql: as app_staff in org A, insert an override + assign a tariff; `resolveOrgEntitlements` reflects
      override>tariff>default. Cross-org: org B cannot see A's overrides (RLS).
- [ ] App unchanged: demo-clinic-a login + /app/doctor + patients still 200 (no regression).
- [ ] typecheck + targeted tests green. Full CI once, at the end of the store initiative (not per step).

## NOT in P0 (later phases)
P1 `requireEntitlement(mechanic)` gating chokepoint; P2 global-admin tariff constructor UI + assign-to-clinic;
P3 admin-curated exercise packages; P4 per-clinic analytics; P5 tenant billing + branding/custom-domain.
