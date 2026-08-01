MISSION: reality-research — "HOW to execute", not "what". Read-only. Your final output IS the deliverable
(a methodology report), not a human-facing message. Be concrete, cite world practice with specifics, state
cost/time, be honest about uncertainty. Work in English.

## Context — read these two docs in full FIRST (authority; do not re-derive their WHAT)
- `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` — the owner's plan for the "clean the test suite" workstream:
  the problem ("tests lie both ways"), owner rulings verbatim, measured picture, the "name the bug" filter,
  stages 0–8, and all 29.07 measurements. THIS is the plan you extend — NOT a new plan.
- `docs/_TODO/TESTSUITE_RESEARCH_2026-07-29.md` — the prior independent Opus+Sol verdict on WHAT tests should
  check (mutation-killed-mutants as the measure, diff-scoped mutation in CI like Google, live-DB role-behavior
  matrix, drop count/expect/ratio metrics).

The WHAT is settled. Do not re-argue it. Assume as given: kill-mutants is the truth signal (not form); default
is DELETE with burden of proof on keeping (owner ruling); AI "name a plausible bug" is untrustworthy and must
be backed by an arbiter (inject the bug by hand → test must go red); text-of-source assertions are junk.

## The owner's framing that triggered this research (two problems, both first-class)
1. A HUGE volume of MEANINGLESS tests that bring no value (execute a line, verify almost nothing —
   measured mutation scores 2.88–3.86% on the modules checked).
2. A clear DEFICIT of competent, USEFUL tests exactly where it matters most (90 code files with zero test
   coverage, 32 on sensitive topics; entitlement decision lines with no test; live DB touched by ~0 tests in CI).

## THE QUESTION YOU ANSWER: HOW do we execute this? (operational methodology, grounded in world practice)

Answer HOW for all three, concretely enough that a worker could follow it:

A. CUT the meaningless at ~1700-file / ~10k-test scale WITHOUT relying on AI opinion. What is the concrete,
   mechanized, reproducible pipeline? Tooling config (Stryker vitest-runner: incremental? --disableBail for
   per-test attribution? concurrency? how to tame heavy Next import graphs that may 2× cost), batching and
   ordering, where the human/arbiter checkpoints sit, how survivors become a deduplicated worklist keyed by
   consequence (not one card per mutant). How to keep each run's baseline green so new red is attributable.

B. BUILD the missing valuable tests for the priority tiers, in order: (1) tenant isolation / RLS / principal,
   (2) auth / passwords / sessions, (3) quotas / billing, (4) the 32 sensitive zero-coverage files
   (clinic provisioning, patient invites, acquiring gateway), (5) three unguarded invariants. What is the
   concrete authoring RECIPE? Behavioral contracts (input→output through the PUBLIC interface, one contract per
   module × environment — pure logic on stubs / live DB / UI — not one giant file). For the live-DB layer:
   ephemeral Postgres 16, a principal × organization × operation matrix that asserts the RESULT (what a role
   sees / cannot see), PLUS DB-level mutation injection (REVOKE / weaken RLS / change function owner) where the
   matrix MUST go red on each injection. Ground each in world practice: "Software Engineering at Google"
   (testing chapters, test-behavior-not-implementation), mutation-testing-in-CI literature, RLS/row-level-
   security testing patterns, Postgres role-privilege testing. Cite specifics, not "best practices".

C. The CI SHRINK-ONLY GATE so the suite cannot re-bloat: exactly how to wire a diff-scoped mutation gate on changed
   DECISION lines into the merge gate — thresholds, how to handle equivalent mutants (score is a LOWER bound),
   time/flake budget for an 8-minute merge gate, what precisely fails the build. Plus the mechanism to make the
   `a0-greenfield` schema baseline real (rebuild in the SAME commit as the migration; drift fails CI) — how
   Rails (schema.rb via db:migrate) and GitLab ("Check for changes in structure.sql") wire this.

## HARD CONSTRAINTS ON YOUR ANSWER (owner, 29.07)
- This APPENDS to `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`. Do NOT propose a new plan document.
- Do NOT propose taskdb cards / new tasks. This is all inside the existing "clean the tests" workstream.
- Reconcile the EXISTING stages 0–8: for EACH stage, state one of {ALREADY DONE (cite evidence from the doc) /
  CANCEL as no-longer-relevant given the HOW (say why) / FOLD INTO the new HOW (say where)}. The owner requires
  every old stage to end up either completed or cancelled-as-stale — no orphan stages.
- Prefer a deterministic, fixed-sequence pipeline over an open-ended "audit until satisfied" loop (the latter
  manufactures scope). Name where a human/owner gate sits.

## Deliverable shape
1. HOW-A (cut) — ordered pipeline + tooling config + checkpoints + cost/time.
2. HOW-B (build) — authoring recipe per tier + the live-DB matrix design + world-practice citations.
3. HOW-C (shrink-only gate) — CI wiring, thresholds, equivalent-mutant handling, a0-baseline mechanism.
4. STAGE RECONCILIATION — table: stage 0–8 → {done / cancel / fold} + one-line reason each.
5. HONEST UNCERTAINTY — where you're guessing, cost risks, equivalent-mutant unknowns.

Read-only: do not modify any file. Return the report as your final output.
