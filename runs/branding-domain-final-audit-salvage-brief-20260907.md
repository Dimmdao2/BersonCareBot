# #787 — salvage the interrupted final branding audit verdict

You are the independent continuation auditor for the exact committed candidate in `/home/dev/dev-projects/bcb-wt-branding-domain-absolute-links-20260907`. This is a bounded evidence-salvage pass after the prior auditor was cut off by the host while waiting for the second typecheck. Product code is read-only. Do not repeat the full live matrix, DB work, test suites, or typechecks. Do not push, land, deploy, touch DNS/TLS/services, or mutate any database.

## Test or view classification — first action

Before inspecting tests, read `AGENTS.md` §§10a, 10b, and 24 in full and record that this continuation is a `view`: verify the prior run's preserved evidence, inspect the exact two already-reported reachable failures, and turn those facts into a binary repository-readiness verdict. No new test or kill-set is authorized in this continuation.

## Authority and evidence

Read the original brief `runs/branding-domain-final-live-audit-brief-20260907.md` from the main repo and these authority/audit files:

- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` B1/B2/B3/B4a/B8/C5a;
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_PATIENT_ABSOLUTE_LINKS_2026-09-07.md`;
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_HOST_TENANT_DOMAIN_CORE_2026-09-07.md`;
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_CUSTOM_DOMAIN_READINESS_2026-09-07.md`;
- `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md` §§9.3–9.4.

The interrupted independent run is:

- log: `/home/dev/dev-projects/BersonCareBot/runs/branding-final-live-audit-resume-20260907.log`;
- raw transcript: `/home/dev/brain/runs/codex-raw/2026-09-07T18-30-01-611Z-branding-final-live-audit-resume-20260907.jsonl`.

The preserved auditor messages already state:

1. `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts` still creates two patient buttons from staff `APP_BASE_URL`; the auditor classified this as the existing reachable F-1 call-site, not a new speculative scope item.
2. A real signed reminder wake returned HTTP 500 both in split-surface and one-host DEV configurations.
3. The isolated Host check on `:5212` passed staff, patient-default, and unknown routing and the listener was stopped; named DEV had no slug-directory row or custom binding, so known-slug/custom/308 cases were absent rather than passed.
4. Integrator typecheck completed successfully; webapp typecheck had started in foreground but the host cut off the run before its result was recorded.

## Exact work

1. Verify candidate HEAD and clean state. Inspect only enough code/diff and prior transcript/log to confirm or reject the two reported failures and the preserved positive/blocked facts. Do not rerun expensive checks.
2. Create or update `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_FINAL_INTEGRATED_PATIENT_ORIGIN_HOST_DB_2026-09-07.md` with candidate SHA, test/view classification, exact verified evidence, binary `FAIL` if either reachable failure remains, and the explicitly unproved cases. Do not claim the interrupted webapp typecheck passed.
3. Append one concise verdict row to `/home/dev/dev-projects/BersonCareBot/docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` covering candidate product commit `9eab369b2` and the current candidate tip. Name the artifact path and verdict. This main-repo queue row is the authorized audit registration; do not alter other queue rows.
4. In the candidate clone, stage only the audit artifact path explicitly and commit it with `audit(#787): record final branding gaps`. Do not modify product or test files. The main queue edit stays in the main tree for the lead to commit later.

Report the audit commit SHA and exact files changed. End only after the candidate clone is clean. The expected useful outcome is a registered independent `FAIL` that unlocks the already-prepared bounded product worker; do not soften it to `unclear` merely because unrelated checks were interrupted.
