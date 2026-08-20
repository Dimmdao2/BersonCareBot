\set ON_ERROR_STOP on
\set VERBOSITY verbose

-- runtime-settings.sql supplies the target key/audience registry, but values for keys that already
-- exist in the fresh PROD dump must come from its canonical system_settings rows, not from the DEV
-- snapshot used to generate the target schema. Only same-key registered projection rows are copied;
-- unregistered secret settings never enter app_runtime_settings.
\echo '=== CUTOVER STEP F01/05: rehydrate canonical runtime setting values ==='
UPDATE public.app_runtime_settings AS runtime
SET value_json = canonical.value_json,
    updated_at = canonical.updated_at,
    updated_by = canonical.updated_by
FROM cutover_source_public.system_settings AS canonical
WHERE canonical.key = runtime.key
  AND canonical.scope = runtime.scope
  AND canonical.organization_id IS NOT DISTINCT FROM runtime.organization_id
  AND runtime.value_json IS DISTINCT FROM canonical.value_json;

SELECT json_build_object(
  'status', 'pass',
  'registeredRuntimeSettings', (SELECT count(*) FROM public.app_runtime_settings),
  'sourceCanonicalSettings', (SELECT count(*) FROM cutover_source_public.system_settings),
  'unregisteredSecretsCopied', 0
)::text AS result
\gset cutover_f01_
SELECT :'cutover_f01_result'::json AS cutover_step_f01_runtime_setting_values;

\echo '=== CUTOVER STEP F02/05: remove preserved source schemas ==='
DROP SCHEMA cutover_source_integrator CASCADE;
DROP SCHEMA cutover_source_drizzle CASCADE;
DROP SCHEMA cutover_source_public CASCADE;

SELECT json_build_object(
  'status', 'pass',
  'sourceSchemasRemaining', (
    SELECT count(*) FROM pg_namespace
    WHERE nspname IN ('cutover_source_public', 'cutover_source_integrator', 'cutover_source_drizzle')
  ),
  'sourceSchemasRemoved', 3
)::text AS result
\gset cutover_f02_
SELECT :'cutover_f02_result'::json AS cutover_step_f02_remove_source_schemas;

-- Canonical phone is unconditional; do not carry the retired fallback strategy into target state.
\echo '=== CUTOVER STEP F03/05: retire linked-phone fallback setting ==='
DELETE FROM public.app_runtime_settings WHERE key = 'integrator_linked_phone_source';
DELETE FROM public.system_settings
WHERE key = 'integrator_linked_phone_source'
  AND scope = 'admin'
  AND organization_id IS NULL;

SELECT json_build_object(
  'status', 'pass',
  'runtimeFallbackRowsRemaining', (
    SELECT count(*) FROM public.app_runtime_settings WHERE key = 'integrator_linked_phone_source'
  ),
  'canonicalFallbackRowsRemaining', (
    SELECT count(*) FROM public.system_settings
    WHERE key = 'integrator_linked_phone_source'
      AND scope = 'admin'
      AND organization_id IS NULL
  )
)::text AS result
\gset cutover_f03_
SELECT :'cutover_f03_result'::json AS cutover_step_f03_retire_phone_fallback;

