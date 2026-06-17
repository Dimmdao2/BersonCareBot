# SAAS_FOUNDATION — initiative index

**Status:** 🔁 **HARDENING LOOP — converging** (r1: 9 findings gross-miss → r2: 7 consistency/detail → v4). `CORRECTED_PLAN.md` = **v4**. Reconciliation (`tiers-218.tsv`, single source): SCOPED **148** (104 need org_id, 44 be_*) / BOOTSTRAP 24 / INFRA 27 / LEGACY 16 / TELEMETRY 4 = 219 ✓. v4 fixes: artifacts unified, outbox/queue+mailing-topics→INFRA, system_settings PK detail, integrator per-table resolution paths, be_* precise. Under **fresh re-review**; terminates at **2 consecutive clean** (streak **0/2**). Not for execution until the loop closes.
**Goal:** lay the dormant foundation to turn the single-clinic app into a multi-tenant
(multi-specialist / multi-organization), later multi-lingual + multi-region SaaS, with **zero behavior
change** today; turning it on is a controlled cutover, not a flag.

## Documents
**LIVE (read these):** [`CORRECTED_PLAN.md`](CORRECTED_PLAN.md) — **canonical plan** · [`scope-derivation/VERIFIED_SCOPE.md`](scope-derivation/VERIFIED_SCOPE.md) — verified 84-table scope · [`LOG.md`](LOG.md) — execution log.

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
