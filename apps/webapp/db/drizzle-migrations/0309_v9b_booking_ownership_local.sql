-- TEMPORARY LOCAL MIGRATION NUMBER 0309
-- #1081 V9b S03: every booking projection receives an organization only from an immutable
-- canonical key already stored on that row. The Drizzle migrator wraps the complete file in one
-- transaction, so the exception below also rolls back the nullable columns and any proven stamps.

ALTER TABLE public.patient_bookings
  ADD COLUMN IF NOT EXISTS organization_id uuid;
--> statement-breakpoint

ALTER TABLE public.appointment_records
  ADD COLUMN IF NOT EXISTS organization_id uuid;
--> statement-breakpoint

DO $migration$
DECLARE
  v_zero_match integer := 0;
  v_multiple_match integer := 0;
  v_deleted_parent integer := 0;
  v_user_mismatch integer := 0;
  v_provider_mismatch integer := 0;
  v_stamped_patient integer := 0;
  v_stamped_record integer := 0;
BEGIN
  WITH targets AS (
    SELECT 'patient_bookings'::text AS target_table,
           pb.id AS row_id,
           pb.platform_user_id AS row_user_id,
           NULL::text AS integrator_record_id,
           '{}'::jsonb AS payload_json,
           pb.canonical_appointment_id AS direct_appointment_id
      FROM public.patient_bookings pb
     WHERE pb.organization_id IS NULL
    UNION ALL
    SELECT 'appointment_records',
           ar.id,
           ar.platform_user_id,
           ar.integrator_record_id,
           ar.payload_json,
           NULL::uuid
      FROM public.appointment_records ar
     WHERE ar.organization_id IS NULL
  ),
  candidate_signals AS (
    -- Native patient booking: canonical_appointment_id is the sole ownership key. Snapshot
    -- branch/service/phone fields and current membership are deliberately not candidates.
    SELECT t.target_table, t.row_id, a.id AS appointment_id,
           a.organization_id AS proof_organization_id,
           a.organization_id AS parent_organization_id
      FROM targets t
      JOIN public.be_appointments a
        ON t.target_table = 'patient_bookings'
       AND a.id = t.direct_appointment_id
    UNION ALL
    -- Native appointment projection: both be:<uuid> and payload appointment_id are immutable
    -- canonical identities. Equal identities collapse; contradictory identities remain multiple.
    SELECT t.target_table, t.row_id, a.id, a.organization_id, a.organization_id
      FROM targets t
      JOIN public.be_appointments a
        ON t.target_table = 'appointment_records'
       AND t.integrator_record_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       AND a.id = substring(t.integrator_record_id FROM 4)::uuid
    UNION ALL
    SELECT t.target_table, t.row_id, a.id, a.organization_id, a.organization_id
      FROM targets t
      JOIN public.be_appointments a
        ON t.target_table = 'appointment_records'
       AND coalesce(t.payload_json->>'appointment_id', '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       AND a.id = (t.payload_json->>'appointment_id')::uuid
    UNION ALL
    -- Retired-provider rows may use only the retained unique external appointment mapping.
    -- Phone, display snapshots, current membership and single-clinic cardinality are not proof.
    SELECT t.target_table, t.row_id, a.id, m.organization_id, a.organization_id
      FROM targets t
      JOIN public.be_external_entity_mappings m
        ON t.target_table = 'appointment_records'
       AND m.external_system = 'rubitime'
       AND m.entity_type = 'appointment'
       AND m.external_id = t.integrator_record_id
      JOIN public.be_appointments a ON a.id = m.canonical_id
  ),
  candidate_summary AS (
    SELECT t.target_table,
           t.row_id,
           count(DISTINCT cs.appointment_id)::integer AS match_count,
           count(DISTINCT cs.proof_organization_id)::integer AS proof_org_count,
           coalesce(
             bool_or(cs.proof_organization_id IS DISTINCT FROM cs.parent_organization_id),
             false
           ) AS mapping_org_mismatch,
           min(cs.appointment_id::text)::uuid AS appointment_id
      FROM targets t
      LEFT JOIN candidate_signals cs
        ON cs.target_table = t.target_table
       AND cs.row_id = t.row_id
     GROUP BY t.target_table, t.row_id
  ),
  resolved AS (
    SELECT t.*,
           s.match_count,
           s.proof_org_count,
           s.mapping_org_mismatch,
           a.organization_id AS matched_organization_id,
           a.platform_user_id AS matched_user_id,
           a.specialist_id AS matched_specialist_id,
           a.deleted_at AS matched_deleted_at,
           nullif(btrim(t.payload_json->>'platform_user_id'), '') AS payload_user_raw,
           CASE
             WHEN nullif(btrim(t.payload_json->>'platform_user_id'), '')
                    ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN (t.payload_json->>'platform_user_id')::uuid
           END AS payload_user_id,
           CASE
             WHEN coalesce(t.payload_json->>'source', '') = 'native'
                OR coalesce(t.integrator_record_id, '') LIKE 'be:%'
             THEN nullif(btrim(t.payload_json->>'specialist_id'), '')
           END AS canonical_provider_raw,
           CASE
             WHEN (coalesce(t.payload_json->>'source', '') = 'native'
                   OR coalesce(t.integrator_record_id, '') LIKE 'be:%')
              AND nullif(btrim(t.payload_json->>'specialist_id'), '')
                    ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN (t.payload_json->>'specialist_id')::uuid
           END AS canonical_provider_id,
           CASE
             WHEN coalesce(t.payload_json->>'source', '') <> 'native'
              AND coalesce(t.integrator_record_id, '') NOT LIKE 'be:%'
             THEN nullif(btrim(coalesce(
               t.payload_json->>'cooperator_id',
               t.payload_json->>'rubitime_cooperator_id',
               t.payload_json->>'specialist_id'
             )), '')
           END AS external_provider_raw
      FROM targets t
      JOIN candidate_summary s USING (target_table, row_id)
      LEFT JOIN public.be_appointments a ON a.id = s.appointment_id
  ),
  provider_checks AS (
    SELECT r.*,
           CASE
             WHEN r.external_provider_raw IS NULL THEN 0
             ELSE count(DISTINCT sm.canonical_id)::integer
           END AS external_provider_match_count,
           min(sm.canonical_id::text)::uuid AS external_provider_id,
           coalesce(
             bool_or(sm.organization_id IS DISTINCT FROM r.matched_organization_id),
             false
           ) AS external_provider_org_mismatch
      FROM resolved r
      LEFT JOIN public.be_external_entity_mappings sm
        ON r.external_provider_raw IS NOT NULL
       AND sm.external_system = 'rubitime'
       AND sm.entity_type = 'specialist'
       AND sm.external_id = r.external_provider_raw
     GROUP BY r.target_table, r.row_id, r.row_user_id, r.integrator_record_id, r.payload_json,
              r.direct_appointment_id, r.match_count, r.proof_org_count,
              r.mapping_org_mismatch, r.matched_organization_id, r.matched_user_id,
              r.matched_specialist_id, r.matched_deleted_at, r.payload_user_raw,
              r.payload_user_id, r.canonical_provider_raw, r.canonical_provider_id,
              r.external_provider_raw
  ),
  classified AS (
    SELECT p.*,
           CASE
             WHEN p.match_count = 0 THEN 'zero_match'
             WHEN p.match_count <> 1 OR p.proof_org_count <> 1 OR p.mapping_org_mismatch
               THEN 'multiple_match'
             WHEN p.matched_deleted_at IS NOT NULL THEN 'deleted_parent'
             WHEN (
               p.row_user_id IS NOT NULL
               AND p.matched_user_id IS NOT NULL
               AND p.row_user_id <> p.matched_user_id
             ) OR (
               p.payload_user_raw IS NOT NULL AND p.payload_user_id IS NULL
             ) OR (
               p.payload_user_id IS NOT NULL
               AND p.matched_user_id IS NOT NULL
               AND p.payload_user_id <> p.matched_user_id
             ) OR (
               p.payload_user_id IS NOT NULL
               AND p.row_user_id IS NOT NULL
               AND p.payload_user_id <> p.row_user_id
             ) THEN 'user_mismatch'
             WHEN p.canonical_provider_raw IS NOT NULL AND (
               p.canonical_provider_id IS NULL
               OR p.matched_specialist_id IS NULL
               OR p.canonical_provider_id <> p.matched_specialist_id
             ) THEN 'provider_mismatch'
             WHEN p.external_provider_raw IS NOT NULL AND (
               p.external_provider_match_count <> 1
               OR p.external_provider_id IS DISTINCT FROM p.matched_specialist_id
               OR p.external_provider_org_mismatch
             ) THEN 'provider_mismatch'
             ELSE NULL
           END AS reason
      FROM provider_checks p
  ),
  stamped_patient AS (
    UPDATE public.patient_bookings pb
       SET organization_id = c.matched_organization_id
      FROM classified c
     WHERE c.target_table = 'patient_bookings'
       AND c.row_id = pb.id
       AND c.reason IS NULL
       AND pb.organization_id IS NULL
    RETURNING pb.id
  ),
  stamped_record AS (
    UPDATE public.appointment_records ar
       SET organization_id = c.matched_organization_id
      FROM classified c
     WHERE c.target_table = 'appointment_records'
       AND c.row_id = ar.id
       AND c.reason IS NULL
       AND ar.organization_id IS NULL
    RETURNING ar.id
  )
  SELECT count(*) FILTER (WHERE reason = 'zero_match')::integer,
         count(*) FILTER (WHERE reason = 'multiple_match')::integer,
         count(*) FILTER (WHERE reason = 'deleted_parent')::integer,
         count(*) FILTER (WHERE reason = 'user_mismatch')::integer,
         count(*) FILTER (WHERE reason = 'provider_mismatch')::integer,
         (SELECT count(*)::integer FROM stamped_patient),
         (SELECT count(*)::integer FROM stamped_record)
    INTO v_zero_match,
         v_multiple_match,
         v_deleted_parent,
         v_user_mismatch,
         v_provider_mismatch,
         v_stamped_patient,
         v_stamped_record
    FROM classified;

  IF v_zero_match <> 0
     OR v_multiple_match <> 0
     OR v_deleted_parent <> 0
     OR v_user_mismatch <> 0
     OR v_provider_mismatch <> 0
  THEN
    RAISE EXCEPTION
      'v9b_s03_booking_ownership_unresolved zero_match=% multiple_match=% deleted_parent=% user_mismatch=% provider_mismatch=%',
      v_zero_match,
      v_multiple_match,
      v_deleted_parent,
      v_user_mismatch,
      v_provider_mismatch;
  END IF;
END
$migration$;
--> statement-breakpoint

ALTER TABLE public.patient_bookings
  ALTER COLUMN organization_id SET NOT NULL;
--> statement-breakpoint

ALTER TABLE public.appointment_records
  ALTER COLUMN organization_id SET NOT NULL;
--> statement-breakpoint

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'patient_bookings_organization_id_fkey'
       AND conrelid = 'public.patient_bookings'::regclass
  ) THEN
    ALTER TABLE public.patient_bookings
      ADD CONSTRAINT patient_bookings_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'appointment_records_organization_id_fkey'
       AND conrelid = 'public.appointment_records'::regclass
  ) THEN
    ALTER TABLE public.appointment_records
      ADD CONSTRAINT appointment_records_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;
END
$migration$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_patient_bookings_organization_id
  ON public.patient_bookings USING btree (organization_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_appointment_records_organization_id
  ON public.appointment_records USING btree (organization_id);
