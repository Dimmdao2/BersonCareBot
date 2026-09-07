# C3M-10 audit correction (`#1098`)

Read `AGENTS.md` first: the heading map, §10a, §10b, §12 and §24. Authority is
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` C3M-10 together with the accepted independent
audit `runs/c3m-portal-symptom-audit-e82c4a43a.md` at audit commit `d14fd91b6`.

Work only in the existing branch `wt/c3m-portal-symptom-slice-20260907`. This is a bounded correction of the four
accepted audit findings, not a redesign:

1. Restore the existing rehabilitation denial for the patient LFK statistics route while keeping the intended
   global diary exclusions outside the client-portal switch.
2. Replace the broad patient API catch-all with the exact organization-private portal surfaces owned by C3M-10;
   appointments, schedule, cancellation, payment and public booking must not become portal policy.
3. Update the three previously landed behavior test files only where their setup/expected domain object must
   legitimately include the new C3M-10 dependency or field. Do not weaken their behavior contracts.
4. Exclude both system symptom keys (`general_wellbeing`, `warmup_feeling`) from the specialist's patient-visibility
   list and from the PATCH write path. Do not make either system row user-configurable and do not change the
   underlying system diary behavior.

Reuse the existing module classifier, policy resolver and patient-card section. Do not add a second policy path,
new settings, tariff/profession/preset logic, archive/block behavior, schema changes or migrations. Do not write
new tests: the independent auditor already retained the acceptance oracle. Do not run full CI in this branch.

Run the same six focused test files named in the audit handoff, webapp typecheck, scoped lint/format and applicable
architecture gates. Inspect the final diff against the four findings. Commit every task-related change explicitly
(never `git add -A`), include `#1098` and the evidence in the commit message, and do not push. Do not finish while a
foreground validation command is still running.

