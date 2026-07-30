# MISSION: audit of stage 5 slice A — commit `6143c7082` (read-only)

Three toggles were wired: external calendar (5.1), patient diaries (5.2), the three owner mechanics (5.9).

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a` — items 5.1, 5.2, 5.9; scope §1; policy §2.
- **Worker brief (the contract he was given):** `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_BRIEF.md`.
- **Worker claims (verify, do not trust):** `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_REPORT.md`.
- **Canon:** `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §1, §5.1, §5.6, §8.

## Questions

1. **Coverage of the write surface.** For each of the three mechanics, enumerate the paths that create or change the
   thing, and say which are guarded and which are not. A single unguarded write path is a MUST FIX — the toggle then
   does not hold and the mechanic is sellable but not enforceable. Pay special attention to server actions, not only
   API routes: this repository has both.
2. **Reads must NOT be guarded.** Confirm nothing that only reads or exports diary entries, calendar state or the
   patient-page content now requires an entitlement. Both directions are defects.
3. **«Сегодня» must be absent, not disabled.** With `patient_home_today` off, the administrator must not see the block
   for configuring the patient page at all. Verify it is really absent from navigation and that the page itself refuses,
   so a direct URL does not reach it. The patient side is deliberately out of scope — flag it if the worker invented
   patient-side behaviour.
4. **Refusals are visible and say what to do** (canon §7 wording rule, no invented numbers). Check the message reaches
   the user in each of the three flows rather than dying in a swallowed error — that exact defect already happened once
   in this plan.
5. **Protected-action rows point at the handlers actually guarded.** A row aimed at the wrong handler is worse than a
   missing one, because a coverage run then looks green. Verify each row the worker added or corrected.
6. **Tests would notice.** For each mechanic name the code change that would silently reopen the hole and say whether a
   test catches it. Report source-text assertions, new single-`it` files or stub-only assertions.
7. **Scope:** `git diff --stat` — anything outside §1 is a finding; the registry, migration `0275`, the seat chokepoint,
   the file write port, billing and the support system must be untouched.

## Rules

MUST FIX only for a reachable break with named impact. No style, no theory, no alternative architecture. Read-only:
change no files, never run the full CI; targeted typecheck and the affected test files are fine if your sandbox permits.

## Output

`VERDICT: PASS | PASS WITH FIXES | FAIL`, a table per mechanic (write paths → guarded? → evidence), numbered MUST FIX
(empty is valid), «что верно», and one line per unchecked claim.
