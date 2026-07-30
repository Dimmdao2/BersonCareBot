# MISSION: item 3.1c — one door for two processes: the integrator must stop deciding the ladder itself

The integrator has its own lifecycle resolver (`apps/integrator/.../writeDiaryLfkDirect.ts:167-230`): it decides
`no_trial / read_only / blocked` and never reads the owner-configured policy. That is a second source of truth for
exactly what stage 2 made configurable. The previous worker refused to invent a seam and escalated — correctly.

## The seam is chosen by the lead — do not redesign it

**Canonical database function.** Not a shared package (the resolver needs database reads), not inter-process HTTP (an
extra runtime link that can fail). The repository already uses this exact pattern for patient entitlements:
`deploy/postgres/e1-current-patient-organization-entitlements.sql`. So: one SQL function is the single door, both
processes read it, and `apps/webapp/ARCHITECTURE.md:40` (no imports between the apps) stays intact.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a — item **3.1c**; scope §1; policy §2.
- **Canon:** `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §4a — the ladder, its two subjects (cabinet access and each
  mechanic), and the rule that policy is live data: durations and terminal states are never literals in code.
- **What the correction already proved (do not redo):** `docs/_TODO/runs/tariff-mechanics/STAGE2_FIX2_REPORT.md`.

## What to build

1. A function that answers, for a pair «organization + mechanic», the current ladder state and the warning payload,
   derived from the same inputs the webapp resolver uses: the tariff policy, the organization's exception and its
   commercial state. One computation, not a copy.
2. The webapp resolver and the integrator both obtain the state from that single source. If the webapp already computes
   it in TypeScript, decide honestly which side becomes authoritative and say why in the report — but there must be
   exactly one place where the state is computed.
3. The integrator's diary/LFK write path stops deciding anything about lifecycle and asks the door instead.
4. **Deploy contract:** if a `SECURITY DEFINER` function owned by `app_owner` appears or changes, bump the counter in
   `deploy/host/deploy-test-saas.sh` and update the two contract tests. Check the exact privilege set the deploy asserts
   for the roles that must call the function — the deploy fails on a mismatch, and that failure looks like a broken
   deploy, not like a missing grant.
5. Under FORCE-RLS a read without a principal returns empty rather than failing: the function must be called with the
   principal set, or return a state that cannot be mistaken for «everything is allowed».

## Acceptance — behaviour, and mutations you must run

- The integrator refuses a diary/LFK write when the owner's policy puts that mechanic in the terminal state, and allows
  it in `терпение`; the state comes from the tariff, not from any local literal.
- Removing the function, or making it return a different state, makes an integrator-side test go red. Run that mutation
  and report the exact failure text.
- No duration, no terminal state and no state name is hardcoded in `apps/integrator` — run the literal search there and
  paste the command and its output.
- Targeted runs only: webapp `typecheck`/`lint`, integrator's own checks, exact `vitest run <file>`, plus the private
  PostgreSQL rehearsal if the function is covered by one. **No full CI.**

## Constraints

- Do not touch billing (`SAAS_BILLING_PLAN.md`) or the mock-payment routes; do not edit the plan or the canon.
- Keep the temporary migration number `0276` if you extend it; the lead assigns the final number at merge.
- Never `git add -A`. Commit increments in this clone; no push, no merge. Live DEV migration is the lead's job.

## Report

`what you built (file:line) → which side is authoritative and why → the integrator path that now asks the door → the
mutation results → the literal search output`. If any part of the seam cannot work as specified, say so plainly instead
of building half of it.
