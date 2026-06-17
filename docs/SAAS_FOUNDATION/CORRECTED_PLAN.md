# SAAS Foundation — CORRECTED PLAN (canonical, 2026-06-17)

**This is the live plan.** Supersedes the framing in `00_DECISIONS_AND_SCHEMA.md` / `01_MASTER_PLAN.md` /
`02_PHASED_BRIEF.md` (kept as history) where they conflict. Evidence: `scope-derivation/VERIFIED_SCOPE.md`
(the 84-table list), `REVIEW_2026-06-17_FRESH.md` (why the first plan was wrong), `FOUNDATION_PLAN.md`
(full rationale), `spike/` (silo PoC that drove the pivot back to RLS).

## Locked decisions
- **Tenant = Organization** (reuse existing `be_organizations`). **Person = `platform_users`** (global identity). **Enrollment = (organization_id, platform_user_id)** table — patient↔practice link; a person can be in many orgs with a separate chart in each.
- **Isolation = shared DB + Postgres RLS** (silo/schema-per-tenant rejected: patient↔patient is row-level, schemas can't express it; RLS covers BOTH boundaries with one mechanism and stays portable across replicas/backups/multi-server — tenant identity is DATA, not a per-tenant DB role).
- **Two row-level boundaries, one mechanism:** practice↔practice (`organization_id`) AND patient↔patient (`patient ownership`) — both enforced by RLS.
- **🔒 Fail-safe = DEFAULT-DENY + explicit PUBLIC allowlist:** RLS `FORCE` on; a table with no policy + no allowlist entry is **inaccessible**. Only tables **deliberately marked PUBLIC** (store inventory, public-booking catalog, marketing) are key-free. → a missed/new table fails LOUD (screen breaks, caught in test) instead of leaking SILENTLY (patient B sees patient A).
- **Scope = 84 tables** need `organization_id` (`needs-orgid-FINAL.txt`). Catalogs **per-tenant**. Telemetry **split** (delivery/usage→scope, aggregate analytics→global). `system_settings`→org-aware row-level. Legacy-8 frozen. `be_*` (44) already org-scoped.
- **Central context chokepoint:** ONE place sets «who / which org / which patient / role» per request; RLS enforces; no module can bypass (ESLint already forbids raw DB import + DB refuses).
- **Two DB roles:** migrator/owner (privileged: migrations + provisioning) vs **non-bypass app role** (runtime).
- **Marketplace/store** (buy exercise libraries → copy into tenant catalog) = later phase; per-tenant catalogs already support it.

## Phases
| Phase | What | Behavior today |
|---|---|---|
| **Phase 0 — dormant foundation** | all seams + RLS present-but-permissive (GUC off) | **byte-for-byte unchanged** (single org) |
| **T0 — enforcement cutover** | flip default-deny on + real per-request context + 4 process entrypoints + shadow-run | the actual multi-tenant switch |
| **Later** | onboarding/provisioning · marketplace/store · EN locale · multi-region | features on top |

## Phase 0 — stage spine (Sonnet-sized; each ≈ 1 PR, step/phase-verifiable)
Rule tags: D=Drizzle · P=ports/DI · PII=dev-PII (no writes/notif/PII-print) · T=step/phase test · G=§24 git (no push/commit-main, explicit add) · GATE=needs prod-parity/owner.

| # | Stage | Verify |
|---|---|---|
| P0.1 | `be_organization_members` (Drizzle) + seed staff→org (doctor→active specialist `518e…`) [D,PII,T,G] | applies; seed counts; idempotent |
| P0.2 | `OrganizationMembershipPort` + `resolveOrgForUser` service (port/DI) [P,T,G] | unit (1 membership→org / none→default / multi→active) |
| P0.3 | `org_enrollments (org, person)` table + backfill all patients→single org [D,PII,T,G] | count==clients; idempotent |
| P0.4a–d | add nullable `organization_id` to the **84** scope tables — 4 Drizzle batches (~21 each) + backfill→single org [D,PII,T,G] | applies; nullable; backfill counts |
| P0.5 | DB role split: migrator/owner vs **non-bypass app role** (2 DATABASE_URLs) [GATE prod-parity,G] | scratch DB; app reads under non-bypass |
| P0.6 | **Central context chokepoint**: per-request pinned connection sets org/person/role, RESET on release [P,T,G] | targeted; leak test (no stale context) |
| P0.7 | **Headless-runtime context (C3)**: wrap integrator bot(per-update)/worker(per-job)/scheduler(per-tick)/media-worker [P,T,G] | per-loop context set; timeout-bounded |
| P0.8 | **RLS policies** — uniform template applied by a LOOP to all 84: org predicate + patient predicate (by actor) + `WITH CHECK`; `ENABLE`+`FORCE`; GUC-gated permissive (dormant) [D,T,G] | scratch: GUC off=unchanged, on=both walls hold |
| P0.9 | **Default-deny + PUBLIC allowlist**: explicit public-table list; everything else denied without context [D,T,G] | scratch: unlisted table denied; public table readable key-free |
| P0.10 | **CI fail-safe invariant**: every table is EITHER scoped(RLS+policy) OR in the public allowlist — else build fails [T,G] | the test itself |
| P0.11 | `system_settings` org-aware row-level (the C2/D7 fix; mirror-safe) [P,T,G] | targeted; mirror sync |
| P0.12 | **Residual-risk checks**: polymorphic/soft-ref scan (`item_ref_id` etc.) + JSON-blob-PII scan → each scoped or justified [T,G] | report; no unscoped PII path |
| P0.13 | Isolation test fixtures: 2 orgs + 2 patients in one org → assert practice↔practice AND patient↔patient both blocked under non-bypass role [T,G] | the test (non-bypass role) |

**Dropped from Phase 0** (later phases): persons/directory split (region-phase); marketplace; onboarding UI.

## C-findings status
- **C1** ✅ resolved — verified 84-table scope (3 methods + arbiter + completeness gate).
- **C2** ✅ resolved-by-design — per-org integration config = `system_settings` org-aware row-level (P0.11), not env, not a parallel store.
- **C3** ✅ in plan — headless-runtime context is P0.7 (explicit stage, was missing before).

## Sizing (revised, honest)
- **Phase 0 (dormant, zero behavior change): ~4–6 wk** (84 tables batched + RLS loop + chokepoint + C3 + fail-safe + residual checks).
- **T0 cutover: ~3–5 wk** (role swap + real per-request context + shadow-run; smaller than the old estimate because RLS-uniform-policy + the chokepoint replace per-table hand-work).
- Later (onboarding/store/EN/region): separate, sized when scheduled.

## Execution model (§24)
Orchestrator (me) writes per-stage briefs + reviews + integrates; **Sonnet implements** one stage at a time, own worktree, no push/no-commit-to-main, no dev-server, timeouts. I verify each on the sandbox/dev before marking done. `LOG.md` updated per stage. Gates: P0.5/P0.8 wait on prod-parity confirm; nothing enforces (default-deny flip) until T0 shadow-run passes.
