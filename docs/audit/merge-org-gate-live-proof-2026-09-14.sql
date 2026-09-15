\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'refusing audit proof on database %', current_database();
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.merge_gate_conflicts(target_id uuid, duplicate_id uuid)
RETURNS TABLE(conflict_organization_id uuid)
LANGUAGE sql
AS $$
  SELECT DISTINCT target.organization_id AS conflict_organization_id
  FROM (
    SELECT organization_id FROM clinical_visit WHERE patient_user_id = target_id
    UNION ALL SELECT organization_id FROM clinical_complaint WHERE patient_user_id = target_id
    UNION ALL SELECT organization_id FROM clinical_diagnosis WHERE patient_user_id = target_id
    UNION ALL SELECT organization_id FROM clinical_anamnesis_trauma WHERE patient_user_id = target_id
    UNION ALL SELECT organization_id FROM clinical_anamnesis_illness WHERE patient_user_id = target_id
    UNION ALL SELECT organization_id FROM clinical_anamnesis_lifestyle WHERE patient_user_id = target_id
    UNION ALL SELECT organization_id FROM doctor_notes WHERE user_id = target_id
    UNION ALL SELECT organization_id FROM patient_bookings WHERE platform_user_id = target_id
    UNION ALL SELECT organization_id FROM be_appointments WHERE platform_user_id = target_id
    UNION ALL SELECT organization_id FROM treatment_program_instances
      WHERE patient_user_id = target_id AND assignment_source = 'doctor'
  ) AS target(organization_id)
  JOIN (
    SELECT organization_id FROM clinical_visit WHERE patient_user_id = duplicate_id
    UNION ALL SELECT organization_id FROM clinical_complaint WHERE patient_user_id = duplicate_id
    UNION ALL SELECT organization_id FROM clinical_diagnosis WHERE patient_user_id = duplicate_id
    UNION ALL SELECT organization_id FROM clinical_anamnesis_trauma WHERE patient_user_id = duplicate_id
    UNION ALL SELECT organization_id FROM clinical_anamnesis_illness WHERE patient_user_id = duplicate_id
    UNION ALL SELECT organization_id FROM clinical_anamnesis_lifestyle WHERE patient_user_id = duplicate_id
    UNION ALL SELECT organization_id FROM doctor_notes WHERE user_id = duplicate_id
    UNION ALL SELECT organization_id FROM patient_bookings WHERE platform_user_id = duplicate_id
    UNION ALL SELECT organization_id FROM be_appointments WHERE platform_user_id = duplicate_id
    UNION ALL SELECT organization_id FROM treatment_program_instances
      WHERE patient_user_id = duplicate_id AND assignment_source = 'doctor'
  ) AS duplicate(organization_id)
    ON duplicate.organization_id IS NOT DISTINCT FROM target.organization_id
  LIMIT 1
$$;

INSERT INTO be_organizations(id, title)
VALUES ('a0000000-0000-4000-8000-000000000002', 'audit rollback org B');

INSERT INTO platform_users(id, display_name, role)
SELECT id, label, role
FROM (VALUES
  ('f0000000-0000-4000-8000-0000000000ff'::uuid, 'audit author', 'doctor'),
  ('f0000000-0000-4000-8000-000000000101'::uuid, 'different org target', 'client'),
  ('f0000000-0000-4000-8000-000000000102'::uuid, 'different org duplicate', 'client'),
  ('f0000000-0000-4000-8000-000000000201'::uuid, 'same org target', 'client'),
  ('f0000000-0000-4000-8000-000000000202'::uuid, 'same org duplicate', 'client'),
  ('f0000000-0000-4000-8000-000000000301'::uuid, 'promo target', 'client'),
  ('f0000000-0000-4000-8000-000000000302'::uuid, 'promo duplicate', 'client'),
  ('f0000000-0000-4000-8000-000000000401'::uuid, 'one side target', 'client'),
  ('f0000000-0000-4000-8000-000000000402'::uuid, 'one side duplicate', 'client'),
  ('f0000000-0000-4000-8000-000000000501'::uuid, 'null target', 'client'),
  ('f0000000-0000-4000-8000-000000000502'::uuid, 'null duplicate', 'client'),
  ('f0000000-0000-4000-8000-000000000601'::uuid, 'null-vs-org target', 'client'),
  ('f0000000-0000-4000-8000-000000000602'::uuid, 'null-vs-org duplicate', 'client'),
  ('f0000000-0000-4000-8000-000000000701'::uuid, 'appointment target', 'client'),
  ('f0000000-0000-4000-8000-000000000702'::uuid, 'appointment duplicate', 'client')
) AS fixture(id, label, role);

