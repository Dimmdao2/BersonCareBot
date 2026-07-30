# MISSION: audit item 3.1c — the single lifecycle door (`a43352274`). You MAY run tests; you may NOT change files.

The ladder state is now computed by one canonical SQL function; the webapp's TypeScript computation was deleted and the
integrator calls the same function. This is deploy-critical: a `SECURITY DEFINER` function owned by `app_owner` with
explicit grants. Clone tree must be clean when you finish.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a — item 3.1c (and stage 2, whose behaviour must
  not have regressed); scope §1; policy §2.
- **Canon:** `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §4a — two subjects (cabinet access and each mechanic), policy as
  live data, no literals in code, changes apply forward.
- **Worker claims (verify, do not trust):** `docs/_TODO/runs/tariff-mechanics/STAGE3_SEAM_REPORT.md`.

## Questions

1. **Exactly one place computes the state.** Confirm the webapp no longer computes it in TypeScript and that no third
   copy survived anywhere (webapp, integrator, SQL overlays, scripts). Name what you searched.
2. **The door cannot be bypassed or fooled.** The function requires a matching organization principal and raises rather
   than returning a permissive empty row — verify that under FORCE-RLS an unprincipled or mismatched call cannot yield
   «everything allowed». Check the integrator honours `mutation_allowed` and has no fallback path when the call fails.
3. **Deploy contract.** `expected_secdef_count` in `deploy/host/deploy-test-saas.sh` and the two contract tests must match
   reality; grants must be the minimum the callers need (`app_staff`, `app_patient`) and no wider. The deploy asserts an
   exact privilege set per login role and fails on any mismatch — say whether this change passes that assertion.
4. **Policy still lives in data.** No duration, terminal state or state name hardcoded in the SQL function, the webapp or
   the integrator. Run the literal search across both apps and the migration; paste the command and output.
5. **No regression of stage 2.** Grace warning still reaches the clinic with its date; reads open in `терпение` and
   `только чтение`; the terminal state hides the section for the specialist and for his patients; critical mechanics
   remain unlatchable; payments and branding remain inside the ladder with no special case.
6. **Migration hygiene.** `0276` stays forward-only and idempotent-safe; nothing renumbered; the historical seed cleanup
   still cannot touch an organization that edited its own values.
7. **Scope.** `git diff --stat` — billing plan, mock-payment routes, plan and canon files untouched.

## Run yourself

Webapp `typecheck` and `lint`, the integrator's own checks, the affected tests via exact `vitest run <file>`, and the
private-PostgreSQL rehearsal that applies `0276` and the overlay. Report the numbers you saw. **Never the full CI.**

## Output

`VERDICT: PASS | PASS WITH FIXES | FAIL`, per-question evidence, numbered MUST FIX (empty is valid), one line on what
remains for the lead on live DEV, the commands you ran, and confirmation the tree is clean.
