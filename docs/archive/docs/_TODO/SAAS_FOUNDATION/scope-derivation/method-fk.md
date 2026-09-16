# Scope derivation — METHOD: FK-REACHABILITY (graph)

> Independent derivation #of-3. Method = **FK graph reachability**, not column-name matching.
> Source: `bcb_webapp_dev`, metadata only (`pg_constraint contype='f'`, `information_schema`). Read-only. No PII read.
> Total `public` base tables: **185** (matches `SELECT count(*) ... table_type='BASE TABLE'`).

## Method

1. Pulled all 185 base tables + all 312 FK constraints (deduped to **285 child→parent edges**).
2. **Roots:** `be_organizations` (tenant root) and `platform_users` (person/patient root).
3. **Closure rule:** a table is **SCOPE** if it transitively FK-references a SCOPE table (child of a scoped parent ⇒ scoped — e.g. `clinical_diagnosis_update → clinical_diagnosis → platform_users`). Propagation runs parent→child along FK edges until fixpoint.
4. **Cut-set problem:** `platform_users` is a _dual_ root — the patient/clinical anchor **and** the auth/identity anchor. Naïve reachability drags the whole credential/channel cluster into SCOPE. So the auth/credential/channel/notification-pref children of `platform_users` are placed in a **GLOBAL cut-set**: closure does **not** flow through them. `platform_users` itself is bucketed GLOBAL (one identity row per human), while `be_organizations` stays in SCOPE as the tenant anchor.
5. Tables unreached by FK (no edge to a root) classified by column/name semantics; a 2nd closure pass then pushed SCOPE through semantically-scoped parents (`reference_categories`, `patient_home_blocks`, …) to their FK children.

## Counts / completeness reconciliation

| Bucket    | Count                                          |
| --------- | ---------------------------------------------- |
| SCOPE     | **128**                                        |
| GLOBAL    | **32**                                         |
| TELEMETRY | **17**                                         |
| LEGACY    | **8**                                          |
| **TOTAL** | **185** ✅ (= 185 base tables; 0 unclassified) |

`128 + 32 + 17 + 8 = 185`. Every table assigned exactly one bucket.

---

## SCOPE (128) — per-tenant and/or per-patient; must be isolated

Reason = shortest FK path to a root (`→ be_organizations` = tenant; `→ platform_users` = patient/person). Tables without an explicit FK path are marked `[col]` (scoped by an enforced-elsewhere column) or `[BORDERLINE]`.

### `be_*` booking engine — tenant-scoped (all FK → `be_organizations`)

- `be_organizations` — tenant root (anchor; every scoped `be_*` row keys to it)
- `be_appointments` → be_organizations
- `be_appointment_cancellations` → be_organizations
- `be_appointment_events` → be_organizations
- `be_appointment_history_events` → be_organizations
- `be_appointment_no_shows` → be_organizations
- `be_appointment_reschedules` → be_organizations
- `be_appointment_staff_comments` → be_organizations
- `be_availability_rules` → be_organizations
- `be_booking_form_fields` → be_organizations
- `be_booking_form_submissions` → be_organizations
- `be_branches` → be_organizations
- `be_cancellation_policies` → be_organizations
- `be_clinic_services` → be_organizations
- `be_external_entity_mappings` → be_organizations
- `be_package_history_events` → be_organizations
- `be_package_items` → be_clinic_services → be_organizations
- `be_package_usages` → be_organizations
- `be_patient_booking_profiles` → be_organizations
- `be_patient_package_items` → be_clinic_services → be_organizations
- `be_patient_packages` → be_organizations
- `be_patient_timeline_events` → be_organizations
- `be_payment_history_events` → be_organizations
- `be_payment_intents` → be_organizations
- `be_payment_provider_events` → be_organizations
- `be_payments` → be_organizations
- `be_prepayment_policies` → be_organizations
- `be_product_history_events` → be_organizations
- `be_product_pay_links` → be_organizations
- `be_product_purchases` → be_organizations
- `be_products` → be_organizations
- `be_refunds` → be_organizations
- `be_reschedule_policies` → be_organizations
- `be_rooms` → be_organizations
- `be_schedule_blocks` → be_organizations
- `be_schedule_templates` → be_organizations
- `be_service_location_availability` → be_organizations
- `be_specialist_locations` → be_organizations
- `be_specialist_rooms` → be_organizations
- `be_specialist_service_availability` → be_organizations
- `be_specialists` → be_organizations
- `be_subscription_packages` → be_organizations
- `be_working_days` → be_organizations
- `be_working_hours` → be_organizations
- `patient_merge_candidates` → be_organizations (also → platform_users; merge dedup within a tenant)

