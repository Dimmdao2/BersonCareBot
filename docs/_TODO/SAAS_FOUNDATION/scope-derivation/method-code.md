# Scope derivation — METHOD: CODE USAGE

Independent derivation (1 of 3) of "which `public` base tables need org/tenant scoping" for
BersonCareBot multi-tenant SaaS. **Signal = how application code reads/writes the table**, NOT
schema column names and NOT the FK graph. Derived from scratch; did not read the other methods'
outputs.

## How the evidence was gathered (reproducible, read-only)

1. Authoritative table list (metadata only, no PII):
   `psql "$DATABASE_URL" -At -c "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1;"`
   → **185** base tables (DB = `bcb_webapp_dev`, the webapp DB).
2. Tables are almost never referenced by raw literal name. Code uses **Drizzle table consts**
   (camelCase) defined in `apps/webapp/db/schema/*.ts` (+ package `packages/operator-db-schema/src/*.ts`).
   Built a `const → table_name` map (199 consts) by parsing `export const X = pgTable("name", …)`.
3. For each of the 185 tables, ripgrep'd **both** the literal name and every owning Drizzle const
   across `apps/webapp/src`, `apps/integrator/src`, `apps/media-worker/src` (tests excluded), and
   collapsed hits to the owning **module / route / app-layer zone**. That zone IS the code-usage
   signal used to bucket. (Note: an internal secret-redactor masks bare identifiers inside
   comments/strings as `n`/`ln`/`l`; the **file path + zone** is the reliable signal, so citations
   below cite path:line, which is unaffected.)

### Buckets
- **SCOPE** — code reads/writes it in a PATIENT, CLINICAL, or DOCTOR/practice context (per-patient
  or per-practice data). Needs org/tenant scoping.
- **GLOBAL** — used only by auth/login/session/identity/channel-binding code (one row per human).
- **TELEMETRY** — analytics / event / playback / delivery-attempt logging code.
- **LEGACY** — Rubitime mirror path (`patient_bookings` / `appointment_records`), being deprecated.

### Single-tenant-today reality (load-bearing for the whole exercise)
`select count(*)` → `be_organizations = 1`, `branches = 2`, `be_branches = 2`. The product runs as a
single clinic today; org/tenant columns are mostly absent. So "SCOPE" here = *the per-clinic /
per-patient data that WOULD have to carry an org_id when this goes multi-tenant*, judged by which
clinical/doctor/patient code path owns the table.

---

## SCOPE (140 total: 124 with code references below + 16 DB-only)

Grouped by the dominant owning area. Reason cites a representative `file:line` (or zone) where
clinical/doctor/patient code reads or writes it. The 16 DB-only SCOPE tables (zero code refs on this
branch) are listed in their own section further down; together = 140. Flat list is authoritative.

### Booking engine — canonical appointments/scheduling/availability (per-practice + per-patient)
Canonical write path lives in `modules/patient-booking` + `modules/booking-*`; doctor calendar reads
in `app/app/doctor` + `modules/booking-calendar`; patient timeline reads in `modules/client-history`.
- `be_appointments` — `modules/booking-calendar`, `app/app/doctor`; canonical appt write path (`modules/patient-booking/patient-booking.md`).
- `be_appointment_events` — `infra/repos/pgBookingEngine.ts`; appt event-sourcing.
- `be_appointment_history_events` — `infra/repos/pgBookingEngine.ts`; appt history store.
- `be_appointment_cancellations` — `modules/doctor-appointments`, `modules/client-history`.
- `be_appointment_reschedules` — `modules/doctor-appointments`, `modules/patient-booking`.
- `be_appointment_staff_comments` — `modules/client-history`; staff notes on a patient's appt.
- `be_patient_timeline_events` — `modules/client-history`; per-patient timeline.
- `be_availability_rules` — `modules/booking-scheduling`.
- `be_schedule_blocks` — `modules/booking-calendar`, `modules/booking-scheduling`.
- `be_working_hours` — `modules/booking-calendar`, `modules/booking-scheduling`.
- `be_clinic_services` — `infra/repos/pgBookingCatalog.ts`/`pgBookingEngine.ts`; clinic service catalog.
- `be_rooms` — `infra/repos/pgBookingEngine.ts`; clinic rooms.
- `be_specialists` — `infra/repos/pgBookingEngine.ts`; practice specialists.
- `be_specialist_locations` — `infra/repos/pgBookingEngine.ts`.
- `be_specialist_rooms` — `infra/repos/pgBookingEngine.ts`.
- `be_specialist_service_availability` — `infra/repos/pgBookingEngine.ts`.
- `be_service_location_availability` — `infra/repos/pgBookingEngine.ts`.
- `be_external_entity_mappings` — `modules/booking-appointment-sync`, GCal sync; per-practice external ids.
- `be_cancellation_policies` — `infra/repos/pgBookingPolicies.ts`; per-practice policy.
- `be_reschedule_policies` — `infra/repos/pgBookingPolicies.ts`; per-practice policy.
- `be_prepayment_policies` — `infra/repos/pgBookingPolicies.ts`; per-practice policy.
- `be_booking_form_fields` — `modules/booking-form`; per-practice intake form.
- `be_booking_form_submissions` — `modules/booking-form`; per-patient submission.
- `be_patient_booking_profiles` — `modules/client-history`; per-patient booking profile.

