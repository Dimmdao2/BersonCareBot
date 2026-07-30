# MISSION: closing audit of stage 2 after correction `af5dfa3c5`. You MAY run tests; you may NOT change files.

Both prior audits failed stage 2 on three points. This verdict decides whether stage 2 closes. Clone tree must be clean
when you finish.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a, stage 2 plus 3.1a/3.1b. Item 2.6c must stay
  unimplemented (open question to the owner) — flag it if it appeared.
- **Prior verdicts:** `docs/_TODO/runs/tariff-mechanics/AUDIT_STAGE2_SOL_RESULT.md`, `AUDIT_STAGE2_OPUS_RESULT.md`.
- **Correction claims (verify, do not trust):** `docs/_TODO/runs/tariff-mechanics/STAGE2_FIX_REPORT.md`.
- **Canon:** `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §4a, §5, §7.

## Four questions

1. **Migration is deploy-safe.** No write to any removed settings mirror anywhere in the migration; the `7/3/21` cleanup
   goes through the canonical settings source only; forward-only; an organization that edited its own values is not
   touched. Verify the rule `.cursor/rules/system-settings-single-source.mdc` is satisfied, and that the root migrate
   order (integrator before webapp) can no longer fail on this file.
2. **The grace warning reaches a real surface.** With `graceDays > 0` the clinic must see what will happen and when —
   count and date coming from the resolver, wording within canon §7, no invented numbers. Name the surface and say
   whether a test goes red if the warning is dropped again.
3. **The literal hunt now covers `apps/integrator`.** Confirm by running your own search there for durations,
   thresholds, counts, terminal states and any copy of the `7/3/21` ladder. Report the command and its output.
4. **The three test blind spots named by the Opus audit are closed** — each of those code changes must make a test red.
   Check all three, name them, and say which test covers each.

Also re-confirm, briefly, that what the previous audits passed is still true: four fields on two levels with an honest
«не настроено», mechanic level beating system level, the ladder non-destructive, the early read-allow gone with reads
still open in `терпение` and `только чтение`, critical mechanics unlatchable, scope untouched (billing, mock-payment
routes, plan and canon files).

## Run yourself

`pnpm --filter webapp typecheck`, `lint`, the affected tests via exact `vitest run <file>`, and the drizzle journal check.
Report real numbers. **Never the full CI.**

## Output

`VERDICT: PASS | PASS WITH FIXES | FAIL`, the four answers with evidence, numbered MUST FIX (empty is valid), one line on
what remains for the lead on live DEV, the commands you ran, and confirmation the tree is clean.
