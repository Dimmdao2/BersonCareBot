# P0.8.3 preflight — public direct-org SCOPED policies

> OWNER-SUPERSEDED 16.08.2026: this document is historical evidence, not an active preflight or command source.
> All scratch/disposable setup and replay steps below are retired; current execution is B0 plus forward migrations,
> with live behavior checked only on named DEV through the application/Drizzle port.

Status: historical execution record from 2026-07-08; superseded on 2026-08-16.
Real policy migration created, no production/dev/test application DB touched.

## Purpose

Prepare and record the exact execution boundary for P0.8.3:

- apply `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` only to the strict public direct-org SCOPED family;
- use the P0.8.2 dormant permissive org predicate:
  `NULLIF(current_setting('app.org', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org', true), '')::uuid`;
- prove behavior in scratch before creating the real migration;
- keep runtime role, production/dev DBs, and application behavior unchanged.

## Code Facts

Read [`P0_8_CODE_FACTS.md`](P0_8_CODE_FACTS.md) before implementing this stage.

Current implementation facts:

- descriptors and predicate rendering exist;
- real policy DDL generation exists for the strict P0.8.3 public direct-org target;
- scratch-smoke tooling for P0.8.3 exists and has passed on a disposable `bcb_saas_*` database;
- committed real-table RLS policy migration exists: `apps/webapp/db/drizzle-migrations/0160_p0_8_3_public_direct_org_rls.sql`;
- P0.5.1 provides the scratch-only role-proof pattern to reuse.

The migration execution pass re-ran the deterministic generator/smoke gate before creating the real
migration and repeated the targeted gate after migration creation.

## Inputs Read

- `CORRECTED_PLAN.md`: P0.8.3 is public direct-org SCOPED family policy application with scratch DB smoke before merge.
- `P0_8_RLS_DESCRIPTOR_CHECKLIST.md`: policy substages require family-specific scratch smoke and forbid prod role/env flips.
- `P0_5_DB_ROLE_SPLIT.md`: app role must be non-owner and `NOBYPASSRLS`; no runtime role flip in Phase 0.
- `P0_8_CODE_FACTS.md`: code-discovered state of P0.8 scripts, migration/journal facts, and missing execution artifacts.
- `scripts/rls-descriptor-model.mjs`: current descriptor categories are the source for policy family selection.
- `scripts/rls-sql-renderer.mjs`: current predicate renderer supports dormant permissive and enforce modes.
- `scope-derivation/p0-4-batches.tsv`: exact P0.4 public table family map.

## P0.8.3 Target Rule

Default target for real P0.8.3 implementation:

1. `tier === "SCOPED"`.
2. Table name starts with `public.`.
3. Table has a direct materialized `organization_id` predicate.
4. Exclude public FK-path, denorm/path-copy, polymorphic, bootstrap, infra, legacy, telemetry, and all `integrator.*`.
5. Exclude `public.be_organizations` self-scope from this micro-stage unless owner explicitly allows folding it into P0.8.3. Its descriptor is `self_org_id`, not direct `organization_id`.
6. Exclude `public.be_package_items` and `public.be_patient_package_items`; they are P0.8.4 FK-path tables.

Current descriptor query (`SCOPED` + `public.*` + `scopingKind=direct_org_column`) returns 103 tables:

- 62 P0.4 public rows.
- 41 existing `public.be_*` direct-org rows.

Strict direct-org execution target is therefore locked at 103 tables:

- 62 P0.4 public rows.
- 41 existing `public.be_*` direct-org rows.

## Descriptor Hygiene Gate

Resolved by task #555 before policy application. These four P0.4 parent-copy rows are now explicitly
classified as `denorm_org_column` descriptors and are excluded from the P0.8.3 public direct-org
target:

| Table                                     | Current source            | Reason to hold                                                                                                                       |
| ----------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `public.content_section_slug_history`     | `content_parent_denorm`   | Copies org from `public.content_sections`; belongs with denorm/path smoke unless owner accepts materialized direct policy in P0.8.3. |
| `public.media_transcode_jobs`             | `media_parent_denorm`     | Copies org from `public.media_files` or upload session; parent-copy failure modes need denorm smoke.                                 |
| `public.patient_daily_warmup_video_views` | `parent_or_patient_org`   | Mixed parent-or-patient source; needs explicit descriptor classification before policy application.                                  |
| `public.reference_items`                  | `reference_parent_denorm` | Copies org from `public.reference_categories`; should be path/denorm unless explicitly accepted as materialized direct.              |

The descriptor checker now asserts this classification and the strict 103-table P0.8.3 target. These
rows remain SCOPED and keep the materialized `organization_id` predicate column, but their policy smoke
belongs with the P0.8.4 denorm/path family unless an explicit later owner decision changes that.

## Batch Plan

### P0.8.3-A — P0.4 public direct-org tables, 62