### Booking engine — payments / packages / products (per-practice catalog + per-patient ledger)
- `be_payments` — `infra/repos/pgPayments.ts`.
- `be_payment_intents` — `modules/patient-booking`.
- `be_payment_provider_events` — `infra/repos/pgPayments.ts`; per-payment provider events.
- `be_payment_history_events` — `modules/client-history`, `modules/patient-booking`.
- `be_refunds` — `infra/repos/pgPayments.ts`.
- `be_products` — `modules/products`; per-practice product catalog.
- `be_product_pay_links` — `modules/products`.
- `be_product_purchases` — `modules/products`, `modules/client-history`; per-patient purchases.
- `be_product_history_events` — `modules/client-history`.
- `be_package_items` — `modules/memberships`.
- `be_package_usages` — `modules/memberships`, `modules/client-history`; per-patient usage.
- `be_package_history_events` — `modules/client-history`.
- `be_patient_packages` — `modules/memberships`; per-patient package.
- `be_patient_package_items` — `modules/memberships`.
- `be_subscription_packages` — `modules/memberships`; per-practice package catalog.
- `be_organizations` — `infra/repos/pgBookingEngine.ts` `mapOrg`; **the tenant/org row itself** (borderline, see below).
- `be_branches` — `infra/repos/pgBookingEngine.ts`; **per-org branch** (borderline tenant anchor).

### Legacy booking catalog mirror (still read by patient/doctor booking UI)
- `branches` — `modules/booking-calendar`, `modules/patient-booking`, `app/app/doctor`; practice branch (tenant anchor; borderline).
- `booking_branches` — `modules/booking-catalog`.
- `booking_cities` — `modules/patient-booking`, `modules/help-content`.
- `booking_services` — `modules/booking-catalog`.
- `booking_specialists` — `modules/booking-catalog`.
- `booking_branch_services` — `modules/patient-booking`.

### Clinical: LFK (exercise therapy) — practice catalog + per-patient assignment
- `lfk_exercises` — `modules/lfk-exercises`, `app/app/doctor`; exercise catalog.
- `lfk_exercise_media` — `modules/lfk-templates`, `app/app/doctor`.
- `lfk_exercise_regions` — `modules/lfk-exercises`.
- `lfk_complexes` — `modules/diaries`, `modules/doctor-clients`; per-patient LFK complex (`user_id`).
- `lfk_complex_exercises` — `infra/repos`; complex composition.
- `lfk_complex_templates` — `modules/material-rating`, `infra/repos`; template catalog.
- `lfk_complex_template_exercises` — `infra/repos`.
- `patient_lfk_assignments` — `app/api/.../route.ts` SELECT FROM patient_lfk_assignments (`apps/webapp/src/infra/repos/pgLfkAssignments.ts:56`); per-patient assignment.
- `lfk_sessions` — `infra/repos/pgLfkDiary.ts`; per-patient session log.

### Clinical: tests / recommendations / references (catalog + per-patient results)
- `tests` — `modules/tests`, `modules/treatment-program`, `app/app/doctor`; clinical test catalog.
- `test_sets` — `modules/treatment-program`, `app/app/doctor`.
- `test_set_items` — `modules/treatment-program`.
- `test_attempts` — `modules/treatment-program`, `app/app/doctor`; per-patient attempt.
- `test_results` — `modules/tests`, `modules/treatment-program`; per-patient results.
- `clinical_test_measure_kinds` — `infra/repos/pgClinicalTestMeasureKinds.ts`; clinical scoring catalog.
- `clinical_test_regions` — `infra/repos/pgClinicalTests.ts`; clinical region catalog.
- `recommendations` — `modules/recommendations`, `modules/treatment-program`; clinical recommendation catalog.
- `recommendation_regions` — `infra/repos/pgRecommendations.ts`.
- `reference_categories` — `modules/tests`, `modules/lfk-exercises`, `modules/recommendations`; clinical reference catalog.
- `reference_items` — `modules/patient-mood`, `modules/recommendations`, `app/app/doctor`; clinical reference items (e.g. symptom_type).

### Clinical: treatment program (per-patient program + practice templates)
- `treatment_program_templates` — `infra/repos/pgTreatmentProgram.ts`; practice template.
- `treatment_program_template_stages` — `infra/repos`.
- `treatment_program_template_stage_groups` — `infra/repos`.
- `treatment_program_template_stage_items` — `modules/treatment-program`.
- `treatment_program_instances` — `modules/doctor-clients`, `app/app/doctor`; per-patient instance.
- `treatment_program_instance_stages` — `modules/messaging`, `infra/repos`.
- `treatment_program_instance_stage_groups` — `infra/repos`.
- `treatment_program_instance_stage_items` — `modules/messaging`, `infra/repos`.
- `program_action_log` — `modules/treatment-program`, `modules/patient-diary`, `app/app/patient`; per-patient program actions.
- `program_item_discussion_messages` — `infra/repos/pgProgramItemDiscussion.ts`; per-patient program item chat.
- `program_item_discussion_reads` — `infra/repos/pgProgramItemDiscussion.ts`.