### Clinical record — per-patient (FK → `platform_users`)

- `clinical_visit` → platform_users
- `clinical_complaint` → platform_users
- `clinical_complaint_update` → clinical_complaint → platform_users
- `clinical_diagnosis` → platform_users (`patient_user_id`)
- `clinical_diagnosis_update` → clinical_diagnosis → platform_users
- `clinical_diagnosis_status_history` → platform_users (child of diagnosis lifecycle)
- `clinical_diagnosis_catalog` → platform_users (`created_by`) — **[BORDERLINE]** reusable diagnosis-label catalog; per-tenant authored vs shared library
- `clinical_anamnesis_illness` → platform_users
- `clinical_anamnesis_lifestyle` → platform_users
- `clinical_anamnesis_trauma` → platform_users
- `patient_comorbidity` → platform_users
- `symptom_entries` → platform_users
- `symptom_trackings` → platform_users
- `clinical_test_regions` → tests → platform_users (body-region tags on a clinical test)

### LFK / exercise complexes — authored-by/assigned-to a person (FK → `platform_users`)

- `lfk_exercises` → platform_users (`created_by`/owner)
- `lfk_exercise_media` → lfk_exercises → platform_users
- `lfk_exercise_regions` → lfk_exercises → platform_users
- `lfk_complexes` → platform_users
- `lfk_complex_exercises` → lfk_complexes → platform_users
- `lfk_complex_templates` → platform_users
- `lfk_complex_template_exercises` → lfk_complex_templates → platform_users
- `lfk_sessions` → platform_users
- `patient_lfk_assignments` → platform_users

### Treatment programs — per-patient instances + authored templates (FK → `platform_users`)

- `treatment_program_instances` → platform_users
- `treatment_program_instance_stages` → treatment_program_instances → platform_users
- `treatment_program_instance_stage_groups` → … → treatment_program_instances → platform_users
- `treatment_program_instance_stage_items` → … → treatment_program_instances → platform_users
- `treatment_program_templates` → platform_users
- `treatment_program_template_stages` → treatment_program_templates → platform_users
- `treatment_program_template_stage_groups` → … → treatment_program_templates → platform_users
- `treatment_program_template_stage_items` → … → treatment_program_templates → platform_users
- `treatment_program_events` → platform_users
- `program_action_log` → platform_users
- `program_item_discussion_messages` → platform_users
- `program_item_discussion_reads` → platform_users

### Content / courses library — staff-authored (FK → `platform_users` via template/`created_by`)

- `courses` → treatment_program_templates → platform_users — **[BORDERLINE]** content library: per-tenant vs shared
- `content_pages` → courses → treatment_program_templates → platform_users — **[BORDERLINE]** content library
- `patient_practice_completions` → content_pages → … → platform_users (per-patient completion)
- `recommendations` → platform_users (`created_by`) — **[BORDERLINE]** content library
- `recommendation_regions` → recommendations → platform_users
- `content_sections` — `[col]` no FK; slug/visibility catalog — **[BORDERLINE]** content library (global vs tenant)
- `content_section_slug_history` → content_sections (2nd-pass) — **[BORDERLINE]** inherits content_sections
- `content_access_grants_webapp` → platform_users (`platform_user_id`, token_hash) — per-patient content grant — **[BORDERLINE]** access-control facet
- `motivational_quotes` — `[col]` no FK; patient-facing quote content — **[BORDERLINE]** global library
- `patient_home_blocks` — `[col]` no FK; patient home-screen block config — **[BORDERLINE]** global config
- `patient_home_block_items` → patient_home_blocks (2nd-pass) — **[BORDERLINE]** inherits home blocks

### Tests / assessments — staff-authored + per-patient results (FK → `platform_users`)

- `tests` → platform_users (`created_by`) — **[BORDERLINE]** content library
- `test_sets` → platform_users (`created_by`) — **[BORDERLINE]** content library
- `test_set_items` → test_sets → platform_users
- `test_attempts` → platform_users (per-patient attempt)
- `test_results` → platform_users (per-patient result)

### Online intake — per-patient (FK → `platform_users`)

- `online_intake_requests` → platform_users
- `online_intake_answers` → online_intake_requests → platform_users
- `online_intake_attachments` → online_intake_requests → platform_users
- `online_intake_status_history` → platform_users