INSERT INTO doctor_notes(user_id, author_id, text, organization_id, note_date)
VALUES
  ('f0000000-0000-4000-8000-000000000101', 'f0000000-0000-4000-8000-0000000000ff', 'audit different A', 'a0000000-0000-4000-8000-000000000001', CURRENT_DATE),
  ('f0000000-0000-4000-8000-000000000102', 'f0000000-0000-4000-8000-0000000000ff', 'audit different B', 'a0000000-0000-4000-8000-000000000002', CURRENT_DATE),
  ('f0000000-0000-4000-8000-000000000201', 'f0000000-0000-4000-8000-0000000000ff', 'audit same A', 'a0000000-0000-4000-8000-000000000001', CURRENT_DATE),
  ('f0000000-0000-4000-8000-000000000301', 'f0000000-0000-4000-8000-0000000000ff', 'audit promo A', 'a0000000-0000-4000-8000-000000000001', CURRENT_DATE),
  ('f0000000-0000-4000-8000-000000000401', 'f0000000-0000-4000-8000-0000000000ff', 'audit one side A', 'a0000000-0000-4000-8000-000000000001', CURRENT_DATE),
  ('f0000000-0000-4000-8000-000000000501', 'f0000000-0000-4000-8000-0000000000ff', 'audit null target', NULL, CURRENT_DATE),
  ('f0000000-0000-4000-8000-000000000502', 'f0000000-0000-4000-8000-0000000000ff', 'audit null duplicate', NULL, CURRENT_DATE),
  ('f0000000-0000-4000-8000-000000000601', 'f0000000-0000-4000-8000-0000000000ff', 'audit null side', NULL, CURRENT_DATE),
  ('f0000000-0000-4000-8000-000000000602', 'f0000000-0000-4000-8000-0000000000ff', 'audit org side', 'a0000000-0000-4000-8000-000000000001', CURRENT_DATE);

INSERT INTO treatment_program_instances(patient_user_id, title, assignment_source, organization_id)
VALUES
  ('f0000000-0000-4000-8000-000000000202', 'audit doctor program', 'doctor', 'a0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000302', 'audit promo program', 'promo', 'a0000000-0000-4000-8000-000000000001');

INSERT INTO patient_bookings(
  id, platform_user_id, booking_type, category, slot_start, slot_end, status,
  contact_phone, contact_name, source, organization_id
)
VALUES
  ('e0000000-0000-4000-8000-000000000701', 'f0000000-0000-4000-8000-000000000701', 'online', 'general', now(), now() + interval '30 minutes', 'completed', '+70000000701', 'audit appointment target', 'imported', 'a0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000702', 'f0000000-0000-4000-8000-000000000702', 'online', 'general', now() + interval '1 hour', now() + interval '90 minutes', 'completed', '+70000000702', 'audit appointment duplicate', 'imported', 'a0000000-0000-4000-8000-000000000001');

SELECT scenario, expected, actual_conflicts,
       CASE WHEN actual_conflicts = expected THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM (
  SELECT 'different_org_doctor_notes' AS scenario, 0::bigint AS expected,
    (SELECT count(*) FROM pg_temp.merge_gate_conflicts('f0000000-0000-4000-8000-000000000101', 'f0000000-0000-4000-8000-000000000102')) AS actual_conflicts
  UNION ALL
  SELECT 'same_org_note_vs_doctor_program', 1,
    (SELECT count(*) FROM pg_temp.merge_gate_conflicts('f0000000-0000-4000-8000-000000000201', 'f0000000-0000-4000-8000-000000000202'))
  UNION ALL
  SELECT 'promo_program_is_not_history', 0,
    (SELECT count(*) FROM pg_temp.merge_gate_conflicts('f0000000-0000-4000-8000-000000000301', 'f0000000-0000-4000-8000-000000000302'))
  UNION ALL
  SELECT 'history_on_target_only', 0,
    (SELECT count(*) FROM pg_temp.merge_gate_conflicts('f0000000-0000-4000-8000-000000000401', 'f0000000-0000-4000-8000-000000000402'))
  UNION ALL
  SELECT 'null_org_matches_null_org', 1,
    (SELECT count(*) FROM pg_temp.merge_gate_conflicts('f0000000-0000-4000-8000-000000000501', 'f0000000-0000-4000-8000-000000000502'))
  UNION ALL
  SELECT 'null_org_does_not_match_known_org', 0,
    (SELECT count(*) FROM pg_temp.merge_gate_conflicts('f0000000-0000-4000-8000-000000000601', 'f0000000-0000-4000-8000-000000000602'))
  UNION ALL
  SELECT 'appointment_history_never_blocks', 0,
    (SELECT count(*) FROM pg_temp.merge_gate_conflicts('f0000000-0000-4000-8000-000000000701', 'f0000000-0000-4000-8000-000000000702'))
) AS results;

ROLLBACK;

SELECT count(*) AS audit_rows_after_rollback
FROM platform_users
WHERE id::text LIKE 'f0000000-0000-4000-8000-000000000%';
