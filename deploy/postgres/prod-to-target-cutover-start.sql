\set ON_ERROR_STOP on
\set VERBOSITY verbose

-- Keep the history carry inside the canonical cutover entrypoint as well as the explicit
-- pre-assertion data stage. Its deterministic key makes this second invocation a no-op.
\echo '=== CUTOVER STEP S01/06: carry unresolved legacy appointment history ==='
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '0';
SET LOCAL check_function_bodies = off;
\set cutover_parent_transaction true
\ir prod-to-target-carry-legacy-appointments.sql
\unset cutover_parent_transaction
\set cutover_s01_result :cutover_legacy_appointment_carry_result

\echo '=== CUTOVER STEP S02/06: validate cutover target and source shape ==='
SELECT set_config('bcb.cutover.expected_database', :'cutover_database', true) AS ignored
\gset
SELECT set_config('bcb.cutover.canonical_organization_id', :'canonical_organization_id', true) AS ignored
\gset
SELECT set_config('bcb.cutover.canonical_specialist_id', :'canonical_specialist_id', true) AS ignored
\gset

DO $preflight$
BEGIN
  IF current_database() <> current_setting('bcb.cutover.expected_database') THEN
    RAISE EXCEPTION 'cutover database mismatch: got %, expected %',
      current_database(), current_setting('bcb.cutover.expected_database');
  END IF;
  IF to_regnamespace('cutover_source_public') IS NOT NULL
     OR to_regnamespace('cutover_source_integrator') IS NOT NULL
     OR to_regnamespace('cutover_source_drizzle') IS NOT NULL THEN
    RAISE EXCEPTION 'cutover source schemas already exist';
  END IF;
  IF to_regclass('public.platform_users') IS NULL
     OR to_regclass('public.be_appointments') IS NULL
     OR to_regclass('integrator.identities') IS NULL THEN
    RAISE EXCEPTION 'database is not the expected clean PROD-dump source shape';
  END IF;
END
$preflight$;

SELECT json_build_object(
  'status', 'pass',
  'databaseMatched', true,
  'requiredSourceRelations', 3,
  'requiredSourceRelationsPresent', (
    SELECT count(*) FROM (VALUES
      (to_regclass('public.platform_users')),
      (to_regclass('public.be_appointments')),
      (to_regclass('integrator.identities'))
    ) AS required(relation_oid)
    WHERE relation_oid IS NOT NULL
  ),
  'staleCutoverSchemas', (
    SELECT count(*) FROM pg_namespace
    WHERE nspname IN ('cutover_source_public', 'cutover_source_integrator', 'cutover_source_drizzle')
  )
)::text AS result
\gset cutover_s02_
SELECT :'cutover_s02_result'::json AS cutover_step_s02_validate_source_shape;

