-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'auth.phone-login.default-channel') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.pre_session_get_default_auth_otp_channel(uuid)')
--
-- Phone login asks for this decision before a human session exists. The previous repository method
-- crossed three relations under the bootstrap principal, whose unnamed relation capability is
-- intentionally absent. This exact door keeps the existing provenance-first/fallback semantics.
CREATE FUNCTION app.pre_session_get_default_auth_otp_channel(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER PARALLEL UNSAFE
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-login.default-channel', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.pre_session_get_default_auth_otp_channel(uuid)'::regprocedure);

  RETURN COALESCE(
    (
      SELECT history.confirming_channel
      FROM public.user_phone_history AS history
      WHERE history.platform_user_id = p_user_id
        AND history.valid_to IS NULL
        AND history.confirming_channel IN ('telegram', 'max', 'email')
      LIMIT 1
    ),
    (
      SELECT first_verified.code
      FROM (
        SELECT binding.channel_code AS code, binding.created_at AS verified_at
        FROM public.user_channel_bindings AS binding
        WHERE binding.user_id = p_user_id
          AND binding.channel_code IN ('telegram', 'max')
        UNION ALL
        SELECT 'email' AS code, contact.confirmed_at AS verified_at
        FROM public.user_contacts AS contact
        WHERE contact.platform_user_id = p_user_id
          AND contact.contact_kind = 'email'
          AND contact.is_primary = true
          AND contact.confirmed_at IS NOT NULL
      ) AS first_verified
      ORDER BY first_verified.verified_at ASC
      LIMIT 1
    )
  );
END
$function$
;
