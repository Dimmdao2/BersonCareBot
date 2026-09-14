-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'auth_captcha_from_attempt') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.password_login_issue_altcha_challenge_impl(text,uuid,text,timestamp with time zone)')
CREATE OR REPLACE FUNCTION app.password_login_issue_altcha_challenge_impl(p_email_normalized text, p_challenge_id uuid, p_challenge_digest text, p_expires_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_state public.password_login_identifier_protection%ROWTYPE;
  v_captcha_enabled boolean := false;
  v_captcha_from integer := 3;
  v_now timestamptz := statement_timestamp();
  v_live_count integer;
  v_identifier_key text;
  v_account_attempts integer := 0;
  v_account_locked_until timestamptz;
BEGIN
  -- Порог выдачи задачки обязан быть ТЕМ ЖЕ, что у двери входа. Раньше здесь стояло собственное
  -- зашитое «меньше пяти неудач — задачку не выдаём», и как только владелец поставил порог ниже
  -- пяти, дверь входа требовала задачку, которую эта дверь отказывалась выдать: попытка не
  -- доходила до сверки пароля, счётчик не рос, и человек оставался снаружи НАВСЕГДА — ровно тот
  -- отказ, ради которого выключатель и заводили. Поймано живым прогоном на TEST 14.09.
  WITH policy AS (
    SELECT
      coalesce(bool_or(
        settings.key = 'auth_captcha_enabled'
        AND settings.value_json -> 'value' = 'true'::jsonb
      ), false) AS enabled,
      coalesce(bool_or(
        settings.key = 'auth_altcha_hmac_secret'
        AND nullif(btrim(settings.value_json ->> 'value'), '') IS NOT NULL
      ), false) AS has_secret,
      max(
        CASE
          WHEN settings.key = 'auth_captcha_from_attempt'
            AND btrim(settings.value_json ->> 'value') ~ '^[+-]?[0-9]+$'
          THEN greatest(
            1::numeric,
            least(50::numeric, btrim(settings.value_json ->> 'value')::numeric)
          )::integer
          ELSE NULL
        END
      ) AS from_attempt
    FROM public.system_settings AS settings
    WHERE settings.scope = 'admin'
      AND settings.organization_id IS NULL
      AND settings.key IN (
        'auth_captcha_enabled',
        'auth_captcha_from_attempt',
        'auth_altcha_hmac_secret'
      )
  )
  SELECT
    policy.enabled AND policy.has_secret,
    coalesce(policy.from_attempt, 3)
  INTO v_captcha_enabled, v_captcha_from
  FROM policy;

  IF p_email_normalized IS NULL
    OR length(p_email_normalized) NOT BETWEEN 3 AND 320
    OR lower(btrim(p_email_normalized)) IS DISTINCT FROM p_email_normalized
    OR p_email_normalized !~ '^[^[:space:]@]+@[^[:space:]@]+$'
    OR p_challenge_id IS NULL
    OR p_challenge_digest IS NULL
    OR p_challenge_digest !~ '^[0-9a-f]{64}$'
    OR p_expires_at IS NULL
    OR p_expires_at <= v_now
    OR p_expires_at > v_now + interval '10 minutes'
  THEN
    RETURN false;
  END IF;

  v_identifier_key :=
    'password-email:v1:' || encode(app_ext.digest(p_email_normalized, 'sha256'), 'hex');

  INSERT INTO public.password_login_identifier_protection (identifier_key)
  VALUES (v_identifier_key)
  ON CONFLICT (identifier_key) DO NOTHING;

  SELECT state.*
  INTO v_state
  FROM public.password_login_identifier_protection AS state
  WHERE state.identifier_key = v_identifier_key
  FOR UPDATE;

  SELECT credentials.failed_attempts, credentials.locked_until
  INTO v_account_attempts, v_account_locked_until
  FROM public.platform_users AS users
  JOIN public.user_password_credentials AS credentials ON credentials.user_id = users.id
  JOIN public.user_contacts AS contact ON contact.platform_user_id = users.id
  WHERE contact.contact_kind = 'email'
    AND contact.value_normalized = p_email_normalized
    AND users.merged_into_id IS NULL
  LIMIT 1
  FOR UPDATE OF credentials;

  IF (v_state.locked_until IS NOT NULL AND v_state.locked_until > v_now)
    OR (v_account_locked_until IS NOT NULL AND v_account_locked_until > v_now)
  THEN
    RETURN false;
  END IF;
  -- Капча выключена (или ключа нет) — задачка не нужна никому, и выдавать её незачем.
  IF NOT v_captcha_enabled THEN
    RETURN false;
  END IF;
  IF greatest(v_state.failed_attempts, coalesce(v_account_attempts, 0))
       < greatest(v_captcha_from - 1, 0)
  THEN
    RETURN false;
  END IF;

  SELECT count(*)::integer
  INTO v_live_count
  FROM public.password_altcha_challenges AS challenge
  WHERE challenge.identifier_key = v_identifier_key
    AND challenge.consumed_at IS NULL
    AND challenge.expires_at > v_now;

  IF v_live_count >= 3 THEN
    RETURN false;
  END IF;

  INSERT INTO public.password_altcha_challenges (
    challenge_id,
    identifier_key,
    purpose,
    challenge_digest,
    expires_at
  )
  VALUES (
    p_challenge_id,
    v_identifier_key,
    'password_login',
    p_challenge_digest,
    p_expires_at
  );

  RETURN true;
END
$function$
;
