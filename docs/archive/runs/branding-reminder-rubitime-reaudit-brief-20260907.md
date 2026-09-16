# #787 — re-audit trusted reminder origin and Rubitime retirement

You are the independent `auditor-live` for the new committed worker delta in `/home/dev/dev-projects/bcb-wt-branding-domain-absolute-links-20260907`. Product code is read-only. This is a focused re-audit of the newly changed DB/M2M origin surface plus owner-mandated Rubitime retirement; reuse prior accepted Host/origin kill-sets and do not repeat the full 27-minute audit. Commit before ending; do not push, land, deploy, mutate persistent DEV/TEST/PROD state, or touch DNS/TLS/services.

## Test or view classification — first action

Before reading tests, read `AGENTS.md` §§10a, 10b and 24 completely. Classify each item: trusted reminder materialization and fail-closed missing origin are repeatable behavior (`test` plus live request); migration privileges, one-resolver architecture, obsolete-source cleanup, active-doc cleanup and exact ENV contract removal are final state (`view`); UI copy/layout are not in scope. Record this at the top of the audit artifact.

## Authority and prior evidence

Read `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` B1/B2/B3/B4a/B8/C5a and `TPB-05`; `AUDIT_PATIENT_ABSOLUTE_LINKS_2026-09-07.md`; `AUDIT_FINAL_INTEGRATED_PATIENT_ORIGIN_HOST_DB_2026-09-07.md`; and `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md` §§9.3–9.4. Read the worker brief `runs/branding-domain-reminder-origin-final-brief-20260907.md`.

Prior independent `FAIL` already proved: integrator reminder callbacks built patient buttons from staff `APP_BASE_URL`, and a valid signed reminder wake returned HTTP 500 in split and one-host DEV. Existing Host-routing positives and absent known-slug/custom DEV data are not to be re-audited.

## Exact acceptance

1. Inspect the worker delta. The canonical patient and organization must come from the trusted reminder DB operation; caller/query/cookie/actor tenant text cannot select organization. The integrator must call the existing webapp-owned `CustomDomainBindingService.resolvePatientPublicOrigin`, not contain a second origin/Host algorithm. Staff `APP_BASE_URL` must never be a patient destination.
2. Run retained reminder materialization/route/config/custom-domain behavior suites. Re-run the same real signed reminder wake in split-surface and one-host DEV configuration. It must recover honestly or produce the correct patient-origin links; a missing trusted org/origin must fail closed without staff, BersonCare, hardcoded TherapyGo, or Rubitime fallback.
3. If the function signature changed, perform the existing owner-aware rollback-only migration preflight against named `bcb_webapp_dev`, analyze statement owner/security definer/runtime roles/table+column access, and verify declaration/generated privilege coverage. No execute, no disposable DB, no persistent writes, no GRANT/REVOKE inside the migration.
4. Verify `BOOKING_URL` is gone from runtime schema/defaulting/fallbacks, active env examples and active deploy docs. Booking without an internal signed link must omit/refuse the URL; no alternate booking system exists. Do not inspect or change ignored live env files; the lead removes DEV/TEST keys only after compatible TEST deploy.
5. Verify active product and active architecture docs contain no Rubitime behavior/diagnostic. Archive/history/migrations/evidence remain history and are allowlisted explicitly. Do not create a source-text absence test.
6. Inspect every touched test under §§10a/10b. Delete harmful source/format/function-spelling/call-shape/count/UI-copy/layout/DOM/table-count oracles found in touched scope. Update only genuine behavior tests made stale by the intentionally removed fallback. Record exact paths and why.

## Validation and deliverables

Use the cheapest relevant targeted suites, both changed-package typechecks, scoped ESLint, migration/privilege consistency checks when applicable, and `git diff --check`. Do not run full CI. Use only free ports `5211..5219`, never touch `:5200`, and prove listener cleanup.

Write/update a focused audit artifact under `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/`, append one concise verdict row for every new candidate commit to the main audit queue, explicitly stage only audit/test paths, and commit. Product files remain untouched. Verdict is binary for repository readiness; separately name TEST env removal/restart and PROD/DNS/TLS as external lead/owner gates.

