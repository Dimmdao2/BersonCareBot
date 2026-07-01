# Roadmap to SaaS

This document links the hardened tenancy foundation to the broader product path from the current single-clinic app to a paid multi-organization SaaS.

## Current point
- Runtime is a single production clinic on one PostgreSQL database with `public` + `integrator` schemas.
- Identity is already global enough for channels: `platform_users`, channel bindings, merge, trusted phone/email access-tier.
- Booking, payments, memberships, products, entitlements and patient/doctor PWA surfaces exist, but they are not yet packaged as self-service SaaS lifecycle.
- `SAAS_FOUNDATION/CORRECTED_PLAN.md` v9 is the canonical tenant-isolation plan.
- `DB_ACCESS_CHOKEPOINT_INITIATIVE` is the hard prerequisite before SAAS code starts.

## Product direction: SaaS-capable one-codebase path

The default product strategy is **not** to split BersonCareBot into a separate SaaS product early.
Develop the working product in one stream and lay SaaS-capable mechanisms underneath it:

- keep current single-clinic behavior unchanged until an explicit cutover stage;
- add dormant organization/tenant metadata to new scoped tables when the domain naturally belongs
  to a clinic, specialist, patient enrollment, catalog asset, product, tariff, package, payment, or
  settings surface;
- keep branding as configuration, not a hard fork: the likely first commercial shape is an upper
  tier with optional white-label branding for a specialist or clinic;
- keep feature packaging as entitlements/capability bundles, not separate apps: examples are store,
  tariffs, courses/products, media/storage, integrations, analytics, and staff seats;
- avoid duplicated SaaS route trees or copied screens. Prefer data-driven variants, settings,
  entitlements, and app-layer adapters.

This means the SaaS foundation is infrastructure and data-shape preparation first. A separate repo,
branch family, or product shell is only justified when there is a real operational boundary: separate
env/secrets, domains, deploys, tenant onboarding, billing, white-label assets, support processes, or
region/legal isolation.

## Table and feature design while SaaS is dormant

For new work before full SaaS execution:

- If a new table stores clinical, patient-facing, doctor-facing, booking, payment, product,
  catalog, messaging, notification-preference, media, or settings data that will belong to an
  organization later, design it with an explicit organization path from the start:
  `organization_id` directly when ownership is obvious, or a documented service-layer path through
  an already scoped parent when direct denormalization would be redundant.
- Do not add RLS policies or tenant enforcement ad hoc before `DB_ACCESS_CHOKEPOINT` and the
  canonical `SAAS_FOUNDATION` stage reach that point.
- Do not move integration secrets to env for tenant needs. Tenant/org integration settings remain
  DB-backed and must evolve from the existing `system_settings` rule.
- If the ownership model is uncertain, record the decision in the feature docs/backlog instead of
  inventing a parallel "SaaS" table.
- Keep migrations backward-compatible for the single-clinic production path: nullable/dormant fields,
  deterministic default organization backfills, and CI invariants before enforcement.