-- Complete the canonical appointment transfer for rows that existed only in the
-- patient-facing Rubitime projection and therefore were not present in appointment_records.
\echo '=== CUTOVER STEP S03/06: complete patient-projection appointment transfer ==='
WITH candidates AS (
  SELECT
    booking.*,
    (
      substr(md5('legacy-patient-booking:' || booking.id::text), 1, 8) || '-' ||
      substr(md5('legacy-patient-booking:' || booking.id::text), 9, 4) || '-' ||
      substr(md5('legacy-patient-booking:' || booking.id::text), 13, 4) || '-' ||
      substr(md5('legacy-patient-booking:' || booking.id::text), 17, 4) || '-' ||
      substr(md5('legacy-patient-booking:' || booking.id::text), 21, 12)
    )::uuid AS canonical_id,
    branch_mapping.canonical_id AS canonical_branch_id,
    service_mapping.canonical_id AS canonical_service_id
  FROM public.patient_bookings booking
  LEFT JOIN LATERAL (
    SELECT mapping.canonical_id
    FROM public.booking_branches legacy_branch
    JOIN public.be_external_entity_mappings mapping
      ON mapping.external_system = 'rubitime'
     AND mapping.entity_type = 'branch'
     AND mapping.external_id = legacy_branch.rubitime_branch_id
    WHERE legacy_branch.id = booking.branch_id
    LIMIT 1
  ) branch_mapping ON true
  LEFT JOIN LATERAL (
    SELECT mapping.canonical_id
    FROM public.booking_branch_services legacy_service
    JOIN public.be_external_entity_mappings mapping
      ON mapping.external_system = 'rubitime'
     AND mapping.entity_type IN ('service', 'availability')
     AND mapping.external_id = legacy_service.rubitime_service_id
    WHERE legacy_service.id = booking.branch_service_id
    ORDER BY CASE mapping.entity_type WHEN 'service' THEN 0 ELSE 1 END
    LIMIT 1
  ) service_mapping ON true
  WHERE booking.rubitime_id IS NOT NULL
    AND booking.canonical_appointment_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.be_external_entity_mappings mapping
      WHERE mapping.external_system = 'rubitime'
        AND mapping.entity_type = 'appointment'
        AND mapping.external_id = booking.rubitime_id::text
    )
), inserted AS (
  INSERT INTO public.be_appointments (
    id, organization_id, branch_id, specialist_id, service_id, platform_user_id,
    start_at, end_at, duration_minutes, source, status, original_start_at,
    reschedule_count, phone_normalized, attribution_json, created_at, updated_at
  )
  SELECT
    candidate.canonical_id,
    :'canonical_organization_id'::uuid,
    candidate.canonical_branch_id,
    :'canonical_specialist_id'::uuid,
    candidate.canonical_service_id,
    candidate.platform_user_id,
    candidate.slot_start,
    candidate.slot_end,
    GREATEST(1, round(extract(epoch FROM (candidate.slot_end - candidate.slot_start)) / 60)::integer),
    'rubitime_projection',
    CASE candidate.status
      WHEN 'cancelled' THEN 'cancelled_by_patient'
      WHEN 'completed' THEN 'completed'
      WHEN 'no_show' THEN 'no_show'
      WHEN 'awaiting_payment' THEN 'awaiting_payment'
      WHEN 'rescheduled' THEN 'rescheduled'
      ELSE 'confirmed'
    END,
    candidate.slot_start,
    0,
    candidate.contact_phone,
    jsonb_build_object(
      'importedBy', 'prod_to_target_cutover',
      'sourceTable', 'patient_bookings'
    ),
    candidate.created_at,
    candidate.updated_at
  FROM candidates candidate
  WHERE candidate.platform_user_id IS NOT NULL
    AND candidate.canonical_branch_id IS NOT NULL
    AND candidate.canonical_service_id IS NOT NULL
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
SELECT count(*) AS rows_written FROM inserted
\gset cutover_s03_

INSERT INTO public.be_external_entity_mappings (
  organization_id, entity_type, canonical_id, external_system, external_id,
  metadata, created_at, updated_at
)
SELECT
  :'canonical_organization_id'::uuid,
  'appointment',
  appointment.id,
  'rubitime',
  booking.rubitime_id::text,
  jsonb_build_object('projectedFrom', 'prod_to_target_cutover', 'sourceTable', 'patient_bookings'),
  booking.created_at,
  booking.updated_at
FROM public.patient_bookings booking
JOIN public.be_appointments appointment
  ON appointment.id = (
    substr(md5('legacy-patient-booking:' || booking.id::text), 1, 8) || '-' ||
    substr(md5('legacy-patient-booking:' || booking.id::text), 9, 4) || '-' ||
    substr(md5('legacy-patient-booking:' || booking.id::text), 13, 4) || '-' ||
    substr(md5('legacy-patient-booking:' || booking.id::text), 17, 4) || '-' ||
    substr(md5('legacy-patient-booking:' || booking.id::text), 21, 12)
  )::uuid
WHERE booking.rubitime_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.be_external_entity_mappings existing
    WHERE existing.external_system = 'rubitime'
      AND existing.entity_type = 'appointment'
      AND existing.external_id = booking.rubitime_id::text
  );

UPDATE public.patient_bookings booking
SET canonical_appointment_id = mapping.canonical_id,
    updated_at = GREATEST(booking.updated_at, now())
FROM public.be_external_entity_mappings mapping
WHERE booking.rubitime_id IS NOT NULL
  AND mapping.external_system = 'rubitime'
  AND mapping.entity_type = 'appointment'
  AND mapping.external_id = booking.rubitime_id::text
  AND booking.canonical_appointment_id IS DISTINCT FROM mapping.canonical_id;

