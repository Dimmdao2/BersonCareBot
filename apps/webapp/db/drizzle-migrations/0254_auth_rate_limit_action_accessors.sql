-- 0254: keep shared auth rate limiting database-backed for bootstrap and identity-self callers
-- without granting either runtime role direct access to public.auth_rate_limit_events.
--
-- app_owner bypasses RLS, so every accessor repeats the exact scope/key/time predicate of the
-- repository operation it replaces. Scope pruning also re-applies the repository's hard batch cap.

DO $auth_rate_limit_owner_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    GRANT SELECT, INSERT, DELETE ON TABLE public.auth_rate_limit_events TO app_owner;
  END IF;
END
$auth_rate_limit_owner_grants$;

CREATE OR REPLACE FUNCTION app.auth_rate_limit_prune_scope(
  p_scope text,
  p_cutoff timestamptz,
  p_batch_size integer
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_batch_size integer;
  v_row_count integer;
BEGIN
  v_batch_size := LEAST(1000, GREATEST(1, COALESCE(p_batch_size, 1)));

  WITH stale AS (
    SELECT event.ctid
    FROM public.auth_rate_limit_events AS event
    WHERE event.scope = p_scope
      AND event.occurred_at <= p_cutoff
    ORDER BY event.occurred_at
    LIMIT v_batch_size
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.auth_rate_limit_events AS event
  USING stale
  WHERE event.ctid = stale.ctid;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_rate_limit_prune_key(
  p_scope text,
  p_key text,
  p_cutoff timestamptz
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_row_count integer;
BEGIN
  DELETE FROM public.auth_rate_limit_events AS event
  WHERE event.scope = p_scope
    AND event.key = p_key
    AND event.occurred_at <= p_cutoff;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count;
END
$function$;

CREATE OR REPLACE FUNCTION app.auth_rate_limit_count(
  p_scope text,
  p_key text
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT count(*)::bigint
  FROM public.auth_rate_limit_events AS event
  WHERE event.scope = p_scope
    AND event.key = p_key
$function$;

CREATE OR REPLACE FUNCTION app.auth_rate_limit_record(
  p_scope text,
  p_key text
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  INSERT INTO public.auth_rate_limit_events (scope, key, occurred_at)
  VALUES (p_scope, p_key, now())
$function$;

DO $auth_rate_limit_accessor_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.auth_rate_limit_prune_scope(text, timestamptz, integer) OWNER TO app_owner;
    ALTER FUNCTION app.auth_rate_limit_prune_key(text, text, timestamptz) OWNER TO app_owner;
    ALTER FUNCTION app.auth_rate_limit_count(text, text) OWNER TO app_owner;
    ALTER FUNCTION app.auth_rate_limit_record(text, text) OWNER TO app_owner;
  END IF;
END
$auth_rate_limit_accessor_owner$;

REVOKE ALL ON FUNCTION app.auth_rate_limit_prune_scope(text, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_rate_limit_prune_key(text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_rate_limit_count(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_rate_limit_record(text, text) FROM PUBLIC;

DO $auth_rate_limit_patient_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.auth_rate_limit_prune_scope(text, timestamptz, integer) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.auth_rate_limit_prune_key(text, text, timestamptz) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.auth_rate_limit_count(text, text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.auth_rate_limit_record(text, text) TO app_patient;
  END IF;
END
$auth_rate_limit_patient_grants$;

COMMENT ON FUNCTION app.auth_rate_limit_prune_scope(text, timestamptz, integer) IS
  'Rate-limit maintenance: deletes at most 1000 rows for the exact supplied scope and cutoff.';
COMMENT ON FUNCTION app.auth_rate_limit_prune_key(text, text, timestamptz) IS
  'Sliding-window maintenance: deletes only the exact supplied scope/key rows at or before cutoff.';
COMMENT ON FUNCTION app.auth_rate_limit_count(text, text) IS
  'Sliding-window count: returns only the count for the exact supplied scope/key.';
COMMENT ON FUNCTION app.auth_rate_limit_record(text, text) IS
  'Sliding-window record: inserts one current-time event for the exact supplied scope/key.';
