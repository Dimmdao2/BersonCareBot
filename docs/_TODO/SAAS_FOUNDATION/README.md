# SAAS_FOUNDATION — initiative index

**Status:** ✅ **HARDENED + PRE-START DECOMPOSED.** Hardening loop closed on **v8** after two consecutive CLEAN reviews (r8 + r9) by independent fresh Opus agents, each running its own `pg_constraint` FK-scan + soft-ref scan + full count reproduction. **v9** keeps the v8 architecture/scope unchanged and adds a pre-start sizing pass: aggregate P0.4/P0.7/P0.8/P0.11/P0.13 are split into executable micro-stages. Final scope: SCOPED 155 (**111 need org_id**) / BOOTSTRAP 24 / INFRA 22 / LEGACY 16 / TELEMETRY 2 = 219; FK-based derivation; default-deny + 3 tiers; integrator bridge; `system_settings` hybrid. **Ready to execute Phase 0 — first micro-stage P0.1.1 = `be_organization_members` DDL (dormant, low-risk).**
**Goal:** lay the dormant foundation to turn the single-clinic app into a multi-tenant
(multi-specialist / multi-organization), later multi-lingual + multi-region SaaS, with **zero behavior
change** today; turning it on is a controlled cutover, not a flag.

## Documents
**LIVE (read these):** [`CORRECTED_PLAN.md`](CORRECTED_PLAN.md) — **canonical plan** · [`scope-derivation/tiers-218.tsv`](scope-derivation/tiers-218.tsv) — authoritative 219-artifact tier map · [`scope-derivation/VERIFIED_SCOPE.md`](scope-derivation/VERIFIED_SCOPE.md) — historical scope derivation · [`LOG.md`](LOG.md) — execution log.

**History / rationale (superseded by CORRECTED_PLAN where they conflict):**
1. [`00_DECISIONS_AND_SCHEMA.md`](00_DECISIONS_AND_SCHEMA.md) — settled decisions + target schema (Drizzle).
2. [`01_MASTER_PLAN.md`](01_MASTER_PLAN.md) — phases, **Phase 0 stage spine**, critical sizing, **rules-compliance matrix**.
3. [`02_PHASED_BRIEF.md`](02_PHASED_BRIEF.md) — per-stage brief **template** (§12 + §24 compliant) + stage stubs.
4. [`LOG.md`](LOG.md) — mandatory execution log (per `.cursor/rules/plan-authoring-execution-standard`).
5. [`FOUNDATION_PLAN.md`](FOUNDATION_PLAN.md) — **rationale & analysis history** (v1→v3, red-team, grounding). Canonical decisions live in `00_…`; if they conflict, `00_…` wins.

## Canonical decision (one line)
**Cabinet ≡ Organization** (reuse `be_organizations`); specialist = org member; enrollment = Person↔Organization; patient = `platform_users` (no persons-split in Phase 0). Scoping = one context-aware org resolver → request context → Postgres RLS (FORCE + GUC-gated permissive, dormant).

## Workflow (per `.cursor/rules` §24)
Orchestrator (Opus) writes briefs + reviews + integrates; **all implementation → Sonnet subagents**, one stage at a time, own worktree, **no push, no commit to main**, no dev-server, timeouts not infinite waits.