| Source batch | Count | Tables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------ | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0.4.P1      |    10 | `clinical_anamnesis_illness`, `clinical_anamnesis_lifestyle`, `clinical_anamnesis_trauma`, `clinical_complaint`, `clinical_diagnosis`, `clinical_visit`, `patient_comorbidity`, `patient_files`, `patient_merge_candidates`, `patient_payment`                                                                                                                                                                                                                                                              |
| P0.4.P2      |     2 | `treatment_program_instances`, `treatment_program_templates`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P0.4.P3      |     7 | `lfk_complex_templates`, `lfk_complexes`, `lfk_exercise_regions`, `lfk_exercises`, `lfk_sessions`, `patient_lfk_assignments`, `test_attempts`                                                                                                                                                                                                                                                                                                                                                               |
| P0.4.P4      |     5 | `patient_daily_warmup_presentations`, `patient_diary_day_snapshots`, `patient_home_blocks`, `patient_practice_completions`, `symptom_trackings`                                                                                                                                                                                                                                                                                                                                                             |
| P0.4.P5      |     1 | `online_intake_requests`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P0.4.P6      |     5 | `doctor_notes`, `doctor_patient_support`, `specialist_tasks`, `support_conversations`, `support_questions`                                                                                                                                                                                                                                                                                                                                                                                                  |
| P0.4.P7      |    18 | `mailing_logs_webapp`, `material_ratings`, `media_files`, `media_folders`, `media_hls_proxy_error_events`, `media_playback_client_events`, `media_playback_resolution_events`, `media_playback_user_video_first_resolve`, `media_upload_sessions`, `message_log`, `operator_health_failure_archive`, `patient_content_rating_feedback`, `product_analytics_events_recent`, `product_analytics_user_hourly`, `product_push_notifications`, `reminder_journal`, `reminder_rules`, `user_subscriptions_webapp` |
| P0.4.P8      |    13 | `admin_audit_log`, `broadcast_audit`, `clinical_diagnosis_catalog`, `clinical_test_regions`, `content_access_grants_webapp`, `content_pages`, `content_sections`, `courses`, `motivational_quotes`, `recommendation_regions`, `recommendations`, `test_sets`, `tests`                                                                                                                                                                                                                                       |
| P0.4.RC      |     1 | `reference_categories`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### P0.8.3-B — existing `be_*` direct-org tables, 41

`be_appointment_cancellations`, `be_appointment_events`, `be_appointment_history_events`,
`be_appointment_no_shows`, `be_appointment_reschedules`, `be_appointment_staff_comments`,
`be_appointments`, `be_availability_rules`, `be_booking_form_fields`, `be_booking_form_submissions`,
`be_branches`, `be_cancellation_policies`, `be_clinic_services`, `be_external_entity_mappings`,
`be_package_history_events`, `be_package_usages`, `be_patient_booking_profiles`,
`be_patient_packages`, `be_patient_timeline_events`, `be_payment_history_events`,
`be_payment_intents`, `be_payment_provider_events`, `be_payments`, `be_prepayment_policies`,
`be_product_history_events`, `be_product_pay_links`, `be_product_purchases`, `be_products`,
`be_refunds`, `be_reschedule_policies`, `be_rooms`, `be_schedule_blocks`,
`be_schedule_templates`, `be_service_location_availability`, `be_specialist_locations`,
`be_specialist_rooms`, `be_specialist_service_availability`, `be_specialists`,
`be_subscription_packages`, `be_working_days`, `be_working_hours`.

### Explicit Non-Targets

- P0.8.4: public FK/denorm/path-scoped families, including the four descriptor-hygiene rows.
- P0.8.4: `public.be_package_items`, `public.be_patient_package_items`.
- P0.8.5: all `integrator.*` SCOPED families.
- P0.8.6: bootstrap hybrid tables.
- P0.8.7: INFRA/LEGACY/TELEMETRY descriptors and unsupported user-ref denial.
- T0/cutover: runtime app role flip and real enforcement.

## Scratch-Only Smoke Plan

Scratch DB requirements:

- database name must clearly indicate scratch/proof usage, for example `bcb_saas_*` or containing `scratch`;
- never use `bcb_webapp_dev`, `bcb_webapp_prod`, `/opt/env/*`, or production services;
- use synthetic UUIDs and synthetic rows only;
- use a non-owner app role with `NOBYPASSRLS`, based on `P0_5_DB_ROLE_SPLIT.md`;
- wrap smoke setup in disposable scratch schema/database lifecycle, not in application runtime.

Minimum smoke per batch:

1. Create or restore a scratch-only schema/table subset for the batch.
2. Insert two synthetic org rows per target table, one for `org_a` and one for `org_b`.
3. Apply generated P0.8.3 policy SQL for that batch only.
4. Under owner/migrator role, verify both rows remain visible for migration/backfill safety.
5. Under app role with no `app.org`, verify dormant permissive mode still sees both rows.
6. Under app role with `app.org=org_a`, verify only `org_a` rows are visible.
7. Under app role with `app.org=org_b`, verify only `org_b` rows are visible.
8. Under app role with empty `app.org`, verify behavior matches the P0.8.2 dormant permissive renderer contract.
9. Verify `rolbypassrls=false` for the app role.
10. Roll back/drop the scratch objects.

