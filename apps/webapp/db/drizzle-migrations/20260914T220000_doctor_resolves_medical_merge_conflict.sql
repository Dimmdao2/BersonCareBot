-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.uq_patient_merge_candidates_org_pending_unordered_pair') IS NOT NULL AND pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'patient_merge_candidates_status_check')) LIKE '%escalated%'
ALTER TABLE public.patient_merge_candidates
  DROP CONSTRAINT patient_merge_candidates_status_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.patient_merge_candidates
  ADD CONSTRAINT patient_merge_candidates_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text, 'escalated'::text]));
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY organization_id,
             LEAST(anchor_user_id::text, candidate_user_id::text),
             GREATEST(anchor_user_id::text, candidate_user_id::text)
           ORDER BY created_at, id
         ) AS position
    FROM public.patient_merge_candidates
   WHERE status = 'pending'
     AND reason LIKE 'medical_history:%'
)
UPDATE public.patient_merge_candidates candidate
   SET status = 'dismissed', resolved_at = pg_catalog.now()
  FROM ranked
 WHERE ranked.id = candidate.id
   AND ranked.position > 1;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX uq_patient_merge_candidates_org_pending_unordered_pair
  ON public.patient_merge_candidates (
    organization_id,
    LEAST(anchor_user_id::text, candidate_user_id::text),
    GREATEST(anchor_user_id::text, candidate_user_id::text)
  )
  WHERE status = 'pending' AND reason LIKE 'medical_history:%';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 5 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname IN ('record_patient_medical_merge_conflict','transfer_staff_approved_platform_user_merge_data','read_staff_patient_medical_merge_conflict','refuse_staff_patient_medical_merge_conflict','resolve_platform_patient_medical_merge_conflicts')