### Clinical: diaries / symptoms / mood (per-patient)
- `symptom_entries` — `modules/diaries`, `modules/patient-mood`, `modules/patient-practice`; per-patient symptom/wellbeing entries.
- `symptom_trackings` — `modules/diaries`, `modules/doctor-clients`, `modules/patient-mood`; per-patient tracking.
- `patient_diary_day_snapshots` — `app/app/patient`, `infra/repos/pgPatientDiarySnapshots.ts`; per-patient diary.
- `patient_practice_completions` — `modules/patient-practice`, `modules/diaries`, `app/app/patient`, `app/app/doctor`; per-patient practice completion.
- `patient_daily_warmup_presentations` — `modules/patient-home`; per-patient warmup.
- `patient_daily_warmup_video_views` — `modules/patient-home`, `app/api/patient`; per-patient view log.

### Doctor / clinical notes, support, tasks (per-patient, doctor-facing)
- `doctor_notes` — `await deps.doctorNotes.listForUser(userId)` (`apps/webapp/src/app/api/doctor/clients/[userId]/notes/route.ts:37`); per-patient clinical notes.
- `doctor_patient_support` — `modules/doctor-clients`, `app/app/doctor`; per-patient support flag.
- `comments` — `modules/comments`, `modules/doctor-client-card`; entity comments on clinical targets (`COMMENT_TARGET_TYPES = exercise|lfk_complex|test|test_set|…`, `modules/comments/types.ts:2`).
- `specialist_tasks` — `modules/specialist-tasks`, `app/api/doctor`, `app/app/doctor`; doctor task queue.
- `motivational_quotes` — `modules/doctor-motivation-quotes`, `modules/patient-home`; doctor-authored patient-facing content.

### Messaging / support / broadcasts (per-patient + per-practice audience)
- `support_conversations` — `modules/messaging`, `app/app/doctor`; per-patient support thread.
- `support_conversation_messages` — `modules/messaging`.
- `support_questions` — `infra/repos/pgSupportCommunication.ts`; per-patient questions.
- `support_question_messages` — `infra/repos/pgSupportCommunication.ts`.
- `message_log` — `modules/doctor-cabinet`; doctor cabinet message aggregation.
- `broadcast_audit` — `modules/doctor-broadcasts`, `modules/patient-broadcasts`, `app/app/doctor`; per-practice broadcast.
- `broadcast_audit_recipients` — `modules/doctor-broadcasts`, `modules/patient-broadcasts`; per-broadcast recipients.

### Online intake (per-patient requests)
- `online_intake_requests` — `INSERT INTO online_intake_requests (id, user_id, …)` (`apps/webapp/src/infra/repos/pgOnlineIntake.ts:152`); `app/app/doctor`.
- `online_intake_answers` — `infra/repos/pgOnlineIntake.ts`.
- `online_intake_attachments` — `infra/repos/pgOnlineIntake.ts`.
- `online_intake_status_history` — `infra/repos/pgOnlineIntake.ts`.

### Content / courses / catalog (practice-authored, patient-consumed)
- `content_pages` — `modules/content-catalog`, `modules/courses`, `modules/lessons`, `modules/patient-home`, `app/app/doctor`+`patient`.
- `content_sections` — `modules/content-sections`, `modules/menu`, `modules/patient-home`, `app/api/patient`.
- `content_section_slug_history` — `infra/repos/pgContentSections.ts`.
- `courses` — `modules/courses`, `modules/patient-home`, `app/app/doctor`+`patient`.
- `patient_home_blocks` — `modules/patient-home`, `app/app/patient`, `app/app/settings`; patient home layout.
- `patient_home_block_items` — `modules/patient-home`, `app/app/patient`.
- `material_ratings` — `modules/material-rating`, `app/app/doctor`; per-patient material rating.
- `patient_content_rating_feedback` — `infra/repos`, `app/app/doctor`; per-patient feedback.
- `content_access_grants_webapp` — `modules/products`; per-patient content access entitlement.

### Media (practice library + per-patient uploads)
- `media_files` — `modules/media`, `modules/lfk-exercises`, `modules/online-intake`, `app/app/doctor`, media-worker; clinical/practice media + patient intake uploads.
- `media_folders` — `modules/media`; per-client media folders (`pgClientMediaFolders.ts`).
- `media_upload_sessions` — `infra/repos/mediaUploadSessionsRepo.ts`.
- `media_transcode_jobs` — `app-layer/media`; per-file transcode (practice content pipeline).