INSERT INTO public.be_appointment_history_events (
  organization_id, appointment_id, event_type, payload, occurred_at, created_at
)
SELECT
  :'canonical_organization_id'::uuid,
  mapping.canonical_id,
  'legacy_cutover_imported',
  jsonb_build_object('externalId', booking.rubitime_id::text, 'sourceTable', 'patient_bookings'),
  booking.updated_at,
  booking.updated_at
FROM public.patient_bookings booking
JOIN public.be_external_entity_mappings mapping
  ON mapping.external_system = 'rubitime'
 AND mapping.entity_type = 'appointment'
 AND mapping.external_id = booking.rubitime_id::text
WHERE booking.rubitime_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.be_appointment_history_events history
    WHERE history.appointment_id = mapping.canonical_id
      AND history.event_type = 'legacy_cutover_imported'
      AND history.payload ->> 'externalId' = booking.rubitime_id::text
  );

SELECT json_build_object(
  'status', 'pass',
  'rowsWritten', :cutover_s03_rows_written,
  'canonicalRowsFromPatientBookings', (
    SELECT count(*) FROM public.be_appointments
    WHERE attribution_json ->> 'sourceTable' = 'patient_bookings'
  ),
  'rubitimeAppointmentMappings', (
    SELECT count(*) FROM public.be_external_entity_mappings
    WHERE external_system = 'rubitime' AND entity_type = 'appointment'
  ),
  'unmappedPatientBookings', (
    SELECT count(*) FROM public.patient_bookings
    WHERE rubitime_id IS NOT NULL AND canonical_appointment_id IS NULL
  ),
  'cutoverHistoryEvents', (
    SELECT count(*) FROM public.be_appointment_history_events
    WHERE event_type = 'legacy_cutover_imported'
  )
)::text AS result
\gset cutover_s03_
SELECT :'cutover_s03_result'::json AS cutover_step_s03_patient_projection_appointments;

-- Preserve legacy messenger identities as canonical platform identities and bindings.
\echo '=== CUTOVER STEP S04/06: preserve messenger identities and channel bindings ==='
INSERT INTO public.platform_users (
  integrator_user_id, display_name, first_name, last_name, role, created_at, updated_at
)
SELECT identity_row.user_id, '', NULL, NULL, 'client', identity_row.created_at, identity_row.updated_at
FROM integrator.identities identity_row
WHERE identity_row.resource IN ('telegram', 'max', 'vk')
  AND NOT EXISTS (
    SELECT 1 FROM public.platform_users user_row
    WHERE user_row.integrator_user_id = identity_row.user_id
  );

INSERT INTO public.user_channel_bindings (
  user_id, channel_code, external_id, created_at
)
SELECT
  canonical_user.id,
  identity_row.resource,
  identity_row.external_id,
  identity_row.created_at
FROM integrator.identities identity_row
JOIN public.platform_users source_user
  ON source_user.integrator_user_id = identity_row.user_id
JOIN public.platform_users canonical_user
  ON canonical_user.id = COALESCE(source_user.merged_into_id, source_user.id)
 AND canonical_user.merged_into_id IS NULL
WHERE identity_row.resource IN ('telegram', 'max', 'vk')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_channel_bindings existing
    WHERE existing.channel_code = identity_row.resource
      AND existing.external_id = identity_row.external_id
  );

UPDATE public.user_channel_bindings binding
SET bot_blocked_at = COALESCE(binding.bot_blocked_at, state_row.updated_at, now()),
    bot_blocked_reason = COALESCE(binding.bot_blocked_reason, 'legacy_telegram_state_inactive')
FROM integrator.telegram_state state_row
JOIN integrator.identities identity_row ON identity_row.id = state_row.identity_id
WHERE NOT state_row.is_active
  AND binding.channel_code = identity_row.resource
  AND binding.external_id = identity_row.external_id
  AND binding.bot_blocked_at IS NULL;

