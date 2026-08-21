-- BCB-MIGRATION-OWNER: app_seam_phone_binding_owner
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 4 FROM pg_catalog.unnest((SELECT p.proargmodes FROM pg_catalog.pg_proc AS p WHERE p.oid = 'app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)'::regprocedure)) AS mode WHERE mode = 't';
-- D25/K8 (independent audit, 22.08.2026): the root refused a phone bind while naming only the SOURCE
-- account, so the human Р-D26 hands the merge decision to opened `messenger_phone_bind_blocked` and
-- could not see WHICH account the number collided with. Worse, `conflict_key` is a sha256 of the
-- sorted candidate ids, so two different conflicts sharing one source collapsed into a single row and
-- the second case vanished into `repeat_count`. The counterparty is already known inside the function
-- (`v_phone_owner_id` / the merge target); this returns it as a fourth OUT column. Behaviour,
-- accepted context and owner are otherwise byte-identical to
-- `20260821T040000_cut_over_canonical_contacts.sql`.
--
-- Adding an OUT column changes the return type, which `CREATE OR REPLACE FUNCTION` refuses
-- ("cannot change return type of existing function"), so the signature-preserving DROP + CREATE pair
-- below is the only available form. The argument list is untouched, so the declared capability
-- identity `app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)` and every callsite stay
-- exactly as declared; the mandatory declaration reconcile that follows the migration re-seeds the
-- port-context catalog row and re-grants EXECUTE for the rebuilt definer function.
DROP FUNCTION IF EXISTS app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_phone_binding_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- D15b/6 root: app.integrator_bind_bootstrap_channel_phone(p_channel_code text, p_external_id text, p_phone_normalized text, p_preferred_platform_user_id uuid)
CREATE OR REPLACE FUNCTION app.integrator_bind_bootstrap_channel_phone(p_channel_code text, p_external_id text, p_phone_normalized text, p_preferred_platform_user_id uuid)
 RETURNS TABLE(platform_user_id uuid, applied boolean, failure_code text, counterparty_platform_user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
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
  v_counterparty_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_phone_binding_owner'::name, 'app_integrator_resolver'::name, 'integrator'::app.port_context_class, 'integrator.bootstrap-phone-bind', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($4))::app.port_typed_arg]), 'app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)'::regprocedure);

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
    RETURN QUERY SELECT NULL::uuid, false, 'no_channel_binding'::text, NULL::uuid;
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
    ) AS owners;

  IF coalesce(array_length(v_owner_ids, 1), 0) > 1 THEN
    SELECT candidate_owner_id INTO v_counterparty_user_id
      FROM unnest(v_owner_ids) AS candidate_owner_id
     WHERE candidate_owner_id IS DISTINCT FROM v_source_user_id
     LIMIT 1;
    RETURN QUERY SELECT v_source_user_id, false, 'phone_owned_by_other_user'::text,
                        v_counterparty_user_id;
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
        RETURN QUERY SELECT v_source_user_id, false, 'merge_blocked_ambiguous_candidates'::text,
                            nullif(v_preferred_user_id, v_source_user_id);
        RETURN;
      END IF;
      EXIT WHEN v_next_id IS NULL OR v_depth >= 32;
      v_preferred_user_id := v_next_id;
      v_depth := v_depth + 1;
    END LOOP;
  END IF;

  IF v_phone_owner_id IS NOT NULL AND v_preferred_user_id IS NOT NULL
     AND v_phone_owner_id <> v_preferred_user_id THEN
    RETURN QUERY SELECT v_source_user_id, false, 'phone_owned_by_other_user'::text,
                        nullif(v_phone_owner_id, v_source_user_id);
    RETURN;
  END IF;

  v_target_user_id := coalesce(v_preferred_user_id, v_phone_owner_id, v_source_user_id);
  SELECT contact.value_normalized INTO v_target_phone
    FROM public.platform_users AS person
    LEFT JOIN public.user_contacts AS contact
      ON contact.platform_user_id = person.id
     AND contact.contact_kind = 'phone'
     AND contact.is_primary = true
   WHERE person.id = v_target_user_id AND person.merged_into_id IS NULL;
  IF NOT FOUND THEN
    RETURN QUERY SELECT v_source_user_id, false, 'merge_blocked_ambiguous_candidates'::text,
                        nullif(v_target_user_id, v_source_user_id);
    RETURN;
  END IF;
  IF v_target_phone IS NOT NULL AND v_target_phone <> p_phone_normalized THEN
    RETURN QUERY SELECT v_source_user_id, false, 'merge_blocked_distinct_real_users'::text,
                        nullif(v_target_user_id, v_source_user_id);
    RETURN;
  END IF;

  IF v_target_user_id <> v_source_user_id THEN
    SELECT
      source.integrator_user_id IS NULL
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
      RETURN QUERY SELECT v_source_user_id, false, 'merge_blocked_distinct_real_users'::text,
                          nullif(v_target_user_id, v_source_user_id);
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
     SET updated_at = now()
   WHERE id = v_target_user_id
     AND merged_into_id IS NULL;

  INSERT INTO public.user_contacts (
    platform_user_id, contact_kind, value_normalized,
    is_primary, confirmed_at, source_origin, updated_at
  ) VALUES (
    v_target_user_id, 'phone', p_phone_normalized,
    true, now(), 'direct', now()
  )
  ON CONFLICT (value_normalized) WHERE contact_kind = 'phone'
  DO UPDATE SET
    is_primary = true,
    confirmed_at = EXCLUDED.confirmed_at,
    source_origin = EXCLUDED.source_origin,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY SELECT v_target_user_id, true, NULL::text, NULL::uuid;
END
$function$
;
