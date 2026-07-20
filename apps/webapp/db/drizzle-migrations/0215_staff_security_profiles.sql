CREATE TABLE IF NOT EXISTS "staff_security_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"factor_type" text,
	"totp_secret_ciphertext" text,
	"pending_totp_secret_ciphertext" text,
	"factor_verified_at" timestamp with time zone,
	"recovery_code_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recovery_codes_confirmed_at" timestamp with time zone,
	"replacement_required" boolean DEFAULT false NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"session_version" integer DEFAULT 0 NOT NULL,
	"login_challenge_hash" text,
	"login_challenge_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_security_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade,
	CONSTRAINT "staff_security_profiles_factor_type_check" CHECK ("factor_type" IS NULL OR "factor_type" = 'totp'),
	CONSTRAINT "staff_security_profiles_session_version_check" CHECK ("session_version" >= 0),
	CONSTRAINT "staff_security_profiles_failed_attempts_check" CHECK ("failed_attempts" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_specialist_signup_intents_user_id"
	ON "specialist_signup_intents" ("user_id");

-- Staff security is a global account-identity boundary, not tenant-owned clinical data.
-- Runtime roles receive no table privileges: every read/write uses the narrow functions below.
REVOKE ALL ON TABLE public.staff_security_profiles FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.require_staff_security_self_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
	v_user_id uuid;
BEGIN
	v_user_id := app.current_patient_user_id();
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'staff_security_self_principal_required';
	END IF;
	RETURN v_user_id;
END
$$;

CREATE OR REPLACE FUNCTION app.ensure_staff_security_profile()
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
	INSERT INTO public.staff_security_profiles (user_id)
	VALUES (app.require_staff_security_self_user_id())
	ON CONFLICT (user_id) DO NOTHING
$$;

CREATE OR REPLACE FUNCTION app.get_staff_security_profile()
RETURNS TABLE (
	user_id uuid, factor_type text, totp_secret_ciphertext text,
	pending_totp_secret_ciphertext text,
	factor_verified_at timestamptz, recovery_code_hashes jsonb,
	recovery_codes_confirmed_at timestamptz, replacement_required boolean,
	failed_attempts integer, locked_until timestamptz, session_version integer,
	login_challenge_hash text, login_challenge_expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
	SELECT p.user_id, p.factor_type, p.totp_secret_ciphertext,
	       p.pending_totp_secret_ciphertext,
	       p.factor_verified_at, p.recovery_code_hashes,
	       p.recovery_codes_confirmed_at, p.replacement_required,
	       p.failed_attempts, p.locked_until, p.session_version,
	       p.login_challenge_hash, p.login_challenge_expires_at
	FROM public.staff_security_profiles p
	WHERE p.user_id = app.require_staff_security_self_user_id()
$$;

CREATE OR REPLACE FUNCTION app.get_staff_security_session_state()
RETURNS TABLE (session_version integer, factor_required boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
	SELECT p.session_version, (p.factor_verified_at IS NOT NULL)
	FROM public.staff_security_profiles p
	WHERE p.user_id = app.require_staff_security_self_user_id()
$$;

CREATE OR REPLACE FUNCTION app.save_pending_staff_totp(p_secret_ciphertext text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
	INSERT INTO public.staff_security_profiles (user_id, pending_totp_secret_ciphertext, failed_attempts, locked_until, updated_at)
	VALUES (app.require_staff_security_self_user_id(), p_secret_ciphertext, 0, NULL, now())
	ON CONFLICT (user_id) DO UPDATE SET
		pending_totp_secret_ciphertext = EXCLUDED.pending_totp_secret_ciphertext,
		failed_attempts = 0,
		locked_until = NULL,
		updated_at = now()
$$;

CREATE OR REPLACE FUNCTION app.complete_staff_totp_enrollment(
	p_secret_ciphertext text,
	p_recovery_code_hashes jsonb
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
	v_session_version integer;
BEGIN
	IF jsonb_typeof(p_recovery_code_hashes) <> 'array'
	   OR jsonb_array_length(p_recovery_code_hashes) = 0 THEN
		RAISE EXCEPTION 'invalid recovery code hashes';
	END IF;

	UPDATE public.staff_security_profiles p
	SET factor_type = 'totp',
	    totp_secret_ciphertext = p_secret_ciphertext,
	    pending_totp_secret_ciphertext = NULL,
	    factor_verified_at = now(),
	    recovery_code_hashes = p_recovery_code_hashes,
	    recovery_codes_confirmed_at = NULL,
	    replacement_required = false,
	    failed_attempts = 0,
	    locked_until = NULL,
	    session_version = p.session_version + 1,
	    updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id()
	  AND p.pending_totp_secret_ciphertext = p_secret_ciphertext
	RETURNING p.session_version INTO v_session_version;

	IF v_session_version IS NULL THEN
		RAISE EXCEPTION 'staff_security_enrollment_conflict';
	END IF;
	RETURN v_session_version;
END
$$;

CREATE OR REPLACE FUNCTION app.confirm_staff_recovery_codes()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
	UPDATE public.staff_security_profiles p
	SET recovery_codes_confirmed_at = now(), updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id()
	  AND p.factor_verified_at IS NOT NULL
	  AND jsonb_array_length(p.recovery_code_hashes) > 0;
	RETURN FOUND;
END
$$;

CREATE OR REPLACE FUNCTION app.begin_staff_login_challenge(
	p_challenge_hash text,
	p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
	UPDATE public.staff_security_profiles p
	SET login_challenge_hash = p_challenge_hash,
	    login_challenge_expires_at = p_expires_at,
	    updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id() AND p.factor_verified_at IS NOT NULL;
	RETURN FOUND;
END
$$;

CREATE OR REPLACE FUNCTION app.consume_staff_totp_login(p_challenge_hash text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
	UPDATE public.staff_security_profiles p
	SET login_challenge_hash = NULL,
	    login_challenge_expires_at = NULL,
	    failed_attempts = 0,
	    locked_until = NULL,
	    updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id()
	  AND p.login_challenge_hash = p_challenge_hash
	  AND p.login_challenge_expires_at > now()
	  AND (p.locked_until IS NULL OR p.locked_until <= now());
	RETURN FOUND;
END
$$;

CREATE OR REPLACE FUNCTION app.consume_staff_recovery_login(
	p_challenge_hash text,
	p_recovery_code_hash text
)
RETURNS TABLE (ok boolean, session_version integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
	v_profile public.staff_security_profiles%ROWTYPE;
	v_next_hashes jsonb;
BEGIN
	SELECT p.* INTO v_profile
	FROM public.staff_security_profiles p
	WHERE p.user_id = app.require_staff_security_self_user_id()
	FOR UPDATE;

	IF NOT FOUND
	   OR v_profile.login_challenge_hash IS DISTINCT FROM p_challenge_hash
	   OR v_profile.login_challenge_expires_at IS NULL
	   OR v_profile.login_challenge_expires_at <= now()
	   OR (v_profile.locked_until IS NOT NULL AND v_profile.locked_until > now())
	   OR NOT (v_profile.recovery_code_hashes ? p_recovery_code_hash) THEN
		RETURN QUERY SELECT false, COALESCE(v_profile.session_version, 0);
		RETURN;
	END IF;

	SELECT COALESCE(jsonb_agg(item.value), '[]'::jsonb) INTO v_next_hashes
	FROM jsonb_array_elements(v_profile.recovery_code_hashes) AS item(value)
	WHERE item.value <> to_jsonb(p_recovery_code_hash);

	UPDATE public.staff_security_profiles p
	SET recovery_code_hashes = v_next_hashes,
	    replacement_required = true,
	    login_challenge_hash = NULL,
	    login_challenge_expires_at = NULL,
	    failed_attempts = 0,
	    locked_until = NULL,
	    session_version = p.session_version + 1,
	    updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id()
	RETURNING p.session_version INTO v_profile.session_version;

	RETURN QUERY SELECT true, v_profile.session_version;
END
$$;

CREATE OR REPLACE FUNCTION app.record_failed_staff_factor_attempt()
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
	v_locked_until timestamptz;
BEGIN
	UPDATE public.staff_security_profiles p
	SET failed_attempts = CASE
	      WHEN p.locked_until IS NOT NULL AND p.locked_until <= now() THEN 1
	      ELSE p.failed_attempts + 1
	    END,
	    locked_until = CASE
	      WHEN p.locked_until IS NOT NULL AND p.locked_until <= now() THEN NULL
	      WHEN p.failed_attempts + 1 >= 5 THEN now() + interval '15 minutes'
	      ELSE p.locked_until
	    END,
	    updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id()
	RETURNING p.locked_until INTO v_locked_until;
	RETURN v_locked_until;
END
$$;

CREATE OR REPLACE FUNCTION app.revoke_staff_sessions()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
	v_session_version integer;
BEGIN
	UPDATE public.staff_security_profiles p
	SET session_version = p.session_version + 1,
	    login_challenge_hash = NULL,
	    login_challenge_expires_at = NULL,
	    updated_at = now()
	WHERE p.user_id = app.require_staff_security_self_user_id()
	RETURNING p.session_version INTO v_session_version;
	IF v_session_version IS NULL THEN
		RAISE EXCEPTION 'staff_security_profile_missing';
	END IF;
	RETURN v_session_version;
END
$$;

CREATE OR REPLACE FUNCTION app.replace_pending_specialist_signup_challenge(
	p_challenge_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
	UPDATE public.specialist_signup_intents
	SET challenge_id = p_challenge_id
	WHERE user_id = app.require_staff_security_self_user_id() AND status = 'pending';
	RETURN FOUND;
END
$$;

CREATE OR REPLACE FUNCTION app.get_latest_specialist_signup_intent_for_user()
RETURNS TABLE (
	id uuid, user_id uuid, challenge_id uuid, email_normalized text,
	organization_title text, specialist_full_name text, status text,
	provisioned_organization_id uuid, provisioned_specialist_id uuid,
	provisioned_membership_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
	SELECT i.id, i.user_id, i.challenge_id, i.email_normalized, i.organization_title,
	       i.specialist_full_name, i.status, i.provisioned_organization_id,
	       i.provisioned_specialist_id, i.provisioned_membership_id
	FROM public.specialist_signup_intents i
	WHERE i.user_id = app.require_staff_security_self_user_id()
	ORDER BY i.created_at DESC
	LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.require_staff_security_self_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.replace_pending_specialist_signup_challenge(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_latest_specialist_signup_intent_for_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.ensure_staff_security_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_staff_security_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_staff_security_session_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.save_pending_staff_totp(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.complete_staff_totp_enrollment(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.confirm_staff_recovery_codes() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.begin_staff_login_challenge(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.consume_staff_totp_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.consume_staff_recovery_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_failed_staff_factor_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.revoke_staff_sessions() FROM PUBLIC;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
		GRANT EXECUTE ON FUNCTION app.replace_pending_specialist_signup_challenge(uuid) TO app_patient;
		GRANT EXECUTE ON FUNCTION app.get_latest_specialist_signup_intent_for_user() TO app_patient;
		GRANT EXECUTE ON FUNCTION app.ensure_staff_security_profile() TO app_patient;
		GRANT EXECUTE ON FUNCTION app.get_staff_security_profile() TO app_patient;
		GRANT EXECUTE ON FUNCTION app.get_staff_security_session_state() TO app_patient;
		GRANT EXECUTE ON FUNCTION app.save_pending_staff_totp(text) TO app_patient;
		GRANT EXECUTE ON FUNCTION app.complete_staff_totp_enrollment(text, jsonb) TO app_patient;
		GRANT EXECUTE ON FUNCTION app.confirm_staff_recovery_codes() TO app_patient;
		GRANT EXECUTE ON FUNCTION app.begin_staff_login_challenge(text, timestamptz) TO app_patient;
		GRANT EXECUTE ON FUNCTION app.consume_staff_totp_login(text) TO app_patient;
		GRANT EXECUTE ON FUNCTION app.consume_staff_recovery_login(text, text) TO app_patient;
		GRANT EXECUTE ON FUNCTION app.record_failed_staff_factor_attempt() TO app_patient;
		GRANT EXECUTE ON FUNCTION app.revoke_staff_sessions() TO app_patient;
	END IF;
END
$$;