## Related plans and how to treat them
| Document | Status | Relation to SaaS |
|---|---|---|
| `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/MASTER_PLAN.md` | TODO, blocking | Must run first. Creates the interceptable DB access trunk needed for request/process tenant principal and later RLS. |
| `docs/_TODO/SAAS_FOUNDATION/CORRECTED_PLAN.md` | hardened v9 | Technical tenant foundation: organizations, enrollments, scoped rows, RLS, org-aware settings, isolation fixtures. |
| `docs/ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md` | canonical | Defines global person/access-tier. Do not mix access-tier with product/tenant lifecycle. |
| `docs/OPERATIONS/SPECIALIST_IDENTITY_CONSOLIDATION.md` | operational prerequisite for clean seed | Supports deterministic solo-specialist seed (`518e…`) and prevents duplicate specialist drift. |
| `.cursor/plans/archive/own_booking_stage5_prepayment_payments.plan.md` | completed | Payment layer exists, but real provider rollout and merchant/account model remain later SaaS work. |
| `.cursor/plans/archive/own_booking_stage6_memberships.plan.md` | completed | Membership/package primitives exist and are already organization-aware in that domain. |
| `.cursor/plans/archive/own_booking_stage7_products_courses.plan.md` | completed | Product/entitlement primitives exist; useful for SaaS monetization, marketplace, and course access. |
| `docs/COURSES_INITIATIVE/README.md` | strawman/deferred | Course engine/product catalog is later product monetization, not a blocker for tenant foundation. |
| `docs/PRODUCT_PLATFORM_INITIATIVE/README.md` | deferred/cancelled for now | Mass/patient mode and product-status resolver are not part of foundation; revisit after product lines and funnels exist. |
| `docs/TODO_NOT_NOW/product-platform-mass-patient.md` | deferred trigger card | Use as revisit gate for mass/lead/customer UX, not as a current implementation plan. |
| `docs/archive/FULL_DEV_PLAN_DONE/PLANS/STAGE_20_MULTITENANT/PLAN.md` | superseded | Old tenant/payment sketch. Keep only as history; shared-DB + RLS in SAAS_FOUNDATION supersedes application-only filtering. |
| `docs/ARCHITECTURE/FULL PLATFORM MODEL.md` | concept | Product vision input for mass content, SOS, lessons, diaries; not a technical execution plan. |

## Roadmap

### R0 — DB access chokepoint
Goal: every DB access path goes through a guarded, interceptable process trunk.

Deliverables:
- raw SQL out of modules/app-layer/routes into sanctioned infra paths;
- `withClient`/`withTransaction` and named process pool providers;
- single `system_settings` accessor and grep guard;
- CI guards for raw SQL, `.connect()`, `new Pool`, and settings bypasses;
- coverage report proving no unlisted DB access path remains.

Exit gate: `DB_ACCESS_CHOKEPOINT_INITIATIVE` DoD complete and CI green.

### R1 — Dormant tenant foundation
Goal: add tenant data model and isolation metadata with zero behavior change.

Source: `CORRECTED_PLAN.md` Phase 0 micro-stage spine.

Deliverables:
- `be_organization_members` and `org_enrollments`;
- deterministic single-org seed and specialist mapping;
- `organization_id`/declared paths for all SCOPED rows from `tiers-218.tsv`;
- bridge/backfill for integrator SCOPED rows;
- org-aware `system_settings` storage and mirror;
- RLS descriptors and GUC-gated permissive policies;
- CI invariants over the 219 artifact universe.

Exit gate: dormant mode unchanged; every SCOPED row is resolvable to org; P0.10 invariants green.

Merge policy: R1 can be merged into the active product branch once it is purely dormant, CI-green,
and backed by reversible/default-safe migrations. It should not change visible behavior, routing,
branding, delivery channels, access decisions, or runtime settings for the existing clinic.

### R2 — Tenant-context cutover
Goal: make all runtime reads/writes carry a tenant principal, then flip enforcement in controlled environments.

Deliverables:
- request and process tenant principal set through the chokepoint;
- non-bypass app DB role validated in prod-parity environment;
- staging shadow-run for wrong-org/empty-org/unenforced cases;
- RLS enforcement flip plan and rollback;
- doctor/admin gates use membership, not implicit single-clinic assumptions.

Exit gate: synthetic two-org tests prove org wall and patient wall under non-bypass role; single-clinic prod behavior remains stable.

Merge policy: keep R2 behind explicit flags/GUC and prod-parity shadow checks. Merge into the active
product branch only while enforcement remains off for production. Merge to `main` only after the
single-clinic path is proven unchanged and rollback is documented.

### R3 — Organization lifecycle and admin UX
Goal: a second organization can exist as an operational object without manual SQL.

Deliverables:
- create/suspend/archive organization flow;
- owner/admin/doctor/assistant membership management;
- invite/accept flow for staff;
- branch/room/specialist setup for a new org;
- tenant-scoped settings and integration setup screens;
- org switcher for users with multiple memberships;
- support/admin tooling to inspect tenant health without PII leaks.

Exit gate: operator can provision a test clinic end-to-end and onboard staff without code changes.

### R4 — Patient enrollment and cross-org rules
Goal: a person can belong to multiple organizations without identity duplication or data leaks.

