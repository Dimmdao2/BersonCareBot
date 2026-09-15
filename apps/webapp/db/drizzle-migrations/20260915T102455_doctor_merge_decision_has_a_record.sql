-- BCB-MIGRATION-OWNER: app_object_owner
-- Э4c / §18б: решение врача хранит комментарий; отказ может остаться внутри клиники либо
-- отдельно уехать администраторам платформы. След отказа читается по любой из двух учёток.
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patient_merge_candidates' AND column_name = 'doctor_comment') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patient_merge_candidates' AND column_name = 'support_requested') AND to_regprocedure('app.transfer_staff_approved_platform_user_merge_data(uuid,uuid,uuid,uuid,text)') IS NOT NULL AND to_regprocedure('app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)') IS NOT NULL AND to_regprocedure('app.read_staff_patient_medical_merge_refusal(uuid)') IS NOT NULL
--
-- Rights analysis: the table remains app_object_owner-owned. All three functions are
-- app_seam_identity_lookup_owner SECURITY DEFINER doors. Runtime callers receive EXECUTE only
-- from deploy/postgres/privileges/declaration.ts; this migration contains no privilege changes.
-- The accept wrapper updates only the exact current-clinic pending row, then delegates the already
-- audited cross-clinic transfer to the private four-argument implementation. The refusal/read doors
-- predicate the candidate row by app.current_org_id().
ALTER TABLE public.patient_merge_candidates
  ADD COLUMN doctor_comment text,
  ADD COLUMN support_requested boolean;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.transfer_staff_approved_platform_user_merge_data(
  p_conflict_id uuid,
  p_target_user_id uuid,
  p_duplicate_user_id uuid,
  p_actor_id uuid,
  p_doctor_comment text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_outcome text;
BEGIN
  IF pg_catalog.btrim(COALESCE(p_doctor_comment, '')) = '' OR
     pg_catalog.length(pg_catalog.btrim(p_doctor_comment)) > 2000 THEN
    RAISE EXCEPTION 'doctor_medical_merge_comment_invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_merge_candidates candidate
     SET doctor_comment = pg_catalog.btrim(p_doctor_comment)
   WHERE candidate.id = p_conflict_id
     AND candidate.organization_id = app.current_org_id()
     AND candidate.status = 'pending'
     AND candidate.reason LIKE 'medical_history:%'
     AND LEAST(candidate.anchor_user_id::text, candidate.candidate_user_id::text) =
         LEAST(p_target_user_id::text, p_duplicate_user_id::text)
     AND GREATEST(candidate.anchor_user_id::text, candidate.candidate_user_id::text) =
         GREATEST(p_target_user_id::text, p_duplicate_user_id::text);
  IF NOT FOUND THEN
    RETURN 'conflict_not_found';
  END IF;

  v_outcome := app.transfer_staff_approved_platform_user_merge_data(
    p_conflict_id,
    p_target_user_id,
    p_duplicate_user_id,
    p_actor_id
  );

  -- Решение этой клиники принято, поэтому её четыре красных входа гаснут, даже если фактическое
  -- слияние ждёт решения другой клиники. Старый transfer уже записал doctorApproved в payload.
  IF v_outcome = 'awaiting_other_organization' THEN
    UPDATE public.patient_merge_candidates
       SET status = 'resolved', resolved_at = pg_catalog.now(), resolved_by = p_actor_id
     WHERE id = p_conflict_id;
  END IF;
  RETURN v_outcome;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
DROP FUNCTION IF EXISTS app.refuse_staff_patient_medical_merge_conflict(uuid, uuid);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.refuse_staff_patient_medical_merge_conflict(
  p_conflict_id uuid,
  p_actor_id uuid,
  p_doctor_comment text,
  p_support_requested boolean
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
      ROW('uuid@1', pg_catalog.uuid_send(p_actor_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_doctor_comment))::app.port_typed_arg,
      ROW('boolean@1', pg_catalog.boolsend(p_support_requested))::app.port_typed_arg
    ]),
    'app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)'::regprocedure
  );

  IF pg_catalog.btrim(COALESCE(p_doctor_comment, '')) = '' OR
     pg_catalog.length(pg_catalog.btrim(p_doctor_comment)) > 2000 THEN
    RAISE EXCEPTION 'doctor_medical_merge_comment_invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_merge_candidates
     SET status = CASE WHEN p_support_requested THEN 'escalated' ELSE 'dismissed' END,
         resolved_at = pg_catalog.now(),
         resolved_by = p_actor_id,
         doctor_comment = pg_catalog.btrim(p_doctor_comment),
         support_requested = p_support_requested
   WHERE id = p_conflict_id
     AND organization_id = app.current_org_id()
     AND status = 'pending'
     AND reason LIKE 'medical_history:%'
  RETURNING id, organization_id, anchor_user_id, candidate_user_id
    INTO v_conflict_id, v_organization_id, v_anchor_user_id, v_candidate_user_id;

  IF v_conflict_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_support_requested THEN
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
        'reason', 'doctor_refused_medical_merge',
        'doctorComment', pg_catalog.btrim(p_doctor_comment)
      ),
      'error'
    )
    ON CONFLICT (conflict_key) WHERE conflict_key IS NOT NULL AND resolved_at IS NULL
    DO UPDATE SET
      details = EXCLUDED.details,
      repeat_count = public.admin_audit_log.repeat_count + 1,
      last_seen_at = pg_catalog.now();
  END IF;

  RETURN true;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.read_staff_patient_medical_merge_refusal(p_conflict_id uuid)
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
    'identity.medical-merge-conflict.read-refusal',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_conflict_id))::app.port_typed_arg
    ]),
    'app.read_staff_patient_medical_merge_refusal(uuid)'::regprocedure
  );

  SELECT CASE WHEN candidate.id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
    'id', candidate.id::text,
    'organizationId', candidate.organization_id::text,
    'createdAt', candidate.created_at::text,
    'source', pg_catalog.substr(candidate.reason, pg_catalog.length('medical_history:') + 1),
    'doctorApproved', false,
    'status', candidate.status,
    'resolvedAt', candidate.resolved_at::text,
    'doctorComment', candidate.doctor_comment,
    'supportRequested', candidate.support_requested,
    'resolvedBy', CASE WHEN resolver.id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
      'userId', resolver.id::text,
      'displayName', COALESCE(resolver_identity.display_name, resolver.display_name, '')
    ) END,
    'initiatedBy', CASE WHEN initiator.id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
      'userId', initiator.id::text,
      'displayName', COALESCE(initiator_identity.display_name, initiator.display_name, '')
    ) END,
    'parties', (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'userId', party.user_id::text,
          'displayName', COALESCE(identity.display_name, users.display_name, ''),
          'firstName', COALESCE(identity.first_name, users.first_name),
          'lastName', COALESCE(identity.last_name, users.last_name),
          'patronymic', COALESCE(identity.patronymic, users.patronymic),
          'lastActivityAt', NULL,
          'assignments', '[]'::jsonb,
          'contacts', COALESCE((
            SELECT pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'kind', contact.contact_kind,
                'value', contact.value_normalized
              ) ORDER BY contact.contact_kind, contact.value_normalized
            )
              FROM public.user_contacts contact
             WHERE contact.platform_user_id = party.user_id
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
      SELECT c.id, c.organization_id, c.anchor_user_id, c.candidate_user_id, c.reason,
             c.status, c.created_at, c.resolved_at, c.resolved_by, c.payload,
             c.doctor_comment, c.support_requested,
             -- `foundAccountId` is the already existing account found by the contact lookup.
             -- The person who initiated the attempted merge was using the other account.
             CASE c.payload #>> '{humanFioDecision,prompt,foundAccountId}'
               WHEN c.anchor_user_id::text THEN c.candidate_user_id
               WHEN c.candidate_user_id::text THEN c.anchor_user_id
               ELSE NULL
             END AS initiator_user_id
        FROM public.patient_merge_candidates c
       WHERE c.id = p_conflict_id
         AND c.organization_id = app.current_org_id()
         AND c.status IN ('dismissed', 'escalated')
         AND c.reason LIKE 'medical_history:%'
       LIMIT 1
    ) candidate
    LEFT JOIN public.platform_users resolver ON resolver.id = candidate.resolved_by
    LEFT JOIN public.user_identity resolver_identity ON resolver_identity.platform_user_id = resolver.id
    LEFT JOIN public.platform_users initiator ON initiator.id = candidate.initiator_user_id
    LEFT JOIN public.user_identity initiator_identity ON initiator_identity.platform_user_id = initiator.id
   RIGHT JOIN (SELECT 1) singleton ON true;

  RETURN v_snapshot;
END
$function$;