-- Existing PROD snapshots predate these required global admin-settings rows. The target UI
-- deliberately fails loud when one is absent, so the A -> B cutover creates only the missing
-- canonical rows and never overwrites a configured value.
\echo '=== CUTOVER STEP F04/05: ensure required global admin settings ==='
INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at)
VALUES
  ('vk_id_application_id', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('vk_id_client_secret', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('vk_id_redirect_uri', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('operator_alert_fallback_email', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('operator_health_projection_thresholds', 'admin', NULL,
   '{"value":{"retriesDebounceMinutes":15,"stalePendingDebounceMinutes":15,"oldestPendingStaleMinutes":30}}'::jsonb,
   now()),
  ('platform_integration_availability', 'admin', NULL,
   '{"value":{"version":1,"integrations":{"telegram":true,"max":true,"email":true,"smsc":true,"web_push":true,"google_calendar":true,"yandex_calendar":false}}}'::jsonb,
   now())
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

INSERT INTO public.app_runtime_settings (
  key, scope, organization_id, audience, value_json, updated_at, updated_by
)
SELECT key, scope, organization_id, 'server', value_json, updated_at, updated_by
FROM public.system_settings
WHERE key = 'platform_integration_availability'
  AND scope = 'admin'
  AND organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

SELECT json_build_object(
  'status', 'pass',
  'requiredGlobalAdminSettings', 6,
  'requiredGlobalAdminSettingsPresent', (
    SELECT count(*)
    FROM (VALUES
      ('vk_id_application_id'),
      ('vk_id_client_secret'),
      ('vk_id_redirect_uri'),
      ('operator_alert_fallback_email'),
      ('operator_health_projection_thresholds'),
      ('platform_integration_availability')
    ) AS required_setting(key)
    WHERE EXISTS (
      SELECT 1 FROM public.system_settings setting
      WHERE setting.key = required_setting.key
        AND setting.scope = 'admin'
        AND setting.organization_id IS NULL
    )
  ),
  'integrationAvailabilityRuntimeRows', (
    SELECT count(*) FROM public.app_runtime_settings
    WHERE key = 'platform_integration_availability'
      AND scope = 'admin'
      AND organization_id IS NULL
  )
)::text AS result
\gset cutover_f04_
SELECT :'cutover_f04_result'::json AS cutover_step_f04_required_admin_settings;

\echo '=== CUTOVER STEP F05/05: verify final target shape ==='
DO $final_shape_gate$
DECLARE
  violations bigint;
  reference record;
  target_rows bigint;
  target_canonical_rows bigint;
BEGIN
  IF to_regnamespace('cutover_source_public') IS NOT NULL
     OR to_regnamespace('cutover_source_integrator') IS NOT NULL
     OR to_regnamespace('cutover_source_drizzle') IS NOT NULL THEN
    RAISE EXCEPTION 'cutover source schemas remain after cleanup';
  END IF;

  SELECT count(*) INTO violations
  FROM public.platform_users
  WHERE merged_into_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_identity identity_row
      WHERE identity_row.platform_user_id = platform_users.id
    );
  IF violations <> 0 THEN RAISE EXCEPTION 'canonical users without user_identity: %', violations; END IF;

  FOR reference IN
    SELECT * FROM cutover_specialist_transition_reference_baseline ORDER BY table_name
  LOOP
    EXECUTE format(
      'SELECT count(*), count(*) FILTER (WHERE %I = $1) FROM public.%I',
      reference.column_name, reference.table_name
    ) INTO target_rows, target_canonical_rows
      USING current_setting('bcb.cutover.canonical_specialist_id')::uuid;
    IF target_rows <> reference.expected_rows
      OR target_canonical_rows <> reference.expected_canonical_rows
    THEN
      RAISE EXCEPTION 'post-transition specialist reference drift in public.%: rows %/%, canonical %/%',
        reference.table_name, target_rows, reference.expected_rows,
        target_canonical_rows, reference.expected_canonical_rows;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.be_specialists
    WHERE id <> current_setting('bcb.cutover.canonical_specialist_id')::uuid
  ) THEN
    RAISE EXCEPTION 'noncanonical specialist card survived the transition';
  END IF;

  SELECT count(*) INTO violations
  FROM public.reminder_occurrence_history history
  LEFT JOIN public.platform_users source_user
    ON source_user.integrator_user_id = history.integrator_user_id
  LEFT JOIN cutover_platform_user_canonical_map identity_map
    ON identity_map.source_id = source_user.id
  WHERE history.platform_user_id IS DISTINCT FROM identity_map.canonical_id;
  IF violations <> 0 THEN RAISE EXCEPTION 'post-transition reminder history identity drift: %', violations; END IF;
  IF (SELECT count(*) FROM public.reminder_occurrence_history)
     <> (SELECT expected_count FROM cutover_systemic_expected_counts WHERE class = 'reminder_occurrence_history') THEN
    RAISE EXCEPTION 'post-transition reminder history row count drift';
  END IF;

  FOR reference IN
    SELECT * FROM cutover_reviewed_live_identity_references ORDER BY schema_name, table_name, column_name
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I.%I target '
      || 'JOIN cutover_platform_user_canonical_map identity_map ON identity_map.source_id = target.%I '
      || 'WHERE identity_map.source_id <> identity_map.canonical_id',
      reference.schema_name, reference.table_name, reference.column_name
    ) INTO violations;
    IF violations <> 0 THEN
      RAISE EXCEPTION 'post-transition merged alias in %.%.%: %',
        reference.schema_name, reference.table_name, reference.column_name, violations;
    END IF;
  END LOOP;

  SELECT count(*) INTO violations FROM public.user_channel_preferences
  WHERE user_id <> platform_user_id::text;
  IF violations <> 0 THEN RAISE EXCEPTION 'post-transition channel preference dual identity drift: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM public.support_conversations conversation
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(conversation.pending_message_drafts) draft_payload
    WHERE draft_payload->>'cutoverSource' = 'integrator.message_drafts'
  )
    AND (
      conversation.organization_id IS DISTINCT FROM current_setting('bcb.cutover.canonical_organization_id')::uuid
      OR NOT EXISTS (
        SELECT 1 FROM cutover_platform_user_canonical_map identity_map
        WHERE identity_map.canonical_id = conversation.platform_user_id
          AND identity_map.source_id = identity_map.canonical_id
      )
    );
  IF violations <> 0 THEN RAISE EXCEPTION 'post-transition canonical message draft scope drift: %', violations; END IF;
  IF (
    SELECT count(*)
    FROM public.support_conversations conversation
    CROSS JOIN LATERAL jsonb_array_elements(conversation.pending_message_drafts) draft_payload
    WHERE draft_payload->>'cutoverSource' = 'integrator.message_drafts'
  )
     <> (SELECT expected_count FROM cutover_systemic_expected_counts WHERE class = 'message_drafts') THEN
    RAISE EXCEPTION 'post-transition message draft row count drift';
  END IF;

  SELECT count(*) INTO violations FROM integrator.delivery_attempt_logs
  WHERE organization_id IS DISTINCT FROM current_setting('bcb.cutover.canonical_organization_id')::uuid;
  IF violations <> 0 THEN RAISE EXCEPTION 'post-transition delivery attempt organization drift: %', violations; END IF;
  IF (SELECT count(*) FROM integrator.delivery_attempt_logs)
     <> (SELECT expected_count FROM cutover_systemic_expected_counts WHERE class = 'delivery_attempt_logs') THEN
    RAISE EXCEPTION 'post-transition delivery attempt row count drift';
  END IF;

  SELECT count(*) INTO violations FROM public.media_playback_stats_hourly
  WHERE organization_id IS DISTINCT FROM current_setting('bcb.cutover.canonical_organization_id')::uuid;
  IF violations <> 0 THEN RAISE EXCEPTION 'post-transition playback hourly organization drift: %', violations; END IF;
  IF (SELECT count(*) FROM public.media_playback_stats_hourly)
     <> (SELECT expected_count FROM cutover_systemic_expected_counts WHERE class = 'media_playback_stats_hourly') THEN
    RAISE EXCEPTION 'post-transition playback hourly row count drift';
  END IF;

  SELECT count(*) INTO violations
  FROM public.be_appointments appointment
  LEFT JOIN public.be_specialists specialist
    ON specialist.id = appointment.specialist_id
   AND specialist.organization_id = appointment.organization_id
  WHERE appointment.deleted_at IS NULL
    AND (specialist.id IS NULL OR NOT specialist.is_active);
  IF violations <> 0 THEN RAISE EXCEPTION 'live appointments without active specialist: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM cutover_expected_active_canonical_client_membership expected
  CROSS JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE enrollment.status = 'active') AS active_count,
      count(*) FILTER (
        WHERE enrollment.status = 'active'
          AND enrollment.organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
      ) AS canonical_count
    FROM public.org_enrollments enrollment
    WHERE enrollment.platform_user_id = expected.platform_user_id
  ) enrollment
  WHERE enrollment.active_count <> 1 OR enrollment.canonical_count <> 1;
  IF violations <> 0 THEN RAISE EXCEPTION 'active canonical clients without exactly one canonical enrollment: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM cutover_expected_active_canonical_client_membership expected
  CROSS JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE link.status = 'active') AS active_count,
      count(*) FILTER (
        WHERE link.status = 'active'
          AND link.organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
          AND link.specialist_id = current_setting('bcb.cutover.canonical_specialist_id')::uuid
      ) AS canonical_count
    FROM public.patient_specialist_links link
    WHERE link.patient_user_id = expected.platform_user_id
  ) link
  WHERE link.active_count <> 1 OR link.canonical_count <> 1;
  IF violations <> 0 THEN RAISE EXCEPTION 'active canonical clients without exactly one canonical specialist link: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM public.org_enrollments enrollment
  LEFT JOIN cutover_expected_active_canonical_client_membership expected
    ON expected.platform_user_id = enrollment.platform_user_id
  WHERE enrollment.status = 'active'
    AND (
      expected.platform_user_id IS NULL
      OR enrollment.organization_id <> current_setting('bcb.cutover.canonical_organization_id')::uuid
    );
  IF violations <> 0 THEN RAISE EXCEPTION 'extra or wrong-organization active enrollment: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM public.patient_specialist_links link
  LEFT JOIN cutover_expected_active_canonical_client_membership expected
    ON expected.platform_user_id = link.patient_user_id
  WHERE link.status = 'active'
    AND (
      expected.platform_user_id IS NULL
      OR link.organization_id <> current_setting('bcb.cutover.canonical_organization_id')::uuid
      OR link.specialist_id <> current_setting('bcb.cutover.canonical_specialist_id')::uuid
    );
  IF violations <> 0 THEN RAISE EXCEPTION 'extra or wrong-specialist active patient link: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM cutover_expected_patient_domain_references patient_reference
  WHERE (
    SELECT count(*) FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
      AND enrollment.platform_user_id = patient_reference.platform_user_id
      AND enrollment.status = 'active'
  ) <> 1
  OR (
    SELECT count(*) FROM public.patient_specialist_links link
    WHERE link.organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
      AND link.patient_user_id = patient_reference.platform_user_id
      AND link.specialist_id = current_setting('bcb.cutover.canonical_specialist_id')::uuid
      AND link.status = 'active'
  ) <> 1;
  IF violations <> 0 THEN RAISE EXCEPTION 'patient-domain reference closure missing canonical membership: %', violations; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.be_organization_members
    WHERE organization_id = current_setting('bcb.cutover.canonical_organization_id')::uuid
      AND specialist_id = current_setting('bcb.cutover.canonical_specialist_id')::uuid
      AND role = 'owner'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'canonical doctor membership was not rebuilt';
  END IF;

  SELECT count(*) INTO violations
  FROM (VALUES
    ('vk_id_application_id'),
    ('vk_id_client_secret'),
    ('vk_id_redirect_uri'),
    ('operator_alert_fallback_email'),
    ('operator_health_projection_thresholds'),
    ('platform_integration_availability')
  ) AS required_setting(key)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.system_settings setting
    WHERE setting.key = required_setting.key
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
  );
  IF violations <> 0 THEN RAISE EXCEPTION 'required global admin settings missing: %', violations; END IF;
