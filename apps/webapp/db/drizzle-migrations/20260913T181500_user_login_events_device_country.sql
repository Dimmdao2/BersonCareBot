-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.append_user_login_event(uuid,text,text,text,text,text,text,text,text,text,text,text)') IS NOT NULL AND (SELECT count(*) = 2 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.user_login_events'::regclass AND attname IN ('device_id', 'country') AND NOT attisdropped)
ALTER TABLE public.user_login_events
  ADD COLUMN device_id text,
  ADD COLUMN country text;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX idx_user_login_events_device_occurred
  ON public.user_login_events USING btree (device_id, occurred_at DESC)
  WHERE device_id IS NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
DROP FUNCTION IF EXISTS app.append_user_login_event(uuid,text,text,text,text,text,text,text,text,text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.append_user_login_event(
  p_user_id uuid,
  p_method text,
  p_role text,
  p_ip text,
  p_user_agent text,
  p_device_kind text,
  p_os text,
  p_browser text,
  p_host text,
  p_session_ref text,
  p_device_id text,
  p_country text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app, app_ext, pg_temp
AS $function$
DECLARE
  inserted_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'auth.user-login-event.append',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_user_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_method))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_role))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_ip))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_user_agent))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_device_kind))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_os))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_browser))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_host))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_session_ref))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_device_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_country))::app.port_typed_arg
    ]),
    'app.append_user_login_event(uuid,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure
  );

  -- Метка устройства и страна приходят СНАРУЖИ, но форму им задаёт дверь: метка — ровно 32 знака
  -- шестнадцатеричного алфавита (её выдаёт приложение и никто её не вводит руками), страна — две
  -- заглавные латинские буквы кода страны. Мусор в этих колонках сделал бы разбор взлома
  -- недостоверным, поэтому он отказывается здесь, а не «отфильтруется потом на экране».
  IF p_user_id IS NULL
    OR p_method IS NULL
    OR pg_catalog.btrim(p_method) = ''
    OR p_role IS NULL
    OR p_role NOT IN ('client', 'doctor', 'admin')
    OR p_session_ref IS NULL
    OR pg_catalog.btrim(p_session_ref) = ''
    OR pg_catalog.length(p_method) > 100
    OR pg_catalog.length(p_role) > 100
    OR pg_catalog.length(p_user_agent) > 8192
    OR pg_catalog.length(p_device_kind) > 100
    OR pg_catalog.length(p_os) > 200
    OR pg_catalog.length(p_browser) > 200
    OR pg_catalog.length(p_host) > 500
    OR pg_catalog.length(p_session_ref) > 200
    OR (p_device_id IS NOT NULL AND p_device_id !~ '^[0-9a-f]{32}$')
    OR (p_country IS NOT NULL AND p_country !~ '^[A-Z]{2}$')
  THEN
    RAISE EXCEPTION 'invalid user login event'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.user_login_events (
    user_id,
    occurred_at,
    outcome,
    failure_reason,
    method,
    role,
    ip,
    user_agent,
    device_kind,
    os,
    browser,
    host,
    session_ref,
    device_id,
    country
  ) VALUES (
    p_user_id,
    now(),
    'success',
    NULL,
    pg_catalog.btrim(p_method),
    p_role,
    NULLIF(pg_catalog.btrim(p_ip), '')::inet,
    p_user_agent,
    p_device_kind,
    p_os,
    p_browser,
    p_host,
    p_session_ref,
    p_device_id,
    p_country
  )
  RETURNING id INTO inserted_id;

  RETURN inserted_id;
END
$function$;
