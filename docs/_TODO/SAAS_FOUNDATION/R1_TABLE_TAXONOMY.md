# R1 table taxonomy checkpoint

Status: first R1 checkpoint after R0 DB chokepoint completion and post-merge audit.

This document is the execution-facing taxonomy for the shared product. The historical derivation artifacts remain the evidence source: `scope-derivation/tiers-218.tsv`, `scope-derivation/needs-orgid-FINAL.txt`, and `CORRECTED_PLAN.md`.

## Buckets

| Bucket | Source tier(s) | Meaning | R1 treatment |
|---|---:|---|---|
| Tenant-owned | `SCOPED` baseline: 155 tables | Clinical/EHR, booking engine, tenant-owned catalogs, patient programs, comms, delivery logs with user keys, and scoped audit roots. | Must have direct `organization_id`, declared FK path, or declared denorm path before RLS enforcement. |
| Global catalog | Part of `INFRA` / explicit future store | Shared operational catalogs and future marketplace/store inventory. Tenant-owned product libraries are not here; bought/shared libraries are copied into tenant catalogs later. | No tenant predicate unless a product decision moves the table into tenant-owned. |
| System | `BOOTSTRAP` 24 + `INFRA` 22 + `TELEMETRY` 2 | Login/bootstrap identity, settings, schemas/ledgers/outboxes, user-less aggregate telemetry. | Bootstrap tables may need row-level global/tenant split; infra/telemetry require documented exemption. |
| Audit | Scoped audit roots inside `SCOPED` plus infra/operator health logs where user-less. | Actor/user-bearing audit rows can leak tenant data and are tenant-owned. User-less operator/system rows stay infra. | Actor/user-bearing audit tables must get org semantics; user-less infra audit rows require exemption. |
| Integration | `integrator.*` scoped rows plus integrator infra/legacy. | Bot/channel/integrator user data resolves to org through the bridge or direct org root. | Scoped integrator tables need bridge/direct org semantics; Rubitime legacy stays frozen. |
| Legacy | `LEGACY` 16 | Rubitime/old booking tables frozen for sunset. | No new tenant work; no new product feature should depend on these tables. |

## Tables requiring `organization_id` now

Baseline `needs-orgid-FINAL.txt` lists 111 existing tables that require `organization_id` in later P0.4 micro-batches. Do not add all 111 in one diff.

Current R1/P0.1.1 delta:

| Table | Bucket | Org semantics | Backfill |
|---|---|---|---|
| `public.be_organization_members` | Tenant-owned / scoped | Direct `organization_id`; membership row cannot exist without an organization. | None: new dormant table has no existing rows. Seed/backfill is P0.1.2. |

## Rule for new product tables

Every new product table must choose one of these at design time:

1. Direct tenant ownership: `organization_id` plus an index for tenant filtering.
2. Declared tenant path: documented FK/denorm path to an org-owned parent.
3. Documented exemption: global catalog, system/bootstrap, telemetry, integration infra, or legacy, with a reason in this file or the owning initiative doc.

If none applies, the table should not be added.