### Reminders (per-patient product reminders — source of truth in webapp)
- `reminder_rules` — `modules/reminders`; per-patient rules, "источник истины" (`modules/reminders/reminders.md`).
- `reminder_journal` — `modules/reminders`, `app/app/patient`; per-patient reminder action journal.
- `webapp_reminder_occurrences` — `modules/reminders`; per-patient occurrences.
- `mailing_topics_webapp` — `modules/patient-notifications`, `modules/patient-home`; per-patient mailing topics.
- `user_notification_topics` — `modules/patient-notifications`; per-patient topics.
- `user_notification_topic_channels` — `modules/reminders`, `app/api/patient`; per-patient topic/channel prefs.
- `user_channel_preferences` — `modules/patient-notifications`, `modules/doctor-broadcasts`, `app/app/doctor`; per-patient channel prefs.

### Misc per-patient
- `patient_merge_candidates` — `modules/patient-booking`; per-patient merge candidate.
- `platform_user_contacts` — `modules/patient-booking` writes contacts (`canonicalCreate.ts`); `app/app/doctor` reads supplementary contacts; per-patient contact set.
- `user_subscriptions_webapp` — `infra/repos`; per-patient subscription state.

### Platform user identity read AS patient roster (borderline → SCOPE)
- `platform_users` — read by `modules/doctor-clients` as the **patient roster** (`role='client'`, archive, profile fields for the client card; `clients/DoctorClientPrimaryContacts.tsx`, `AdminClientProfileEditPanel.tsx`), plus patient modules, analytics. Identity anchor AND per-patient profile. See borderline.

---

## GLOBAL (25)

Used only by auth / login / session / identity / channel-binding / per-human-account code, plus
cross-cutting infra (migration ledgers, idempotency, ops job/incident status, global config). One row
per human or one global/infra row; no per-patient clinical business context. (Includes `admin_audit_log`
and `webapp_schema_migrations`, documented in the reconciliation; flat list is authoritative.)

- `user_password_credentials` — `modules/auth`, `app/api/auth`; password login (`auth.md:38`).
- `user_oauth_bindings` — `modules/auth/oauth*`, `modules/platform-access`; OAuth identity binding.
- `user_pins` — `app/api/auth`, `app/api/me`; account PIN.
- `login_tokens` — `deps.loginTokens.markExpiredIfPast` (`apps/webapp/src/app/api/auth/messenger/poll/route.ts:25`); messenger login tokens.
- `email_challenges` — `app/api/auth`, `modules/auth`; email verification challenge.
- `phone_challenges` — `infra/repos/pgPhoneChallengeStore.ts`; phone OTP challenge.
- `phone_otp_locks` — `infra/repos/pgPhoneOtpLimits.ts`; OTP rate-lock.
- `phone_messenger_bind_secrets` — `infra/repos/pgPhoneMessengerBind.ts`; messenger bind secret.
- `channel_link_secrets` — `modules/auth`; channel link secret.
- `user_channel_bindings` — `modules/auth` (+ read by doctor-clients/reminders for display); channel→human binding. (borderline, see below.)
- `user_phone_history` — `infra/repos/pgPhoneHistory.ts`; phone change history for one account.
- `user_email_setup_tokens` — `infra/repos/pgEmailSetupTokens.ts`; one-time email-setup token.
- `auth_rate_limit_events` — `modules/auth`; auth rate-limit counters.
- `email_send_cooldowns` — `modules/reminders` (transactional-email cooldown) + auth; per-recipient send throttle, account-level.
- `user_web_push_subscriptions` — `app-layer/health`+`stats`, `infra/repos/pgWebPushSubscriptions.ts`; per-human push subscription endpoint.
- `idempotency_keys` — `modules/auth`, `infra/idempotency/pgStore.ts`, `app-layer/health`; cross-cutting request idempotency (infra, not patient data).
- `integrator_push_outbox` — `infra/integrator-push/*`, `modules/operator-health`; outbox for webapp→integrator pushes (infra plumbing). (borderline infra, see below.)
- `mailing_logs_webapp` — see TELEMETRY (mailing send log; classified TELEMETRY in the flat list). (borderline GLOBAL/TELEMETRY.)
- `user_subscriptions` — webapp-schema legacy/global subscription table (paired with integrator). (borderline.)
- `schema_migrations` — integrator-owned migration ledger (`INTG:infra/db`); infra.
- `webapp_schema_migrations` — Drizzle migration ledger; infra.
- `system_settings` — read by ~everything (`app-layer/*`, dozens of modules); global key/value config, single-clinic today. (borderline: would become per-org config in multi-tenant.)
- `operator_job_status` — `modules/operator-health`, cron tick status; ops infra (host/cron job status).
- `operator_incidents` — `modules/operator-health`, `app-layer/health`; ops incident ledger (system, not patient).

---

## TELEMETRY (18)

Analytics / event / playback / delivery-attempt logging; rolling-window aggregation; retention jobs.
(Authoritative members: see the flat list. This prose block enumerates all 18.)

