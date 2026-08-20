\set ON_ERROR_STOP on

-- Schema-A data stage for appointment_records rows that never received a canonical appointment
-- mapping. This is part of the normal PROD-dump -> target cutover and is deliberately rerunnable:
-- the stable deduplication key is appointment_records.id, namespaced into a deterministic UUID.
-- The legacy row is then linked through the native be:<uuid> reference, so no Rubitime mapping is
-- created and the retired external bridge is not needed after the cutover.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '0';

SELECT set_config('bcb.cutover.expected_database', :'cutover_database', true);
SELECT set_config('bcb.cutover.canonical_organization_id', :'canonical_organization_id', true);
SELECT set_config('bcb.cutover.canonical_specialist_id', :'canonical_specialist_id', true);

DO $preflight$
DECLARE
  canonical_organization uuid := current_setting('bcb.cutover.canonical_organization_id')::uuid;
  canonical_specialist uuid := current_setting('bcb.cutover.canonical_specialist_id')::uuid;
  active_specialists bigint;
BEGIN
  IF current_database() <> current_setting('bcb.cutover.expected_database') THEN
    RAISE EXCEPTION 'legacy appointment carry targeted %, expected %',
      current_database(), current_setting('bcb.cutover.expected_database');
  END IF;
  IF to_regclass('public.appointment_records') IS NULL
     OR to_regclass('public.be_appointments') IS NULL THEN
    RAISE EXCEPTION 'legacy appointment carry requires schema-A appointment tables';
  END IF;

  SELECT count(*) INTO active_specialists
  FROM public.be_specialists
  WHERE organization_id = canonical_organization AND is_active;
  IF active_specialists <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.be_specialists
    WHERE id = canonical_specialist
      AND organization_id = canonical_organization
      AND is_active
  ) THEN
    RAISE EXCEPTION 'legacy appointment carry requires the one canonical active specialist';
  END IF;
END
$preflight$;

