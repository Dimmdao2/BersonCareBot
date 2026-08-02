-- TEMPORARY LOCAL MIGRATION NUMBER 0309
-- #1081 V9b S03: every booking projection receives an organization only from an immutable
-- canonical key already stored on that row. The Drizzle migrator wraps the complete file in one
-- transaction, so an ambiguous or contradictory proof rolls back the nullable columns and any
-- proven stamps. Rows with no immutable proof intentionally remain NULL: historical ownership is
-- never guessed from membership, phone, snapshots, timeslots, or deletion state.

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
              r.matched_specialist_id, r.payload_user_raw,
              r.payload_user_id, r.canonical_provider_raw, r.canonical_provider_id,
              r.external_provider_raw
  ),
  classified AS (
    SELECT p.*,
           CASE
             WHEN p.match_count = 0 THEN 'zero_match'
             WHEN p.match_count <> 1 OR p.proof_org_count <> 1 OR p.mapping_org_mismatch
               THEN 'multiple_match'
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
         count(*) FILTER (WHERE reason = 'user_mismatch')::integer,
         count(*) FILTER (WHERE reason = 'provider_mismatch')::integer,
         (SELECT count(*)::integer FROM stamped_patient),
         (SELECT count(*)::integer FROM stamped_record)
    INTO v_zero_match,
         v_multiple_match,
         v_user_mismatch,
         v_provider_mismatch,
         v_stamped_patient,
         v_stamped_record
    FROM classified;

  -- A zero-match row has no immutable tenant proof and must remain NULL. It is not a
  -- contradiction, so this expand migration preserves it for patient self-read instead of
  -- fabricating ownership or rolling back the retained proven stamps.
  IF v_multiple_match <> 0
     OR v_user_mismatch <> 0
     OR v_provider_mismatch <> 0
  THEN
    RAISE EXCEPTION
      'v9b_s03_booking_ownership_unresolved multiple_match=% user_mismatch=% provider_mismatch=%',
      v_multiple_match,
      v_user_mismatch,
      v_provider_mismatch;
  END IF;
END
$migration$;
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
--> statement-breakpoint

-- Reuse the existing patient capability; there is deliberately no second legacy reader. A NULL
-- organization means only that historical tenant ownership was never provable, not that another
-- patient may read it. Canonical rows keep their existing signed organization + active-parent
-- checks, while a signed enrolled patient may read only their own NULL-org legacy row. The left
-- joins below cannot construct canonical navigation for that row, so canonical_in_person_context
-- remains NULL.
CREATE OR REPLACE FUNCTION app.read_current_patient_booking_rows(
  p_kind text,
  p_now timestamptz
)
RETURNS TABLE (booking jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  IF v_org IS NULL OR v_patient IS NULL OR p_kind NOT IN ('upcoming', 'history') THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN RETURN; END IF;

  RETURN QUERY
  WITH scoped AS MATERIALIZED (
    SELECT row.*
    FROM public.patient_bookings row
    WHERE row.platform_user_id = v_patient
      AND (
        row.organization_id IS NULL
        OR (
          row.organization_id = v_org
          AND EXISTS (
            SELECT 1 FROM public.be_appointments appointment
            WHERE appointment.id = row.canonical_appointment_id
              AND appointment.organization_id = v_org
              AND appointment.platform_user_id = v_patient
              AND appointment.deleted_at IS NULL
          )
        )
      )
  ), selected AS (
    SELECT row.*
    FROM scoped row
    WHERE (
      p_kind = 'upcoming'
      AND row.cancelled_at IS NULL
      AND row.status IN ('creating','awaiting_payment','confirmed','rescheduled','cancelling','cancel_failed')
      AND row.slot_start >= p_now
      AND NOT (row.status = 'creating' AND row.canonical_appointment_id IS NULL)
      AND NOT (
        row.status = 'creating' AND EXISTS (
          SELECT 1 FROM scoped newer
          WHERE newer.id <> row.id
            AND newer.status IN ('awaiting_payment','confirmed','rescheduled','cancelling','cancel_failed')
            AND newer.slot_start = row.slot_start AND newer.slot_end = row.slot_end
            AND COALESCE(newer.branch_service_id::text, '') = COALESCE(row.branch_service_id::text, '')
            AND COALESCE(newer.booking_type, '') = COALESCE(row.booking_type, '')
            AND COALESCE(newer.category, '') = COALESCE(row.category, '')
        )
      )
    ) OR (
      p_kind = 'history'
      AND (row.slot_start < p_now OR row.status IN ('cancelled','completed','no_show','failed_sync'))
    )
    ORDER BY
      CASE WHEN p_kind = 'upcoming' THEN row.slot_start END ASC,
      CASE WHEN p_kind = 'history' THEN row.slot_start END DESC,
      row.created_at DESC
    LIMIT 100
  ), enriched AS (
    SELECT
      row.*,
      CASE
        WHEN row.booking_type = 'in_person'
          AND appointment.id IS NOT NULL
          AND branch.id IS NOT NULL
          AND service.id IS NOT NULL
          AND branch.is_active = TRUE
          AND service.is_active = TRUE
          AND service.public_widget_visible = TRUE
          AND service.admin_manual_only = FALSE
          AND EXISTS (
            SELECT 1
            FROM public.be_specialist_service_availability availability
            JOIN public.be_specialists specialist
              ON specialist.id = availability.specialist_id
             AND specialist.organization_id = availability.organization_id
             AND specialist.is_active = TRUE
            WHERE availability.organization_id = appointment.organization_id
              AND availability.specialist_id = appointment.specialist_id
              AND availability.branch_id = appointment.branch_id
              AND availability.service_id = appointment.service_id
              AND availability.is_active = TRUE
          )
        THEN jsonb_build_object(
          'branchId', appointment.branch_id,
          'serviceId', appointment.service_id,
          'cityCode', branch.city_code,
          'branchTitle', branch.title,
          'serviceTitle', service.title,
          'durationMinutes', appointment.duration_minutes,
          'priceMinor', service.price_minor
        )
        ELSE NULL
      END AS canonical_in_person_context
    FROM selected row
    LEFT JOIN public.be_appointments appointment
      ON appointment.id = row.canonical_appointment_id
     AND appointment.organization_id = v_org
    LEFT JOIN public.be_branches branch
      ON branch.id = appointment.branch_id
     AND branch.organization_id = appointment.organization_id
    LEFT JOIN public.be_clinic_services service
      ON service.id = appointment.service_id
     AND service.organization_id = appointment.organization_id
  )
  SELECT jsonb_build_object(
    'id', row.id, 'organization_id', row.organization_id, 'platform_user_id', row.platform_user_id,
    'booking_type', row.booking_type, 'city', row.city, 'category', row.category,
    'slot_start', row.slot_start, 'slot_end', row.slot_end, 'status', row.status,
    'cancelled_at', row.cancelled_at, 'cancel_reason', row.cancel_reason, 'gcal_event_id', row.gcal_event_id,
    'contact_phone', row.contact_phone,
    'contact_email', row.contact_email, 'contact_name', row.contact_name,
    'reminder_24h_sent', row.reminder_24h_sent, 'reminder_2h_sent', row.reminder_2h_sent,
    'created_at', row.created_at, 'updated_at', row.updated_at, 'branch_id', row.branch_id,
    'service_id', row.service_id, 'branch_service_id', row.branch_service_id,
    'city_code_snapshot', row.city_code_snapshot, 'branch_title_snapshot', row.branch_title_snapshot,
    'service_title_snapshot', row.service_title_snapshot,
    'duration_minutes_snapshot', row.duration_minutes_snapshot,
    'price_minor_snapshot', row.price_minor_snapshot,
    'provenance_created_by', row.provenance_created_by,
    'provenance_updated_by', row.provenance_updated_by,
    'canonical_appointment_id', row.canonical_appointment_id,
    'canonical_in_person_context', row.canonical_in_person_context
  )
  FROM enriched row;
END
$function$;

-- S04/S05 remain intentionally absent: after caller adoption/direct-grant revoke, staff policy
-- must match a non-NULL organization, patient policy is self-read, and INSERT/UPDATE/DELETE
-- require non-NULL organization. Historical NULL rows are never assigned by guess.
