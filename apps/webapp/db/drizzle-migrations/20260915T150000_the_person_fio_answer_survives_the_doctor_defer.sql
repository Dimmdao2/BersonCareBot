-- Канон §18а: при конфликте ФИО правильный вариант выбирает ЧЕЛОВЕК. Медицинский блокер §18 бросается
-- ПОЗЖЕ этого выбора и откатывает транзакцию слияния вместе с ним, а строка конфликта хранила только
-- пару, организацию и источник. Поэтому после одобрения врача (§18б) брать выбранную подпись было
-- неоткуда, и молча выживала подпись целевой учётки — выбор, сделанный движком. Дверь записи конфликта
-- получает пятый аргумент: ответ человека едет в `payload` вместе со строкой и переживает defer.
--
-- Ответ приходит ТЕКСТОМ, а не `jsonb`: контракт типизированных аргументов порт-контекста
-- (`app.hash_port_typed_args`) знает ровно десять тегов, `jsonb` среди них нет. Текст хешируется
-- ровно тем, что прислал рантайм, и разбирается в `jsonb` уже внутри двери.
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 0 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname = 'record_patient_medical_merge_conflict' AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, uuid, text'
DROP FUNCTION IF EXISTS app.record_patient_medical_merge_conflict(uuid, uuid, uuid, text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname = 'record_patient_medical_merge_conflict' AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, uuid, text, text'
CREATE OR REPLACE FUNCTION app.record_patient_medical_merge_conflict(
  p_organization_id uuid,
  p_anchor_user_id uuid,
  p_candidate_user_id uuid,
  p_source text,
  p_human_fio_decision text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_conflict_id uuid;
  v_payload jsonb;
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
      ROW('text@1', pg_catalog.textsend(p_source))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_human_fio_decision))::app.port_typed_arg
    ]),
    'app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text,text)'::regprocedure
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

  -- Ответ человека (§18а) кладётся отдельным ключом, а не поверх payload: `source` обновляется каждой
  -- повторной попыткой входа, и ответ обязан пережить их все. Отсутствующий ответ НЕ стирает
  -- сохранённый ранее — иначе первая же повторная попытка без диалога обнуляла бы выбор человека.
  v_payload := pg_catalog.jsonb_build_object('source', p_source);
  IF p_human_fio_decision IS NOT NULL THEN
    v_payload := v_payload
      || pg_catalog.jsonb_build_object('humanFioDecision', p_human_fio_decision::jsonb);
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

  -- One pending row per clinic and pair. Repeated login/bind attempts land here, so a doctor
  -- approval already recorded in this row's payload survives them instead of being reset.
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
       SET payload = payload || v_payload
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
      'medical_history:' || p_source, 'pending', v_payload
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_conflict_id;
  ELSE
    INSERT INTO public.patient_merge_candidates (
      organization_id, anchor_user_id, candidate_user_id, reason, status, payload
    ) VALUES (
      p_organization_id, p_anchor_user_id, p_candidate_user_id,
      'medical_history:' || p_source, 'pending', v_payload
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
