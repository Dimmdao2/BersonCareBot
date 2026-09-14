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
  WHERE status = 'pending';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 3 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname IN ('record_patient_medical_merge_conflict','read_staff_patient_medical_merge_conflict','refuse_staff_patient_medical_merge_conflict')
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
    'app_patient'::name,
    'patient'::app.port_context_class,
    'identity.medical-merge-conflict.record',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_anchor_user_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_candidate_user_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_source))::app.port_typed_arg
    ]),
    'app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text)'::regprocedure
  );

  IF app.current_org_id() IS NULL OR p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'patient_medical_merge_conflict_principal_mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_anchor_user_id = p_candidate_user_id THEN
    RAISE EXCEPTION 'patient_medical_merge_conflict_requires_two_users' USING ERRCODE = '22023';
  END IF;
  IF p_source NOT IN ('projection', 'phone_bind', 'email_bind') THEN
    RAISE EXCEPTION 'patient_medical_merge_conflict_source_invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.patient_merge_candidates (
    organization_id, anchor_user_id, candidate_user_id, reason, status, payload
  ) VALUES (
    p_organization_id, p_anchor_user_id, p_candidate_user_id,
    'medical_history:' || p_source, 'pending', pg_catalog.jsonb_build_object('source', p_source)
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_conflict_id;

  IF v_conflict_id IS NULL THEN
    UPDATE public.patient_merge_candidates
       SET reason = 'medical_history:' || p_source,
           payload = payload || pg_catalog.jsonb_build_object('source', p_source)
     WHERE organization_id = p_organization_id
       AND status = 'pending'
       AND LEAST(anchor_user_id::text, candidate_user_id::text) =
           LEAST(p_anchor_user_id::text, p_candidate_user_id::text)
       AND GREATEST(anchor_user_id::text, candidate_user_id::text) =
           GREATEST(p_anchor_user_id::text, p_candidate_user_id::text)
    RETURNING id INTO v_conflict_id;
  END IF;

  RETURN v_conflict_id;
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
  v_candidate public.patient_merge_candidates%ROWTYPE;
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
  RETURNING * INTO v_candidate;

  IF v_candidate.id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, target_id, conflict_key, details, status
  ) VALUES (
    v_candidate.organization_id,
    p_actor_id,
    'auto_merge_conflict',
    v_candidate.anchor_user_id::text,
    'doctor-refused-medical-merge:' || v_candidate.organization_id::text || ':' ||
      LEAST(v_candidate.anchor_user_id::text, v_candidate.candidate_user_id::text) || ':' ||
      GREATEST(v_candidate.anchor_user_id::text, v_candidate.candidate_user_id::text),
    pg_catalog.jsonb_build_object(
      'candidateIds', pg_catalog.jsonb_build_array(
        v_candidate.anchor_user_id::text, v_candidate.candidate_user_id::text
      ),
      'conflictId', v_candidate.id::text,
      'organizationId', v_candidate.organization_id::text,
      'reason', 'doctor_refused_medical_merge'
    ),
    'error'
  )
  ON CONFLICT (conflict_key) WHERE resolved_at IS NULL
  DO UPDATE SET
    details = EXCLUDED.details,
    repeat_count = public.admin_audit_log.repeat_count + 1,
    last_seen_at = pg_catalog.now();

  RETURN true;
END
$function$;
