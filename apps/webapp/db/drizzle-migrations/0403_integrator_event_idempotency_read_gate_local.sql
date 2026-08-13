-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Forward repair: exact pre-session roots use a PL/pgSQL body so the declaration reconciler can
-- install and verify the required gate as the first executable statement.
CREATE OR REPLACE FUNCTION app.integrator_event_idempotency_read(p_key text)
RETURNS TABLE (request_hash text, status integer, response_body jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  RETURN QUERY
  SELECT stored.request_hash, stored.status, stored.response_body
  FROM public.idempotency_keys AS stored
  WHERE stored.key = p_key
    AND stored.expires_at > now();
END
$function$;

REVOKE ALL ON FUNCTION app.integrator_event_idempotency_read(text) FROM PUBLIC;
