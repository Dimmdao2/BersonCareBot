# MISSION: re-audit of the correction round — commit `718576165` on top of `a678edc7e` (read-only)

First audit returned FAIL with six findings. The lead fixed finding 6 (a plan defect). The worker claims fixes 1–5.
Your job: verify each fix by behaviour, and hunt for what the fixes themselves may have broken.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a`, stages 1 and 2 (scope §1 was widened
  after finding 6).
- **Canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §1, §3, §4, §5.
- **First verdict:** `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_RESULT.md`.
- **Correction brief given to the worker:** `docs/_TODO/runs/tariff-mechanics/STAGE12_CORRECTION_BRIEF.md`.
- **Worker's claims (verify, do not trust):** `docs/_TODO/runs/tariff-mechanics/STAGE12_CORRECTION_REPORT.md`.

## Part 1 — the five fixes

For each: does the defect actually die, and would the new test really catch its return? Say what code change you would
make to break it and whether the test would notice.

1. **`никогда` is always enabled** — a stored `false` in a tariff or an organization override must not disable the
   patient card or the patient app. Confirm the forcing lives in the resolver (not only in the constructor UI), so a
   map written by an older tariff, by a migration, or by a direct API call cannot switch it off either.
2. **A new tariff no longer disables the numeric mechanics** — seats and file volume work from their configured limit;
   an empty capability map does not silently switch them off. Check the invariant the worker relied on and whether it
   also holds for the future `запас` class.
3. **`запас` is declarable** — the type exists, a period on it does not type-check.
4. **Material ratings: every write path refuses when the setting is off** — including the feedback route. Look for any
   remaining write into the rating loop that no one checks.
5. **Behaviour tests exist for course POST, notification-template PUT and both rating writes** — they call the real
   handler and expect a refusal. Reject tests asserting on source text, on registry rows, or on a stub.

## Part 2 — regressions the fixes could have caused (this is where the real risk is now)

- **`pgOrganizationInvites.ts` was touched — the seat chokepoint.** Verify the advisory lock still wraps recount and
  insert in ONE transaction and the seat limit still refuses the last-slot race. If the lock, the recount or the
  ordering changed, that is a MUST FIX: this is the only numeric limit that works in production today.
- **Forcing a whole class ON in the resolver is a blunt instrument.** Check it cannot accidentally enable something it
  should not: enumerate which mechanics are class `никогда` and confirm nothing commercial slipped into that class.
- **The numeric-class change must not make a limit unlimited by accident.** If the boolean map no longer gates seats and
  files, what happens when no limit is configured at all? Confirm the fail-closed baseline still exists and is finite
  (the canon forbids treating a missing limit as unlimited for seats).
- **Reads must still not be gated,** and mutations must still be gated. Both directions are defects.
- `git diff --stat` against `feat`: anything outside the widened §1 scope is a finding.

## Rules

- Each MUST FIX names the concrete reachable failure, its impact, and the exact requirement violated. No style, no
  theoretical edge cases without a path, no alternative architecture.
- You are read-only: change no files. DEV runtime probes are the lead's job in the canonical tree — do not attempt them,
  but do say which claims stay unproven without them.

## Output

`VERDICT: PASS | PASS WITH FIXES | FAIL`, then a per-fix table (fix → verified? → evidence file:line → what would break
it), then numbered MUST FIX, then «что теперь верно», then «что осталось непроверенным и почему».
