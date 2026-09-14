-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.login_security_actions') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.user_password_credentials'::regclass AND attname = 'must_change_at' AND NOT attisdropped)
ALTER TABLE public.user_password_credentials
  ADD COLUMN IF NOT EXISTS must_change_at timestamptz;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE TABLE IF NOT EXISTS public.login_security_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  source_login_event_id uuid NOT NULL REFERENCES public.user_login_events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT login_security_actions_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT login_security_actions_purpose_check
    CHECK (purpose = 'revoke_sessions_and_require_password_change')
);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX IF NOT EXISTS uq_login_security_actions_token_hash
  ON public.login_security_actions (token_hash);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX IF NOT EXISTS uq_login_security_actions_source_login_event_id
  ON public.login_security_actions (source_login_event_id);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX IF NOT EXISTS idx_login_security_actions_user_created
  ON public.login_security_actions (user_id, created_at DESC);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX IF NOT EXISTS idx_login_security_actions_expires_at
  ON public.login_security_actions (expires_at);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.issue_login_security_action(
  p_user_id uuid,
  p_source_login_event_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $function$
DECLARE
  v_action_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_password_auth_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'auth.login-security-action.issue',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_user_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_source_login_event_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_token_hash))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send(p_expires_at))::app.port_typed_arg
    ]),
    'app.issue_login_security_action(uuid,uuid,text,timestamp with time zone)'::regprocedure
  );

  IF p_token_hash IS NULL
    OR p_token_hash !~ '^[0-9a-f]{64}$'
    OR p_expires_at <= statement_timestamp()
    OR p_expires_at > statement_timestamp() + interval '7 days 1 minute'
  THEN
    RAISE EXCEPTION 'invalid login security action'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_login_events AS event
    JOIN public.user_password_credentials AS credentials
      ON credentials.user_id = event.user_id
    WHERE event.id = p_source_login_event_id
      AND event.user_id = p_user_id
      AND event.outcome = 'success'
  ) THEN
    RAISE EXCEPTION 'login security action source is not eligible'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.login_security_actions (
    token_hash,
    user_id,
    purpose,
    expires_at,
    source_login_event_id
  ) VALUES (
    p_token_hash,
    p_user_id,
    'revoke_sessions_and_require_password_change',
    p_expires_at,
    p_source_login_event_id
  )
  RETURNING id INTO v_action_id;

  RETURN v_action_id;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.consume_login_security_action(p_token_hash text)