- `product_analytics_events_recent` — `modules/product-analytics` short-retention raw events (`productAnalyticsRetention.ts`).
- `product_analytics_hourly` — `modules/product-analytics`; hourly rollup.
- `product_analytics_user_hourly` — `modules/product-analytics`; per-user hourly rollup (analytics).
- `product_push_notifications` — `app-layer/product-analytics`+`stats`, `modules/product-analytics`; product push analytics.
- `media_playback_client_events` — `app-layer/media`; client playback telemetry.
- `media_playback_resolution_events` — `db.insert(mediaPlaybackResolutionEvents)` (`apps/webapp/src/app-layer/media/playbackResolutionEvents.ts:20`); playback resolution telemetry.
- `media_playback_stats_hourly` — `app-layer/media`, `app/api/internal`; hourly playback rollup.
- `media_playback_user_video_first_resolve` — `app-layer/media`; first-resolve pair telemetry.
- `media_hls_proxy_error_events` — `app-layer/media`, `modules/media`; HLS proxy error telemetry.
- `notification_delivery_attempts` — `db.insert(...)` + 24h window aggregation (`apps/webapp/src/infra/repos/pgNotificationDeliveryAttempts.ts`); delivery-attempt log.
- `reminder_delivery_events` — `app-layer/health/adminReminderPipelineMetrics.ts` (24h window counts); reminder delivery telemetry.
- `reminder_occurrence_history` — `app-layer/health`+`stats`, `modules/reminders`; occurrence delivery history (ops metrics). (borderline → per-patient.)
- `support_delivery_events` — `infra/repos/pgSupportCommunication.ts`; support message delivery log.
- `mailing_logs_webapp` — `infra/repos`, purge keyed by `integrator_user_id`; mailing send log (account-level; borderline GLOBAL).
- `integration_webhook_error_events` — `modules/operator-health`, `app-layer/health`; inbound webhook error telemetry.
- `integration_webhook_last_status` — `modules/operator-health`; inbound webhook last-status telemetry.
- `operator_health_failure_archive` — `modules/operator-health`, `infra/repos/pgHealthFailureArchive.ts`; health-failure event archive.
- `operator_health_alert_sent` — `app-layer/health`, `infra/repos/pgOperatorHealthAlertSent.ts`; alert-sent dedup log.

(18 tables. `admin_audit_log` is an admin/identity action log, not analytics → classified GLOBAL, not here.)

---

## LEGACY (2)

Rubitime mirror path, explicitly compat-only / being deprecated.

