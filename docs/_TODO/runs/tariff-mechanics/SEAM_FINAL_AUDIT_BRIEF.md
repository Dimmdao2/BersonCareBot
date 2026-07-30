# MISSION: closing audit of the lifecycle door (`ccbe94538` on top of `a43352274`). You MAY run tests; you may NOT change files.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a — item 3.1c and stage 2; scope §1; policy §2.
- **Canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §4a — the ladder, its two subjects, and
  the data/code boundary as narrowed by the lead (item 2: durations, warning count, terminal choice and whether a step
  applies are data; the SET of states and their meaning stay in code — do not report that as a defect).
- **Prior verdicts:** `docs/_TODO/runs/tariff-mechanics/AUDIT_SEAM_SOL_RESULT.md`, `AUDIT_SEAM_OPUS_RESULT.md`.
- **Correction claims (verify, do not trust):** `docs/_TODO/runs/tariff-mechanics/SEAM_FIX_REPORT.md`.

## Questions

1. **Will the door actually exist everywhere?** The worker moved it out of the already-applied `0276` into a new `0277`,
   restored `0276` byte-for-byte, added the journal entry, and made the function `CREATE OR REPLACE` with grants
   re-applied. Verify all four, and reason through the three cases: `0276` applied without the door · `0276` not yet
   applied · the door already created by the edited `0276`. Confirm applying `0277` twice is harmless.
2. **The rehearsal now proves behaviour, not existence.** Four cases were required: a mismatched or absent organization
   principal raises instead of returning a permissive row; `только чтение` refuses mutation and allows reading; a critical
   mechanic stays full-access even with a stored `false`; `payments` and `branding` traverse the ladder with no special
   case. For each, check the case exists AND that removing the corresponding SQL branch makes it fail. Run the rehearsal.
3. **The two UI tests were fixed, not weakened.** The fake port must implement the real contract; the tests must still
   fail if the warning or the visibility decision is dropped.
4. **Deploy contract.** `expected_secdef_count` and the two contract tests match the actual number of definer functions
   after `0277`; grants stay minimal (`app_staff`, `app_patient`); the exact privilege set the deploy asserts still holds.
5. **No regression:** one place computes the state; the integrator honours `mutation_allowed` with no fallback; grace
   warning reaches the clinic with its date; reads open in `терпение` and `только чтение`; terminal state hides the
   section on both sides; critical mechanics unlatchable; no literals for durations or terminal states in either app.
6. **Scope:** `git diff --stat` — billing, mock-payment routes, plan and canon untouched.

## Run yourself

Webapp `typecheck`/`lint`, integrator checks, the affected tests via exact `vitest run <file>`, journal sync check, and the
private-PostgreSQL rehearsal (twice, to prove idempotency). Report real numbers. **Never the full CI.**

## Output

`VERDICT: PASS | PASS WITH FIXES | FAIL`, per-question evidence, numbered MUST FIX (empty is valid), «что остаётся лиду на
живом DEV» in one paragraph, the commands you ran, and confirmation the tree is clean.