RETURNS TABLE(outcome text, user_id uuid, email text, source_login_event_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $function$
DECLARE
  v_action public.login_security_actions%ROWTYPE;
  v_email text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_password_auth_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'auth.login-security-action.consume',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_token_hash))::app.port_typed_arg
    ]),
    'app.consume_login_security_action(text)'::regprocedure
  );

  SELECT action.*
  INTO v_action
  FROM public.login_security_actions AS action
  WHERE action.token_hash = p_token_hash
    AND action.purpose = 'revoke_sessions_and_require_password_change'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_action.used_at IS NOT NULL THEN
    RETURN QUERY SELECT 'used'::text, NULL::uuid, NULL::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_action.expires_at <= statement_timestamp() THEN
    RETURN QUERY SELECT 'expired'::text, NULL::uuid, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.platform_users AS users
  SET session_epoch = users.session_epoch + 1,
      updated_at = statement_timestamp()
  WHERE users.id = v_action.user_id
    AND users.merged_into_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'login security action user is unavailable'
      USING ERRCODE = '23503';
  END IF;

  UPDATE public.user_password_credentials AS credentials
  SET must_change_at = statement_timestamp(),
      updated_at = statement_timestamp()
  WHERE credentials.user_id = v_action.user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'login security action password credential is unavailable'
      USING ERRCODE = '23503';
  END IF;

  UPDATE public.login_security_actions AS action
  SET used_at = statement_timestamp()
  WHERE action.id = v_action.id;

  SELECT contact.value_normalized
  INTO v_email
  FROM public.user_contacts AS contact
  WHERE contact.platform_user_id = v_action.user_id
    AND contact.contact_kind = 'email'
    AND contact.confirmed_at IS NOT NULL
  ORDER BY contact.is_primary DESC, contact.created_at, contact.id
  LIMIT 1;

  RETURN QUERY
  SELECT 'consumed'::text, v_action.user_id, v_email, v_action.source_login_event_id;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.password_credentials_must_change_self()
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $function$
DECLARE
  v_user_id uuid := app.require_staff_security_self_user_id();
  v_must_change_at timestamptz;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_password_auth_owner'::name,
    'app_patient'::name,
    'patient'::app.port_context_class,
    'auth.password-change-required.read-self',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.password_credentials_must_change_self()'::regprocedure
  );

  SELECT credentials.must_change_at
  INTO v_must_change_at
  FROM public.user_password_credentials AS credentials
  WHERE credentials.user_id = v_user_id;

  RETURN v_must_change_at;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.password_credentials_replace_self(p_email_normalized text, p_password_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := app.require_staff_security_self_user_id();
  v_identifier_key text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_password_auth_owner'::name, ARRAY['app_patient'::name]::name[]);

  SELECT 'password-email:v1:' || encode(app_ext.digest(contact.value_normalized, 'sha256'), 'hex')
  INTO v_identifier_key
  FROM public.platform_users AS users
  JOIN public.user_contacts AS contact ON contact.platform_user_id = users.id
  WHERE users.id = v_user_id
    AND contact.contact_kind = 'email'
    AND contact.value_normalized = p_email_normalized
    AND users.merged_into_id IS NULL;

  IF v_identifier_key IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.password_login_identifier_protection (identifier_key)
  VALUES (v_identifier_key)
  ON CONFLICT (identifier_key) DO NOTHING;

  PERFORM 1
  FROM public.password_login_identifier_protection AS state
  WHERE state.identifier_key = v_identifier_key
  FOR UPDATE;

  UPDATE public.user_password_credentials AS credentials
  SET password_hash = p_password_hash,
      failed_attempts = 0,
      next_allowed_at = NULL,
      locked_until = NULL,
      verification_lease_token = NULL,
      verification_lease_until = NULL,
      must_change_at = NULL,
      updated_at = statement_timestamp()
  WHERE credentials.user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.password_login_identifier_protection AS state
  SET failed_attempts = 0,
      next_allowed_at = NULL,
      locked_until = NULL,
      verification_lease_token = NULL,
      verification_lease_until = NULL,
      leased_user_id = NULL,
      updated_at = statement_timestamp()
  WHERE state.identifier_key = v_identifier_key;
  RETURN true;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.password_credentials_upsert_self(p_email_normalized text, p_password_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := app.require_staff_security_self_user_id();
  v_identifier_key text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_password_auth_owner'::name, ARRAY['app_patient'::name]::name[]);

  SELECT 'password-email:v1:' || encode(app_ext.digest(contact.value_normalized, 'sha256'), 'hex')
  INTO v_identifier_key
  FROM public.platform_users AS users
  JOIN public.user_contacts AS contact ON contact.platform_user_id = users.id
  WHERE users.id = v_user_id
    AND contact.contact_kind = 'email'
    AND contact.value_normalized = p_email_normalized
    AND users.merged_into_id IS NULL;

  IF v_identifier_key IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.password_login_identifier_protection (identifier_key)
  VALUES (v_identifier_key)
  ON CONFLICT (identifier_key) DO NOTHING;

  PERFORM 1
  FROM public.password_login_identifier_protection AS state
  WHERE state.identifier_key = v_identifier_key
  FOR UPDATE;

  INSERT INTO public.user_password_credentials (
    user_id,
    password_hash,
    failed_attempts,
    next_allowed_at,
    locked_until,
    verification_lease_token,
    verification_lease_until,
    must_change_at,
    updated_at
  )
  VALUES (
    v_user_id,
    p_password_hash,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    statement_timestamp()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      failed_attempts = 0,
      next_allowed_at = NULL,
      locked_until = NULL,
      verification_lease_token = NULL,
      verification_lease_until = NULL,
      must_change_at = NULL,
      updated_at = statement_timestamp();

  UPDATE public.password_login_identifier_protection AS state
  SET failed_attempts = 0,
      next_allowed_at = NULL,
      locked_until = NULL,
      verification_lease_token = NULL,
      verification_lease_until = NULL,
      leased_user_id = NULL,
      updated_at = statement_timestamp()
  WHERE state.identifier_key = v_identifier_key;
  RETURN true;
END
$function$;
