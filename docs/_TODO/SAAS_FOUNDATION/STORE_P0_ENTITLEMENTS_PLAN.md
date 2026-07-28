# Store P0 — entitlement foundation (dormant, backward-compatible)

> **Статус:** historical P0 checklist, не текущий product plan. Реализованные schema/resolver facts переиспользуются,
> но product defaults, конечный mechanic list и `manual tariff / no billing` заменены
> [`../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md`](../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md)
> и [`SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`](./SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md).

> **2026-07-27 checkbox pass (owner canon `BACKLOG_CONSOLIDATION_2026-07-26.md` §6.3).** Was: 14 open boxes
> counted as live backlog despite this file's own header calling it a historical checklist. Now: all 14 marked
> `- [-]` ✅ done — this file duplicates the P0 scope that `STORE_EXECUTION_PLAN.md`'s own P0 section already
> ticked `[x]` (commits `c1f07c130`, `52d99299b`); verified again directly against current code (`modules/org-
entitlements/{types,ports,service}.ts`, `deploy/postgres/store-p0-entitlements-rls.sql`, migration
> `0180_store_entitlements.sql`, `service.test.ts` re-run 24/24 green 2026-07-27). Why: a second file tracking
> the same shipped work as open was double-counting dead backlog.

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

- [-] ~~`saas_tariffs`: id uuid pk, name text, description text, price_minor int NULL, currency text NULL,
  mechanics jsonb NOT NULL default '{}' (map mechanic→bool; absent key = default enabled), is_active bool default true,
  created_at/updated_at. Platform-global (no org). Owned by global admin.~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ, коммит `c1f07c130` ("P0 entitlement foundation — tariffs + per-org overrides (dormant)"); таблица в migration `apps/webapp/db/drizzle-migrations/0180_store_entitlements.sql` + `deploy/postgres/store-p0-entitlements-rls.sql`; зафиксировано done в `STORE_EXECUTION_PLAN.md:31-32`.
- [-] ~~`be_organizations.tariff_id uuid NULL references saas_tariffs(id) ON DELETE SET NULL`.~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ, тот же коммит `c1f07c130`, `STORE_EXECUTION_PLAN.md:31`.
- [-] ~~`saas_org_entitlement_overrides`: id uuid pk, organization_id uuid NOT NULL references be_organizations(id)
  ON DELETE CASCADE, mechanic text NOT NULL, enabled bool NOT NULL, created_at/updated_at; UNIQUE(organization_id, mechanic).~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ, `c1f07c130`, `deploy/postgres/store-p0-entitlements-rls.sql`, `STORE_EXECUTION_PLAN.md:31`.
- [-] ~~RLS (match the enforce walls): `saas_org_entitlement_overrides` FORCE RLS, policy = staff-in-own-org
  (`app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()`), same idiom as
  be_specialists. `saas_tariffs` = global read for staff (grants; global-admin write via app layer). Grants for
  app_staff (+ app_patient read of the resolved-entitlement only if the patient app ever needs it — NOT now).
  Deploy overlay in deploy/postgres/ if SECURITY DEFINER accessors are needed for any pre-session read (likely none
  in P0 — entitlement reads happen under a staff/org principal).~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `deploy/postgres/store-p0-entitlements-rls.sql` (FORCE RLS, org-scoped policy). Ownership evolved beyond the plan's "app_staff write": a dedicated `app_platform_settings` principal now owns commercial writes (`deploy/postgres/c5a-platform-operations-runtime.sql`), same isolation effect.

## Resolver (module `modules/org-entitlements`; do NOT collide with existing content `modules/entitlements`)

- [-] ~~`MECHANICS` constant + `OrgMechanic` type.~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ, коммит `52d99299b`; эволюционировало в `apps/webapp/src/modules/org-entitlements/types.ts:10-27` (`MECHANIC_REGISTRY`, `OrgMechanic`, `MECHANICS`).
- [-] ~~port `OrgEntitlementsPort`: `getTariffForOrg(orgId)`, `listOverrides(orgId)`.~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `apps/webapp/src/modules/org-entitlements/ports.ts:16-29` (`getTariffForOrg`, `listOverrides`, plus later `getSnapshot`/`getEffectiveCommercialAccess`/`getEnforcedQuotaUsage`).
- [-] ~~`resolveOrgEntitlements(orgId): Record<OrgMechanic, boolean>` = for each mechanic:
  override.enabled ?? tariff.mechanics[mechanic] ?? **true** (default-on = dormant/backward-compat).~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `apps/webapp/src/modules/org-entitlements/service.ts:164` (`resolveOrgEntitlements`).
- [-] ~~`isMechanicEnabled(orgId, mechanic)` convenience.~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `service.ts:184-189`.
- [-] ~~Pure unit tests of the resolution precedence (override > tariff > default-true).~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `apps/webapp/src/modules/org-entitlements/service.test.ts` (precedence cases incl. "lets an organization override win over an assigned tariff", "does not leak an override from organization A into organization B"); re-run live 2026-07-27 via `npx vitest run src/modules/org-entitlements/service.test.ts` → 24 passed (24).

## Backward-compat / dormancy (must not break the live tenant)

- [-] ~~Existing clinic (Точка Здоровья) + demo clinics have tariff_id NULL → resolver returns ALL enabled. No route
  is gated in P0. Verified: app behaves identically after migration.~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ, зафиксировано `STORE_EXECUTION_PLAN.md:34` ("Verified live: org-A staff sees own override, org-B sees 0 (isolation); precedence proven. Dormant.") и `STORE_EXECUTION_PLAN.md:40` (P1.a regression: "default 200").

## Verification (live, against reality)

- [-] ~~Migration applies clean to bersoncarebot_test (idempotent-safe); tables + column + RLS present.~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `0180_store_entitlements.sql` applied; `STORE_EXECUTION_PLAN.md:32` cites the applied deploy overlay + drizzle migration as done.
- [-] ~~psql: as app_staff in org A, insert an override + assign a tariff; `resolveOrgEntitlements` reflects
  override>tariff>default. Cross-org: org B cannot see A's overrides (RLS).~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `STORE_EXECUTION_PLAN.md:34` ("org-A staff sees own override, org-B sees 0 (isolation); precedence proven").
- [-] ~~App unchanged: demo-clinic-a login + /app/doctor + patients still 200 (no regression).~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `STORE_EXECUTION_PLAN.md:40` (P1.a: "Verified live: default 200 → override off 403 (A) → B 200 → restore 200").
- [-] ~~typecheck + targeted tests green. Full CI once, at the end of the store initiative (not per step).~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ (targeted-tests part): `service.test.ts` 24/24 green, re-run live 2026-07-27. Не проверено отдельно в рамках этой разметки: сам процессный пункт "Full CI once at the end" — это правило процесса, а не факт состояния, и full CI здесь не гонялся.

## NOT in P0 (later phases)

P1 `requireEntitlement(mechanic)` gating chokepoint; P2 global-admin tariff constructor UI + assign-to-clinic;
P3 admin-curated exercise packages; P4 per-clinic analytics; P5 tenant billing + branding/custom-domain.