### Support / messaging — per-patient threads (FK → `platform_users`)

- `support_conversations` → platform_users
- `support_conversation_messages` → support_conversations → platform_users
- `support_delivery_events` → support_conversation_messages → … → platform_users — **[BORDERLINE]** delivery-log facet of a scoped message
- `support_questions` → support_conversations → platform_users
- `support_question_messages` → support_questions → … → platform_users
- `doctor_patient_support` → platform_users
- `doctor_notes` → platform_users
- `specialist_tasks` → platform_users
- `comments` → platform_users (`author_id`; polymorphic target on clinical objects)
- `message_log` → platform_users (`user_id`/`platform_user_id`; per-patient message audit) — **[BORDERLINE]** delivery/channel facet

### Media — registry + per-patient/tenant assets (FK → `platform_users`)

- `media_files` → platform_users (`uploaded_by`); patient files & content media hang off it
- `media_folders` → platform_users (`created_by`/`patient_user_id`)
- `media_transcode_jobs` → media_files → platform_users
- `media_upload_sessions` → platform_users
- `patient_files` → platform_users

### Reminders — per-patient rules/occurrences (FK → `platform_users`)

- `reminder_rules` → platform_users (`platform_user_id`)
- `reminder_journal` → reminder_rules → platform_users
- `webapp_reminder_occurrences` → platform_users (`platform_user_id`)

### Patient-misc & cross-cutting scoped

- `patient_payment` → platform_users
- `patient_content_rating_feedback` → platform_users (per-patient rating) — **[BORDERLINE]** could be TELEMETRY
- `material_ratings` → platform_users (per-patient rating) — **[BORDERLINE]** could be TELEMETRY
- `patient_diary_day_snapshots` — `[col]` no FK; `platform_user_id`+`plan_instance_id` → clearly per-patient
- `reference_categories` — `[col]` no FK; carries `owner_id`+`tenant_id` → per-tenant extensible reference
- `reference_items` → reference_categories (2nd-pass) → per-tenant
- `system_settings` → platform_users (`updated_by`); has a `scope` column — **[BORDERLINE]** platform-global vs per-tenant settings
- `admin_audit_log` → platform_users (`actor_id`) — **[BORDERLINE]** per-tenant admin actions vs platform-global ops log
- `broadcast_audit` — `[col]` no FK (`actor_id`, audience over patients) — **[BORDERLINE]** per-tenant broadcast action
- `broadcast_audit_recipients` → platform_users (per-recipient row of a broadcast) — **[BORDERLINE]** with broadcast_audit

---

## GLOBAL (32) — person identity / auth / credential / channel; one per human (cut-set)

These are direct/indirect children of `platform_users` but represent the **identity/auth/channel** facet, not per-patient clinical data. Marked the cut so SCOPE does not flow through them.

### Identity root

- `platform_users` — the person identity root (one row per human; clinical data references it but it is not itself patient-scoped data)

### Passwords / pins / oauth / login tokens

- `user_password_credentials` → platform_users — password creds (one per human)
- `user_pins` → platform_users — PIN creds
- `user_oauth_bindings` → platform_users — OAuth identity links
- `login_tokens` → platform_users — login tokens
- `user_email_setup_tokens` → platform_users — email-setup tokens
- `email_challenges` → platform_users — email verification challenges
- `email_send_cooldowns` → platform_users — email send rate-limit state
- `auth_rate_limit_events` — `[col]` (`scope`,`key`) auth rate-limit log; cross-cutting auth

### Phone / OTP identity

- `user_phone_history` → platform_users — phone-number history (identity)
- `phone_challenges` — `[col]` phone OTP challenges (no FK; keyed by phone)
- `phone_otp_locks` — `[col]` phone OTP lockout (keyed by phone)
- `phone_messenger_bind_secrets` → platform_users — messenger-bind secrets

### Channel bindings / preferences / push

- `user_channel_bindings` → platform_users — messenger channel bindings
- `user_channel_preferences` → platform_users — per-person channel prefs
- `user_web_push_subscriptions` → platform_users — web-push endpoints
- `channel_link_secrets` → platform_users — channel deep-link secrets
- `user_notification_topics` → platform_users — per-person notification topic prefs
- `user_notification_topic_channels` → platform_users — per-person topic×channel prefs
- `platform_user_contacts` → platform_users — contact values (phone/email per person, identity)

### Delivery / notification plumbing (channel facet, keyed by user/integrator ids)

