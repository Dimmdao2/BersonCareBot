# MISSION: closing audit of stage 5 slice A — whole slice `6143c7082..92c4d237f`. You MAY run tests; you may NOT change files.

Two corrections and one salvaged continuation happened. This verdict decides whether slice A closes. The clone tree must
be clean when you finish.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a` — items 5.1, 5.2, 5.9; scope §1; policy §2.
- **The two previous verdicts:** `STAGE5_SLICE_A_AUDIT_RESULT.md`, `STAGE5_SLICE_A_REAUDIT_RESULT.md` in
  `docs/_TODO/runs/tariff-mechanics/`.
- **Worker enumeration and claims (verify, do not trust):** `STAGE5_SLICE_A_CORRECTION_RESULT.md`,
  `STAGE5_SLICE_A_FINISH_REPORT.md`.
- **Canon:** `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §5.1, §5.6, §7, §8.

Known history you must account for: the salvage commit `692e00f05` left the tree red (typecheck + one route test); the
continuation `92c4d237f` claims both are fixed, that all three sensitivity checks went red as required, and that one
apparent missing guard was in fact a wrong test fixture — the production guard existed. Verify that last claim
specifically: a fixture that lied once can lie again.

## Questions

1. **Completeness, third pass.** Build your own list of write paths for the three mechanics — including read paths that
   lazily materialise rows, integrator entry points, server actions, the shared settings endpoint, CMS actions and
   patient flows — and diff against the workers' lists. Any path still open is a MUST FIX.
2. **Reads not gated, existing data intact.** Nothing that only reads or exports may now require an entitlement, and no
   existing diary entry, promo instance or Today content may be hidden or deleted.
3. **The three sensitivity claims.** For each — lazy diary materialisation, doctor PATCH on the LFK diary row,
   patient-home `daily_warmup` writes — say whether the guarding test would really go red if the protection were removed.
   Reason it through; do not modify files.
4. **The fixture claim.** Confirm the warmups reminder guard exists in production code and that the test now exercises it
   honestly (`systemParentCode: 'warmups'`), not that the test was bent to pass.
5. **Refusals visible** in every flow touched, with wording that names the action; no generic error swallowing.
6. **Exemptions honest.** No exemption in the protected-action registry covers a real mutation.
7. **Scope:** `git diff --stat` against canonical `feat` — anything outside §1 is a finding. The registry key list,
   migration `0275`, the seat chokepoint, the file write port, billing, the support system, the patient card and the
   patient app must be untouched. Confirm no requirement was lost when the worker reflowed the plan file earlier.

## Run yourself

`pnpm --filter webapp typecheck`, `pnpm --filter webapp lint`, and the affected test files. Report the numbers you saw.
**Never the full CI.**

## Output

`VERDICT: PASS | PASS WITH FIXES | FAIL`, the completeness diff, numbered MUST FIX (empty is valid), «что верно», «что
осталось непроверенным», the commands with results, and confirmation the tree is clean.
