-- 0275: voluntary patient passkeys plus global login-method toggles (#1005).
--
-- WebAuthn biometric/PIN verification stays inside the authenticator. The application stores only
-- an opaque account handle, the public credential, replay counter and bounded one-time challenges.

INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at)
VALUES
  ('auth_passkey_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp()),
  ('auth_pin_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp()),
  ('auth_oauth_apple_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp())
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

INSERT INTO public.app_runtime_settings (
  key,
  scope,
  organization_id,
  audience,
  value_json,
  updated_at,
  updated_by
)
SELECT
  setting.key,
  'admin',
  NULL,
  'public',
  setting.value_json,
  statement_timestamp(),
  NULL
FROM public.system_settings AS setting
WHERE setting.key IN ('auth_passkey_enabled', 'auth_pin_enabled', 'auth_oauth_apple_enabled')
  AND setting.scope = 'admin'
  AND setting.organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
SET audience = EXCLUDED.audience,
    value_json = EXCLUDED.value_json,
    updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by;

CREATE TABLE public.user_passkey_accounts (
  user_id uuid PRIMARY KEY REFERENCES public.platform_users(id) ON DELETE CASCADE,
  user_handle text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT user_passkey_accounts_handle_check
    CHECK (user_handle ~ '^[A-Za-z0-9_-]{43}$')
);

CREATE TABLE public.user_passkey_credentials (
  credential_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports jsonb NOT NULL DEFAULT '[]'::jsonb,
  device_type text NOT NULL,
  backed_up boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  last_used_at timestamptz,
  CONSTRAINT user_passkey_credentials_id_check
    CHECK (credential_id ~ '^[A-Za-z0-9_-]{16,1024}$'),
  CONSTRAINT user_passkey_credentials_public_key_check
    CHECK (public_key ~ '^[A-Za-z0-9_-]{16,8192}$'),
  CONSTRAINT user_passkey_credentials_counter_check CHECK (counter >= 0),
  CONSTRAINT user_passkey_credentials_device_type_check
    CHECK (device_type IN ('singleDevice', 'multiDevice')),
  CONSTRAINT user_passkey_credentials_transports_check
    CHECK (jsonb_typeof(transports) = 'array')
);

CREATE INDEX idx_user_passkey_credentials_user_id
  ON public.user_passkey_credentials (user_id, created_at);

CREATE TABLE public.user_passkey_challenges (
  id uuid PRIMARY KEY,
  purpose text NOT NULL,
  user_id uuid REFERENCES public.platform_users(id) ON DELETE CASCADE,
  challenge text NOT NULL,
  expected_origin text NOT NULL,
  rp_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT user_passkey_challenges_purpose_check
    CHECK (purpose IN ('registration', 'authentication')),
  CONSTRAINT user_passkey_challenges_user_shape_check
    CHECK (
      (purpose = 'registration' AND user_id IS NOT NULL)
      OR (purpose = 'authentication' AND user_id IS NULL)
    ),
  CONSTRAINT user_passkey_challenges_value_check
    CHECK (challenge ~ '^[A-Za-z0-9_-]{32,1024}$')
);

CREATE INDEX idx_user_passkey_challenges_expires_at
  ON public.user_passkey_challenges (expires_at);

CREATE OR REPLACE FUNCTION app.passkey_get_or_create_account(
  p_user_id uuid,
  p_candidate_handle text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := app.current_patient_user_id();
  v_handle text;
BEGIN
  IF v_user_id IS NULL
    OR p_user_id IS DISTINCT FROM v_user_id
    OR p_candidate_handle !~ '^[A-Za-z0-9_-]{43}$'
  THEN
    RAISE EXCEPTION 'passkey_patient_principal_required';
  END IF;

  INSERT INTO public.user_passkey_accounts (user_id, user_handle)
  VALUES (v_user_id, p_candidate_handle)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT account.user_handle
  INTO v_handle
  FROM public.user_passkey_accounts AS account
  WHERE account.user_id = v_user_id;
  RETURN v_handle;
END
$function$;

CREATE OR REPLACE FUNCTION app.passkey_list_current_credentials()
RETURNS TABLE (
  credential_id text,
  transports jsonb,
  device_type text,
  backed_up boolean,
  created_at timestamptz,
  last_used_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    credential.credential_id,
    credential.transports,
    credential.device_type,
    credential.backed_up,
    credential.created_at,
    credential.last_used_at
  FROM public.user_passkey_credentials AS credential
  WHERE credential.user_id = app.current_patient_user_id()
  ORDER BY credential.created_at DESC
$function$;

CREATE OR REPLACE FUNCTION app.passkey_list_current_exclusions()
RETURNS TABLE (credential_id text, transports jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT credential.credential_id, credential.transports
  FROM public.user_passkey_credentials AS credential
  WHERE credential.user_id = app.current_patient_user_id()
$function$;

CREATE OR REPLACE FUNCTION app.passkey_issue_challenge(
  p_id uuid,
  p_purpose text,
  p_user_id uuid,
  p_challenge text,
  p_expected_origin text,
  p_rp_id text,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_id IS NULL
    OR p_purpose NOT IN ('registration', 'authentication')
    OR p_challenge !~ '^[A-Za-z0-9_-]{32,1024}$'
    OR p_expected_origin IS NULL
    OR p_rp_id IS NULL
    OR p_expires_at <= statement_timestamp()
    OR p_expires_at > statement_timestamp() + interval '10 minutes'
    OR (
      p_purpose = 'registration'
      AND (
        p_user_id IS NULL
        OR p_user_id IS DISTINCT FROM app.current_patient_user_id()
      )
    )
    OR (p_purpose = 'authentication' AND p_user_id IS NOT NULL)
  THEN
    RETURN false;
  END IF;

  DELETE FROM public.user_passkey_challenges
  WHERE expires_at < statement_timestamp() - interval '1 day';

  INSERT INTO public.user_passkey_challenges (
    id,
    purpose,
    user_id,
    challenge,
    expected_origin,
    rp_id,
    expires_at
  )
  VALUES (
    p_id,
    p_purpose,
    p_user_id,
    p_challenge,
    p_expected_origin,
    p_rp_id,
    p_expires_at
  );
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION app.passkey_read_challenge(
  p_id uuid,
  p_purpose text
)
RETURNS TABLE (
  user_id uuid,
  challenge text,
  expected_origin text,
  rp_id text,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    stored.user_id,
    stored.challenge,
    stored.expected_origin,
    stored.rp_id,
    stored.expires_at
  FROM public.user_passkey_challenges AS stored
  WHERE stored.id = p_id
    AND stored.purpose = p_purpose
    AND stored.consumed_at IS NULL
    AND stored.expires_at >= statement_timestamp()
$function$;

CREATE OR REPLACE FUNCTION app.passkey_read_credential(p_credential_id text)
RETURNS TABLE (
  credential_id text,
  user_id uuid,
  user_handle text,
  public_key text,
  counter bigint,
  transports jsonb,
  device_type text,
  backed_up boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    credential.credential_id,
    credential.user_id,
    account.user_handle,
    credential.public_key,
    credential.counter,
    credential.transports,
    credential.device_type,
    credential.backed_up
  FROM public.user_passkey_credentials AS credential
  JOIN public.user_passkey_accounts AS account ON account.user_id = credential.user_id
  WHERE p_credential_id ~ '^[A-Za-z0-9_-]{16,1024}$'
    AND credential.credential_id = p_credential_id
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION app.passkey_complete_registration(
  p_challenge_id uuid,
  p_user_id uuid,
  p_credential_id text,
  p_public_key text,
  p_counter bigint,
  p_transports jsonb,
  p_device_type text,
  p_backed_up boolean
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := app.current_patient_user_id();
BEGIN
  IF v_user_id IS NULL
    OR p_user_id IS DISTINCT FROM v_user_id
    OR p_credential_id !~ '^[A-Za-z0-9_-]{16,1024}$'
    OR p_public_key !~ '^[A-Za-z0-9_-]{16,8192}$'
    OR p_counter < 0
    OR jsonb_typeof(p_transports) <> 'array'
    OR p_device_type NOT IN ('singleDevice', 'multiDevice')
  THEN
    RETURN false;
  END IF;

  UPDATE public.user_passkey_challenges AS challenge
  SET consumed_at = statement_timestamp()
  WHERE challenge.id = p_challenge_id
    AND challenge.purpose = 'registration'
    AND challenge.user_id = v_user_id
    AND challenge.consumed_at IS NULL
    AND challenge.expires_at >= statement_timestamp();
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_passkey_credentials (
    credential_id,
    user_id,
    public_key,
    counter,
    transports,
    device_type,
    backed_up
  )
  VALUES (
    p_credential_id,
    v_user_id,
    p_public_key,
    p_counter,
    p_transports,
    p_device_type,
    p_backed_up
  );
  RETURN true;
EXCEPTION
  WHEN unique_violation THEN
    RETURN false;
END
$function$;

CREATE OR REPLACE FUNCTION app.passkey_complete_authentication(
  p_challenge_id uuid,
  p_credential_id text,
  p_previous_counter bigint,
  p_new_counter bigint,
  p_device_type text,
  p_backed_up boolean
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  UPDATE public.user_passkey_challenges AS challenge
  SET consumed_at = statement_timestamp()
  WHERE challenge.id = p_challenge_id
    AND challenge.purpose = 'authentication'
    AND challenge.consumed_at IS NULL
    AND challenge.expires_at >= statement_timestamp();
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.user_passkey_credentials AS credential
  SET counter = p_new_counter,
      device_type = p_device_type,
      backed_up = p_backed_up,
      last_used_at = statement_timestamp()
  WHERE credential.credential_id = p_credential_id
    AND credential.counter = p_previous_counter
  RETURNING credential.user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'passkey_credential_state_changed';
  END IF;
  RETURN v_user_id;
END
$function$;

CREATE OR REPLACE FUNCTION app.passkey_delete_current_credential(p_credential_id text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  DELETE FROM public.user_passkey_credentials AS credential
  WHERE credential.credential_id = p_credential_id
    AND credential.user_id = app.current_patient_user_id();
  RETURN FOUND;
END
$function$;

DO $passkey_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER TABLE public.user_passkey_accounts OWNER TO app_owner;
    ALTER TABLE public.user_passkey_credentials OWNER TO app_owner;
    ALTER TABLE public.user_passkey_challenges OWNER TO app_owner;
    ALTER FUNCTION app.passkey_get_or_create_account(uuid, text) OWNER TO app_owner;
    ALTER FUNCTION app.passkey_list_current_credentials() OWNER TO app_owner;
    ALTER FUNCTION app.passkey_list_current_exclusions() OWNER TO app_owner;
    ALTER FUNCTION app.passkey_issue_challenge(uuid, text, uuid, text, text, text, timestamptz)
      OWNER TO app_owner;
    ALTER FUNCTION app.passkey_read_challenge(uuid, text) OWNER TO app_owner;
    ALTER FUNCTION app.passkey_read_credential(text) OWNER TO app_owner;
    ALTER FUNCTION app.passkey_complete_registration(uuid, uuid, text, text, bigint, jsonb, text, boolean)
      OWNER TO app_owner;
    ALTER FUNCTION app.passkey_complete_authentication(uuid, text, bigint, bigint, text, boolean)
      OWNER TO app_owner;
    ALTER FUNCTION app.passkey_delete_current_credential(text) OWNER TO app_owner;
  END IF;
END
$passkey_owner$;

REVOKE ALL ON TABLE public.user_passkey_accounts FROM PUBLIC;
REVOKE ALL ON TABLE public.user_passkey_credentials FROM PUBLIC;
REVOKE ALL ON TABLE public.user_passkey_challenges FROM PUBLIC;
REVOKE ALL ON FUNCTION app.passkey_get_or_create_account(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.passkey_list_current_credentials() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.passkey_list_current_exclusions() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.passkey_issue_challenge(uuid, text, uuid, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.passkey_read_challenge(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.passkey_read_credential(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.passkey_complete_registration(uuid, uuid, text, text, bigint, jsonb, text, boolean)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION app.passkey_complete_authentication(uuid, text, bigint, bigint, text, boolean)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION app.passkey_delete_current_credential(text) FROM PUBLIC;

DO $passkey_runtime_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.passkey_get_or_create_account(uuid, text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.passkey_list_current_credentials() TO app_patient;
    GRANT EXECUTE ON FUNCTION app.passkey_list_current_exclusions() TO app_patient;
    GRANT EXECUTE ON FUNCTION app.passkey_issue_challenge(uuid, text, uuid, text, text, text, timestamptz)
      TO app_patient;
    GRANT EXECUTE ON FUNCTION app.passkey_read_challenge(uuid, text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.passkey_complete_registration(uuid, uuid, text, text, bigint, jsonb, text, boolean)
      TO app_patient;
    GRANT EXECUTE ON FUNCTION app.passkey_delete_current_credential(text) TO app_patient;
  END IF;
END
$passkey_runtime_grants$;
