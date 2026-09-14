\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'refusing merge-gate proof on database %', current_database();
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
    UNION ALL SELECT organization_id FROM symptom_trackings
      WHERE (platform_user_id = target_id OR user_id = target_id::text)
        AND deleted_at IS NULL
        AND (symptom_key IS NULL OR symptom_key NOT IN ('general_wellbeing', 'warmup_feeling'))
    UNION ALL SELECT organization_id FROM patient_lfk_assignments WHERE patient_user_id = target_id
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
    UNION ALL SELECT organization_id FROM symptom_trackings
      WHERE (platform_user_id = duplicate_id OR user_id = duplicate_id::text)
        AND deleted_at IS NULL
        AND (symptom_key IS NULL OR symptom_key NOT IN ('general_wellbeing', 'warmup_feeling'))
    UNION ALL SELECT organization_id FROM patient_lfk_assignments WHERE patient_user_id = duplicate_id
    UNION ALL SELECT organization_id FROM treatment_program_instances
      WHERE patient_user_id = duplicate_id AND assignment_source = 'doctor'
  ) AS duplicate(organization_id)
    ON duplicate.organization_id IS NOT DISTINCT FROM target.organization_id
  LIMIT 1
$$;

INSERT INTO be_organizations(id, title)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'merge gate rollback org A'),
  ('a1000000-0000-4000-8000-000000000002', 'merge gate rollback org B');

INSERT INTO platform_users(id, display_name, role)
SELECT id, label, role
FROM (VALUES
  ('f1000000-0000-4000-8000-0000000000ff'::uuid, 'merge gate author', 'doctor'),
  ('f1000000-0000-4000-8000-000000000101'::uuid, 'appointment target', 'client'),
  ('f1000000-0000-4000-8000-000000000102'::uuid, 'appointment duplicate', 'client'),
  ('f1000000-0000-4000-8000-000000000201'::uuid, 'same org target', 'client'),
  ('f1000000-0000-4000-8000-000000000202'::uuid, 'same org duplicate', 'client'),
  ('f1000000-0000-4000-8000-000000000301'::uuid, 'different org target', 'client'),
  ('f1000000-0000-4000-8000-000000000302'::uuid, 'different org duplicate', 'client'),
  ('f1000000-0000-4000-8000-000000000401'::uuid, 'null org target', 'client'),
  ('f1000000-0000-4000-8000-000000000402'::uuid, 'null org duplicate', 'client')
) AS fixture(id, label, role);

INSERT INTO patient_bookings(
  id, platform_user_id, booking_type, category, slot_start, slot_end, status,
  contact_phone, contact_name, source, organization_id
)
VALUES
  ('e1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000101', 'online', 'general', now(), now() + interval '30 minutes', 'completed', '+70000000101', 'appointment target', 'imported', 'a1000000-0000-4000-8000-000000000001'),
  ('e1000000-0000-4000-8000-000000000102', 'f1000000-0000-4000-8000-000000000102', 'online', 'general', now() + interval '1 hour', now() + interval '90 minutes', 'completed', '+70000000102', 'appointment duplicate', 'imported', 'a1000000-0000-4000-8000-000000000001');

INSERT INTO treatment_program_instances(patient_user_id, title, assignment_source, organization_id)
VALUES
  ('f1000000-0000-4000-8000-000000000201', 'same org assignment target', 'doctor', 'a1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000202', 'same org assignment duplicate', 'doctor', 'a1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000301', 'different org assignment target', 'doctor', 'a1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000302', 'different org assignment duplicate', 'doctor', 'a1000000-0000-4000-8000-000000000002');

INSERT INTO doctor_notes(user_id, author_id, text, organization_id, note_date)
VALUES
  ('f1000000-0000-4000-8000-000000000401', 'f1000000-0000-4000-8000-0000000000ff', 'null org target', NULL, CURRENT_DATE),
  ('f1000000-0000-4000-8000-000000000402', 'f1000000-0000-4000-8000-0000000000ff', 'null org duplicate', NULL, CURRENT_DATE);

SELECT scenario, expected, actual_conflicts,
       CASE WHEN actual_conflicts = expected THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM (
  SELECT 'appointment_history_never_blocks' AS scenario, 0::bigint AS expected,
    (SELECT count(*) FROM pg_temp.merge_gate_conflicts('f1000000-0000-4000-8000-000000000101', 'f1000000-0000-4000-8000-000000000102')) AS actual_conflicts
  UNION ALL
  SELECT 'same_org_assignments_block', 1,
    (SELECT count(*) FROM pg_temp.merge_gate_conflicts('f1000000-0000-4000-8000-000000000201', 'f1000000-0000-4000-8000-000000000202'))
  UNION ALL
  SELECT 'different_org_assignments_allow', 0,
    (SELECT count(*) FROM pg_temp.merge_gate_conflicts('f1000000-0000-4000-8000-000000000301', 'f1000000-0000-4000-8000-000000000302'))
  UNION ALL
  SELECT 'null_org_matches_null_org', 1,
    (SELECT count(*) FROM pg_temp.merge_gate_conflicts('f1000000-0000-4000-8000-000000000401', 'f1000000-0000-4000-8000-000000000402'))
) AS results;

ROLLBACK;

SELECT count(*) AS proof_rows_after_rollback
FROM platform_users
WHERE id::text LIKE 'f1000000-0000-4000-8000-000000000%';
