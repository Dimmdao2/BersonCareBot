# Fresh adversarial review — 2026-06-17 — ⛔ REWORK REQUIRED BEFORE F0.1

Cold-start Opus review of the SAAS_FOUNDATION plan, verified against code + prod-mirror DB. Verdict:
**not sound to start F0.1 as written.** Damage is concentrated and fixable before any code. The
dormant/additive philosophy and the ground-truth measurements (1 org, 2 specialists, no pgbouncer,
owner-role-owns-tables, no bypassrls) are correct — but the executable plan is built on a table
inventory wrong by ~2–3× and a config primitive that does not exist.

## CRITICAL

### C1 — Clinical-scope classification missed the entire EHR. "18 scope tables" is wrong by ~2–3×.
The classification used a `platform_user_id|user_id` heuristic — which matched **only 2 of the 15**
user-key column names that exist. **Confirmed by query:** 185 public base tables; user-key columns
include `user_id`(34), `platform_user_id`(24), **`patient_user_id`(18)**, `owner_user_id`,
`doctor_user_id`, `uploaded_by_user_id`, `assigned_by_platform_user_id`, … — none of which the
heuristic saw except the first two.
- **18 `patient_user_id` tables entirely omitted (the EHR core):** clinical_complaint, clinical_diagnosis, clinical_visit, clinical_anamnesis_illness/lifestyle/trauma, patient_comorbidity, **patient_files** (PHI + s3_key/s3_bucket), **patient_payment**, patient_lfk_assignments, treatment_program_instances, program_action_log, program_item_discussion_messages, program_item_discussion_reads, test_attempts, doctor_patient_support, media_folders, specialist_tasks.
- **~20+ child clinical tables** reachable only via a parent FK (no user column) are also invisible to the heuristic: clinical_*_update/_status_history, online_intake_answers/attachments/status_history, support_conversation_messages, support_questions, treatment_program_instance_stage*/_events, test_results, reminder history/journal tables, lfk_complex_exercises.
- **Risk at cutover:** omitted tables get no `organization_id` + no policy → at `app.enforce_tenancy=on` they either **leak cross-tenant** (no policy) or **deny-all** (NULL ≠ org), depending on F0.14's invariant. Worst case: org B reads org A's diagnoses/files/payments.
- **Fix:** re-derive the scope universe by **FK reachability** from `platform_users` + `be_organizations` (a script), not a 2-column match; make that reachability the F0.14 CI-invariant source of truth so "scoped" can't drift. Realistic SCOPE surface ≈ **45–55 tables**. Re-batch (B1/B2/B3 invalidated).

### C2 — D7 "per-org integration config via `system_settings`" is infeasible — `scope` is role-based, not org-based.
`apps/webapp/src/modules/system-settings/types.ts:174` — `SystemSettingScope = "global"|"doctor"|"admin"`. No organization dimension; `(key, scope)` is a global singleton; integrator mirror is org-blind (`grep apps/integrator/src organization_id` → none). A second clinic's bot token would overwrite the first's. D7 collides with rule `000-critical-integration-config-in-db` (the only compliant store is structurally single-tenant).
- **Fix:** net-new mechanism, not a config-key add. Either (a) add nullable `organization_id` to `system_settings` (PK `(key, scope, organization_id)`; mirror + `updateSetting` + admin API all change), or (b) a dedicated `be_organization_integrations(organization_id, integration_code, config_json, …)` + resolver port falling back to the global row. **Amend rule 000 in lockstep.** Do NOT start F0.15 until redesigned.

### C3 — "dormant + centralized" breaks on 3 of 4 runtimes; RLS must be hard-gated behind the role split.
- **Headless runtimes have no org and no request edge:** integrator/worker/scheduler/bot (`apps/integrator/src` → zero `organization_id`/resolver refs) write scoped clinical tables (notification_delivery_attempts, reminders, message_log) via their own `new Pool`. Under `FORCE`+GUC-on they never set `app.organization_id` → **denied** → reminders/notifications/support delivery break. The spine F0.1–F0.20 has **no stage** to wrap them (only FOUNDATION_PLAN §C2 prose).
- **Resolver doesn't auto-centralize:** `getDefaultOrganizationId()` takes no principal; "most callers inherit the fix" needs session threaded into ~104 call sites or request-scoped `AsyncLocalStorage` (doesn't exist). That's T0 work mislabeled as inherited.
- **RLS sequencing:** owner-role owns all 185 tables → `ENABLE+FORCE` applies to the app immediately; dormancy rests entirely on the permissive `IS DISTINCT FROM 'on'` predicate. One predicate bug (unset → `''` compared to org) flips prod to deny-all. **F0.13 must hard-gate behind F0.12 + a staging shadow-run + a GUC-predicate test** (unset→permit, on+wrong-org→deny, on+empty→deny) as a blocking deliverable, not a footnote.

## HIGH
- **H1 — F0.2 staff seed non-deterministic:** `be_specialists` has no `platform_user_id` (confirmed) — doctor↔specialist is name-match only. Hardcode `518e…` with an existence+active+appt-count assertion; make F0.2 depend on specialist-consolidation; guard so inactive `c951…` can't be picked.
- **H2 — Catalog/template tenancy is an unmade decision:** `lfk_exercises`, `lfk_complex_templates`, `treatment_program_templates` (only `created_by`) are assumed global. In real multi-tenant, does clinic B see clinic A's exercise/program library? If per-org → +~6–10 tables to SCOPE. **Add to F0.8b sign-off.**
- **H3 — `patient_lfk_assignments` dropped yet is a clinical root** (keyed `patient_user_id`, named in LFK absolutes). Inconsistent with including `lfk_sessions/lfk_complexes`. (Adding nullable `organization_id` to LFK tables is permitted — §5.1a lifted the ban — so no rule violation, just a coverage hole.)
- **H4 — S3 isolation (F0.17) shallow:** `patient_files.s3_key/s3_bucket` (PHI) + `media_files` exist; F0.17 only touches new objects in `infra/s3/client.ts` and never the `patient_files` write path or existing org-less keys.

## MEDIUM / LOW
- **M1** — `broadcast_audit_recipients` is a child of `broadcast_audit` (no org/patient); classify the parent + `mailing_logs_webapp`, not just the recipient join.
- **M2** — `message_log` per-org defensible but written by the integrator (C3 breakage).
- **M3** — Sizing optimistic: ~45–55 scoped tables (3× the DDL/backfill/RLS/CI surface) + the C2 config workstream + the C3 headless-runtime workstream → Phase 0 well above ~3–4.5wk; "~20→~30 stages" undercounts.
- **M4** — F0.20 isolation test can't run yet: needs a synthetic 2nd org (only 1 exists) + depends on F0.12 landing first.
- **Low** — 00 schema sketch says org `status`; real column is `is_active`. `card_visibility_policy` not yet present (planned, fine). proxy-not-middleware confirmed (F0.16 feasible).

## Required rework before executing (in order)
1. **Re-derive scope universe by FK reachability** + re-batch (reshapes F0.8/F0.9/F0.11/F0.13/F0.14).
2. **Redesign D7** into a real org-scoped config store + amend rule 000 (before F0.15).
3. **Add headless-runtime tenant-context workstream** + hard-gate F0.13 behind F0.12 + shadow-run.
4. **Make F0.2 specialist seed deterministic** + dependent on consolidation.
5. **Decide catalog/template tenancy** at F0.8b.

F0.1 (`be_organization_members` DDL) is itself low-risk, but starting it would falsely signal the plan is validated. **Fix C1 + C2 first — about a day of planning, zero code lost.**