SELECT json_build_object(
  'status', 'pass',
  'legacyMessengerIdentities', (
    SELECT count(*) FROM integrator.identities WHERE resource IN ('telegram', 'max', 'vk')
  ),
  'canonicalChannelBindings', (
    SELECT count(*) FROM public.user_channel_bindings WHERE channel_code IN ('telegram', 'max', 'vk')
  ),
  'unmappedMessengerIdentities', (
    SELECT count(*)
    FROM integrator.identities identity_row
    LEFT JOIN public.user_channel_bindings binding
      ON binding.channel_code = identity_row.resource
     AND binding.external_id = identity_row.external_id
    WHERE identity_row.resource IN ('telegram', 'max', 'vk') AND binding.user_id IS NULL
  ),
  'blockedChannelBindings', (
    SELECT count(*) FROM public.user_channel_bindings WHERE bot_blocked_at IS NOT NULL
  )
)::text AS result
\gset cutover_s04_
SELECT :'cutover_s04_result'::json AS cutover_step_s04_messenger_identities;

-- Final neutral provenance accepted by the target checks.
\echo '=== CUTOVER STEP S05/06: normalize provenance and validate prepared data ==='
ALTER TABLE public.patient_bookings DROP CONSTRAINT IF EXISTS patient_bookings_source_check;
ALTER TABLE public.be_appointments DROP CONSTRAINT IF EXISTS be_appointments_source_check;
UPDATE public.patient_bookings SET source = 'imported' WHERE source = 'rubitime_projection';
UPDATE public.be_appointments SET source = 'imported' WHERE source = 'rubitime_projection';

DO $data_gate$
DECLARE
  violations bigint;
