# Store P0 — entitlement foundation (dormant, backward-compatible)

> **Статус:** historical P0 checklist, не текущий product plan. Реализованные schema/resolver facts переиспользуются,
> но product defaults, конечный mechanic list и `manual tariff / no billing` заменены
> [`../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md`](../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md).
> **Форвард (2026-08-05):** магазин упражнений —
> [`EXERCISE_STORE_PLAN.md`](./EXERCISE_STORE_PLAN.md). P0 entitlements к витрине/авторам не относится.
> **Форвард-ссылка (2026-08-01, tariff-plan-triage):** актуальный текущий план тарифов/entitlements/квот —
> [`TARIFFS_PAYMENTS_ADMIN_PLAN.md`](./TARIFFS_PAYMENTS_ADMIN_PLAN.md) §5a; биллинг/оплата — отдельно
> [`SAAS_BILLING_PLAN.md`](./SAAS_BILLING_PLAN.md). Старая ссылка на архивированный
> `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` снята — тот файл сам архивирован и сам форвардит на
> `TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a. Единственный оставшийся здесь открытый пункт («typecheck + targeted tests
> green» для P0-кода 2026-07-19) поглощён последующими полными зелёными прогонами CI, задокументированными в
> `TARIFFS_PAYMENTS_ADMIN_PLAN.md` пункте 7.1 (`pnpm run ci`, код возврата 0, 31.07) — P0-код с тех пор прошёл
> многократный typecheck/test цикл, не потерян и не завис.

> **2026-07-27 checkbox pass, corrected 2026-07-29.** Thirteen shipped P0 facts are `[x]` with durable commit or
> symbol/heading evidence below. The verified implementation commits `c1f07c130` and `52d99299b` remain the
> historical anchors. The combined typecheck/test gate remains `[ ]`: this clone has no installed dependencies,
> so the correction pass could not reproduce it.

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

- [x] `saas_tariffs`: id uuid pk, name text, description text, price_minor int NULL, currency text NULL,
  mechanics jsonb NOT NULL default '{}' (map mechanic→bool; absent key = default enabled), is_active bool default true,
  created_at/updated_at. Platform-global (no org). Owned by global admin. — commit `c1f07c130`; `apps/webapp/db/drizzle-migrations/0180_store_entitlements.sql` §`CREATE TABLE IF NOT EXISTS saas_tariffs` — «mechanics jsonb DEFAULT '{}'::jsonb NOT NULL».
- [x] `be_organizations.tariff_id uuid NULL references saas_tariffs(id) ON DELETE SET NULL`. — commit `c1f07c130`; `apps/webapp/db/drizzle-migrations/0180_store_entitlements.sql` §`ALTER TABLE be_organizations` — «ADD COLUMN IF NOT EXISTS tariff_id uuid REFERENCES saas_tariffs(id) ON DELETE SET NULL».
- [x] `saas_org_entitlement_overrides`: id uuid pk, organization_id uuid NOT NULL references be_organizations(id)
  ON DELETE CASCADE, mechanic text NOT NULL, enabled bool NOT NULL, created_at/updated_at; UNIQUE(organization_id, mechanic). — commit `c1f07c130`; `apps/webapp/db/drizzle-migrations/0180_store_entitlements.sql` §`CREATE TABLE IF NOT EXISTS saas_org_entitlement_overrides` — «CONSTRAINT saas_org_entitlement_overrides_org_mechanic_uidx UNIQUE (organization_id, mechanic)».
- [x] RLS (match the enforce walls): `saas_org_entitlement_overrides` FORCE RLS, policy = staff-in-own-org
  (`app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()`), same idiom as
  be_specialists. `saas_tariffs` = global read for staff (grants; global-admin write via app layer). Grants for
  app_staff (+ app_patient read of the resolved-entitlement only if the patient app ever needs it — NOT now).
  Deploy overlay in deploy/postgres/ if SECURITY DEFINER accessors are needed for any pre-session read (likely none
  in P0 — entitlement reads happen under a staff/org principal). — commit `c1f07c130`; `deploy/postgres/store-p0-entitlements-rls.sql` §`saas_org_entitlement_overrides_org_read` — «ALTER TABLE public.saas_org_entitlement_overrides FORCE ROW LEVEL SECURITY»; `deploy/postgres/c5a-platform-operations-runtime.sql` §`saas_org_entitlement_overrides_platform_operations` — «FOR ALL TO app_platform_settings USING (true) WITH CHECK (true)».

## Resolver (module `modules/org-entitlements`; do NOT collide with existing content `modules/entitlements`)

- [x] `MECHANICS` constant + `OrgMechanic` type. — commit `52d99299b`; `apps/webapp/src/modules/org-entitlements/types.ts` §`MECHANIC_REGISTRY` / `OrgMechanic` / `MECHANICS` — «export type OrgMechanic = keyof typeof MECHANIC_REGISTRY;»; «export const MECHANICS = Object.keys(MECHANIC_REGISTRY) as OrgMechanic[];».
- [x] port `OrgEntitlementsPort`: `getTariffForOrg(orgId)`, `listOverrides(orgId)`. — `apps/webapp/src/modules/org-entitlements/ports.ts` §`OrgEntitlementsPort` — «getTariffForOrg(»; «listOverrides(».
- [x] `resolveOrgEntitlements(orgId): Record<OrgMechanic, boolean>` = for each mechanic:
  override.enabled ?? tariff.mechanics[mechanic] ?? **true** (default-on = dormant/backward-compat). — commit `52d99299b`; `apps/webapp/src/modules/org-entitlements/service.ts` §`resolveOrgEntitlements` — «export async function resolveOrgEntitlements(».
- [x] `isMechanicEnabled(orgId, mechanic)` convenience. — commit `52d99299b`; `apps/webapp/src/modules/org-entitlements/service.ts` §`isMechanicEnabled` — «export async function isMechanicEnabled(».
- [x] Pure unit tests of the resolution precedence (override > tariff > default-true). — commit `52d99299b`; `apps/webapp/src/modules/org-entitlements/service.test.ts` §`resolveOrgEntitlements` — «lets an organization override win over an assigned tariff»; «does not leak an override from organization A into organization B».

## Backward-compat / dormancy (must not break the live tenant)

- [x] Existing clinic (Точка Здоровья) + demo clinics have tariff_id NULL → resolver returns ALL enabled. No route
  is gated in P0. Verified: app behaves identically after migration. — commits `52d99299b`, `530cb2bbd`; `STORE_EXECUTION_PLAN.md` §P0 — «Verified live: org-A staff sees own override, org-B sees 0 (isolation); precedence proven. Dormant.»

## Verification (live, against reality)

- [x] Migration applies clean to bersoncarebot_test (idempotent-safe); tables + column + RLS present. — commit `c1f07c130`; `STORE_EXECUTION_PLAN.md` §P0 — «deploy/postgres/store-p0-entitlements-rls.sql (applied to test) + drizzle schema + migration 0180.»
- [x] psql: as app_staff in org A, insert an override + assign a tariff; `resolveOrgEntitlements` reflects
  override>tariff>default. Cross-org: org B cannot see A's overrides (RLS). — `STORE_EXECUTION_PLAN.md` §P0 — «Verified live: org-A staff sees own override, org-B sees 0 (isolation); precedence proven. Dormant.»
- [x] App unchanged: demo-clinic-a login + /app/doctor + patients still 200 (no regression). — commit `530cb2bbd`; `STORE_EXECUTION_PLAN.md` §P1.a — «Verified live: default 200 → override off 403 (A) → B 200 → restore 200.»
- [ ] typecheck + targeted tests green.

Full CI once, at the end of the store initiative (not per step).

## NOT in P0 (later phases)

P1 `requireEntitlement(mechanic)` gating chokepoint; P2 global-admin tariff constructor UI + assign-to-clinic;
P3 admin-curated exercise packages; P4 per-clinic analytics; P5 tenant billing + branding/custom-domain.