OWNER-SUPERSEDED 16.08.2026: scratch/disposable execution in this historical preflight is retired.
The surviving DB-free generator proof is:

```bash
node scripts/check-saas-db-regression.mjs
```

Runtime behavior is re-proved only by the serialized named-DEV application-port matrix documented in
`docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_MATRIX_2026-08-17.md`; this preflight no longer carries a
database setup or replay recipe.

## Execution Brief For The Next Implementation Stage

### Allowed Files

- `docs/_TODO/SAAS_FOUNDATION/scripts/rls-sql-renderer.mjs`
- new scripts under `docs/_TODO/SAAS_FOUNDATION/scripts/`
- `scripts/check-saas-db-regression.mjs`
- `docs/_TODO/SAAS_FOUNDATION/P0_8_3_PREFLIGHT.md`
- `docs/archive/2026-07-plans/SAAS_FOUNDATION/P0_8_RLS_DESCRIPTOR_CHECKLIST.md`
- `docs/_TODO/SAAS_FOUNDATION/P0_8_CODE_FACTS.md`
- `docs/_TODO/SAAS_FOUNDATION/LOG.md`
- if and only if scratch smoke passes: one webapp Drizzle migration under `apps/webapp/db/drizzle-migrations/` plus matching `meta/_journal.json`

### Out Of Scope

- no application route/service/UI changes;
- no `system_settings` storage/read/write changes;
- no integrator policy application;
- no BOOTSTRAP, FK-path, denorm, INFRA, LEGACY, TELEMETRY policies;
- no production/dev DB writes;
- no runtime `DATABASE_URL`, grant, role, or env changes;
- no `main`, `test`, or `dimmdao` push.

### Required Implementation Steps

1. Run branch drift and preflight checks:

   ```bash
   git status --short --branch
   git rev-list --left-right --count feat/doctor-ui-rebuild...codex/saas-roadmap-foundation
   bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && git diff --check"
   ```

2. Add deterministic target listing/generation from descriptors:
   - target predicate: `tier === "SCOPED"`, `table.startsWith("public.")`, `scopingKind === "direct_org_column"`;
   - assert count `103`;
   - export a stable sorted target list;
   - fail on any table outside the approved target set.
   - current implementation: `scripts/p0-8-3-policy-targets.mjs` + `check-p0-8-3-policy-generator.mjs`.

3. Extend the SQL renderer or add a small policy renderer:
   - render quoted `ALTER TABLE <target> ENABLE ROW LEVEL SECURITY`;
   - render quoted `ALTER TABLE <target> FORCE ROW LEVEL SECURITY`;
   - render quoted `DROP POLICY IF EXISTS <stable_name> ON <target>`;
   - render quoted `CREATE POLICY <stable_name> ON <target> FOR ALL USING (<dormant permissive org predicate>) WITH CHECK (<same predicate>)`;
   - stable policy name format: `saas_org_dormant_p0_8_3`;
   - no raw unquoted table/column interpolation.

4. OWNER-SUPERSEDED 16.08.2026: do not create scratch databases, schemas, roles, or replay SQL. Keep the
   deterministic generator checks DB-free; exercise live policy consequences only through the named-DEV
   application-port acceptance matrix.

5. Run targeted gate:

   ```bash
   node scripts/check-saas-db-regression.mjs
   ```

6. If scratch smoke passes and owner/stage scope allows a real migration in the same pass:
   - add one Drizzle SQL migration for P0.8.3 policies;
   - add matching `_journal.json` entry;
   - run:

     ```bash
     bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && bash apps/webapp/scripts/check-drizzle-journal-sync.sh && git diff --check"
     ```

7. Update `LOG.md` and taskdb with exact commands/results and explicit skipped scope.

### Stop Conditions

Stop and mark task blocked if:

- scratch DB credentials are unavailable;
- branch drift includes schema/migration changes that affect target tables and cannot be safely merged first;
- target count is not exactly `103`;
- any generated SQL targets a non-P0.8.3 table;
- scratch smoke requires dev/prod DB access;
- the stage needs a runtime role/env change.

## Rollback Gates

Before any later P0.8.3 policy migration is mergeable:

- generated policy SQL must be deterministic from descriptors, not hand-maintained per table;
- every `ENABLE/FORCE` statement must have a paired scratch rollback/drop path;
- scratch smoke must pass for each P0.8.3 batch independently;
- no policy SQL may target tables outside the approved P0.8.3 list;
- no app runtime role flip, env change, grant change, or production/dev database mutation may be included;
- failed scratch smoke means the stage is blocked, not broadened.

## Owner Gates

Owner decision is required if:

- the four descriptor-hygiene rows should remain in P0.8.3 instead of moving to P0.8.4;
- `public.be_organizations` self-scope should be folded into P0.8.3;
- P0.8.3 should create a committed migration before a scratch smoke script exists;
- any smoke requires dev/prod DB access or real runtime roles.

Default if no owner decision: keep the strict 103-table target. Descriptor classification is now
explicit; real policy application still requires the scratch-smoke implementation stage.
