-- BCB-MIGRATION-OWNER: app_seam_phone_binding_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Exact bootstrap phone-bind root. It may merge only the empty account created by the first
-- channel webhook; every non-empty/ambiguous identity fails closed for the ordinary merge path.

CREATE OR REPLACE FUNCTION app.integrator_bind_bootstrap_channel_phone(
  p_channel_code text,
  p_external_id text,
  p_phone_normalized text,
  p_preferred_platform_user_id uuid
)
RETURNS TABLE (
  platform_user_id uuid,
  applied boolean,
  failure_code text
)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_source_user_id uuid;
  v_target_user_id uuid;
  v_phone_owner_id uuid;
  v_preferred_user_id uuid;
  v_next_id uuid;
  v_depth integer;
  v_owner_ids uuid[];
  v_source_is_empty boolean;
  v_target_phone text;
  v_lock_channel bigint;
  v_lock_phone bigint;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_phone_binding_owner', 'app_integrator_resolver', 'integrator',
    'integrator.bootstrap-phone-bind',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_channel_code))::app.port_typed_arg,
      ROW('text@1', textsend(p_external_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_phone_normalized))::app.port_typed_arg,
      ROW('uuid@1', CASE WHEN p_preferred_platform_user_id IS NULL THEN NULL
        ELSE uuid_send(p_preferred_platform_user_id) END)::app.port_typed_arg
    ]),
    'app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)'::regprocedure
  );

  IF p_channel_code NOT IN ('telegram', 'max') THEN
    RAISE EXCEPTION 'integrator_bootstrap_phone_channel_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_external_id IS NULL OR btrim(p_external_id) = ''
     OR p_phone_normalized IS NULL OR btrim(p_phone_normalized) = '' THEN
    RAISE EXCEPTION 'integrator_bootstrap_phone_input_required' USING ERRCODE = '22023';
  END IF;

  v_lock_channel := hashtextextended(
    'integrator-channel-identity:' || p_channel_code || ':' || p_external_id, 0
  );
  v_lock_phone := hashtextextended('integrator-phone-identity:' || p_phone_normalized, 0);
  PERFORM pg_advisory_xact_lock(least(v_lock_channel, v_lock_phone));
  IF v_lock_phone <> v_lock_channel THEN
    PERFORM pg_advisory_xact_lock(greatest(v_lock_channel, v_lock_phone));
  END IF;

  SELECT binding.user_id
    INTO v_source_user_id
    FROM public.user_channel_bindings AS binding
   WHERE binding.channel_code = p_channel_code
     AND binding.external_id = p_external_id;
  IF v_source_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false, 'no_channel_binding'::text;
    RETURN;
  END IF;

  v_depth := 0;
  LOOP
    SELECT person.merged_into_id INTO v_next_id
      FROM public.platform_users AS person
     WHERE person.id = v_source_user_id;
    EXIT WHEN NOT FOUND OR v_next_id IS NULL OR v_depth >= 32;
    v_source_user_id := v_next_id;
    v_depth := v_depth + 1;
  END LOOP;

  SELECT array_agg(DISTINCT owner_id ORDER BY owner_id)
    INTO v_owner_ids
    FROM (
      SELECT contact.platform_user_id AS owner_id
        FROM public.user_contacts AS contact
       WHERE contact.contact_kind = 'phone'
         AND contact.value_normalized = p_phone_normalized
      UNION
      SELECT person.id
        FROM public.platform_users AS person
       WHERE person.phone_normalized = p_phone_normalized
         AND person.merged_into_id IS NULL
      UNION
      SELECT history.platform_user_id
        FROM public.user_phone_history AS history
       WHERE history.phone_normalized = p_phone_normalized
         AND history.valid_to IS NULL
    ) AS owners;

  IF coalesce(array_length(v_owner_ids, 1), 0) > 1 THEN
    RETURN QUERY SELECT v_source_user_id, false, 'phone_owned_by_other_user'::text;
    RETURN;
  END IF;
  v_phone_owner_id := v_owner_ids[1];
  IF v_phone_owner_id IS NOT NULL THEN
    v_depth := 0;
    LOOP
      SELECT person.merged_into_id INTO v_next_id
        FROM public.platform_users AS person
       WHERE person.id = v_phone_owner_id;
      EXIT WHEN NOT FOUND OR v_next_id IS NULL OR v_depth >= 32;
      v_phone_owner_id := v_next_id;
      v_depth := v_depth + 1;
    END LOOP;
  END IF;

  v_preferred_user_id := p_preferred_platform_user_id;
  IF v_preferred_user_id IS NOT NULL THEN
    v_depth := 0;
    LOOP
      SELECT person.merged_into_id INTO v_next_id
        FROM public.platform_users AS person
       WHERE person.id = v_preferred_user_id;
      IF NOT FOUND THEN
        RETURN QUERY SELECT v_source_user_id, false, 'merge_blocked_ambiguous_candidates'::text;
        RETURN;
      END IF;
      EXIT WHEN v_next_id IS NULL OR v_depth >= 32;
      v_preferred_user_id := v_next_id;
      v_depth := v_depth + 1;
    END LOOP;
  END IF;

  IF v_phone_owner_id IS NOT NULL AND v_preferred_user_id IS NOT NULL
     AND v_phone_owner_id <> v_preferred_user_id THEN
    RETURN QUERY SELECT v_source_user_id, false, 'phone_owned_by_other_user'::text;
    RETURN;
  END IF;

  v_target_user_id := coalesce(v_preferred_user_id, v_phone_owner_id, v_source_user_id);
  SELECT person.phone_normalized INTO v_target_phone
    FROM public.platform_users AS person
   WHERE person.id = v_target_user_id AND person.merged_into_id IS NULL;
  IF NOT FOUND THEN
    RETURN QUERY SELECT v_source_user_id, false, 'merge_blocked_ambiguous_candidates'::text;
    RETURN;
  END IF;
  IF v_target_phone IS NOT NULL AND v_target_phone <> p_phone_normalized THEN
    RETURN QUERY SELECT v_source_user_id, false, 'merge_blocked_distinct_real_users'::text;
    RETURN;
  END IF;

  IF v_target_user_id <> v_source_user_id THEN
    SELECT
      source.integrator_user_id IS NULL
      AND source.phone_normalized IS NULL
      AND source.email IS NULL
      AND identity.first_name IS NULL
      AND identity.last_name IS NULL
      AND identity.patronymic IS NULL
      AND identity.birth_date IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.user_contacts AS contact
         WHERE contact.platform_user_id = source.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_phone_history AS history
         WHERE history.platform_user_id = source.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.org_enrollments AS enrollment
         WHERE enrollment.platform_user_id = source.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.be_organization_members AS member
         WHERE member.platform_user_id = source.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_channel_bindings AS other_binding
         WHERE other_binding.user_id = source.id
           AND (other_binding.channel_code, other_binding.external_id)
             IS DISTINCT FROM (p_channel_code, p_external_id)
      )
      INTO v_source_is_empty
      FROM public.platform_users AS source
      INNER JOIN public.user_identity AS identity ON identity.platform_user_id = source.id
     WHERE source.id = v_source_user_id
       AND source.merged_into_id IS NULL;

    IF coalesce(v_source_is_empty, false) IS NOT TRUE THEN
      RETURN QUERY SELECT v_source_user_id, false, 'merge_blocked_distinct_real_users'::text;
      RETURN;
    END IF;

    UPDATE public.user_channel_bindings
       SET user_id = v_target_user_id
     WHERE user_id = v_source_user_id
       AND channel_code = p_channel_code
       AND external_id = p_external_id;

    INSERT INTO public.user_channel_preferences AS preferences (
      user_id, platform_user_id, channel_code,
      is_enabled_for_messages, is_enabled_for_notifications, updated_at
    ) VALUES (
      v_target_user_id::text, v_target_user_id, p_channel_code, true, true, now()
    )
    ON CONFLICT (platform_user_id, channel_code) DO UPDATE SET
      is_enabled_for_messages = true,
      is_enabled_for_notifications = true,
      updated_at = EXCLUDED.updated_at;

    DELETE FROM public.user_channel_preferences
     WHERE platform_user_id = v_source_user_id
       AND channel_code = p_channel_code;

    UPDATE public.platform_users
       SET merged_into_id = v_target_user_id,
           updated_at = now()
     WHERE id = v_source_user_id
       AND merged_into_id IS NULL;
  END IF;

  UPDATE public.user_phone_history
     SET valid_to = now()
   WHERE platform_user_id = v_target_user_id
     AND valid_to IS NULL
     AND phone_normalized <> p_phone_normalized;

  INSERT INTO public.user_phone_history (
    platform_user_id, phone_normalized, valid_from, valid_to, source
  ) VALUES (
    v_target_user_id, p_phone_normalized, now(), NULL, 'messenger'
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.platform_users
     SET phone_normalized = p_phone_normalized,
         patient_phone_trust_at = now(),
         updated_at = now()
   WHERE id = v_target_user_id
     AND merged_into_id IS NULL;

  DELETE FROM public.user_contacts
   WHERE platform_user_id = v_target_user_id
     AND contact_kind = 'phone'
     AND source_origin IN ('platform_users', 'phone_history');

  INSERT INTO public.user_contacts (
    platform_user_id, contact_kind, value_normalized,
    is_primary, confirmed_at, source_origin, updated_at
  ) VALUES (
    v_target_user_id, 'phone', p_phone_normalized,
    true, now(), 'platform_users', now()
  )
  ON CONFLICT (value_normalized) WHERE contact_kind = 'phone'
  DO UPDATE SET
    platform_user_id = EXCLUDED.platform_user_id,
    is_primary = true,
    confirmed_at = EXCLUDED.confirmed_at,
    source_origin = EXCLUDED.source_origin,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY SELECT v_target_user_id, true, NULL::text;
END
$function$;
