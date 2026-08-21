-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.pre_session_find_session_user_by_phone(text)') IS NOT NULL
--
-- D15b/6 repair: `pgUserByPhone.findByPhone` resolved the canonical id and assembled the session
-- identity through plain relation reads (`SELECT ... FROM platform_users/user_contacts/
-- user_channel_bindings`). Those reads never carried a `pre_session` capability — the bootstrap
-- principal that runs `POST /api/auth/phone/start` has no unnamed relation door by design (see
-- `apps/webapp/src/infra/db/portContextRuntime.ts`, `capabilities['pre_session']` is intentionally
-- absent) — so phone login for an existing owner failed with "Missing declared webapp port
-- capability: pre_session" before OTP delivery was ever attempted. This root is the same pattern
-- already used for messenger login (`app.auth_channel_binding_session`, D15b/x): one SECURITY
-- DEFINER door that resolves the canonical holder AND assembles the full session-identity payload
-- (contacts + channel bindings) in a single call, so phone-start needs no follow-up relation read.
CREATE FUNCTION app.pre_session_find_session_user_by_phone(p_phone_normalized text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER PARALLEL RESTRICTED
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
DECLARE
  v_match_count integer;
  v_user_id uuid;
  v_display_name text;
  v_first_name text;
  v_last_name text;
  v_patronymic text;
  v_role text;
  v_session_epoch integer;
  v_is_archived boolean;
  v_contacts jsonb;
  v_bindings jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-login.session-lookup', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.pre_session_find_session_user_by_phone(text)'::regprocedure);

  IF p_phone_normalized IS NULL OR btrim(p_phone_normalized) = '' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- `user_contacts` is the sole physical phone authority (D15b/6): a canonical, non-merged holder
  -- carries the primary phone contact directly — no `merged_into_id` chain-follow is needed here,
  -- exactly like `findCanonicalUserIdByPhone` on the TypeScript side this root replaces. Two live
  -- holders for one phone is a data anomaly, not an ambiguous pick to resolve silently: same
  -- fail-closed shape as `app.read_integrator_delivery_target_snapshot`.
  SELECT count(*), (array_agg(contact.platform_user_id))[1]
  INTO v_match_count, v_user_id
  FROM public.user_contacts AS contact
  JOIN public.platform_users AS holder ON holder.id = contact.platform_user_id
  WHERE contact.contact_kind = 'phone'
    AND contact.value_normalized = p_phone_normalized
    AND holder.merged_into_id IS NULL;

  IF v_match_count <> 1 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT holder.role, holder.session_epoch, COALESCE(holder.is_archived, false),
         identity.display_name, identity.first_name, identity.last_name, identity.patronymic
  INTO v_role, v_session_epoch, v_is_archived, v_display_name, v_first_name, v_last_name, v_patronymic
  FROM public.platform_users AS holder
  LEFT JOIN public.user_identity AS identity ON identity.platform_user_id = holder.id
  WHERE holder.id = v_user_id;

  -- Full contact list (not just the matched phone): the caller builds the same `SessionUser.contacts`
  -- shape `loadSessionIdentityUser` used to assemble from a second relation read, including
  -- unconfirmed/non-primary rows and the primary e-mail — phone-start derives OTP delivery
  -- eligibility (trusted phone, verified e-mail) from these rows instead of two further pre-session
  -- relation reads that would fail the same way.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'contact_kind', contact.contact_kind,
    'value_normalized', contact.value_normalized,
    'is_primary', contact.is_primary,
    'confirmed_at', contact.confirmed_at,
    'source_origin', contact.source_origin
  ) ORDER BY contact.contact_kind, contact.is_primary DESC, contact.created_at, contact.id), '[]'::jsonb)
  INTO v_contacts
  FROM public.user_contacts AS contact
  WHERE contact.platform_user_id = v_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'channel_code', binding.channel_code,
    'external_id', binding.external_id
  ) ORDER BY binding.channel_code), '[]'::jsonb)
  INTO v_bindings
  FROM public.user_channel_bindings AS binding
  WHERE binding.user_id = v_user_id;

  RETURN jsonb_build_object(
    'found', true,
    'id', v_user_id,
    'display_name', v_display_name,
    'first_name', v_first_name,
    'last_name', v_last_name,
    'patronymic', v_patronymic,
    'role', v_role,
    'session_epoch', v_session_epoch,
    'is_archived', v_is_archived,
    'contacts', v_contacts,
    'bindings', v_bindings
  );
END
$function$
;
