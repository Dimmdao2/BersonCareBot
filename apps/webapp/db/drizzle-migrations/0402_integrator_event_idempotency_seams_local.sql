-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- Signed integrator events need durable response idempotency before a human or tenant principal is known.
-- Keep the table definer-only: the webapp pre-session port receives two exact functions, never relation ACL.
CREATE OR REPLACE FUNCTION app.integrator_event_idempotency_read(p_key text)
RETURNS TABLE (request_hash text, status integer, response_body jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT stored.request_hash, stored.status, stored.response_body
  FROM public.idempotency_keys AS stored
  WHERE stored.key = p_key
    AND stored.expires_at > now()
$function$;

--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE OR REPLACE FUNCTION app.integrator_event_idempotency_store(
  p_key text,
  p_request_hash text,
  p_status integer,
  p_response_body text,
  p_ttl_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_row_count integer;
BEGIN
  IF p_ttl_seconds < 60 OR p_ttl_seconds > 604800 THEN
    RAISE EXCEPTION 'integrator_event_idempotency_ttl_out_of_range';
  END IF;

  INSERT INTO public.idempotency_keys AS stored (
    key, request_hash, status, response_body, expires_at
  ) VALUES (
    p_key, p_request_hash, p_status, p_response_body::jsonb,
    now() + p_ttl_seconds * interval '1 second'
  )
  ON CONFLICT (key) DO UPDATE SET
    request_hash = EXCLUDED.request_hash,
    status = EXCLUDED.status,
    response_body = EXCLUDED.response_body,
    expires_at = EXCLUDED.expires_at
  WHERE stored.expires_at < now() OR stored.request_hash = EXCLUDED.request_hash;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END
$function$;

REVOKE ALL ON FUNCTION app.integrator_event_idempotency_read(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.integrator_event_idempotency_store(text,text,integer,text,integer) FROM PUBLIC;