END
$final_shape_gate$;

SELECT json_build_object(
  'status', 'pass',
  'violations', 0,
  'canonicalUsersWithoutIdentity', 0,
  'mergedAliasesInReviewedReferences', 0,
  'liveAppointmentsWithoutActiveSpecialist', 0,
  'membershipClosureViolations', 0,
  'requiredGlobalAdminSettingsMissing', 0
)::text AS result
\gset cutover_f05_
SELECT :'cutover_f05_result'::json AS cutover_step_f05_final_shape_gate;

SELECT json_build_object('status', 'pass', 'reportedSteps', 5)::text AS result
\gset cutover_p07_

SELECT json_build_object(
  'status', 'pass',
  'mode', :'cutover_mode',
  'transactionOutcome', CASE
    WHEN :'cutover_mode' = 'dryrun' THEN 'rolled_back'
    ELSE 'committed'
  END,
  'phases', json_build_object(
    'P01_prepare_source_and_schema_swap', :'cutover_p01_result'::json,
    'P02_target_pre_data_schema', :'cutover_p02_result'::json,
    'P03_target_data', :'cutover_p03_result'::json,
    'P04_ledgers_and_baseline', :'cutover_p04_result'::json,
    'P05_runtime_settings', :'cutover_p05_result'::json,
    'P06_target_post_data_schema', :'cutover_p06_result'::json,
    'P07_finalize_and_close', :'cutover_p07_result'::json
  ),
  'startSteps', json_build_object(
    'S01_legacy_appointment_history', :'cutover_s01_result'::json,
    'S02_source_shape', :'cutover_s02_result'::json,
    'S03_patient_projection_appointments', :'cutover_s03_result'::json,
    'S04_messenger_identities', :'cutover_s04_result'::json,
    'S05_prepared_data_gate', :'cutover_s05_result'::json,
    'S06_schema_swap', :'cutover_s06_result'::json
  ),
  'dataSteps', json_build_object(
    'D01_copy_common_relations', :'cutover_d01_result'::json,
    'D02_source_relation_disposition', :'cutover_d02_result'::json,
    'D03_known_missing_media', :'cutover_d03_result'::json,
    'D04_canonical_user_graph', :'cutover_d04_result'::json,
    'D05_specialist_reference_baseline', :'cutover_d05_result'::json,
    'D06_unique_identity_classes', :'cutover_d06_result'::json,
    'D07_live_identity_references', :'cutover_d07_result'::json,
    'D08_required_tenant_rows', :'cutover_d08_result'::json,
    'D09_reminder_history_identity', :'cutover_d09_result'::json,
    'D10_reminder_occurrences', :'cutover_d10_result'::json,
    'D11_actionable_web_push', :'cutover_d11_result'::json,
    'D12_reminder_delivery_logs', :'cutover_d12_result'::json,
    'D13_calendar_mappings', :'cutover_d13_result'::json,
    'D14_clinical_visit_links', :'cutover_d14_result'::json,
    'D15_legacy_organization_scope', :'cutover_d15_result'::json,
    'D16_message_drafts', :'cutover_d16_result'::json,
    'D17_identity_profiles', :'cutover_d17_result'::json,
    'D18_identity_contacts', :'cutover_d18_result'::json,
    'D19_channel_display_and_block_facts', :'cutover_d19_result'::json,
    'D20_appointment_reminders', :'cutover_d20_result'::json,
    'D21_membership_and_visibility', :'cutover_d21_result'::json,
    'D22_reseed_sequences', :'cutover_d22_result'::json,
    'D23_identity_reference_gate', :'cutover_d23_result'::json,
    'D24_copy_completeness_gate', :'cutover_d24_result'::json
  ),
  'finishSteps', json_build_object(
    'F01_runtime_setting_values', :'cutover_f01_result'::json,
    'F02_remove_source_schemas', :'cutover_f02_result'::json,
    'F03_retire_phone_fallback', :'cutover_f03_result'::json,
    'F04_required_admin_settings', :'cutover_f04_result'::json,
    'F05_final_shape_gate', :'cutover_f05_result'::json
  ),
  'endState', json_build_object(
    'platformUsers', (SELECT count(*) FROM public.platform_users),
    'userIdentities', (SELECT count(*) FROM public.user_identity),
    'appointments', (SELECT count(*) FROM public.be_appointments),
    'activeCanonicalClientMembershipExpected', (
      SELECT count(*) FROM cutover_expected_active_canonical_client_membership
    ),
    'patientDomainReferenceExpected', (
      SELECT count(*) FROM cutover_expected_patient_domain_references
    ),
    'activeEnrollments', (SELECT count(*) FROM public.org_enrollments WHERE status = 'active'),
    'reminderHistoryAttributed', (
      SELECT count(*) FROM public.reminder_occurrence_history WHERE platform_user_id IS NOT NULL
    ),
    'reminderHistoryHonestlyUnmapped', (
      SELECT count(*) FROM public.reminder_occurrence_history WHERE platform_user_id IS NULL
    ),
    'preservedMessageDrafts', (
      SELECT count(*)
      FROM public.support_conversations conversation
      CROSS JOIN LATERAL jsonb_array_elements(conversation.pending_message_drafts) draft_payload
      WHERE draft_payload->>'cutoverSource' = 'integrator.message_drafts'
    ),
    'attributedDeliveryAttempts', (SELECT count(*) FROM integrator.delivery_attempt_logs),
    'attributedPlaybackHourlyRows', (SELECT count(*) FROM public.media_playback_stats_hourly),
    'calendarMappings', (SELECT count(*) FROM public.booking_calendar_map),
    'pendingDeliveryQueue', (
      SELECT count(*) FROM public.outgoing_delivery_queue
      WHERE status IN ('pending', 'processing', 'failed_retryable')
    )
  )
)::text AS result
\gset cutover_closing_

\if :cutover_is_dryrun
ROLLBACK;
\echo '=== CUTOVER TRANSACTION OUTCOME: DRY RUN ROLLED BACK; NOTHING PERSISTED ==='
\else
COMMIT;
\echo '=== CUTOVER TRANSACTION OUTCOME: COMMITTED ==='
\endif

\echo '=== CUTOVER CLOSING SUMMARY: every named step and end-state result ==='
SELECT :'cutover_closing_result'::json AS prod_to_target_cutover_closing_summary;
