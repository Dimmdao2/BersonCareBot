# Roadmap to SaaS

This document links the hardened tenancy foundation to the broader product path from the current single-clinic app to a paid multi-organization SaaS.

## Current point
- Runtime is a single production clinic on one PostgreSQL database with `public` + `integrator` schemas.
- Identity is already global enough for channels: `platform_users`, channel bindings, merge, trusted phone/email access-tier.
- Booking, payments, memberships, products, entitlements and patient/doctor PWA surfaces exist, but they are not yet packaged as self-service SaaS lifecycle.
- `SAAS_FOUNDATION/CORRECTED_PLAN.md` v9 is the canonical tenant-isolation plan.
- `DB_ACCESS_CHOKEPOINT_INITIATIVE` is the hard prerequisite before SAAS code starts.

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

### R2 — Tenant-context cutover
Goal: make all runtime reads/writes carry a tenant principal, then flip enforcement in controlled environments.

Deliverables:
- request and process tenant principal set through the chokepoint;
- non-bypass app DB role validated in prod-parity environment;
- staging shadow-run for wrong-org/empty-org/unenforced cases;
- RLS enforcement flip plan and rollback;
- doctor/admin gates use membership, not implicit single-clinic assumptions.

Exit gate: synthetic two-org tests prove org wall and patient wall under non-bypass role; single-clinic prod behavior remains stable.

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
Goal: sell and operate the platform as a clinic SaaS, not only as an internal multi-tenant app.

Deliverables:
- SaaS plans/quotas: staff seats, patients, storage, media minutes, channels, per-org bot/integration availability;
- billing account per organization, invoices, payment provider/merchant decision, tax/legal fields;
- subscription lifecycle: trial, active, past_due, suspended, cancelled;
- entitlement gates for SaaS features;
- per-org usage metering and admin dashboards.

Notes:
- Existing booking payments/products/memberships help with patient-facing commerce, but SaaS billing is a separate organization-facing domain.
- Integration secrets stay in DB-backed settings, not env.

Exit gate: a new clinic can subscribe, pay, be limited by plan, and be suspended without breaking other tenants.

### R6 — Marketplace, courses, and product platform revisit
Goal: unlock scalable product revenue beyond clinic operations.

Deliverables:
- marketplace/store model for global sellable library products;
- purchase/copy flow into tenant-owned catalogs;
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
