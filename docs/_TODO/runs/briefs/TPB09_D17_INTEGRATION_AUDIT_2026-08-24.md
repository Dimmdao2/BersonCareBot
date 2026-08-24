# Independent audit: TPB-09 + D17 branding integration

Read `AGENTS.md` first and obey its per-action routing, audit and DEV-database rules.

## Candidate

- Worktree: `/home/dev/dev-projects/bcb-wt-therapysto-night-20260823`
- Branch: `wt/therapysto-night-20260823`
- Exact candidate SHA: `c1bbb78b2197749909765e56dfab328bcb93f340`
- Owner plan: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`
- Existing TPB-09 evidence: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/E1_EVIDENCE_TPB09_2026-08-24.md`

Audit the exact candidate SHA above. Stop and report STALE if HEAD differs before your first check or if product code changes during the audit.

## Authority and owner boundary

The owner explicitly authorized merging the branding branch with `feat/doctor-ui-rebuild` and fixing all real integration conflicts. Earlier agent-authored prohibitions against merging, touching the delivery root, or implementing the auth mechanics matrix were removed as unauthorized.

Do not switch or activate domains, DNS, TLS, nginx, TEST origins, or runtime env. `test.bersoncare.ru` must continue working at its current address. Domain-dependent activation is not part of this audit.

## Тест или взгляд — say this first

For each check, state **TEST** or **INSPECTION** before running it.

- Prefer a behavior test/injection when one can prove the claim at reasonable cost.
- Use inspection only for a genuinely static property or when a behavior test would be disproportionate; name why.
- A green test is evidence for a behavior only if its failure injection demonstrably turns it red, or it first failed on the real defect and then passed after the fix.

## Scope A — TPB-09 closing audit

Independently verify the TPB-09 checklist against the current owner plan, not merely the existing report. Reuse existing evidence only after confirming it still points at the current implementation and rerun the decisive checks/injections. At minimum verify:

- clinic transactional sender/template identity and `.ics` organizer name use the same clinic-owned source;
- patient-visible attachment naming no longer exposes BersonCare branding;
- stable already-issued event identity was not needlessly rewritten;
- the configuration seam and clinic settings ownership are real and tenant-bound;
- any claimed mutation/injection actually makes the relevant check fail.

## Scope B — D17 delivery-root integration

Audit the final state after the feat merge and the three relevant commits:

- `bd1da907f` removes the stale runtime-overlay definition;
- `3cbccb810` adds the late reconciliation migration;
- `c1bbb78b2` enables rollback-only candidate preflight using canonical DEV env files.

Prove the effective migration-owned function `app.read_integrator_clinic_delivery_credential`:

- is owned by `app_seam_settings_integrator_owner`;
- accepts only `app_integrator_tenant_service` as caller;
- denies the broad `app_tenant_service` role;
- enforces exact organization equality;
- supports SMTP, SMSC, Telegram, MAX, VK and `clinic_transactional_mail_template` keys;
- contains no migration-level GRANT/REVOKE and has no second active runtime-overlay definition;
- remains usable by the actual integrator path needed for appointment reminders.

The orchestrator already ran this exact rollback-only candidate command successfully and it ended in ROLLBACK:

`bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot`

Do not accept that statement as your proof: rerun or independently inspect the exact candidate evidence. Do not execute migrations permanently and do not create a disposable database.

Also audit the new `--runtime-env-root` boundary: preflight-only, regular non-symlink root/files, candidate parser/runners/migration sources retained, execute mode rejects the override, and no secret value is printed.

## Findings bar

A MUST FIX exists only for a reachable broken behavior, security-boundary bypass, data loss/corruption, or build/runtime/integration failure tied to the owner plan. Style, preference, alternative architecture, speculative hardening, and agent-invented scope are not findings. For every finding give the exact scenario, impact, violated requirement, and evidence.

Do not modify product code. If you find a defect, report it for the orchestrator to fix. You may add audit-only tests/injections and the required audit report/queue entry.

## Required output

1. Write a detailed audit report under `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/` with exact candidate SHA, TEST/INSPECTION classifications, commands, injections, results and verdict per scope.
2. Record the exact candidate commits in the repository audit queue using the existing format.
3. Commit only audit artifacts/tests with a meaningful audit commit; do not push or merge.
4. Final verdict must be `PASS`, `FAIL`, or `STALE`, with no ambiguous “mostly pass”.
