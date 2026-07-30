# MISSION: final audit of stages 1–2 — whole delta `a678edc7e..9ee6971c9`. You MAY run tests; you may NOT change files.

Three correction rounds happened. This is the closing verdict for stages 1 and 2: after it the lead ticks checkboxes,
merges into `feat` and runs the DEV probes. The clone's git tree must be clean when you finish; temporary test
artefacts are fine.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a` — stage 1 (1.1–1.4), stage 2 (2.1–2.10),
  scope §1, verification policy §2. Note item **4.10**: freeing occupied volume belongs to stage 4, and the volume
  limit must not be rolled out to any clinic until it exists — that is not a defect of these stages.
- **Canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §1, §3, §4, §5.
- **Previous verdicts:** `STAGE12_AUDIT_RESULT.md`, `STAGE12_REAUDIT_RESULT.md`, `STAGE12_AUDIT_R3_RESULT.md` in
  `docs/_TODO/runs/tariff-mechanics/`.
- **Last fix report (verify, do not trust):** `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX3_REPORT.md`.

## What to decide

1. **The last fix:** a refused upload now leaves a visible message naming the action and how to lift it; the panel
   still closes on success. Would the test notice if the unconditional close came back? Is any other refusal path in
   this component still silent?
2. **Closing matrix for every checkbox 1.1–2.10:** `done / not done / done-but-runtime-unproven`, with evidence. This
   is the list the lead will tick against, so be exact about which parts genuinely need a live DEV run and which are
   already proven.
3. **Regressions across the whole delta,** not just the last commit: the seat chokepoint keeps lock → recount →
   refusal → insert inside one transaction; `никогда` cannot be switched off by a stored `false`; numeric classes are
   fail-closed without an invented ceiling; the compatibility path is unchanged; reads are not gated, mutations are.
4. **Scope:** `git diff --stat` against canonical `feat` — anything outside the widened §1 scope is a finding. Confirm
   migration `0275` is the only migration touched and that nobody renumbered anyone else's.
5. **Test quality across the delta:** name the two tests you consider strongest and the two weakest, and for each say
   what code change would slip past them. Report source-text assertions, single-`it` files and stub-only assertions.

## Run yourself

`pnpm --filter webapp typecheck`, `pnpm --filter webapp lint`, and the targeted Vitest files of these stages. Report
the numbers you saw. **Do not run the full CI** — the lead runs it once at stage 7 under the shared lock. If the seat
race script still fails on its own SQL interpolation, confirm it is the pre-existing defect and not a regression.

## Rules

- MUST FIX only for: required behaviour actually broken, a reachable bypass, data loss or wrong money, a real
  build/runtime break. Each names the failure, the impact and the exact violated requirement.
- No style, no theoretical edge cases, no alternative architecture, no rewriting the code.
- Do not re-break guards by hand this round — reason instead; the tree must stay clean.

## Output

`VERDICT: PASS | PASS WITH FIXES | FAIL`, the closing matrix, numbered MUST FIX (empty list is a valid answer), «что
верно», «что остаётся за лидом на живом DEV», the commands you ran with results, and confirmation that the tree is clean.