- `patient_bookings` — `modules/patient-booking`; canonical path now writes `be_appointments`, this is
  the legacy mirror kept for compat (`patient-booking.md`: "канонический write-путь (`be_appointments`)
  + совместимость с [patient_bookings]"). `bookingMirrorDesyncMatrix.test.ts` references `DELETE FROM public.[patient_bookings]`.
- `appointment_records` — Rubitime projection (`shared/lib/scheduleRecordProvenance.ts`: "записей из
  проекции Rubitime … compat-sync"; `modules/appointments/service.ts` marks provenance for rows from
  `appointment_records`). Deprecated alongside the Rubitime path.

---

## Tables with ZERO code references in this branch (DB-only / provisioned ahead of code)

These exist in `bcb_webapp_dev` but have **no literal or Drizzle-const reference** anywhere in
`apps/*` or `packages/*` on branch `feat/doctor-ui-rebuild` (verified `refs=0`). Classified by
domain/name only → counted as **SCOPE** (clinical/patient/booking data tables awaiting wiring), and
all flagged borderline.

Clinical (10): `clinical_visit`, `clinical_complaint`, `clinical_complaint_update`,
`clinical_diagnosis`, `clinical_diagnosis_update`, `clinical_diagnosis_status_history`,
`clinical_diagnosis_catalog`, `clinical_anamnesis_illness`, `clinical_anamnesis_lifestyle`,
`clinical_anamnesis_trauma`.
Patient (3): `patient_files`, `patient_payment`, `patient_comorbidity`.
Booking engine (3): `be_appointment_no_shows`, `be_schedule_templates`, `be_working_days`.

(These 16 are included in the SCOPE count.)

---

## Counts & completeness reconciliation

The **authoritative classification is the flat list below** (every one of the 185
`information_schema` names appears exactly once). Counts were tallied programmatically from that list
(`awk 'NF==2{print $2}' | sort | uniq -c`), not by hand-counting prose. The grouped prose sections
above are explanatory; where prose and the flat list ever disagree, **the flat list wins.**

| Bucket    | Count |
|-----------|------:|
| SCOPE     |   140 |
| GLOBAL    |    25 |
| TELEMETRY |    18 |
| LEGACY    |     2 |
| **TOTAL** | **185** |

**Completeness gate: 140 + 25 + 18 + 2 = 185 = total base-table count. Nothing unclassified.** ✔

Notes on how the buckets are constituted:
- **SCOPE 140** = 124 tables with clinical/doctor/patient code references **+** 16 DB-only tables
  (the "zero code references" list above, classified by domain/name and flagged borderline).
- **GLOBAL 25** includes `admin_audit_log` (admin/identity action log) and the two migration ledgers
  (`schema_migrations`, `webapp_schema_migrations`) and cross-cutting infra (`idempotency_keys`,
  `integrator_push_outbox`, `outgoing_delivery_queue`, `operator_job_status`, `operator_incidents`,
  `system_settings`) alongside the pure auth/identity tables.
- **TELEMETRY 18** = the analytics/playback/delivery-attempt/webhook-status logs enumerated in the
  TELEMETRY section.
- **LEGACY 2** = `patient_bookings`, `appointment_records`.

To re-verify from this file:
`awk '/AUTHORITATIVE FLAT/{f=1} f&&/^\x60\x60\x60$/{c++} f&&c==1&&NF==2{print $2}' method-code.md | sort | uniq -c`

---

## AUTHORITATIVE FLAT CLASSIFICATION (source of truth — sums to 185)

Format: `table  BUCKET`. Sorted as in `information_schema`.

```
admin_audit_log                          GLOBAL
appointment_records                      LEGACY
auth_rate_limit_events                   GLOBAL
be_appointment_cancellations             SCOPE
be_appointment_events                    SCOPE
be_appointment_history_events            SCOPE
be_appointment_no_shows                  SCOPE
be_appointment_reschedules               SCOPE
be_appointment_staff_comments            SCOPE
be_appointments                          SCOPE
be_availability_rules                    SCOPE
be_booking_form_fields                   SCOPE
be_booking_form_submissions              SCOPE
be_branches                              SCOPE
be_cancellation_policies                 SCOPE
be_clinic_services                       SCOPE
be_external_entity_mappings              SCOPE
be_organizations                         SCOPE
be_package_history_events                SCOPE
be_package_items                         SCOPE
be_package_usages                        SCOPE
be_patient_booking_profiles              SCOPE
be_patient_package_items                 SCOPE
be_patient_packages                      SCOPE
be_patient_timeline_events               SCOPE
be_payment_history_events                SCOPE
be_payment_intents                       SCOPE
be_payment_provider_events               SCOPE
be_payments                              SCOPE
be_prepayment_policies                   SCOPE
be_product_history_events                SCOPE
be_product_pay_links                     SCOPE
be_product_purchases                     SCOPE
be_products                              SCOPE
be_refunds                               SCOPE
be_reschedule_policies                   SCOPE
be_rooms                                 SCOPE
be_schedule_blocks                       SCOPE
be_schedule_templates                    SCOPE
be_service_location_availability         SCOPE
be_specialist_locations                  SCOPE
be_specialist_rooms                      SCOPE
be_specialist_service_availability       SCOPE
be_specialists                           SCOPE
be_subscription_packages                 SCOPE
be_working_days                          SCOPE
be_working_hours                         SCOPE
booking_branch_services                  SCOPE
booking_branches                         SCOPE
booking_cities                           SCOPE
booking_services                         SCOPE
booking_specialists                      SCOPE
branches                                 SCOPE
broadcast_audit                          SCOPE
broadcast_audit_recipients               SCOPE
channel_link_secrets                     GLOBAL
clinical_anamnesis_illness               SCOPE
clinical_anamnesis_lifestyle             SCOPE
clinical_anamnesis_trauma                SCOPE
clinical_complaint                       SCOPE
clinical_complaint_update                SCOPE
clinical_diagnosis                       SCOPE
clinical_diagnosis_catalog               SCOPE
clinical_diagnosis_status_history        SCOPE
clinical_diagnosis_update                SCOPE
clinical_test_measure_kinds              SCOPE
clinical_test_regions                    SCOPE
clinical_visit                           SCOPE
comments                                 SCOPE
content_access_grants_webapp             SCOPE
content_pages                            SCOPE
content_section_slug_history             SCOPE
content_sections                         SCOPE
courses                                  SCOPE
doctor_notes                             SCOPE
doctor_patient_support                   SCOPE
email_challenges                         GLOBAL
email_send_cooldowns                     GLOBAL
idempotency_keys                         GLOBAL
integration_webhook_error_events         TELEMETRY
integration_webhook_last_status          TELEMETRY
integrator_push_outbox                   GLOBAL
lfk_complex_exercises                    SCOPE
lfk_complex_template_exercises           SCOPE
lfk_complex_templates                    SCOPE
lfk_complexes                            SCOPE
lfk_exercise_media                       SCOPE
lfk_exercise_regions                     SCOPE
lfk_exercises                            SCOPE
lfk_sessions                             SCOPE
login_tokens                             GLOBAL
mailing_logs_webapp                      TELEMETRY
mailing_topics_webapp                    SCOPE
material_ratings                         SCOPE
media_files                              SCOPE
media_folders                            SCOPE
media_hls_proxy_error_events             TELEMETRY
media_playback_client_events             TELEMETRY
media_playback_resolution_events         TELEMETRY
media_playback_stats_hourly              TELEMETRY
media_playback_user_video_first_resolve  TELEMETRY
media_transcode_jobs                     SCOPE
media_upload_sessions                    SCOPE
message_log                              SCOPE
motivational_quotes                      SCOPE
notification_delivery_attempts           TELEMETRY
online_intake_answers                    SCOPE
online_intake_attachments                SCOPE
online_intake_requests                   SCOPE
online_intake_status_history             SCOPE
operator_health_alert_sent               TELEMETRY
operator_health_failure_archive          TELEMETRY
operator_incidents                       GLOBAL
operator_job_status                      GLOBAL
outgoing_delivery_queue                  GLOBAL
patient_bookings                         LEGACY
patient_comorbidity                      SCOPE
patient_content_rating_feedback          SCOPE
patient_daily_warmup_presentations       SCOPE
patient_daily_warmup_video_views         SCOPE
patient_diary_day_snapshots              SCOPE
patient_files                            SCOPE
patient_home_block_items                 SCOPE
patient_home_blocks                      SCOPE
patient_lfk_assignments                  SCOPE
patient_merge_candidates                 SCOPE
patient_payment                          SCOPE
patient_practice_completions             SCOPE
phone_challenges                         GLOBAL
phone_messenger_bind_secrets             GLOBAL
phone_otp_locks                          GLOBAL
platform_user_contacts                   SCOPE
platform_users                           SCOPE
product_analytics_events_recent          TELEMETRY
product_analytics_hourly                 TELEMETRY
product_analytics_user_hourly            TELEMETRY
product_push_notifications               TELEMETRY
program_action_log                       SCOPE
program_item_discussion_messages         SCOPE
program_item_discussion_reads            SCOPE
recommendation_regions                   SCOPE
recommendations                          SCOPE
reference_categories                     SCOPE
reference_items                          SCOPE
reminder_delivery_events                 TELEMETRY
reminder_journal                         SCOPE
reminder_occurrence_history              TELEMETRY
reminder_rules                           SCOPE
schema_migrations                        GLOBAL
specialist_tasks                         SCOPE
support_conversation_messages            SCOPE
support_conversations                    SCOPE
support_delivery_events                  TELEMETRY
support_question_messages                SCOPE
support_questions                        SCOPE
symptom_entries                          SCOPE
symptom_trackings                        SCOPE
system_settings                          GLOBAL
test_attempts                            SCOPE
test_results                             SCOPE
test_set_items                           SCOPE
test_sets                                SCOPE
tests                                    SCOPE
treatment_program_events                 SCOPE
treatment_program_instance_stage_groups  SCOPE
treatment_program_instance_stage_items   SCOPE
treatment_program_instance_stages        SCOPE
treatment_program_instances              SCOPE
treatment_program_template_stage_groups  SCOPE
treatment_program_template_stage_items   SCOPE
treatment_program_template_stages        SCOPE
treatment_program_templates              SCOPE
user_channel_bindings                    GLOBAL
user_channel_preferences                 SCOPE
user_email_setup_tokens                  GLOBAL
user_notification_topic_channels         SCOPE
user_notification_topics                 SCOPE
user_oauth_bindings                      GLOBAL
user_password_credentials                GLOBAL
user_phone_history                       GLOBAL
user_pins                                GLOBAL
user_subscriptions_webapp                GLOBAL
user_web_push_subscriptions              GLOBAL
webapp_reminder_occurrences              SCOPE
webapp_schema_migrations                 GLOBAL
```

### Final audited counts (tallied from the flat list above — authoritative)

| Bucket    | Count |
|-----------|------:|
| SCOPE     |   140 |
| GLOBAL    |    25 |
| TELEMETRY |    18 |
| LEGACY    |     2 |
| **TOTAL** | **185** |

- LEGACY (2): `appointment_records`, `patient_bookings`.
- TELEMETRY (18): integration_webhook_error_events, integration_webhook_last_status,
  mailing_logs_webapp, media_hls_proxy_error_events, media_playback_client_events,
  media_playback_resolution_events, media_playback_stats_hourly,
  media_playback_user_video_first_resolve, notification_delivery_attempts,
  operator_health_alert_sent, operator_health_failure_archive, product_analytics_events_recent,
  product_analytics_hourly, product_analytics_user_hourly, product_push_notifications,
  reminder_delivery_events, reminder_occurrence_history, support_delivery_events.
- GLOBAL (25): admin_audit_log, auth_rate_limit_events, channel_link_secrets, email_challenges,
  email_send_cooldowns, idempotency_keys, integrator_push_outbox, login_tokens, operator_incidents,
  operator_job_status, outgoing_delivery_queue, phone_challenges, phone_messenger_bind_secrets,
  phone_otp_locks, schema_migrations, system_settings, user_channel_bindings, user_email_setup_tokens,
  user_oauth_bindings, user_password_credentials, user_phone_history, user_pins,
  user_subscriptions_webapp, user_web_push_subscriptions, webapp_schema_migrations.
- SCOPE (140): 185 − 2 − 18 − 25 = 140 (= all remaining tables; full list in "SCOPE list" below).

**Completeness gate: 140 + 25 + 18 + 2 = 185. Every base table classified exactly once.** ✔

---

## BORDERLINE (need human decision)

1. **`platform_users`** — THE identity anchor (one row per human) *and* read by doctor-clients as the
   patient roster (profile, archive, role). I bucketed **SCOPE** because doctor/patient code reads
   per-patient profile from it, but in a multi-tenant model this is the membership/identity table; the
   org_id likely lives on it or on a separate `org_memberships` table. **Decide:** scope-by-membership
   vs treat as global identity with a join table.
2. **`be_organizations` / `branches` / `be_branches`** — the tenant/org/branch tables *themselves*.
   They define the tenant; whether they "carry" an org_id or *are* the org dimension is a modeling
   choice. Single-clinic today (`orgs=1`, `branches=2`).
3. **`user_channel_bindings`** — bucketed GLOBAL (channel→human binding, auth), but doctor-clients &
   doctor-broadcasts read it per-patient (binding dates, active-messenger filter). Straddles
   GLOBAL/SCOPE.
4. **`platform_user_contacts`** — bucketed SCOPE (patient-booking writes contacts, doctor card reads),
   but it is fundamentally per-human contact identity. Straddles.
5. **`system_settings`** — bucketed GLOBAL (single global key/value config read everywhere). In
   multi-tenant most keys become per-org; some stay global (infra). Needs per-key split.
6. **`reminder_occurrence_history` / `reminder_delivery_events` / `notification_delivery_attempts` /
   `support_delivery_events`** — bucketed TELEMETRY (delivery logs, window-aggregated for ops), but
   each row is tied to a specific patient (`user_id`/`integrator_user_id`, purged on user delete). If
   "per-patient retention/export" matters they are SCOPE-ish PII telemetry.
7. **`integrator_push_outbox` / `outgoing_delivery_queue`** — bucketed GLOBAL (infra delivery
   plumbing), but payloads are per-patient messages. Infra-by-mechanism, patient-by-content.
8. **`mailing_logs_webapp` / `user_subscriptions_webapp`** — webapp-side mirrors keyed by
   `integrator_user_id`; per-human. GLOBAL vs TELEMETRY (logs) vs SCOPE (subscription state).
9. **The 16 zero-code-reference tables** (clinical_*, patient_files/payment/comorbidity,
   be_appointment_no_shows/schedule_templates/working_days) — classified SCOPE by name only; **no
   code evidence exists on this branch.** Confirm they are real upcoming clinical/patient features
   (then SCOPE) vs abandoned/idle (then drop).

---

## SCOPE list (the deliverable) — 140 tables

be_appointment_cancellations, be_appointment_events, be_appointment_history_events,
be_appointment_no_shows, be_appointment_reschedules, be_appointment_staff_comments, be_appointments,
be_availability_rules, be_booking_form_fields, be_booking_form_submissions, be_branches,
be_cancellation_policies, be_clinic_services, be_external_entity_mappings, be_organizations,
be_package_history_events, be_package_items, be_package_usages, be_patient_booking_profiles,
be_patient_package_items, be_patient_packages, be_patient_timeline_events, be_payment_history_events,
be_payment_intents, be_payment_provider_events, be_payments, be_prepayment_policies,
be_product_history_events, be_product_pay_links, be_product_purchases, be_products, be_refunds,
be_reschedule_policies, be_rooms, be_schedule_blocks, be_schedule_templates,
be_service_location_availability, be_specialist_locations, be_specialist_rooms,
be_specialist_service_availability, be_specialists, be_subscription_packages, be_working_days,
be_working_hours, booking_branch_services, booking_branches, booking_cities, booking_services,
booking_specialists, branches, broadcast_audit, broadcast_audit_recipients, clinical_anamnesis_illness,
clinical_anamnesis_lifestyle, clinical_anamnesis_trauma, clinical_complaint, clinical_complaint_update,
clinical_diagnosis, clinical_diagnosis_catalog, clinical_diagnosis_status_history,
clinical_diagnosis_update, clinical_test_measure_kinds, clinical_test_regions, clinical_visit, comments,
content_access_grants_webapp, content_pages, content_section_slug_history, content_sections, courses,
doctor_notes, doctor_patient_support, lfk_complex_exercises, lfk_complex_template_exercises,
lfk_complex_templates, lfk_complexes, lfk_exercise_media, lfk_exercise_regions, lfk_exercises,
lfk_sessions, mailing_topics_webapp, material_ratings, media_files, media_folders, media_transcode_jobs,
media_upload_sessions, message_log, motivational_quotes, online_intake_answers,
online_intake_attachments, online_intake_requests, online_intake_status_history, patient_comorbidity,
patient_content_rating_feedback, patient_daily_warmup_presentations, patient_daily_warmup_video_views,
patient_diary_day_snapshots, patient_files, patient_home_block_items, patient_home_blocks,
patient_lfk_assignments, patient_merge_candidates, patient_payment, patient_practice_completions,
platform_user_contacts, platform_users, program_action_log, program_item_discussion_messages,
program_item_discussion_reads, recommendation_regions, recommendations, reference_categories,
reference_items, reminder_journal, reminder_rules, specialist_tasks, support_conversation_messages,
support_conversations, support_question_messages, support_questions, symptom_entries, symptom_trackings,
test_attempts, test_results, test_set_items, test_sets, tests, treatment_program_events,
treatment_program_instance_stage_groups, treatment_program_instance_stage_items,
treatment_program_instance_stages, treatment_program_instances, treatment_program_template_stage_groups,
treatment_program_template_stage_items, treatment_program_template_stages, treatment_program_templates,
user_channel_preferences, user_notification_topic_channels, user_notification_topics,
webapp_reminder_occurrences
