-- 0342: F5/F6 (Track D / #987 D27) — OAuth contact resolution + equal-rights login.
--
-- IDENTITY_AND_MERGE_SCHEME.md §2a item 7 (owner, 03.08): "равноправный вход по любому
-- подтверждённому контакту — согласен". Today `email_password_find_login_candidate` and
-- `email_auth_find_email_owner_conflict` resolve an account only through
-- `platform_users.email_normalized` (the primary email). A confirmed secondary address
-- (`user_oauth_bindings.email`, written whenever an OAuth sign-in has already bound that
-- provider to an account — see F6 case 3/4/5) could not log in and was not even detected as
-- already owned when someone else tried to claim it, exactly the gap this migration closes.
--
-- `find_platform_user_ids_by_any_confirmed_email` is the ONE new function both existing
-- accessors are rewritten to use (CREATE OR REPLACE keeps their OID/ownership/grants intact),
-- so a future D15a/D15b identity-storage change only has to swap this one function's body.
CREATE FUNCTION app.find_platform_user_ids_by_any_confirmed_email(p_email_norm text)
RETURNS TABLE(user_id uuid, matched_primary boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $$
  SELECT t.user_id, bool_or(t.matched_primary) AS matched_primary
  FROM (
    SELECT pu.id AS user_id, true AS matched_primary
    FROM public.platform_users AS pu
    WHERE pu.merged_into_id IS NULL
      AND pu.email_normalized = lower(btrim(p_email_norm))
    UNION ALL
    SELECT ob.user_id, false AS matched_primary
    FROM public.user_oauth_bindings AS ob
    INNER JOIN public.platform_users AS pu2 ON pu2.id = ob.user_id
    WHERE pu2.merged_into_id IS NULL
      AND ob.email IS NOT NULL
      AND lower(btrim(ob.email)) = lower(btrim(p_email_norm))
  ) AS t
  GROUP BY t.user_id
$$;

DO $find_platform_user_ids_by_any_confirmed_email_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.find_platform_user_ids_by_any_confirmed_email(text) OWNER TO app_owner;
  END IF;
END
$find_platform_user_ids_by_any_confirmed_email_owner$;

REVOKE ALL ON FUNCTION app.find_platform_user_ids_by_any_confirmed_email(text) FROM PUBLIC;

DO $find_platform_user_ids_by_any_confirmed_email_runtime_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.find_platform_user_ids_by_any_confirmed_email(text) TO app_patient;
  END IF;
END
$find_platform_user_ids_by_any_confirmed_email_runtime_grants$;

COMMENT ON FUNCTION app.find_platform_user_ids_by_any_confirmed_email(text) IS
  'F5/F6 §2a item 7: owner(s) of an email as EITHER the active primary (platform_users.email_normalized) OR a confirmed OAuth-linked secondary (user_oauth_bindings.email). matched_primary distinguishes the two so callers can compute the right email_verified/conflict semantics without a second, direct read of user_oauth_bindings (app_patient has no such grant).';

-- Equal-rights login (§2a item 7): password verification must find the account through ANY
-- confirmed email, not only the primary. `email_verified` now also reflects "this exact
-- identifier is a confirmed OAuth-linked secondary" (matched_primary = false), since such a
-- binding is only ever written after the provider itself vouched for the address (F6 case 1).
CREATE OR REPLACE FUNCTION app.email_password_find_login_candidate(p_email_norm text) RETURNS TABLE(user_id uuid, password_hash text, email_verified boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT upc.user_id, upc.password_hash,
         (pu.email_verified_at IS NOT NULL OR fpu.matched_primary = false) AS email_verified
  FROM public.user_password_credentials AS upc
  INNER JOIN public.platform_users AS pu ON pu.id = upc.user_id
  INNER JOIN app.find_platform_user_ids_by_any_confirmed_email(p_email_norm) AS fpu ON fpu.user_id = upc.user_id
  WHERE pu.merged_into_id IS NULL
  LIMIT 1
$$;

-- Claiming an email via OTP code must refuse when it is already a confirmed contact of a
-- DIFFERENT account, whether that account holds it as its primary or as a confirmed OAuth
-- secondary -- previously only the primary column was checked, so claiming (and thereby
-- verifying as your OWN primary) an email that was already someone else's confirmed secondary
-- went undetected, letting the same address end up confirmed on two accounts at once.
CREATE OR REPLACE FUNCTION app.email_auth_find_email_owner_conflict(p_user_id uuid, p_email text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.find_platform_user_ids_by_any_confirmed_email(p_email) AS fpu
    WHERE fpu.user_id <> p_user_id
  )
$$;

-- F6 case 4 ("email matches, phone differs -> the provider's phone is added as an additional
-- (spare) contact"): the write goes through the existing
-- `applyPlatformUserPhoneHistoryTransition` helper (pgPhoneHistory.ts), whose `source` column
-- has no value for "confirmed directly by an OAuth provider" -- reusing 'otp'/'messenger' would
-- misattribute the provenance. Nullable/no-op for every existing row, same shape as 0341.
ALTER TABLE public.user_phone_history DROP CONSTRAINT IF EXISTS user_phone_history_source_check;
ALTER TABLE public.user_phone_history
  ADD CONSTRAINT user_phone_history_source_check
  CHECK (source = ANY (ARRAY['otp'::text, 'messenger'::text, 'merge'::text, 'admin'::text, 'projection'::text, 'oauth'::text]));
