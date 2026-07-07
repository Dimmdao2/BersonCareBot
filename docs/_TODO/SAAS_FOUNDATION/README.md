# SAAS_FOUNDATION — initiative index

**Status:** ✅ **HARDENED + PRE-START DECOMPOSED.** Hardening loop closed on **v8** after two consecutive CLEAN reviews (r8 + r9) by independent fresh Opus agents, each running its own `pg_constraint` FK-scan + soft-ref scan + full count reproduction. **v9** keeps the v8 architecture/scope unchanged and adds a pre-start sizing pass: aggregate P0.4/P0.7/P0.8/P0.11/P0.13 are split into executable micro-stages. Final scope: SCOPED 155 (**111 need org_id**) / BOOTSTRAP 24 / INFRA 22 / LEGACY 16 / TELEMETRY 2 = 219; FK-based derivation; default-deny + 3 tiers; integrator bridge; `system_settings` hybrid. **P0.1.1 is implemented; P0.1.2 staff membership seed is implemented as a strict/idempotent migration; P0.2.1-P0.2.5 are implemented; the P0.2 sync checkpoint passed full CI and `codex/saas-roadmap-foundation` has been fast-forwarded into `feat/doctor-ui-rebuild`; P0.3.1-P0.3.3 are implemented; P0.4.0 has a validated exact-once scoped-table batch manifest; P0.4.P1, P0.4.P2, P0.4.P3, P0.4.P4, P0.4.P5, P0.4.P6, P0.4.P7, P0.4.P8, P0.4.D, P0.4.RC, P0.4.I1-P0.4.I4, and P0.4.BE are implemented; P0.5.1 role split contract/proof is implemented and privileged scratch execution passed. Remaining P0.4 work: none.**
**Goal:** lay the dormant foundation to turn the single-clinic app into a multi-tenant
(multi-specialist / multi-organization), later multi-lingual + multi-region SaaS, with **zero behavior
change** today; turning it on is a controlled cutover, not a flag.

**Product direction (2026-07-01):** do not assume an inevitable hard product fork. Continue the
main BersonCareBot product in one development stream while adding dormant SaaS-capable schema and
access mechanisms. Future commercialization may remain one codebase with optional organization
features: white-label branding in an upper-tier plan, package-gated capability bundles (store,
tariffs, products/courses), and tenant lifecycle only when the business flow requires it.

## Documents
**LIVE (read these):** [`CORRECTED_PLAN.md`](CORRECTED_PLAN.md) — **canonical plan** · [`P0_2_MEMBERSHIP_RESOLVER_CHECKLIST.md`](P0_2_MEMBERSHIP_RESOLVER_CHECKLIST.md) — executable P0.2 resolver/gate/workspace checklist · [`P0_4_BATCHES.md`](P0_4_BATCHES.md) — concrete scoped-table batch map for P0.4 · [`P0_5_DB_ROLE_SPLIT.md`](P0_5_DB_ROLE_SPLIT.md) — P0.5.1 role split contract and scratch proof · [`P0_6_DORMANT_CONTEXT_CHECKLIST.md`](P0_6_DORMANT_CONTEXT_CHECKLIST.md), [`P0_7_WRITER_CENSUS_CHECKLIST.md`](P0_7_WRITER_CENSUS_CHECKLIST.md), [`P0_7_WRITER_CENSUS.md`](P0_7_WRITER_CENSUS.md), [`P0_8_RLS_DESCRIPTOR_CHECKLIST.md`](P0_8_RLS_DESCRIPTOR_CHECKLIST.md), [`P0_9_DEFAULT_DENY_CHECKLIST.md`](P0_9_DEFAULT_DENY_CHECKLIST.md), [`P0_10_CI_INVARIANTS_CHECKLIST.md`](P0_10_CI_INVARIANTS_CHECKLIST.md), [`P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md`](P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md), [`P0_12_RESIDUAL_REFS_CHECKLIST.md`](P0_12_RESIDUAL_REFS_CHECKLIST.md), [`P0_13_ISOLATION_FIXTURES_CHECKLIST.md`](P0_13_ISOLATION_FIXTURES_CHECKLIST.md) — executable remaining Phase 0 checklists · [`UPSTREAM_SYNC_REGRESSION_CHECKLIST.md`](UPSTREAM_SYNC_REGRESSION_CHECKLIST.md) — pre-P0.6/upstream DB regression gate · [`R1_TABLE_TAXONOMY.md`](R1_TABLE_TAXONOMY.md) — execution-facing tenant/global/system/audit/integration/legacy taxonomy · [`ROADMAP_TO_SAAS.md`](ROADMAP_TO_SAAS.md) — global path from now to SaaS · [`UPSTREAM_SYNC_POLICY.md`](UPSTREAM_SYNC_POLICY.md) — how this branch stays compatible with upstream UI/product work · [`scope-derivation/tiers-218.tsv`](scope-derivation/tiers-218.tsv) — authoritative baseline tier map · [`scope-derivation/p0-4-batches.tsv`](scope-derivation/p0-4-batches.tsv) — P0.4.0 exact-once table assignments · [`scope-derivation/VERIFIED_SCOPE.md`](scope-derivation/VERIFIED_SCOPE.md) — historical scope derivation · [`LOG.md`](LOG.md) — execution log.

**History / rationale (superseded by CORRECTED_PLAN where they conflict):**
1. [`00_DECISIONS_AND_SCHEMA.md`](00_DECISIONS_AND_SCHEMA.md) — settled decisions + target schema (Drizzle).
2. [`01_MASTER_PLAN.md`](01_MASTER_PLAN.md) — phases, **Phase 0 stage spine**, critical sizing, **rules-compliance matrix**.
3. [`02_PHASED_BRIEF.md`](02_PHASED_BRIEF.md) — per-stage brief **template** (§12 + §24 compliant) + stage stubs.
4. [`LOG.md`](LOG.md) — mandatory execution log (per `.cursor/rules/plan-authoring-execution-standard`).
5. [`FOUNDATION_PLAN.md`](FOUNDATION_PLAN.md) — **rationale & analysis history** (v1→v3, red-team, grounding). Canonical decisions live in `00_…`; if they conflict, `00_…` wins.

**Blocking prerequisite:** [`../DB_ACCESS_CHOKEPOINT_INITIATIVE/MASTER_PLAN.md`](../DB_ACCESS_CHOKEPOINT_INITIATIVE/MASTER_PLAN.md) must be completed before SAAS code starts. It is not replaced by this initiative.

## Canonical decision (one line)
**Cabinet ≡ Organization** (reuse `be_organizations`); specialist = org member; enrollment = Person↔Organization; patient = `platform_users` (no persons-split in Phase 0). Scoping = one context-aware org resolver → request context → Postgres RLS (FORCE + GUC-gated permissive, dormant).

## Workflow (per `.cursor/rules` §24)
Orchestrator (Opus) writes briefs + reviews + integrates; **all implementation → Sonnet subagents**, one stage at a time, own worktree, **no push, no commit to main**, no dev-server, timeouts not infinite waits.