LOCK TABLE public.appointment_records IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.be_appointments IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE cutover_legacy_appointment_candidates ON COMMIT DROP AS
WITH unresolved AS (
  SELECT
    legacy.*,
    coalesce(
      direct.attribution_json ->> 'legacyIntegratorRecordId',
      legacy.integrator_record_id
    ) AS legacy_integrator_record_id,
    (
      substr(md5('legacy-appointment-record:' || legacy.id::text), 1, 8) || '-' ||
      substr(md5('legacy-appointment-record:' || legacy.id::text), 9, 4) || '-' ||
      substr(md5('legacy-appointment-record:' || legacy.id::text), 13, 4) || '-' ||
      substr(md5('legacy-appointment-record:' || legacy.id::text), 17, 4) || '-' ||
      substr(md5('legacy-appointment-record:' || legacy.id::text), 21, 12)
    )::uuid AS canonical_id,
    CASE
      WHEN nullif(legacy.payload_json ->> 'duration', '') ~ '^[0-9]+([.][0-9]+)?$'
       AND (legacy.payload_json ->> 'duration')::numeric > 0
      THEN round((legacy.payload_json ->> 'duration')::numeric)::integer
    END AS duration_minutes,
    source_branch.integrator_branch_id::text AS branch_external_id
  FROM public.appointment_records legacy
  LEFT JOIN public.branches source_branch ON source_branch.id = legacy.branch_id
  LEFT JOIN public.be_external_entity_mappings appointment_mapping
    ON appointment_mapping.external_system = 'rubitime'
   AND appointment_mapping.entity_type = 'appointment'
   AND appointment_mapping.external_id = legacy.integrator_record_id
  LEFT JOIN public.be_appointments direct
    ON direct.id = CASE
      WHEN legacy.integrator_record_id ~ '^be:[0-9a-fA-F-]{36}$'
      THEN substring(legacy.integrator_record_id FROM 4)::uuid
    END
  WHERE legacy.deleted_at IS NULL
    AND legacy.record_at IS NOT NULL
    AND appointment_mapping.canonical_id IS NULL
    AND (
      direct.id IS NULL
      OR (
        direct.attribution_json ->> 'sourceTable' = 'appointment_records'
        AND direct.attribution_json ->> 'legacyAppointmentRecordId' = legacy.id::text
      )
    )
), classified AS (
  SELECT
    unresolved.*,
    CASE
      WHEN lower(coalesce(
        nullif(unresolved.payload_json ->> 'rubitime_normalized_status', ''),
        nullif(unresolved.payload_json ->> 'status', ''),
        nullif(unresolved.payload_json ->> 'rubitime_status_code', '')
      )) IN ('2', 'completed')
        OR lower(unresolved.payload_json ->> 'status_title') LIKE '%заверш%'
      THEN 'completed'
      WHEN lower(coalesce(
        nullif(unresolved.payload_json ->> 'rubitime_normalized_status', ''),
        nullif(unresolved.payload_json ->> 'status', ''),
        nullif(unresolved.payload_json ->> 'rubitime_status_code', '')
      )) IN ('3', 'awaiting_prepayment')
        OR lower(unresolved.payload_json ->> 'status_title') LIKE '%предоплат%'
      THEN 'awaiting_payment'
      WHEN lower(coalesce(
        nullif(unresolved.payload_json ->> 'rubitime_normalized_status', ''),
        nullif(unresolved.payload_json ->> 'status', ''),
        nullif(unresolved.payload_json ->> 'rubitime_status_code', '')
      )) IN ('5', 'awaiting_confirmation')
        OR lower(unresolved.payload_json ->> 'status_title') LIKE '%ожида%подтвержд%'
      THEN 'manual_review_required'
      WHEN lower(coalesce(
        nullif(unresolved.payload_json ->> 'rubitime_normalized_status', ''),
        nullif(unresolved.payload_json ->> 'status', ''),
        nullif(unresolved.payload_json ->> 'rubitime_status_code', '')
      )) IN ('6', 'in_cart')
        OR lower(unresolved.payload_json ->> 'status_title') LIKE '%корзин%'
      THEN 'created'
      WHEN lower(coalesce(
        nullif(unresolved.payload_json ->> 'rubitime_normalized_status', ''),
        nullif(unresolved.payload_json ->> 'status', ''),
        nullif(unresolved.payload_json ->> 'rubitime_status_code', '')
      )) IN ('7', 'moved', 'moved_awaiting')
        OR lower(unresolved.payload_json ->> 'status_title') LIKE '%перенос%'
        OR (lower(unresolved.status) = 'updated' AND lower(unresolved.last_event) ~ '(resched|move)')
      THEN 'rescheduled'
      WHEN lower(coalesce(
        nullif(unresolved.payload_json ->> 'rubitime_normalized_status', ''),
        nullif(unresolved.payload_json ->> 'status', ''),
        nullif(unresolved.payload_json ->> 'rubitime_status_code', ''),
        unresolved.status
      )) IN ('4', 'canceled', 'cancelled')
        OR lower(unresolved.payload_json ->> 'status_title') LIKE '%отмен%'
        OR lower(unresolved.last_event) LIKE '%cancel%'
      THEN CASE
        WHEN lower(unresolved.last_event) ~ '(staff|specialist|admin|manual-cancel)'
        THEN 'cancelled_by_specialist'
        ELSE 'cancelled_by_patient'
      END
      WHEN lower(unresolved.last_event) ~ '(no_show|no-show)' THEN 'no_show'
      ELSE 'confirmed'
    END AS canonical_status
  FROM unresolved
)
SELECT
  classified.*,
  branch_mapping.canonical_id AS canonical_branch_id,
  service_mapping.canonical_id AS canonical_service_id
FROM classified
LEFT JOIN LATERAL (
  SELECT mapping.canonical_id
  FROM public.be_external_entity_mappings mapping
  WHERE mapping.external_system = 'rubitime'
    AND mapping.entity_type = 'branch'
    AND mapping.external_id = coalesce(
      nullif(classified.payload_json ->> 'branch_id', ''),
      classified.branch_external_id
    )
  LIMIT 1
) branch_mapping ON true
LEFT JOIN LATERAL (
  SELECT mapping.canonical_id
  FROM public.be_external_entity_mappings mapping
  WHERE mapping.external_system = 'rubitime'
    AND mapping.entity_type IN ('service', 'availability')
    AND mapping.external_id = nullif(classified.payload_json ->> 'service_id', '')
  ORDER BY CASE mapping.entity_type WHEN 'service' THEN 0 ELSE 1 END
  LIMIT 1
) service_mapping ON true;

