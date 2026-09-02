-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.email_auth_find_latest_pending_email_challenge_for_user(uuid,bigint,text)') IS NOT NULL AND to_regprocedure('app.email_auth_find_latest_pending_email_challenge_for_user(uuid,bigint)') IS NULL
--
-- Concurrent email OTP challenges can have different purposes. Selecting the newest row first and
-- checking its purpose in application code lets a newer self-service verification hide an older,
-- still-valid staff-started email change. Purpose is therefore part of the database lookup key.
DROP FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint);

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
CREATE FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(
  p_user_id uuid,
  p_now_sec bigint,
  p_purpose text
)
RETURNS TABLE (id uuid, email text, code_hash text, expires_at bigint, attempts integer, purpose text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT app.require_attested_context_for_roles(
    'app_seam_email_otp_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );

  SELECT c.id, c.email, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.user_id = p_user_id
    AND c.expires_at > p_now_sec
    AND c.purpose = p_purpose
  ORDER BY c.created_at DESC
  LIMIT 1
$$;