- `notification_delivery_attempts` — `[col]` per-attempt delivery log (`user_id`/`integrator_user_id`/`channel`)
- `outgoing_delivery_queue` — `[col]` outbound delivery queue (`event_id`/`channel`)
- `integrator_push_outbox` — `[col]` push outbox (idempotency_key/payload)
- `reminder_delivery_events` — `[col]` reminder delivery log (`integrator_user_id`) — **[BORDERLINE]** vs scoped reminder
- `reminder_occurrence_history` — `[col]` reminder occurrence delivery history (`integrator_user_id`) — **[BORDERLINE]**
- `mailing_logs_webapp` — `[col]` mailing send log (`integrator_user_id`)
- `mailing_topics_webapp` — `[col]` mailing topic catalog (platform config)
- `user_subscriptions_webapp` — `[col]` per-user mailing-topic subscription (channel pref)

### Infra / platform-global (no tenant/patient meaning)

- `schema_migrations` — `[col]` migration ledger
- `webapp_schema_migrations` — `[col]` migration ledger
- `idempotency_keys` — `[col]` request idempotency (cross-cutting)
- `clinical_test_measure_kinds` — `[col]` clinical measurement-kind reference (code/label) — **[BORDERLINE]** platform-global lookup vs per-tenant

---

## TELEMETRY (17) — analytics / event / playback / ops logging (non-clinical)

Several are keyed by `user_id` and would be **per-patient under strict FK-reachability**, but match the TELEMETRY bucket definition (analytics/event/playback). All per-patient ones are flagged borderline below.

### Product / usage analytics (per-user) — **[BORDERLINE: per-patient]**

- `product_analytics_events_recent` — `[col]` raw analytics events (`user_id`)
- `product_analytics_user_hourly` — `[col]` per-user hourly rollup (`user_id`)
- `product_analytics_hourly` — `[col]` global hourly rollup (no user)
- `product_push_notifications` → platform_users — sent-push log (`user_id`,`topic_code`) — **[BORDERLINE: per-patient]**
- `patient_daily_warmup_presentations` → platform_users/content_pages — warmup shown (`user_id`) — **[BORDERLINE: per-patient]**
- `patient_daily_warmup_video_views` → platform_users/content_pages — warmup video views (`user_id`) — **[BORDERLINE: per-patient]**

### Media playback telemetry

- `media_playback_client_events` → media_files/platform_users — client playback events (`user_id`) — **[BORDERLINE: per-patient]**
- `media_playback_resolution_events` → … — resolution events
- `media_playback_user_video_first_resolve` → … — first-resolve marker (`user_id`) — **[BORDERLINE: per-patient]**
- `media_playback_stats_hourly` — `[col]` hourly playback rollup (no user)
- `media_hls_proxy_error_events` → … — HLS proxy error log

### Ops / integration health (non-clinical infra telemetry)

- `operator_incidents` — `[col]` ops incident log
- `operator_health_alert_sent` — `[col]` ops alert dedup log
- `operator_health_failure_archive` — `[col]` archived ops failures
- `operator_job_status` — `[col]` background-job status
- `integration_webhook_error_events` — `[col]` inbound webhook error log
- `integration_webhook_last_status` — `[col]` inbound webhook last status

---

## LEGACY (8) — Rubitime / branch-scoped, being deprecated

Literal per method (`patient_bookings`, `appointment_records` + children) **plus** the old Rubitime booking catalog (all carry `rubitime_*` ids; superseded by the `be_*` engine). Branch-scoped, not org/tenant-scoped.

- `patient_bookings` → platform_users — legacy Rubitime patient bookings (method-named)
- `appointment_records` → platform_users/branches — legacy Rubitime appointment records (method-named)
- `branches` — `[col]` old branch table (referenced only by appointment_records; distinct from new `be_branches`)
- `booking_cities` — `[col]` Rubitime booking catalog: cities
- `booking_services` — `[col]` Rubitime booking catalog: services
- `booking_branches` → booking_cities — Rubitime booking catalog: branches (`rubitime_branch_id`)
- `booking_specialists` → booking_branches — Rubitime booking catalog: specialists (`rubitime_cooperator_id`)
- `booking_branch_services` → booking_branches/booking_services/booking_specialists — Rubitime catalog join (`rubitime_service_id`)

> Note: these 6 `booking_*`/`branches` tables are LEGACY by **method spirit** (Rubitime + branch-scoped + deprecated), not literal FK-children of `patient_bookings`/`appointment_records`. If the consuming decision wants the strict literal LEGACY set, they would instead fall to a "legacy reference catalog" sub-bucket — but they are NOT per-tenant `be_*` data.

