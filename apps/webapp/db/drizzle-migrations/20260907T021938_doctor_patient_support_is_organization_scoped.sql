-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT (SELECT attnotnull FROM pg_catalog.pg_attribute WHERE attrelid = 'public.doctor_patient_support'::regclass AND attname = 'organization_id' AND NOT attisdropped) AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND tablename = 'doctor_patient_support' AND indexname = 'uq_doctor_patient_support_patient') AND EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND tablename = 'doctor_patient_support' AND indexname = 'uq_doctor_patient_support_organization_patient' AND indexdef LIKE '%(organization_id, patient_user_id)%') AND EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND tablename = 'doctor_patient_support' AND indexname = 'idx_doctor_patient_support_organization_on_support' AND indexdef LIKE '%(organization_id, on_support)%')
-- C3M-02: a support profile belongs to exactly one organization and patient. Existing null rows
-- move only when enrollment history proves one organization; zero or multiple candidates are
-- reported and refuse the migration before any data is changed.
DO $c3m02_support_organization_backfill$
DECLARE
  v_ambiguous_count bigint;
  v_ambiguity_report text;
  v_backfilled_count bigint;
BEGIN
  WITH organization_candidates AS (
    SELECT
      support.patient_user_id,
      count(DISTINCT enrollment.organization_id) AS candidate_count,
      array_agg(DISTINCT enrollment.organization_id ORDER BY enrollment.organization_id)
        FILTER (WHERE enrollment.organization_id IS NOT NULL) AS organization_ids
    FROM public.doctor_patient_support AS support
    LEFT JOIN public.org_enrollments AS enrollment
      ON enrollment.platform_user_id = support.patient_user_id
    WHERE support.organization_id IS NULL
    GROUP BY support.patient_user_id
  ), ambiguous AS (
    SELECT patient_user_id, candidate_count, organization_ids
    FROM organization_candidates
    WHERE candidate_count IS DISTINCT FROM 1
  )
  SELECT
    count(*),
    string_agg(
      format(
        '%s => [%s]',
        patient_user_id,
        COALESCE(array_to_string(organization_ids, ', '), 'no organization')
      ),
      '; ' ORDER BY patient_user_id
    )
  INTO v_ambiguous_count, v_ambiguity_report
  FROM ambiguous;

  IF v_ambiguous_count > 0 THEN
    RAISE EXCEPTION
      'C3M-02 support organization backfill refused: % ambiguous patient(s): %',
      v_ambiguous_count,
      v_ambiguity_report;
  END IF;

  WITH exact_organization AS (
    SELECT
      support.patient_user_id,
      (array_agg(DISTINCT enrollment.organization_id ORDER BY enrollment.organization_id))[1]
        AS organization_id
    FROM public.doctor_patient_support AS support
    JOIN public.org_enrollments AS enrollment
      ON enrollment.platform_user_id = support.patient_user_id
    WHERE support.organization_id IS NULL
    GROUP BY support.patient_user_id
    HAVING count(DISTINCT enrollment.organization_id) = 1
  )
  UPDATE public.doctor_patient_support AS support
  SET organization_id = exact_organization.organization_id
  FROM exact_organization
  WHERE support.patient_user_id = exact_organization.patient_user_id
    AND support.organization_id IS NULL;

  GET DIAGNOSTICS v_backfilled_count = ROW_COUNT;

  IF EXISTS (
    SELECT 1
    FROM public.doctor_patient_support
    WHERE organization_id IS NULL
  ) THEN
    RAISE EXCEPTION 'C3M-02 support organization backfill left unscoped rows';
  END IF;

  RAISE NOTICE 'C3M-02 support organization backfill assigned % row(s)', v_backfilled_count;
END
$c3m02_support_organization_backfill$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.doctor_patient_support
  ALTER COLUMN organization_id SET NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DROP INDEX public.uq_doctor_patient_support_patient;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX uq_doctor_patient_support_organization_patient
  ON public.doctor_patient_support USING btree (organization_id, patient_user_id);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DROP INDEX public.idx_doctor_patient_support_on_support;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX idx_doctor_patient_support_organization_on_support
  ON public.doctor_patient_support USING btree (organization_id, on_support);
