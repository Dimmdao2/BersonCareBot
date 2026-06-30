# Verified scope list (3-method reconciliation + DB arbiter) — 2026-06-17

Supersedes the C1-broken classification in `01_MASTER_PLAN.md`. Derived by **three independent methods**
(blind to each other) + a **deterministic DB arbiter** (recursive FK-closure) + **completeness gate**.

## Method results (the disagreement IS the value)
| | columns (mine) | FK-closure agent | code-usage agent | **DB arbiter (deterministic)** |
|---|---|---|---|---|
| SCOPE | 81 w/ direct key | 128 | 140 | 67 (+44 `be_*` already-org) |
| GLOBAL | — | 32 | 25 | 18 identity + 48 infra |
| LEGACY | — | 8 | 2 | 8 |
| **total reconciles to 185** | — | ✅ | ✅ | ✅ |

Why they differ: agents are **inclusive** (FK/code dragged in content catalogs via `created_by` + counted `be_*` + per-patient telemetry); arbiter is **conservative** (seeds only on patient/user keys + FK-children, with explicit identity/legacy cut-sets). **All four converge on the clinical/patient core** and diverge only on the known judgment perimeter → high confidence.

## ✅ VERIFIED MUST-SCOPE CORE — 66 tables need `organization_id` (the C1 fix)
These are SCOPE in the arbiter AND confirmed by both agents. **Includes every EHR table the original heuristic missed.**

**Clinical EHR (~17):** clinical_visit, clinical_complaint(+_update), clinical_diagnosis(+_update, _status_history), clinical_anamnesis_{illness,lifestyle,trauma}, patient_comorbidity, symptom_entries, symptom_trackings · **patient_files** (PHI+s3) · **patient_payment**.
**Treatment programs (8):** treatment_program_instances(+_stages, _stage_groups, _stage_items, _events), program_action_log, program_item_discussion_{messages,reads}.
**LFK/rehab (4):** lfk_complexes, lfk_complex_exercises, lfk_sessions, patient_lfk_assignments.
**Tests (2):** test_attempts, test_results.
**Diary/activity (4):** patient_diary_day_snapshots, patient_practice_completions, patient_daily_warmup_presentations, patient_daily_warmup_video_views.
**Intake (4):** online_intake_requests, online_intake_answers, online_intake_attachments, online_intake_status_history.
**Support/comms (7):** support_conversations, support_conversation_messages, support_questions, support_question_messages, doctor_patient_support, doctor_notes, specialist_tasks.
**Reminders (3):** reminder_rules, reminder_journal, webapp_reminder_occurrences.
**Messaging/media (6):** message_log, media_files, media_folders, media_upload_sessions, material_ratings, patient_content_rating_feedback.
**Misc per-patient (~3):** content_access_grants_webapp, broadcast_audit_recipients, platform_user_contacts.

Full machine list: `needs-orgid.txt`; full per-table classification: `arbiter.tsv`; method evidence: `method-fk.md`, `method-code.md`, `method-columns.tsv`.

## ⚠️ BORDERLINE — owner decisions (move tables in/out of scope)
1. **Per-patient TELEMETRY / delivery-logs (~10, currently INSIDE the 66):** product_analytics_events_recent, product_analytics_user_hourly, media_playback_{client_events,resolution_events,user_video_first_resolve}, media_hls_proxy_error_events, media_transcode_jobs, operator_health_failure_archive, notification_delivery_attempts, support_delivery_events. Keyed by `user_id` → would leak cross-patient if NOT scoped, but they're analytics/logs. **Decide: isolate (keep in scope) or treat as global telemetry (drop ~10 → core ≈ 56).**
2. **Content catalogs (~10-15, currently OUTSIDE / in OTHER):** courses, content_pages, content_sections, recommendations(+_regions), tests, test_sets(+_items), reference_categories(+_items), motivational_quotes, clinical_diagnosis_catalog, lfk_exercises(+_media,_regions), lfk_complex_templates(+_exercises). Staff-authored (`created_by`). **Decide: shared global library, or per-tenant?** Per-tenant → +these to scope.
3. **`system_settings`:** has a `scope` column → needs **row-level** global/tenant split, not a plain org_id column. Special handling.
4. **LEGACY (8) confirm drop:** patient_bookings, appointment_records, branches, booking_{cities,services,branches,specialists,branch_services} — Rubitime/branch-scoped, being deprecated → frozen, NOT scoped. Confirm.

## Completeness & invariants
- **Gate:** 185 tables all classified, sum reconciles ✅ (the check that would have caught C1 — clinical_* and patient_files/payment are now IN scope, not silently dropped).
- **FK-closure invariant:** children of scoped tables (e.g. clinical_diagnosis_update, _status_history) pulled in automatically ✅.
- **`be_*` (44):** already carry `organization_id` → confirmed tenant-scoped, **no work** (not in the 66).
## ✅ FINAL — owner decisions applied (2026-06-17): **84 tables need `organization_id`**
List: `needs-orgid-FINAL.txt`. Decisions:
- **Telemetry SPLIT:** delivery/usage logs (notification_delivery_attempts, support_delivery_events, reminder_journal, media_playback_*, media_transcode_jobs) → SCOPE; aggregate analytics + infra telemetry (product_analytics_events_recent, product_analytics_user_hourly, media_hls_proxy_error_events, operator_health_failure_archive) → GLOBAL (−4 from core → 62).
- **Catalogs PER-TENANT (+22):** lfk_exercises(+_media,+_regions), lfk_complex_templates(+_exercises), treatment_program_templates(+_stage*), courses, content_pages, content_sections, tests, test_sets(+_items), recommendations(+_regions), reference_categories(+_items), motivational_quotes, clinical_diagnosis_catalog, clinical_test_regions. Each specialist/clinic owns its library. (`user_email_setup_tokens` was a created_by false-positive → stays GLOBAL.)
- **NEW workstream — MARKETPLACE/STORE** (owner: "магазин с покупкой библиотек упражнений"): a GLOBAL store inventory of sellable library-products + purchase records; buying = COPY into the tenant's per-tenant catalog (same copy pattern as patient-transfer). Later feature, NOT Phase-0 foundation, but the per-tenant catalog model already supports it.
- **system_settings:** org-aware row-level (global + per-org rows) — ties to C2/D7 redesign.
- **Legacy-8:** frozen, not scoped.

**Reconciles: 84 need-org + 44 `be_*`(have org) + 8 legacy + ~18 identity + ~31 infra/analytics = 185 ✅.**
Next: corrected **shared-DB + RLS** plan on these 84 + store workstream + C2 (D7 config) + C3 (headless runtimes).