BEGIN
  SELECT count(*) INTO violations
  FROM public.patient_bookings booking
  WHERE booking.rubitime_id IS NOT NULL
    AND booking.canonical_appointment_id IS NULL;
  IF violations <> 0 THEN
    RAISE EXCEPTION 'unmapped patient booking projections: %', violations;
  END IF;

  SELECT count(*) INTO violations
  FROM integrator.identities identity_row
  LEFT JOIN public.user_channel_bindings binding
    ON binding.channel_code = identity_row.resource
   AND binding.external_id = identity_row.external_id
  WHERE identity_row.resource IN ('telegram', 'max', 'vk')
    AND binding.user_id IS NULL;
  IF violations <> 0 THEN
    RAISE EXCEPTION 'unmapped messenger identities: %', violations;
  END IF;

  SELECT count(*) INTO violations
  FROM integrator.question_messages legacy
  WHERE NOT EXISTS (
    SELECT 1 FROM public.support_question_messages target
    WHERE target.integrator_question_message_id = legacy.id
  );
  IF violations <> 0 THEN RAISE EXCEPTION 'unmirrored support question messages: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM integrator.user_questions legacy
  WHERE NOT EXISTS (
    SELECT 1 FROM public.support_questions target
    WHERE target.integrator_question_id = legacy.id
  );
  IF violations <> 0 THEN RAISE EXCEPTION 'unmirrored support questions: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM integrator.conversation_messages legacy
  WHERE NOT EXISTS (
    SELECT 1 FROM public.support_conversation_messages target
    WHERE target.integrator_message_id = legacy.id
  );
  IF violations <> 0 THEN RAISE EXCEPTION 'unmirrored support conversation messages: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM integrator.conversations legacy
  WHERE NOT EXISTS (
    SELECT 1 FROM public.support_conversations target
    WHERE target.integrator_conversation_id = legacy.id
  );
  IF violations <> 0 THEN RAISE EXCEPTION 'unmirrored support conversations: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM public.be_appointment_events legacy
  WHERE NOT EXISTS (
    SELECT 1 FROM public.be_appointment_history_events target
    WHERE target.organization_id = legacy.organization_id
      AND target.appointment_id = legacy.appointment_id
      AND target.event_type = legacy.event_type
      AND target.actor_id IS NOT DISTINCT FROM legacy.actor_id
      AND target.payload = legacy.payload
      AND target.created_at = legacy.created_at
  );
  IF violations <> 0 THEN RAISE EXCEPTION 'unmirrored appointment events: %', violations; END IF;

  SELECT count(*) INTO violations
  FROM integrator.rubitime_create_retry_jobs legacy
  WHERE legacy.status IN ('pending', 'processing')
    AND (
      legacy.kind IS DISTINCT FROM 'message.deliver'
      OR legacy.payload_json #>> '{intent,type}' IS DISTINCT FROM 'message.send'
      OR NULLIF(legacy.payload_json #>> '{intent,meta,eventId}', '') IS NULL
      OR COALESCE(
        NULLIF(legacy.payload_json #>> '{intent,payload,delivery,channels,0}', ''),
        NULLIF(legacy.payload_json #>> '{targets,0,resource}', '')
      ) IS NULL
    );
  IF violations <> 0 THEN RAISE EXCEPTION 'unsupported pending legacy retry jobs: %', violations; END IF;
END
$data_gate$;

SELECT json_build_object(
  'status', 'pass',
  'unmappedPatientBookings', (
    SELECT count(*) FROM public.patient_bookings
    WHERE rubitime_id IS NOT NULL AND canonical_appointment_id IS NULL
  ),
  'unmappedMessengerIdentities', (
    SELECT count(*)
    FROM integrator.identities identity_row
    LEFT JOIN public.user_channel_bindings binding
      ON binding.channel_code = identity_row.resource
     AND binding.external_id = identity_row.external_id
    WHERE identity_row.resource IN ('telegram', 'max', 'vk') AND binding.user_id IS NULL
  ),
  'legacyProjectionSourceValuesRemaining', (
    (SELECT count(*) FROM public.patient_bookings WHERE source = 'rubitime_projection')
    + (SELECT count(*) FROM public.be_appointments WHERE source = 'rubitime_projection')
  ),
  'unsupportedPendingLegacyRetryJobs', (
    SELECT count(*) FROM integrator.rubitime_create_retry_jobs legacy
    WHERE legacy.status IN ('pending', 'processing')
      AND (
        legacy.kind IS DISTINCT FROM 'message.deliver'
        OR legacy.payload_json #>> '{intent,type}' IS DISTINCT FROM 'message.send'
        OR NULLIF(legacy.payload_json #>> '{intent,meta,eventId}', '') IS NULL
        OR COALESCE(
          NULLIF(legacy.payload_json #>> '{intent,payload,delivery,channels,0}', ''),
          NULLIF(legacy.payload_json #>> '{targets,0,resource}', '')
        ) IS NULL
      )
  )
)::text AS result
\gset cutover_s05_
SELECT :'cutover_s05_result'::json AS cutover_step_s05_prepared_data_gate;

\echo '=== CUTOVER STEP S06/06: swap source schemas and create target schema shell ==='
ALTER SCHEMA public RENAME TO cutover_source_public;
ALTER SCHEMA integrator RENAME TO cutover_source_integrator;
ALTER SCHEMA drizzle RENAME TO cutover_source_drizzle;

-- Fresh PROD schema A predates tenant-scoped settings. Normalize only the preserved
-- source copy so finish.sql can rehydrate global values through the target B shape.
ALTER TABLE cutover_source_public.system_settings
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE SCHEMA public;
CREATE SCHEMA app;
CREATE SCHEMA app_control;
CREATE SCHEMA app_ext;
CREATE SCHEMA drizzle;
CREATE SCHEMA integrator;

ALTER EXTENSION btree_gist SET SCHEMA public;
ALTER EXTENSION pgcrypto SET SCHEMA app_ext;

SELECT json_build_object(
  'status', 'pass',
  'sourceSchemasPreserved', (
    SELECT count(*) FROM pg_namespace
    WHERE nspname IN ('cutover_source_public', 'cutover_source_integrator', 'cutover_source_drizzle')
  ),
  'targetSchemasCreated', (
    SELECT count(*) FROM pg_namespace
    WHERE nspname IN ('public', 'app', 'app_control', 'app_ext', 'drizzle', 'integrator')
  ),
  'sourceSystemSettingsOrganizationColumnPresent', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'cutover_source_public'
      AND table_name = 'system_settings'
      AND column_name = 'organization_id'
  )
)::text AS result
\gset cutover_s06_
SELECT :'cutover_s06_result'::json AS cutover_step_s06_schema_swap;