---

## BORDERLINE — flagged for human decision

Tables where FK-reachability and the bucket definitions disagree, or where global-vs-tenant is a product decision:

| Table                                                                                                                                                                                                                                                 | Assigned  | Tension                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content_sections`, `content_pages`, `courses`, `recommendations`, `tests`, `test_sets`                                                                                                                                                               | SCOPE     | Content **library** authored by staff (`created_by`): per-tenant content vs one shared global catalog. If shared → GLOBAL.                                                                                                              |
| `content_section_slug_history`, `patient_home_blocks`, `patient_home_block_items`, `motivational_quotes`                                                                                                                                              | SCOPE     | Content/config; same global-vs-tenant question as above.                                                                                                                                                                                |
| `clinical_diagnosis_catalog`                                                                                                                                                                                                                          | SCOPE     | Reusable diagnosis-label catalog (`created_by`): shared clinical reference vs per-tenant authored.                                                                                                                                      |
| `clinical_test_measure_kinds`                                                                                                                                                                                                                         | GLOBAL    | Reference catalog (code/label); placed GLOBAL as platform lookup, but could be per-tenant extensible.                                                                                                                                   |
| `reference_categories`, `reference_items`                                                                                                                                                                                                             | SCOPE     | Has `owner_id`+`tenant_id`; scoped — but `is_user_extensible` rows may seed a global base set.                                                                                                                                          |
| `system_settings`                                                                                                                                                                                                                                     | SCOPE     | Has a `scope` column → some keys platform-global, some per-tenant. Needs row-level split, not table-level.                                                                                                                              |
| `admin_audit_log`                                                                                                                                                                                                                                     | SCOPE     | `actor_id` only; per-tenant admin actions vs platform-global operator log.                                                                                                                                                              |
| `broadcast_audit`, `broadcast_audit_recipients`                                                                                                                                                                                                       | SCOPE     | Broadcast execution + recipients; per-tenant action over that tenant's patients (confirm broadcasts are tenant-scoped).                                                                                                                 |
| `material_ratings`, `patient_content_rating_feedback`                                                                                                                                                                                                 | SCOPE     | Per-patient ratings — clinical-adjacent SCOPE vs engagement TELEMETRY.                                                                                                                                                                  |
| `message_log`, `support_delivery_events`                                                                                                                                                                                                              | SCOPE     | Per-patient message/delivery audit — content (SCOPE) vs channel-delivery (GLOBAL) facet.                                                                                                                                                |
| `product_push_notifications`, `patient_daily_warmup_presentations`, `patient_daily_warmup_video_views`, `media_playback_client_events`, `media_playback_user_video_first_resolve`, `product_analytics_events_recent`, `product_analytics_user_hourly` | TELEMETRY | All keyed by `user_id` → **per-patient**; would be SCOPE under strict FK-reachability. TELEMETRY by bucket-definition, but **leak cross-patient/cross-tenant if unscoped** — strong candidates to ALSO carry tenant/patient scope keys. |
| `reminder_delivery_events`, `reminder_occurrence_history`, `mailing_logs_webapp`, `notification_delivery_attempts`                                                                                                                                    | GLOBAL    | Delivery logs keyed by `integrator_user_id`; placed with the channel/delivery cut-set, but the underlying rules (`reminder_rules`) are SCOPE.                                                                                           |
| `branches`, `booking_cities`, `booking_services`, `booking_branches`, `booking_specialists`, `booking_branch_services`                                                                                                                                | LEGACY    | Rubitime catalog; LEGACY by spirit, not literal `patient_bookings`/`appointment_records` children.                                                                                                                                      |
| `patient_merge_candidates`                                                                                                                                                                                                                            | SCOPE     | FK → both `be_organizations` and `platform_users`; tenant-scoped dedup over patients (confirm tenant key is authoritative).                                                                                                             |

---

## Appendix — derivation facts

- Roots: `platform_users`, `be_organizations`.
- FK edges: 312 raw constraints → 285 unique child→parent edges (self-loops dropped).
- GLOBAL cut-set size: 28 explicit auth/channel/infra tables (+ `platform_users` root + 3 borderline) ⇒ closure does not traverse them.
- SCOPE closure reached 126 tables via FK + 2 via 2nd-pass through semantic parents = 128.
- No table left UNRESOLVED; bucket sum = 185 = total base tables.