CREATE OR REPLACE FUNCTION app.record_patient_medical_merge_conflict(
  p_organization_id uuid,
  p_anchor_user_id uuid,
  p_candidate_user_id uuid,
  p_source text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_conflict_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner'::name,
    CASE WHEN pg_catalog.current_setting('role', true) = 'app_pre_session'
      THEN 'app_pre_session'::name ELSE 'app_patient'::name END,
    CASE WHEN pg_catalog.current_setting('role', true) = 'app_pre_session'
      THEN 'pre_session'::app.port_context_class ELSE 'patient'::app.port_context_class END,
    'identity.medical-merge-conflict.record',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_anchor_user_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_candidate_user_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_source))::app.port_typed_arg
    ]),
    'app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text)'::regprocedure
  );

  IF pg_catalog.current_setting('role', true) = 'app_patient' AND
     (app.current_org_id() IS NULL OR p_organization_id IS DISTINCT FROM app.current_org_id()) THEN
    RAISE EXCEPTION 'patient_medical_merge_conflict_principal_mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_anchor_user_id = p_candidate_user_id THEN
    RAISE EXCEPTION 'patient_medical_merge_conflict_requires_two_users' USING ERRCODE = '22023';
  END IF;
  IF p_source NOT IN ('projection', 'phone_bind', 'email_bind') THEN
    RAISE EXCEPTION 'patient_medical_merge_conflict_source_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_organization_id IS NULL THEN
    INSERT INTO public.admin_audit_log (
      organization_id, actor_id, action, target_id, conflict_key, details, status
    ) VALUES (
      NULL,
      NULL,
      'auto_merge_conflict_anomaly',
      p_anchor_user_id::text,
      'medical-merge-without-organization:' ||
        LEAST(p_anchor_user_id::text, p_candidate_user_id::text) || ':' ||
        GREATEST(p_anchor_user_id::text, p_candidate_user_id::text),
      pg_catalog.jsonb_build_object(
        'candidateIds', pg_catalog.jsonb_build_array(p_anchor_user_id::text, p_candidate_user_id::text),
        'organizationId', NULL,
        'source', p_source,
        'reason', 'medical_history_without_organization'
      ),
      'error'
    )
    ON CONFLICT (conflict_key) WHERE conflict_key IS NOT NULL AND resolved_at IS NULL
    DO UPDATE SET
      details = EXCLUDED.details,
      repeat_count = public.admin_audit_log.repeat_count + 1,
      last_seen_at = pg_catalog.now()
    RETURNING id INTO v_conflict_id;
    RETURN v_conflict_id;
  END IF;

  SELECT candidate.id
    INTO v_conflict_id
    FROM public.patient_merge_candidates candidate
   WHERE candidate.organization_id = p_organization_id
     AND candidate.status = 'pending'
     AND candidate.reason LIKE 'medical_history:%'
     AND LEAST(candidate.anchor_user_id::text, candidate.candidate_user_id::text) =
         LEAST(p_anchor_user_id::text, p_candidate_user_id::text)
     AND GREATEST(candidate.anchor_user_id::text, candidate.candidate_user_id::text) =
         GREATEST(p_anchor_user_id::text, p_candidate_user_id::text)
   LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    UPDATE public.patient_merge_candidates
       SET payload = payload || pg_catalog.jsonb_build_object('source', p_source)
     WHERE id = v_conflict_id;
    RETURN v_conflict_id;
  END IF;

  -- The legacy ordered pending-pair index is the arbiter used by booking/invite doors.  Preserve
  -- their row and use the reverse orientation for this distinct medical conflict when necessary.
  IF EXISTS (
    SELECT 1 FROM public.patient_merge_candidates candidate
     WHERE candidate.organization_id = p_organization_id
       AND candidate.anchor_user_id = p_anchor_user_id
       AND candidate.candidate_user_id = p_candidate_user_id
       AND candidate.status = 'pending'
  ) THEN
    v_conflict_id := NULL;
    INSERT INTO public.patient_merge_candidates (
      organization_id, anchor_user_id, candidate_user_id, reason, status, payload
    ) VALUES (
      p_organization_id, p_candidate_user_id, p_anchor_user_id,
      'medical_history:' || p_source, 'pending', pg_catalog.jsonb_build_object('source', p_source)
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_conflict_id;
  ELSE
    INSERT INTO public.patient_merge_candidates (
      organization_id, anchor_user_id, candidate_user_id, reason, status, payload
    ) VALUES (
      p_organization_id, p_anchor_user_id, p_candidate_user_id,
      'medical_history:' || p_source, 'pending', pg_catalog.jsonb_build_object('source', p_source)
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_conflict_id;
  END IF;

  -- Both ordered slots can already be occupied by older candidate kinds. Do not overwrite either:
  -- send the unrepresentable medical conflict to the global support queue.
  IF v_conflict_id IS NULL THEN
    INSERT INTO public.admin_audit_log (
      organization_id, actor_id, action, target_id, conflict_key, details, status
    ) VALUES (
      p_organization_id,
      NULL,
      'auto_merge_conflict_anomaly',
      p_anchor_user_id::text,
      'medical-merge-candidate-slots-full:' || p_organization_id::text || ':' ||
        LEAST(p_anchor_user_id::text, p_candidate_user_id::text) || ':' ||
        GREATEST(p_anchor_user_id::text, p_candidate_user_id::text),
      pg_catalog.jsonb_build_object(
        'candidateIds', pg_catalog.jsonb_build_array(p_anchor_user_id::text, p_candidate_user_id::text),
        'organizationId', p_organization_id::text,
        'source', p_source,
        'reason', 'patient_merge_candidate_slots_full'
      ),
      'error'
    )
    ON CONFLICT (conflict_key) WHERE conflict_key IS NOT NULL AND resolved_at IS NULL
    DO UPDATE SET
      details = EXCLUDED.details,
      repeat_count = public.admin_audit_log.repeat_count + 1,
      last_seen_at = pg_catalog.now()
    RETURNING id INTO v_conflict_id;
  END IF;

  RETURN v_conflict_id;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.resolve_platform_patient_medical_merge_conflicts(
  p_target_user_id uuid,
  p_duplicate_user_id uuid,
  p_actor_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_resolved integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner'::name,
    'app_platform_admin'::name,
    'platform'::app.port_context_class,
    'identity.medical-merge-conflict.resolve-platform',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_target_user_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_duplicate_user_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_actor_id))::app.port_typed_arg
    ]),
    'app.resolve_platform_patient_medical_merge_conflicts(uuid,uuid,uuid)'::regprocedure
  );

  UPDATE public.patient_merge_candidates
     SET status = 'resolved', resolved_at = pg_catalog.now(), resolved_by = p_actor_id
   WHERE status = 'pending'
     AND reason LIKE 'medical_history:%'
     AND LEAST(anchor_user_id::text, candidate_user_id::text) =
         LEAST(p_target_user_id::text, p_duplicate_user_id::text)
     AND GREATEST(anchor_user_id::text, candidate_user_id::text) =
         GREATEST(p_target_user_id::text, p_duplicate_user_id::text);
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN v_resolved;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.transfer_staff_approved_platform_user_merge_data(
  p_conflict_id uuid,
  p_target_user_id uuid,
  p_duplicate_user_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_password_credentials_count integer;
BEGIN
  -- This door is called inside the already-installed staff relation transaction.  EXECUTE belongs
  -- only to app_staff; the current organization plus the exact pending row are the capability.
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'staff_medical_merge_requires_organization' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.patient_merge_candidates candidate
     WHERE candidate.id = p_conflict_id
       AND candidate.organization_id = v_organization_id
       AND candidate.status = 'pending'
       AND candidate.reason LIKE 'medical_history:%'
       AND LEAST(candidate.anchor_user_id::text, candidate.candidate_user_id::text) =
           LEAST(p_target_user_id::text, p_duplicate_user_id::text)
       AND GREATEST(candidate.anchor_user_id::text, candidate.candidate_user_id::text) =
           GREATEST(p_target_user_id::text, p_duplicate_user_id::text)
     FOR UPDATE
  ) THEN
    RETURN false;
  END IF;

  -- A doctor may remove only their clinic's blocker. A second clinic must make its own decision.
  IF EXISTS (
    SELECT 1
      FROM (
        SELECT organization_id FROM public.clinical_visit WHERE patient_user_id = p_target_user_id
        UNION ALL SELECT organization_id FROM public.clinical_complaint WHERE patient_user_id = p_target_user_id
        UNION ALL SELECT organization_id FROM public.clinical_diagnosis WHERE patient_user_id = p_target_user_id
        UNION ALL SELECT organization_id FROM public.clinical_anamnesis_trauma WHERE patient_user_id = p_target_user_id
        UNION ALL SELECT organization_id FROM public.clinical_anamnesis_illness WHERE patient_user_id = p_target_user_id
        UNION ALL SELECT organization_id FROM public.clinical_anamnesis_lifestyle WHERE patient_user_id = p_target_user_id
        UNION ALL SELECT organization_id FROM public.doctor_notes WHERE user_id = p_target_user_id
        UNION ALL SELECT organization_id FROM public.treatment_program_instances
          WHERE patient_user_id = p_target_user_id AND assignment_source = 'doctor'
      ) target_history
      JOIN (
        SELECT organization_id FROM public.clinical_visit WHERE patient_user_id = p_duplicate_user_id
        UNION ALL SELECT organization_id FROM public.clinical_complaint WHERE patient_user_id = p_duplicate_user_id
        UNION ALL SELECT organization_id FROM public.clinical_diagnosis WHERE patient_user_id = p_duplicate_user_id
        UNION ALL SELECT organization_id FROM public.clinical_anamnesis_trauma WHERE patient_user_id = p_duplicate_user_id
        UNION ALL SELECT organization_id FROM public.clinical_anamnesis_illness WHERE patient_user_id = p_duplicate_user_id
        UNION ALL SELECT organization_id FROM public.clinical_anamnesis_lifestyle WHERE patient_user_id = p_duplicate_user_id
        UNION ALL SELECT organization_id FROM public.doctor_notes WHERE user_id = p_duplicate_user_id
        UNION ALL SELECT organization_id FROM public.treatment_program_instances
          WHERE patient_user_id = p_duplicate_user_id AND assignment_source = 'doctor'
      ) duplicate_history
        ON duplicate_history.organization_id IS NOT DISTINCT FROM target_history.organization_id
     WHERE target_history.organization_id IS DISTINCT FROM v_organization_id
  ) THEN
    RAISE EXCEPTION 'medical_merge_blocked_by_another_organization' USING ERRCODE = 'P0001';
  END IF;

  -- Identity/auth rows are deliberately inaccessible to app_staff. The same narrow door that
  -- validates the exact doctor-owned conflict performs their part of the merge as its seam owner.
  PERFORM 1
    FROM public.user_password_credentials
   WHERE user_id IN (p_target_user_id, p_duplicate_user_id)
   ORDER BY user_id
   FOR UPDATE;
  SELECT count(*)::integer
    INTO v_password_credentials_count
    FROM public.user_password_credentials
   WHERE user_id IN (p_target_user_id, p_duplicate_user_id);
  IF v_password_credentials_count > 1 THEN
    RAISE EXCEPTION 'merge_both_password_credentials' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.channel_link_secrets SET user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id;
  UPDATE public.email_challenges SET user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id;
  UPDATE public.user_oauth_bindings SET user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id;

  IF EXISTS (
    SELECT 1 FROM public.user_password_credentials WHERE user_id = p_target_user_id
  ) THEN
    DELETE FROM public.user_password_credentials WHERE user_id = p_duplicate_user_id;
  ELSE
    UPDATE public.user_password_credentials SET user_id = p_target_user_id
     WHERE user_id = p_duplicate_user_id;
  END IF;

  INSERT INTO public.email_send_cooldowns (user_id, email_normalized, last_sent_at)
  SELECT p_target_user_id, email_normalized, last_sent_at
    FROM public.email_send_cooldowns WHERE user_id = p_duplicate_user_id
  ON CONFLICT (user_id, email_normalized) DO UPDATE SET
    last_sent_at = GREATEST(public.email_send_cooldowns.last_sent_at, EXCLUDED.last_sent_at);
  DELETE FROM public.email_send_cooldowns WHERE user_id = p_duplicate_user_id;
  DELETE FROM public.login_tokens WHERE user_id = p_duplicate_user_id;

  UPDATE public.user_channel_preferences AS target
     SET is_enabled_for_messages = CASE
           WHEN duplicate.updated_at > target.updated_at THEN duplicate.is_enabled_for_messages
           ELSE target.is_enabled_for_messages
         END,
         is_enabled_for_notifications = CASE
           WHEN duplicate.updated_at > target.updated_at THEN duplicate.is_enabled_for_notifications
           ELSE target.is_enabled_for_notifications
         END,
         is_preferred_for_auth = CASE
           WHEN target.is_preferred_for_auth AND duplicate.is_preferred_for_auth
             THEN target.is_preferred_for_auth
           WHEN duplicate.updated_at > target.updated_at THEN duplicate.is_preferred_for_auth
           ELSE target.is_preferred_for_auth
         END,
         updated_at = GREATEST(target.updated_at, duplicate.updated_at),
         platform_user_id = p_target_user_id
    FROM public.user_channel_preferences duplicate
   WHERE (target.user_id = p_target_user_id::text OR target.platform_user_id = p_target_user_id)
     AND (duplicate.user_id = p_duplicate_user_id::text OR duplicate.platform_user_id = p_duplicate_user_id)
     AND target.channel_code = duplicate.channel_code;
  DELETE FROM public.user_channel_preferences duplicate
   WHERE (duplicate.user_id = p_duplicate_user_id::text OR duplicate.platform_user_id = p_duplicate_user_id)
     AND EXISTS (
       SELECT 1 FROM public.user_channel_preferences target
        WHERE (target.user_id = p_target_user_id::text OR target.platform_user_id = p_target_user_id)
          AND target.channel_code = duplicate.channel_code
     );
  UPDATE public.user_channel_preferences
     SET user_id = p_target_user_id::text, platform_user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id::text OR platform_user_id = p_duplicate_user_id;

  UPDATE public.reminder_rules SET platform_user_id = p_target_user_id
   WHERE platform_user_id = p_duplicate_user_id;
  UPDATE public.content_access_grants_webapp SET platform_user_id = p_target_user_id
   WHERE platform_user_id = p_duplicate_user_id;
  UPDATE public.clinical_visit SET patient_user_id = p_target_user_id
   WHERE patient_user_id = p_duplicate_user_id;
  UPDATE public.clinical_complaint SET patient_user_id = p_target_user_id
   WHERE patient_user_id = p_duplicate_user_id;
  UPDATE public.clinical_diagnosis SET patient_user_id = p_target_user_id
   WHERE patient_user_id = p_duplicate_user_id;
  UPDATE public.clinical_anamnesis_trauma SET patient_user_id = p_target_user_id
   WHERE patient_user_id = p_duplicate_user_id;
  UPDATE public.clinical_anamnesis_illness SET patient_user_id = p_target_user_id
   WHERE patient_user_id = p_duplicate_user_id;
  UPDATE public.clinical_anamnesis_lifestyle SET patient_user_id = p_target_user_id
   WHERE patient_user_id = p_duplicate_user_id;
  UPDATE public.doctor_notes SET user_id = p_target_user_id WHERE user_id = p_duplicate_user_id;
  UPDATE public.patient_bookings SET platform_user_id = p_target_user_id
   WHERE platform_user_id = p_duplicate_user_id;
  UPDATE public.be_appointments SET platform_user_id = p_target_user_id
   WHERE platform_user_id = p_duplicate_user_id;
  UPDATE public.treatment_program_instances SET patient_user_id = p_target_user_id
   WHERE patient_user_id = p_duplicate_user_id;
  UPDATE public.support_conversations SET platform_user_id = p_target_user_id
   WHERE platform_user_id = p_duplicate_user_id;

  DELETE FROM public.program_item_discussion_reads duplicate
   WHERE duplicate.patient_user_id = p_duplicate_user_id
     AND EXISTS (
       SELECT 1 FROM public.program_item_discussion_reads target
        WHERE target.patient_user_id = p_target_user_id
          AND target.instance_stage_item_id = duplicate.instance_stage_item_id
     );
  UPDATE public.program_item_discussion_reads SET patient_user_id = p_target_user_id
   WHERE patient_user_id = p_duplicate_user_id;
  UPDATE public.program_item_discussion_messages SET patient_user_id = p_target_user_id
   WHERE patient_user_id = p_duplicate_user_id;
  UPDATE public.patient_specialist_links duplicate
     SET status = 'ended', ended_at = pg_catalog.now(), ended_reason = 'transferred_out'
   WHERE duplicate.patient_user_id = p_duplicate_user_id
     AND duplicate.status = 'active'
     AND EXISTS (
       SELECT 1 FROM public.patient_specialist_links target
        WHERE target.patient_user_id = p_target_user_id
          AND target.specialist_id = duplicate.specialist_id
          AND target.status = 'active'
     );
  UPDATE public.patient_specialist_links SET patient_user_id = p_target_user_id
   WHERE patient_user_id = p_duplicate_user_id;
  UPDATE public.user_phone_history SET platform_user_id = p_target_user_id
   WHERE platform_user_id = p_duplicate_user_id;
  UPDATE public.online_intake_requests SET user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id;
  UPDATE public.patient_lfk_assignments SET patient_user_id = p_target_user_id
   WHERE patient_user_id = p_duplicate_user_id;

  WITH target_tracking AS (
    SELECT id FROM public.symptom_trackings
     WHERE symptom_key IN ('general_wellbeing', 'warmup_feeling')
       AND deleted_at IS NULL
       AND (platform_user_id = p_target_user_id OR user_id = p_target_user_id::text)
  ), duplicate_tracking AS (
    SELECT duplicate.id, target.id AS target_id
      FROM public.symptom_trackings duplicate
      JOIN target_tracking target ON true
      JOIN public.symptom_trackings target_row ON target_row.id = target.id
     WHERE duplicate.symptom_key = target_row.symptom_key
       AND duplicate.deleted_at IS NULL
       AND (duplicate.platform_user_id = p_duplicate_user_id OR duplicate.user_id = p_duplicate_user_id::text)
  )
  UPDATE public.symptom_entries entry SET tracking_id = duplicate_tracking.target_id
    FROM duplicate_tracking WHERE entry.tracking_id = duplicate_tracking.id;
  UPDATE public.symptom_trackings duplicate
     SET is_active = false, deleted_at = pg_catalog.now(), updated_at = pg_catalog.now()
   WHERE duplicate.deleted_at IS NULL
     AND duplicate.symptom_key IN ('general_wellbeing', 'warmup_feeling')
     AND (duplicate.platform_user_id = p_duplicate_user_id OR duplicate.user_id = p_duplicate_user_id::text)
     AND EXISTS (
       SELECT 1 FROM public.symptom_trackings target
        WHERE target.symptom_key = duplicate.symptom_key
          AND target.deleted_at IS NULL
          AND (target.platform_user_id = p_target_user_id OR target.user_id = p_target_user_id::text)
     );
  UPDATE public.symptom_trackings SET user_id = p_target_user_id::text, platform_user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id::text OR platform_user_id = p_duplicate_user_id;
  UPDATE public.symptom_entries SET user_id = p_target_user_id::text, platform_user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id::text OR platform_user_id = p_duplicate_user_id;
  UPDATE public.lfk_complexes SET user_id = p_target_user_id::text, platform_user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id::text OR platform_user_id = p_duplicate_user_id;
  UPDATE public.lfk_sessions SET user_id = p_target_user_id WHERE user_id = p_duplicate_user_id;
  UPDATE public.message_log SET user_id = p_target_user_id::text, platform_user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id::text OR platform_user_id = p_duplicate_user_id;
  UPDATE public.media_files SET uploaded_by = p_target_user_id WHERE uploaded_by = p_duplicate_user_id;
  UPDATE public.media_upload_sessions SET owner_user_id = p_target_user_id
   WHERE owner_user_id = p_duplicate_user_id;

  INSERT INTO public.material_ratings (user_id, target_kind, target_id, stars, updated_at)
  SELECT p_target_user_id, target_kind, target_id, stars, updated_at
    FROM public.material_ratings WHERE user_id = p_duplicate_user_id
  ON CONFLICT ON CONSTRAINT material_ratings_user_target_unique DO UPDATE SET
    stars = CASE WHEN EXCLUDED.updated_at >= public.material_ratings.updated_at
      THEN EXCLUDED.stars ELSE public.material_ratings.stars END,
    updated_at = GREATEST(public.material_ratings.updated_at, EXCLUDED.updated_at);
  DELETE FROM public.material_ratings WHERE user_id = p_duplicate_user_id;

  INSERT INTO public.patient_daily_warmup_presentations (
    user_id, content_page_id, updated_at, last_rotation_at, skip_next_scheduled_rotation
  )
  SELECT p_target_user_id, content_page_id, updated_at, last_rotation_at, skip_next_scheduled_rotation
    FROM public.patient_daily_warmup_presentations WHERE user_id = p_duplicate_user_id
  ON CONFLICT (user_id) DO UPDATE SET
    content_page_id = CASE WHEN GREATEST(
      COALESCE(EXCLUDED.last_rotation_at, EXCLUDED.updated_at),
      COALESCE(public.patient_daily_warmup_presentations.last_rotation_at,
               public.patient_daily_warmup_presentations.updated_at)
    ) = COALESCE(EXCLUDED.last_rotation_at, EXCLUDED.updated_at)
      THEN EXCLUDED.content_page_id ELSE public.patient_daily_warmup_presentations.content_page_id END,
    last_rotation_at = GREATEST(
      COALESCE(EXCLUDED.last_rotation_at, EXCLUDED.updated_at),
      COALESCE(public.patient_daily_warmup_presentations.last_rotation_at,
               public.patient_daily_warmup_presentations.updated_at)
    ),
    skip_next_scheduled_rotation = CASE WHEN GREATEST(
      COALESCE(EXCLUDED.last_rotation_at, EXCLUDED.updated_at),
      COALESCE(public.patient_daily_warmup_presentations.last_rotation_at,
               public.patient_daily_warmup_presentations.updated_at)
    ) = COALESCE(EXCLUDED.last_rotation_at, EXCLUDED.updated_at)
      THEN EXCLUDED.skip_next_scheduled_rotation
      ELSE public.patient_daily_warmup_presentations.skip_next_scheduled_rotation END,
    updated_at = GREATEST(public.patient_daily_warmup_presentations.updated_at, EXCLUDED.updated_at);
  DELETE FROM public.patient_daily_warmup_presentations WHERE user_id = p_duplicate_user_id;

  INSERT INTO public.be_patient_booking_profiles (
    organization_id, platform_user_id, is_problematic, booking_blocked, problematic_note, updated_at, updated_by
  )
  SELECT organization_id, p_target_user_id, is_problematic, booking_blocked, problematic_note, updated_at, updated_by
    FROM public.be_patient_booking_profiles WHERE platform_user_id = p_duplicate_user_id
  ON CONFLICT (organization_id, platform_user_id) DO UPDATE SET
    is_problematic = CASE WHEN EXCLUDED.updated_at >= public.be_patient_booking_profiles.updated_at
      THEN EXCLUDED.is_problematic ELSE public.be_patient_booking_profiles.is_problematic END,
    booking_blocked = CASE WHEN EXCLUDED.updated_at >= public.be_patient_booking_profiles.updated_at
      THEN EXCLUDED.booking_blocked ELSE public.be_patient_booking_profiles.booking_blocked END,
    problematic_note = COALESCE(public.be_patient_booking_profiles.problematic_note, EXCLUDED.problematic_note),
    updated_at = GREATEST(public.be_patient_booking_profiles.updated_at, EXCLUDED.updated_at),
    updated_by = COALESCE(public.be_patient_booking_profiles.updated_by, EXCLUDED.updated_by);
  DELETE FROM public.be_patient_booking_profiles WHERE platform_user_id = p_duplicate_user_id;

  INSERT INTO public.product_analytics_user_hourly (
    organization_id, bucket_hour, user_id, entry_channel, page_key,
    app_opens, page_views, push_opens, active_minutes, last_seen_at, updated_at
  )
  SELECT organization_id, bucket_hour, p_target_user_id, entry_channel, page_key,
         app_opens, page_views, push_opens, active_minutes, last_seen_at, updated_at
    FROM public.product_analytics_user_hourly
   WHERE user_id = p_duplicate_user_id AND organization_id IS NULL
  ON CONFLICT (bucket_hour, user_id, entry_channel, page_key) WHERE organization_id IS NULL
  DO UPDATE SET
    app_opens = public.product_analytics_user_hourly.app_opens + EXCLUDED.app_opens,
    page_views = public.product_analytics_user_hourly.page_views + EXCLUDED.page_views,
    push_opens = public.product_analytics_user_hourly.push_opens + EXCLUDED.push_opens,
    active_minutes = public.product_analytics_user_hourly.active_minutes + EXCLUDED.active_minutes,
    last_seen_at = GREATEST(public.product_analytics_user_hourly.last_seen_at, EXCLUDED.last_seen_at),
    updated_at = GREATEST(public.product_analytics_user_hourly.updated_at, EXCLUDED.updated_at);
  INSERT INTO public.product_analytics_user_hourly (
    organization_id, bucket_hour, user_id, entry_channel, page_key,
    app_opens, page_views, push_opens, active_minutes, last_seen_at, updated_at
  )
  SELECT organization_id, bucket_hour, p_target_user_id, entry_channel, page_key,
         app_opens, page_views, push_opens, active_minutes, last_seen_at, updated_at
    FROM public.product_analytics_user_hourly
   WHERE user_id = p_duplicate_user_id AND organization_id IS NOT NULL
  ON CONFLICT (organization_id, bucket_hour, user_id, entry_channel, page_key)
    WHERE organization_id IS NOT NULL
  DO UPDATE SET
    app_opens = public.product_analytics_user_hourly.app_opens + EXCLUDED.app_opens,
    page_views = public.product_analytics_user_hourly.page_views + EXCLUDED.page_views,
    push_opens = public.product_analytics_user_hourly.push_opens + EXCLUDED.push_opens,
    active_minutes = public.product_analytics_user_hourly.active_minutes + EXCLUDED.active_minutes,
    last_seen_at = GREATEST(public.product_analytics_user_hourly.last_seen_at, EXCLUDED.last_seen_at),
    updated_at = GREATEST(public.product_analytics_user_hourly.updated_at, EXCLUDED.updated_at);
  DELETE FROM public.product_analytics_user_hourly WHERE user_id = p_duplicate_user_id;

  DELETE FROM public.patient_diary_day_snapshots duplicate
   WHERE duplicate.platform_user_id = p_duplicate_user_id
     AND EXISTS (SELECT 1 FROM public.patient_diary_day_snapshots target
       WHERE target.platform_user_id = p_target_user_id AND target.local_date = duplicate.local_date);
  UPDATE public.patient_diary_day_snapshots SET platform_user_id = p_target_user_id
   WHERE platform_user_id = p_duplicate_user_id;
  DELETE FROM public.user_web_push_subscriptions duplicate
   WHERE duplicate.user_id = p_duplicate_user_id
     AND EXISTS (SELECT 1 FROM public.user_web_push_subscriptions target
       WHERE target.user_id = p_target_user_id AND target.endpoint = duplicate.endpoint);
  UPDATE public.user_web_push_subscriptions SET user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id;
  DELETE FROM public.native_push_targets duplicate
   WHERE duplicate.user_id = p_duplicate_user_id
     AND EXISTS (SELECT 1 FROM public.native_push_targets target
       WHERE target.user_id = p_target_user_id AND target.app_id = duplicate.app_id
         AND target.provider = duplicate.provider
         AND target.installation_id_hash = duplicate.installation_id_hash);
  UPDATE public.native_push_targets SET user_id = p_target_user_id WHERE user_id = p_duplicate_user_id;
  DELETE FROM public.broadcast_audit_recipients
   WHERE platform_user_id = p_duplicate_user_id
     AND audit_id IN (SELECT audit_id FROM public.broadcast_audit_recipients
       WHERE platform_user_id = p_target_user_id);
  UPDATE public.broadcast_audit_recipients SET platform_user_id = p_target_user_id
   WHERE platform_user_id = p_duplicate_user_id;

  UPDATE public.patient_content_rating_feedback SET user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id;
  UPDATE public.patient_practice_completions SET user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id;
  UPDATE public.patient_daily_warmup_video_views SET user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id;
  UPDATE public.program_action_log SET patient_user_id = p_target_user_id
   WHERE patient_user_id = p_duplicate_user_id;
  UPDATE public.test_attempts SET patient_user_id = p_target_user_id
   WHERE patient_user_id = p_duplicate_user_id;
  UPDATE public.be_patient_timeline_events SET platform_user_id = p_target_user_id
   WHERE platform_user_id = p_duplicate_user_id;
  UPDATE public.be_appointment_staff_comments SET platform_user_id = p_target_user_id
   WHERE platform_user_id = p_duplicate_user_id;
  UPDATE public.be_payment_intents SET platform_user_id = p_target_user_id
   WHERE platform_user_id = p_duplicate_user_id;
  UPDATE public.be_payments SET platform_user_id = p_target_user_id
   WHERE platform_user_id = p_duplicate_user_id;
  UPDATE public.be_payment_history_events SET platform_user_id = p_target_user_id
   WHERE platform_user_id = p_duplicate_user_id;
  UPDATE public.be_patient_packages SET platform_user_id = p_target_user_id
   WHERE platform_user_id = p_duplicate_user_id;
  UPDATE public.product_push_notifications SET user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id;
  UPDATE public.product_analytics_events_recent SET user_id = p_target_user_id
   WHERE user_id = p_duplicate_user_id;

  UPDATE public.patient_merge_candidates
     SET status = 'resolved', resolved_at = pg_catalog.now(), resolved_by = p_actor_id
   WHERE id = p_conflict_id
     AND organization_id = v_organization_id
     AND status = 'pending'
     AND reason LIKE 'medical_history:%';
  RETURN FOUND;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.read_staff_patient_medical_merge_conflict(p_conflict_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_snapshot jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner'::name,
    'app_staff'::name,
    'staff'::app.port_context_class,
    'identity.medical-merge-conflict.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_conflict_id))::app.port_typed_arg
    ]),
    'app.read_staff_patient_medical_merge_conflict(uuid)'::regprocedure
  );

  SELECT CASE WHEN candidate.id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
    'id', candidate.id::text,
    'organizationId', candidate.organization_id::text,
    'createdAt', candidate.created_at::text,
    'source', pg_catalog.substr(candidate.reason, pg_catalog.length('medical_history:') + 1),
    'parties', (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'userId', party.user_id::text,
          'displayName', COALESCE(identity.display_name, users.display_name, ''),
          'firstName', COALESCE(identity.first_name, users.first_name),
          'lastName', COALESCE(identity.last_name, users.last_name),
          'patronymic', COALESCE(identity.patronymic, users.patronymic),
          'lastActivityAt', (
            SELECT pg_catalog.max(login.occurred_at)::text
              FROM public.user_login_events login
             WHERE login.user_id = party.user_id
          ),
          'assignments', COALESCE((
            SELECT pg_catalog.jsonb_agg(assignment.value ORDER BY assignment.assigned_at DESC)
              FROM (
                SELECT program.created_at AS assigned_at,
                       pg_catalog.jsonb_build_object(
                         'id', program.id::text,
                         'kind', 'treatment_program',
                         'title', program.title,
                         'assignedAt', program.created_at::text,
                         'status', program.status
                       ) AS value
                  FROM public.treatment_program_instances program
                 WHERE program.organization_id = candidate.organization_id
                   AND program.patient_user_id = party.user_id
                   AND program.assignment_source = 'doctor'
                UNION ALL
                SELECT lfk.assigned_at,
                       pg_catalog.jsonb_build_object(
                         'id', lfk.id::text,
                         'kind', 'lfk_assignment',
                         'title', template.title,
                         'assignedAt', lfk.assigned_at::text,
                         'status', CASE WHEN lfk.is_active THEN 'active' ELSE 'inactive' END
                       )
                  FROM public.patient_lfk_assignments lfk
                  JOIN public.lfk_complex_templates template
                    ON template.id = lfk.template_id
                   AND (template.organization_id = candidate.organization_id OR template.owner_kind = 'platform')
                 WHERE lfk.organization_id = candidate.organization_id
                   AND lfk.patient_user_id = party.user_id
              ) assignment
          ), '[]'::jsonb)
        ) ORDER BY party.position
      )
        FROM pg_catalog.unnest(ARRAY[candidate.anchor_user_id, candidate.candidate_user_id])
             WITH ORDINALITY AS party(user_id, position)
        JOIN public.platform_users users ON users.id = party.user_id
        LEFT JOIN public.user_identity identity ON identity.platform_user_id = party.user_id
    )
  ) END INTO v_snapshot
    FROM (
      SELECT c.*
        FROM public.patient_merge_candidates c
       WHERE c.id = p_conflict_id
         AND c.organization_id = app.current_org_id()
         AND c.status = 'pending'
         AND c.reason LIKE 'medical_history:%'
       LIMIT 1
    ) candidate
   RIGHT JOIN (SELECT 1) singleton ON true;

  RETURN v_snapshot;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.refuse_staff_patient_medical_merge_conflict(
  p_conflict_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_conflict_id uuid;
  v_organization_id uuid;
  v_anchor_user_id uuid;
  v_candidate_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner'::name,
    'app_staff'::name,
    'staff'::app.port_context_class,
    'identity.medical-merge-conflict.refuse',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_conflict_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_actor_id))::app.port_typed_arg
    ]),
    'app.refuse_staff_patient_medical_merge_conflict(uuid,uuid)'::regprocedure
  );

  UPDATE public.patient_merge_candidates
     SET status = 'escalated', resolved_at = pg_catalog.now(), resolved_by = p_actor_id
   WHERE id = p_conflict_id
     AND organization_id = app.current_org_id()
     AND status = 'pending'
     AND reason LIKE 'medical_history:%'
  RETURNING id, organization_id, anchor_user_id, candidate_user_id
    INTO v_conflict_id, v_organization_id, v_anchor_user_id, v_candidate_user_id;

  IF v_conflict_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, target_id, conflict_key, details, status
  ) VALUES (
    v_organization_id,
    p_actor_id,
    'auto_merge_conflict',
    v_anchor_user_id::text,
    'doctor-refused-medical-merge:' || v_organization_id::text || ':' ||
      LEAST(v_anchor_user_id::text, v_candidate_user_id::text) || ':' ||
      GREATEST(v_anchor_user_id::text, v_candidate_user_id::text),
    pg_catalog.jsonb_build_object(
      'candidateIds', pg_catalog.jsonb_build_array(
        v_anchor_user_id::text, v_candidate_user_id::text
      ),
      'conflictId', v_conflict_id::text,
      'organizationId', v_organization_id::text,
      'reason', 'doctor_refused_medical_merge'
    ),
    'error'
  )
  ON CONFLICT (conflict_key) WHERE conflict_key IS NOT NULL AND resolved_at IS NULL
  DO UPDATE SET
    details = EXCLUDED.details,
    repeat_count = public.admin_audit_log.repeat_count + 1,
    last_seen_at = pg_catalog.now();

  RETURN true;
END
$function$;
