# Final independent audit — Therapysto future-domain cutover package

Тест или взгляд: повторяемое fail-closed/apply/rollback поведение — существующие acceptance-тесты и точечные fault injections; разовая связность runbook, diff и отсутствие live effects — inspection.

## Authority and candidate

Read `AGENTS.md` sections 1, 9, 10a, 10b, and 24 before acting. This is the final independent audit of
the deliberately separate, not-to-be-merged future-domain cutover branch.

Источник оракула: `/home/dev/dev-projects/bcb-wt-therapysto-domain-cutover-ready-20260824/docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/CLOSING_AUDIT_DOMAIN_CUTOVER_READY_2026-08-24.md` — «Four reachable gaps remain».

Exact candidate: `b97240812` on `wt/therapysto-domain-cutover-ready-20260824`. The prior audit is the file
above. Fix commit: `8f5197fbb`; merge of current `feat`: `dddb633a9`; merge-seam correction: `b97240812`.

The owner's outcome is fixed: the package must be ready to switch later, but must not be merged or applied now;
the currently running `test.bersoncare.ru` scheme stays untouched.

## Scope

Re-check CF1-CF4 against the exact candidate, reusing the existing 11-scenario acceptance oracle. Inspect the
new DB callback verifier and the real apply/rollback sequencing. Explicitly verify the merged strict origin helper
is used for restored-runtime health and that CRLF/userinfo cannot reach a curl Host header. Check that:

- platform/custom TLS pairs cannot be shared under any hostname;
- offline apply stops before host effects;
- DB-backed callback mismatch stops before mutation and never prints the stored value;
- successful apply activates webapp env, requires active service and Host-aware health before success;
- every partial failure restores env/nginx/runtime and proves restored health;
- the acceptance rollback scenario reached fake mutation before restore and never read live paths;
- the runbook tells the same truth as the executable flow.

This is not a new blind audit of already-passed unrelated routing/monitoring classes. Any additional finding must
name a reachable break of the owner outcome or repo rule.

## Boundaries and evidence

- Read-only/audit-artifact work only. Do not fix product code.
- Do not merge, push, deploy, apply, or touch DNS/TLS/nginx/env/systemd/DB/cron/DEV/TEST/PROD.
- Do not read live env files or secrets. All stateful simulations stay hermetic under `/tmp` with fake commands.
- Run the existing 11 acceptance scenarios, contract test, syntax/static checks, and the strict-origin test.
- Fault-inject only new/changed CF3/rollback/origin classes once; restore every mutation.
- Full CI is not required.
- Write a concise final audit artifact under
  `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/` and commit only that artifact or necessary audit tests.
- End with `PASS` or `FAIL`, exact SHA, exact checks, and confirmation that live state was untouched.
