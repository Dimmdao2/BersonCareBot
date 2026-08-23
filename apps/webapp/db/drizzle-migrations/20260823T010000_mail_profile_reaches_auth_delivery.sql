-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.email_auth_start_challenge(uuid,text,text,bigint,text,text,text,text,uuid,text,text)') IS NOT NULL AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('app.read_integrator_clinic_delivery_credential(text,uuid)'::regprocedure), 'clinic_transactional_mail_template') > 0;
-- C4: the six-argument entry can no longer invent a sender. It remains as a fail-closed trap so a
-- stale caller cannot enqueue a platform-branded message after the profile-aware overload lands.
CREATE OR REPLACE FUNCTION app.email_auth_start_challenge(
  p_user_id uuid, p_email text, p_code_hash text, p_expires_at bigint, p_purpose text, p_code text
)
RETURNS TABLE (challenge_id uuid, retry_after_seconds integer)
LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'email_auth_start_challenge: mail_profile_required';
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.email_auth_start_challenge(
  p_user_id uuid,
  p_email text,
  p_code_hash text,
  p_expires_at bigint,
  p_purpose text,
  p_code text,
  p_mail_profile_kind text,
  p_sender_display_name text,
  p_organization_id uuid,
  p_clinic_name text,
  p_platform_name text
)
RETURNS TABLE (challenge_id uuid, retry_after_seconds integer)
LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_challenge_id uuid;
  v_last_sent_at timestamptz;
  v_retry_after integer;
  v_event_id text;
  v_queue_rows integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_email_otp_owner', 'app_pre_session', 'pre_session',
    'auth.email-otp.challenge.start',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_user_id))::app.port_typed_arg,
      ROW('text@2', textsend(p_email))::app.port_typed_arg,
      ROW('text@3', textsend(p_code_hash))::app.port_typed_arg,
      ROW('bigint@4', int8send(p_expires_at))::app.port_typed_arg,
      ROW('text@5', textsend(p_purpose))::app.port_typed_arg,
      ROW('text@6', textsend(p_code))::app.port_typed_arg,
      ROW('text@7', textsend(p_mail_profile_kind))::app.port_typed_arg,
      ROW('text@8', textsend(p_sender_display_name))::app.port_typed_arg,
      ROW('uuid@9', uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('text@10', textsend(p_clinic_name))::app.port_typed_arg,
      ROW('text@11', textsend(p_platform_name))::app.port_typed_arg
    ]),
    'app.email_auth_start_challenge(uuid,text,text,bigint,text,text,text,text,uuid,text,text)'::regprocedure
  );

  IF p_user_id IS NULL OR p_email IS NULL OR p_email <> lower(btrim(p_email))
     OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'email_auth_start_challenge: invalid identity/email';
  END IF;
  IF p_code !~ '^[0-9]{6}$' OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'email_auth_start_challenge: invalid code material';
  END IF;
  IF p_expires_at <= extract(epoch FROM now())::bigint THEN
    RAISE EXCEPTION 'email_auth_start_challenge: expiry must be in the future';
  END IF;
  IF p_purpose NOT IN (
    'login', 'public_registration', 'clinic_invite', 'specialist_signup',
    'password_reset', 'password_setup', 'password_register', 'email_verify',
    'patient_email_change'
  ) THEN
    RAISE EXCEPTION 'email_auth_start_challenge: invalid purpose';
  END IF;
  IF p_mail_profile_kind = 'platform' THEN
    IF p_sender_display_name IS NULL OR btrim(p_sender_display_name) = ''
       OR p_organization_id IS NOT NULL OR p_clinic_name IS NOT NULL OR p_platform_name IS NOT NULL THEN
      RAISE EXCEPTION 'email_auth_start_challenge: invalid platform mail profile';
    END IF;
  ELSIF p_mail_profile_kind = 'branded' THEN
    IF p_sender_display_name IS NOT NULL OR p_organization_id IS NULL
       OR btrim(coalesce(p_clinic_name, '')) = '' OR btrim(coalesce(p_platform_name, '')) = '' THEN
      RAISE EXCEPTION 'email_auth_start_challenge: invalid branded mail profile';
    END IF;
  ELSE
    RAISE EXCEPTION 'email_auth_start_challenge: mail_profile_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  SELECT cooldown.last_sent_at INTO v_last_sent_at
  FROM public.email_send_cooldowns AS cooldown
  WHERE cooldown.user_id = p_user_id AND cooldown.email_normalized = p_email;

  IF v_last_sent_at IS NOT NULL AND v_last_sent_at > now() - interval '60 seconds' THEN
    v_retry_after := greatest(
      1, 60 - floor(extract(epoch FROM (now() - v_last_sent_at)))::integer
    );
    RETURN QUERY SELECT NULL::uuid, v_retry_after;
    RETURN;
  END IF;

  DELETE FROM public.email_challenges WHERE user_id = p_user_id;
  INSERT INTO public.email_challenges (
    user_id, email, code_hash, expires_at, attempts, purpose,
    pending_delivery_code, delivery_token, delivery_claimed_at
  ) VALUES (
    p_user_id, p_email, p_code_hash, p_expires_at, 0, p_purpose, NULL, NULL, now()
  ) RETURNING id INTO v_challenge_id;

  v_event_id := 'auth-otp:email:' || v_challenge_id::text;
  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json,
    status, attempt_count, max_attempts, next_retry_at, priority
  ) VALUES (
    p_organization_id, v_event_id, 'auth_email_otp', 'email',
    jsonb_build_object(
      'intent', jsonb_build_object(
        'type', 'message.send',
        'meta', jsonb_build_object(
          'eventId', 'otp:email:' || gen_random_uuid()::text,
          'occurredAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || 'Z',
          'source', 'email', 'outboundMessageClass', 'auth_code',
          'outboundCapability', 'auth_code'
        ),
        'payload', jsonb_build_object(
          'recipient', jsonb_build_object('email', p_email),
          'delivery', jsonb_build_object('channels', jsonb_build_array('email')),
          'authCode', p_code,
          'mailProfile', CASE p_mail_profile_kind
            WHEN 'platform' THEN jsonb_build_object(
              'kind', 'platform', 'senderDisplayName', p_sender_display_name
            )
            ELSE jsonb_build_object(
              'kind', 'branded', 'organizationId', p_organization_id,
              'clinicName', p_clinic_name, 'platformName', p_platform_name
            )
          END
        )
      )
    ),
    'pending', 0, 4, now(), 100
  );
  GET DIAGNOSTICS v_queue_rows = ROW_COUNT;
  IF v_queue_rows <> 1 THEN
    RAISE EXCEPTION 'email_auth_start_challenge: durable enqueue failed';
  END IF;

  INSERT INTO public.email_send_cooldowns (user_id, email_normalized, last_sent_at)
  VALUES (p_user_id, p_email, now())
  ON CONFLICT (user_id, email_normalized) DO UPDATE SET last_sent_at = now();
  RETURN QUERY SELECT v_challenge_id, 60;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
COMMENT ON FUNCTION app.email_auth_start_challenge(
  uuid, text, text, bigint, text, text, text, text, uuid, text, text
) IS 'Exact pre-session root that requires surface-resolved mail profile data before enqueue.';

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
CREATE OR REPLACE FUNCTION app.read_integrator_clinic_delivery_credential(
  p_key text,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_organization_id IS NOT NULL
    AND p_key IN (
      'clinic_smtp_outbound', 'clinic_smsc_api_key', 'clinic_telegram_bot_token',
      'clinic_max_bot_api_key', 'clinic_vk_community_access_token',
      'clinic_transactional_mail_template'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id = p_organization_id
  LIMIT 1
$function$;
