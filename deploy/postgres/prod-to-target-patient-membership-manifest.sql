\set ON_ERROR_STOP on

-- Build the patient-domain membership oracle from every reviewed surviving relation.
-- Caller sets patient_source_schema to either public (preflight) or cutover_source_public (A -> B).
DROP TABLE IF EXISTS pg_temp.cutover_patient_fact_registry;
DROP TABLE IF EXISTS pg_temp.cutover_expected_patient_domain_membership;

CREATE TEMP TABLE cutover_patient_fact_registry (
  relation_name text PRIMARY KEY,
  patient_column text NOT NULL
);

INSERT INTO cutover_patient_fact_registry (relation_name, patient_column) VALUES
  ('clinical_anamnesis_illness', 'patient_user_id'),
  ('clinical_anamnesis_lifestyle', 'patient_user_id'),
  ('clinical_anamnesis_trauma', 'patient_user_id'),
  ('clinical_complaint', 'patient_user_id'),
  ('clinical_diagnosis', 'patient_user_id'),
  ('clinical_visit', 'patient_user_id'),
  ('doctor_patient_support', 'patient_user_id'),
  ('media_folders', 'patient_user_id'),
  ('patient_comorbidity', 'patient_user_id'),
  ('patient_files', 'patient_user_id'),
  ('patient_lfk_assignments', 'patient_user_id'),
  ('patient_payment', 'patient_user_id'),
  ('program_action_log', 'patient_user_id'),
  ('program_item_discussion_messages', 'patient_user_id'),
  ('program_item_discussion_reads', 'patient_user_id'),
  ('specialist_tasks', 'patient_user_id'),
  ('test_attempts', 'patient_user_id'),
  ('treatment_program_instances', 'patient_user_id');

CREATE TEMP TABLE cutover_expected_patient_domain_membership (
  platform_user_id uuid PRIMARY KEY
);

SELECT set_config('bcb.cutover.patient_source_schema', :'patient_source_schema', false);

DO $patient_domain_manifest$
DECLARE
  source_schema text := current_setting('bcb.cutover.patient_source_schema');
  fact record;
BEGIN
  IF source_schema NOT IN ('public', 'cutover_source_public') THEN
    RAISE EXCEPTION 'unsupported patient membership source schema: %', source_schema;
  END IF;

  IF to_regclass(format('%I.platform_users', source_schema)) IS NULL THEN
    RAISE EXCEPTION 'patient membership source has no platform_users: %', source_schema;
  END IF;

  FOR fact IN SELECT * FROM cutover_patient_fact_registry ORDER BY relation_name
  LOOP
    IF to_regclass(format('%I.%I', source_schema, fact.relation_name)) IS NULL THEN
      RAISE EXCEPTION 'reviewed patient-domain relation is missing: %.%', source_schema, fact.relation_name;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_attribute attribute
      WHERE attribute.attrelid = format('%I.%I', source_schema, fact.relation_name)::regclass
        AND attribute.attname = fact.patient_column
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ) THEN
      RAISE EXCEPTION 'reviewed patient-domain column is missing: %.%.%',
        source_schema, fact.relation_name, fact.patient_column;
    END IF;

    EXECUTE format(
      'INSERT INTO cutover_expected_patient_domain_membership (platform_user_id) '
      'SELECT DISTINCT patient.id '
      'FROM %I.%I domain_fact '
      'JOIN %I.platform_users patient ON patient.id = domain_fact.%I '
      'WHERE domain_fact.%I IS NOT NULL '
      'AND patient.role = ''client'' '
      'AND patient.merged_into_id IS NULL '
      'AND COALESCE(patient.is_archived, false) = false '
      'ON CONFLICT (platform_user_id) DO NOTHING',
      source_schema,
      fact.relation_name,
      source_schema,
      fact.patient_column,
      fact.patient_column
    );
  END LOOP;
END
$patient_domain_manifest$;