DO $candidate_gate$
DECLARE
  invalid_duration_count bigint;
BEGIN
  SELECT count(*) INTO invalid_duration_count
  FROM cutover_legacy_appointment_candidates
  WHERE duration_minutes IS NULL;
  IF invalid_duration_count <> 0 THEN
    RAISE EXCEPTION 'legacy appointment carry: % rows have no usable source duration', invalid_duration_count;
  END IF;
END
$candidate_gate$;

WITH inserted AS (
  INSERT INTO public.be_appointments (
    id, organization_id, branch_id, specialist_id, service_id, platform_user_id,
    start_at, end_at, duration_minutes, source, status, original_start_at,
    reschedule_count, phone_normalized, attribution_json, created_at, updated_at
  )
  SELECT
    candidate.canonical_id,
    current_setting('bcb.cutover.canonical_organization_id')::uuid,
    candidate.canonical_branch_id,
    current_setting('bcb.cutover.canonical_specialist_id')::uuid,
    candidate.canonical_service_id,
    candidate.platform_user_id,
    candidate.record_at,
    candidate.record_at + make_interval(mins => candidate.duration_minutes),
    candidate.duration_minutes,
    'rubitime_projection',
    candidate.canonical_status,
    candidate.record_at,
    0,
    candidate.phone_normalized,
    jsonb_build_object(
      'importedBy', 'prod_to_target_cutover',
      'sourceTable', 'appointment_records',
      'legacyAppointmentRecordId', candidate.id,
      'legacyIntegratorRecordId', candidate.legacy_integrator_record_id
    ),
    candidate.created_at,
    candidate.updated_at
  FROM cutover_legacy_appointment_candidates candidate
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
SELECT count(*) AS legacy_appointments_inserted FROM inserted;

UPDATE public.appointment_records legacy
SET integrator_record_id = 'be:' || candidate.canonical_id::text,
    updated_at = greatest(legacy.updated_at, statement_timestamp())
FROM cutover_legacy_appointment_candidates candidate
WHERE legacy.id = candidate.id
  AND EXISTS (
    SELECT 1 FROM public.be_appointments appointment
    WHERE appointment.id = candidate.canonical_id
      AND appointment.attribution_json ->> 'sourceTable' = 'appointment_records'
      AND appointment.attribution_json ->> 'legacyAppointmentRecordId' = candidate.id::text
  );

-- The same provider appointment can also be present in patient_bookings. Point that projection at
-- the carried canonical row by its exact source id before prod-to-target-cutover-start.sql considers
-- creating a patient-booking-only appointment. This is another native FK, not a provider mapping.
UPDATE public.patient_bookings booking
SET canonical_appointment_id = candidate.canonical_id,
    updated_at = greatest(booking.updated_at, statement_timestamp())
FROM cutover_legacy_appointment_candidates candidate
WHERE booking.rubitime_id::text = candidate.legacy_integrator_record_id
  AND booking.canonical_appointment_id IS DISTINCT FROM candidate.canonical_id;

SELECT json_build_object(
  'status', 'pass',
  'deduplicationKey', 'md5(legacy-appointment-record:<appointment_records.id>)',
  'legacyCandidates', (SELECT count(*) FROM cutover_legacy_appointment_candidates),
  'legacyDirectLinks', (
    SELECT count(*)
    FROM public.appointment_records legacy
    JOIN cutover_legacy_appointment_candidates candidate ON candidate.id = legacy.id
    WHERE legacy.integrator_record_id = 'be:' || candidate.canonical_id::text
  ),
  'canonicalRows', (
    SELECT count(*)
    FROM public.be_appointments appointment
    JOIN cutover_legacy_appointment_candidates candidate ON candidate.canonical_id = appointment.id
  ),
  'patientBookingDirectLinks', (
    SELECT count(*)
    FROM public.patient_bookings booking
    JOIN cutover_legacy_appointment_candidates candidate
      ON candidate.legacy_integrator_record_id = booking.rubitime_id::text
    WHERE booking.canonical_appointment_id = candidate.canonical_id
  )
) AS legacy_appointment_carry;

COMMIT;
