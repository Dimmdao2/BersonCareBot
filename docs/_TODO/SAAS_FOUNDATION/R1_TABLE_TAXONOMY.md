# R1 table taxonomy checkpoint

Status: first R1 checkpoint after R0 DB chokepoint completion and post-merge audit.

This document is the execution-facing taxonomy for the shared product. The historical derivation artifacts remain the evidence source: `scope-derivation/tiers-218.tsv`, `scope-derivation/needs-orgid-FINAL.txt`, and `CORRECTED_PLAN.md`.

## Buckets

| Bucket         |                                                                      Source tier(s) | Meaning                                                                                                                                                                         | R1 treatment                                                                                           |
| -------------- | ----------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Tenant-owned   |                                                       `SCOPED` baseline: 160 tables | Clinical/EHR, booking engine, tenant-owned catalogs, patient programs, comms, delivery logs with user keys, and scoped audit roots.                                             | Must have direct `organization_id`, declared FK path, or declared denorm path before RLS enforcement.  |
| Global catalog |                                             Part of `INFRA` / explicit future store | Shared operational catalogs and future marketplace/store inventory. Tenant-owned product libraries are not here; bought/shared libraries are copied into tenant catalogs later. | No tenant predicate unless a product decision moves the table into tenant-owned.                       |
| System         |                                         `BOOTSTRAP` 30 + `INFRA` 25 + `TELEMETRY` 5 | Login/bootstrap identity, settings, schemas/ledgers/outboxes, user-less aggregate telemetry.                                                                                    | Bootstrap tables may need row-level global/tenant split; infra/telemetry require documented exemption. |
| Audit          | Scoped audit roots inside `SCOPED` plus infra/operator health logs where user-less. | Actor/user-bearing audit rows can leak tenant data and are tenant-owned. User-less operator/system rows stay infra.                                                             | Actor/user-bearing audit tables must get org semantics; user-less infra audit rows require exemption.  |
| Integration    |                            `integrator.*` scoped rows plus integrator infra/legacy. | Bot/channel/integrator user data resolves to org through the bridge or direct org root.                                                                                         | Scoped integrator tables need bridge/direct org semantics; Rubitime legacy stays frozen.               |
| Legacy         |                                                                         `LEGACY` 16 | Rubitime/old booking tables frozen for sunset.                                                                                                                                  | No new tenant work; no new product feature should depend on these tables.                              |

## Tables requiring `organization_id` now

Baseline `needs-orgid-FINAL.txt` lists 113 existing tables that require `organization_id` in later P0.4 micro-batches. Do not add all 113 in one diff.

Current R1/P0.1.1 delta:

| Table                            | Bucket                                         | Org semantics                                                                            | Backfill                                                               |
| -------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `public.be_organization_members` | System / bootstrap (**corrected** — see below) | Direct `organization_id`, NOT NULL; membership row cannot exist without an organization. | None: new dormant table has no existing rows. Seed/backfill is P0.1.2. |

**Correction (P0.10.1 W2, taskdb #648):** the row above originally read "Tenant-owned / scoped," written before the P0.2 resolver's actual read path existed. `tiers-218.tsv` now tiers `public.be_organization_members` **BOOTSTRAP**, not SCOPED: `resolveOrganizationForUser`/`pgOrganizationMembership.listByPlatformUser` (`apps/webapp/src/infra/repos/pgOrganizationMembership.ts`) read this table keyed by `platform_user_id`, with no organization filter, to resolve which org(s) a user belongs to _before_ an org context exists — this is exactly the "login resolves identity→org" definition of BOOTSTRAP in `CORRECTED_PLAN.md`, and matches how `platform_users` itself is tiered. Since `organization_id` is `NOT NULL` (never NULL), it uses plain `bootstrap_global` scoping (not the nullable-org `bootstrap_hybrid` pattern) — same treatment as `platform_users`. Note: `docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` embeds an org-scoped deny-by-default RLS policy for this table as a hardcoded fixture for a _different_ purpose (P0.13 isolation smoke); that fixture is a hand-written SQL literal, not derived from `tiers-218.tsv`, and is not gated on this tier decision. Reconciling that fixture's policy shape with the BOOTSTRAP tier (if desired) is a P0.8/T0 follow-up, not part of this stray-table tiering slice.

The other three stray tables surfaced by the grounded P0.10.1 checker (taskdb #646/#648) are now tiered as well: `public.org_enrollments` → **SCOPED** (patient enrollment is the core `(organization_id, platform_user_id)` tenant-ownership record per `CORRECTED_PLAN.md`'s locked architecture; already has `organization_id` `NOT NULL` from creation/backfill in 0144/0145 — no new column needed, only a supplemental no-NULL validation migration, mirroring the `patient_merge_candidates` `already_direct_org` pattern). `public.system_settings_audit` → **BOOTSTRAP-hybrid**, mirroring `public.system_settings`'s nullable-`organization_id` tier (it already received nullable `organization_id` in 0164). `public.broadcast_drafts` → **SCOPED** (a clinic's WIP broadcast draft; needed a new nullable `organization_id` column + FK + idempotent single-org backfill + no-NULL check, added in 0165, since — unlike `broadcast_audit`/`broadcast_audit_recipients` handled in P0.4.P8/0153 — this table was never covered by the audit-table migration family). See `LOG.md` for the full closure entry.

`public.app_runtime_settings` is **BOOTSTRAP with a dedicated runtime-audience subtype**. Global defaults must be
available before an organization is selected, while organization overrides require exact org context. Unlike
`system_settings`, the table contains only registry-approved non-secret runtime values, but its `audience='server'`
rows are not client-readable. Therefore it is deliberately excluded from the generic P0.5 app-role grant and the
generic P0.8.6 bootstrap-hybrid target set. Its descriptor permits only `public|authenticated_client` rows through
the generic bootstrap read predicate and explicitly excludes `app_worker`; worker/staff/integrator capabilities
remain the dedicated grants/accessors defined by the runtime-settings migrations and overlays.

`public.staff_security_profiles` is **BOOTSTRAP global account-security state**. It stores staff MFA/recovery and
login-challenge material keyed by the global `platform_users` identity, so it is not tenant-owned clinical data.
Sensitivity is enforced by a separate privilege boundary: `app_staff` and `app_patient` have no direct table
privileges, and runtime access is limited to the self-scoped `SECURITY DEFINER` functions installed by the
specialist-signup bootstrap overlay.

## Declared FK tenant paths

These tenant-owned tables are intentionally outside `needs-orgid-FINAL.txt` because they inherit tenant
scope through an org-owned package parent. The service FK is a same-org cross-check for future RLS
descriptor generation and writer validation.

| Table                             | Tenant parent path                                                           | Same-org cross-check                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `public.be_package_items`         | `package_id` -> `public.be_subscription_packages.id` -> `organization_id`    | `service_id` -> `public.be_clinic_services.id` -> `organization_id` must match the package org.         |
| `public.be_patient_package_items` | `patient_package_id` -> `public.be_patient_packages.id` -> `organization_id` | `service_id` -> `public.be_clinic_services.id` -> `organization_id` must match the patient package org. |

## Rule for new product tables

Every new product table must choose one of these at design time:

1. Direct tenant ownership: `organization_id` plus an index for tenant filtering.
2. Declared tenant path: documented FK/denorm path to an org-owned parent.
3. Documented exemption: global catalog, system/bootstrap, telemetry, integration infra, or legacy, with a reason in this file or the owning initiative doc.

If none applies, the table should not be added.
