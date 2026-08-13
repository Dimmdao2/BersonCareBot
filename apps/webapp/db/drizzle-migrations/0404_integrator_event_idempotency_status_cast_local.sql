-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- PL/pgSQL RETURN QUERY requires the table smallint status to match the public integer contract exactly.
CREATE OR REPLACE FUNCTION app.integrator_event_idempotency_read(p_key text)
RETURNS TABLE (request_hash text, status integer, response_body jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  RETURN QUERY
  SELECT stored.request_hash, stored.status::integer, stored.response_body
  FROM public.idempotency_keys AS stored
  WHERE stored.key = p_key
    AND stored.expires_at > now();
END
$function$;

REVOKE ALL ON FUNCTION app.integrator_event_idempotency_read(text) FROM PUBLIC;
