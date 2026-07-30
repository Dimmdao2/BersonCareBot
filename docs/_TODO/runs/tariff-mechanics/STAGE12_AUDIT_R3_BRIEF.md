# MISSION: audit round 3 — commit `47e5313c1` (fail-closed for numeric mechanics). You MAY run tests; you may NOT change files.

You run with a writable workspace only so that Vitest can create its temp files — the previous read-only round could
not run a single test (`EROFS`). **The clone's git tree must be clean when you finish.** Do not edit, create or delete
project files, do not commit, do not push. Temporary test artefacts are fine.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a`, stages 1–2, scope §1, verification policy §2.
- **Canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §3, §5, §9.
- **Previous verdict (one MUST FIX):** `docs/_TODO/runs/tariff-mechanics/STAGE12_REAUDIT_RESULT.md`.
- **Worker's claims (verify, do not trust):** `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX2_REPORT.md`.

## Part 1 — did the fail-open defect die?

1. A tariff **with** a configured file limit: uploads work up to it, refused beyond it.
2. A tariff **without** a configured file limit: growth refused, refusal visible (never a silent success).
3. An organization on the **compatibility path** (no tariff assigned): behaviour unchanged — this must not have become
   a regression that blocks a live clinic.
4. Existing files stay readable, downloadable and deletable in every case.
5. No invented ceiling: confirm the fix uses an explicit «limit not configured» state or the existing finite baseline,
   and does not hard-code a made-up number as product policy.
6. The same shape must already protect the future `запас` class, so stage 4 inherits fail-closed.

## Part 2 — regressions from this fix (the real risk now)

- **The file write port changed** (`pgPatientFiles` or equivalent): byte recount plus advisory lock plus insert must be
  inside ONE transaction, in that order. Compare with the reference pattern in `pgOrganizationInvites.ts`. If recount
  can happen outside the lock, two parallel uploads pass the last remaining bytes — say so as a MUST FIX.
- **Seats must be untouched** by this round: the lock, the recount and the refusal order in `pgOrganizationInvites.ts`
  stay as they were.
- **Reads still not gated; mutations still gated.**
- `git diff --stat` against canonical `feat`: anything outside the widened §1 scope is a finding.

## Part 3 — run the checks yourself (this is what the previous round could not do)

- `pnpm --filter webapp typecheck`
- `pnpm --filter webapp lint`
- The targeted Vitest files touched by stages 1–2 (entitlements service, patient-files service, the tariff-mechanics
  route test). Report the real numbers you saw, not the worker's.
- **Do NOT run the full CI** — it belongs to the lead, once, under the shared lock.
- If a race-proof script for file bytes exists, run it and report the outcome. If none exists, say plainly that the
  atomic claim rests on code reading only.
- The seat race script is known to be broken on its own SQL interpolation — that defect predates this work. Confirm it
  still fails the same way rather than blaming this commit.

## Rules

- Each MUST FIX: concrete reachable failure, impact, exact requirement violated. No style, no theoretical edge cases,
  no alternative architecture.
- Removing a guard by hand to prove a test is NOT allowed this round (it would dirty the tree). Instead reason about
  which code change would break each test and say whether the test would notice.

## Output

`VERDICT: PASS | PASS WITH FIXES | FAIL`, then the per-item table, then numbered MUST FIX, then «что теперь верно»,
then «что осталось непроверенным и почему», then the exact commands you ran with their results, and finally confirm the
clone tree is clean.
