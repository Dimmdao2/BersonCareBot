-- Aggregate-only fail-closed proof for the one-time PROD -> target data stage.
-- Runs after owner identity consolidation, doctor/admin split, reviewed FIO and the accepted
-- legacy-appointment transfer, but before any A -> B schema cutover.
\set ON_ERROR_STOP on

SELECT set_config('bcb.cutover.expected_database', :'expected_database', false);
SELECT set_config('bcb.cutover.canonical_organization_id', :'canonical_organization_id', false);
SELECT set_config('bcb.cutover.canonical_specialist_id', :'canonical_specialist_id', false);

\set patient_source_schema public
\ir prod-to-target-patient-membership-manifest.sql

DO $$
DECLARE
  expected_database text := current_setting('bcb.cutover.expected_database');
  canonical_organization uuid := current_setting('bcb.cutover.canonical_organization_id')::uuid;
  canonical_specialist uuid := current_setting('bcb.cutover.canonical_specialist_id')::uuid;
  dead_owner_users uuid[] := ARRAY[
    'a754c977-d1cc-46bb-b870-ca499be81884'::uuid,
    '9504c4b8-a97b-4be2-b2ff-9e03c13a71fb'::uuid,
    '2e5068fe-7f50-459f-b879-41cd194e5080'::uuid,
    '9475c2a9-cbef-4d3e-8357-f96503e2e29b'::uuid
  ];
  violation_count bigint;
BEGIN
  IF current_database() <> expected_database THEN
    RAISE EXCEPTION 'pre-cutover data assertion targeted %, expected %', current_database(), expected_database;
  END IF;

  SELECT count(*) INTO violation_count
  FROM public.platform_users
  WHERE id = ANY(dead_owner_users);
  IF violation_count <> 0 THEN
    RAISE EXCEPTION 'pre-cutover data assertion: % retired owner identities remain', violation_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.be_specialists
    WHERE id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'::uuid
  ) THEN
    RAISE EXCEPTION 'pre-cutover data assertion: retired specialist remains';
  END IF;

  SELECT count(*) INTO violation_count
  FROM public.be_specialists
  WHERE organization_id = canonical_organization AND is_active;
  IF violation_count <> 1 THEN
    RAISE EXCEPTION 'pre-cutover data assertion: active specialist count is %, expected 1', violation_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.be_specialists
    WHERE id = canonical_specialist
      AND organization_id = canonical_organization
      AND is_active
  ) THEN
    RAISE EXCEPTION 'pre-cutover data assertion: canonical specialist is not the one active specialist';
  END IF;

  SELECT count(*) INTO violation_count
  FROM public.be_appointments appointment
  LEFT JOIN public.be_specialists specialist ON specialist.id = appointment.specialist_id
  WHERE appointment.deleted_at IS NULL
    AND (appointment.specialist_id IS NULL OR specialist.id IS NULL OR NOT specialist.is_active);
  IF violation_count <> 0 THEN
    RAISE EXCEPTION 'pre-cutover data assertion: % live appointments have no active specialist', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM public.appointment_records legacy
  LEFT JOIN public.be_external_entity_mappings mapping
    ON mapping.external_system = 'rubitime'
   AND mapping.entity_type = 'appointment'
   AND mapping.external_id = legacy.integrator_record_id
  LEFT JOIN public.be_appointments direct
    ON direct.id = CASE
      WHEN legacy.integrator_record_id ~ '^be:[0-9a-fA-F-]{36}$'
      THEN substring(legacy.integrator_record_id FROM 4)::uuid
    END
  WHERE legacy.deleted_at IS NULL
    AND legacy.record_at IS NOT NULL
    AND mapping.canonical_id IS NULL
    AND direct.id IS NULL;
  IF violation_count <> 0 THEN
    RAISE EXCEPTION 'pre-cutover data assertion: % live legacy appointments remain unresolved', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM integrator.rubitime_records raw
  LEFT JOIN public.be_external_entity_mappings mapping
    ON mapping.external_system = 'rubitime'
   AND mapping.entity_type = 'appointment'
   AND mapping.external_id = raw.rubitime_record_id
  WHERE mapping.canonical_id IS NULL;
  IF violation_count <> 0 THEN
    RAISE EXCEPTION 'pre-cutover data assertion: % raw Rubitime records remain unmapped', violation_count;
  END IF;

  SELECT count(*) INTO violation_count
  FROM (
    SELECT external_id
    FROM public.be_external_entity_mappings
    WHERE external_system = 'rubitime' AND entity_type = 'appointment'
    GROUP BY external_id
    HAVING count(*) <> 1
  ) duplicate_mapping;
  IF violation_count <> 0 THEN
    RAISE EXCEPTION 'pre-cutover data assertion: % duplicate Rubitime appointment mappings', violation_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.platform_users
    WHERE id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'::uuid
      AND role = 'doctor'
      AND merged_into_id IS NULL
  ) THEN
    RAISE EXCEPTION 'pre-cutover data assertion: canonical owner account is not the live doctor';
  END IF;
END $$;

SELECT json_build_object(
  'status', 'pass',
  'activeSpecialists', (
    SELECT count(*) FROM public.be_specialists
    WHERE organization_id = :'canonical_organization_id'::uuid AND is_active
  ),
  'canonicalAppointments', (
    SELECT count(*) FROM public.be_appointments
    WHERE specialist_id = :'canonical_specialist_id'::uuid AND deleted_at IS NULL
  ),
  'patientDomainMembershipExpected', (
    SELECT count(*) FROM cutover_expected_patient_domain_membership
  ),
  'liveLegacyUnresolved', 0,
  'rawRubitimeUnmapped', 0,
  'retiredIdentityReferences', 0
) AS pre_cutover_data_stage;