Deliverables:
- explicit patient enrollment lifecycle: invite, active, discharged, archived;
- patient org switcher or scoped context for multi-org patients;
- transfer/copy policy for clinical data and tenant catalog assets;
- visibility policy (`all` vs assigned specialists) decided and implemented if needed;
- audit trail for enrollment changes.

Exit gate: same `platform_users` person can be active in two orgs with separated clinical data and correct channel delivery.

### R5 — Commercial SaaS packaging
Goal: sell and operate the platform as a clinic SaaS or upper-tier white-label product, not only as
an internal multi-tenant app.

Deliverables:
- SaaS plans/quotas: staff seats, patients, storage, media minutes, channels, per-org bot/integration availability;
- optional white-label branding: organization logo/name/colors/public surfaces, gated by plan;
- capability bundles: store, tariffs, courses/products, advanced analytics, integrations, staff roles;
- billing account per organization, invoices, payment provider/merchant decision, tax/legal fields;
- subscription lifecycle: trial, active, past_due, suspended, cancelled;
- entitlement gates for SaaS features;
- per-org usage metering and admin dashboards.

Notes:
- Existing booking payments/products/memberships help with patient-facing commerce, but SaaS billing is a separate organization-facing domain.
- Integration secrets stay in DB-backed settings, not env.

Exit gate: a clinic or specialist can subscribe to a plan, enable optional branding and bundles, be
limited by plan, and be suspended without breaking other organizations or the original clinic.

### R6 — Marketplace, courses, and product platform revisit
Goal: unlock scalable product revenue beyond clinic operations.

Deliverables:
- marketplace/store model for global sellable library products;
- purchase/copy flow into tenant-owned catalogs;
- tariff/package model for optional product capabilities and sellable bundles;
- course engine decisions from `COURSES_INITIATIVE`;
- product-status/mass-mode revisit only after content/product lines justify it;
- marketing funnels, public pages, referrals and analytics by tenant/source.

Exit gate: tenant can buy/import content products, sell patient products, and report conversion without cross-tenant data sharing.

### R7 — Multi-region and localization
Goal: prepare for non-RU locales and region/cell split.

Deliverables:
- ru-only i18n scaffold first, then en activation;
- region/cell directory and routing policy;
- data residency policy for EU/RU;
- backups, exports, deletion, DPA/GDPR operational process;
- per-region integrations/providers where needed.

Exit gate: second region can be provisioned as a controlled cell with tenant directory routing and documented operational boundaries.

## Key gaps found in the plan
- The technical foundation is strong, but it is not the full SaaS business roadmap. Organization lifecycle, SaaS billing, quotas, tenant support tooling, legal/compliance/export/deletion and self-service onboarding are later roadmaps.
- `DB_ACCESS_CHOKEPOINT` must complete first. Without it, SAAS P0/T0 turns back into a broad DB-access refactor.
- `PRODUCT_PLATFORM` and `COURSES` should remain deferred until R5/R6. Pulling them into R1/R2 would mix tenant isolation with monetization UX.
- Real payment provider selection is still not solved for SaaS organization billing. Existing payment stage is useful but patient/booking-oriented.

## When to merge SaaS preparation into active branches

Use three gates, not a calendar date:

1. **Safe to merge into `feat/doctor-ui-rebuild`:** after each R0/R1 micro-stage that is dormant,
   has backward-compatible migrations, keeps single-clinic behavior unchanged, and passes targeted
   checks plus the relevant DB-access/tenant invariants. This keeps the active product from drifting
   away from the foundation and avoids a painful late merge.
2. **Safe to merge into `main`:** only after the same dormant stage is CI-green and has a clear
   production rollout/rollback note. Prefer small dormant schema/access increments over a large
   end-of-project merge.
3. **Not safe to merge broadly yet:** R2 enforcement, R3 tenant admin UX, R5 billing/branding, and
   any feature that changes visible behavior, auth decisions, integration delivery, settings
   semantics, or tenant-specific branding. Those need flags, staging/prod-parity validation, and an
   explicit owner go/no-go.

In short: merge **dormant foundations early and often**; merge **active SaaS behavior only at the
controlled cutover stages**.
