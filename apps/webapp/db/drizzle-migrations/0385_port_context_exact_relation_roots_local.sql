-- TEMPORARY LOCAL MIGRATION NUMBER 0385 — final number assigned at land, per AGENTS.md §1.
-- Revision-10 exact roots required before the atomic privilege reset/regrant.

-- The transaction-bound port contract replaces the legacy signed session-row
-- context completely. Retaining either installer would leave a second DB door.
DROP FUNCTION IF EXISTS app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text);
DROP FUNCTION IF EXISTS app.release_principal_context();
DROP FUNCTION IF EXISTS app.reset_principal_context();

-- `telegram_state.username` was a live display fact, not dialogue state. Preserve it on the
-- canonical channel binding before the phase-3 integrator drop chain removes identities/state.
ALTER TABLE public.user_channel_bindings
  ADD COLUMN IF NOT EXISTS display_handle text;

DO $carry_channel_display_handle$
DECLARE
  v_legacy_handles bigint;
  v_unmapped_handles bigint;
  v_carried_handles bigint;
BEGIN
  IF to_regclass('integrator.telegram_state') IS NULL THEN
    RAISE NOTICE '0385: integrator.telegram_state absent — canonical display_handle column installed; no legacy handle source remains.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_legacy_handles
    FROM integrator.telegram_state state
   WHERE NULLIF(regexp_replace(btrim(state.username), '^@+', ''), '') IS NOT NULL;

  IF v_legacy_handles = 0 THEN
    RAISE NOTICE '0385: telegram_state has no non-empty display handles to carry.';
    RETURN;
  END IF;

  IF to_regclass('integrator.identities') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = format('0385: cannot carry %s Telegram display handle(s): integrator.identities is absent', v_legacy_handles);
  END IF;

  SELECT count(*) INTO v_unmapped_handles
    FROM integrator.telegram_state state
    JOIN integrator.identities identity ON identity.id = state.identity_id
    LEFT JOIN public.user_channel_bindings binding
      ON binding.channel_code = identity.resource
     AND binding.external_id = identity.external_id
   WHERE NULLIF(regexp_replace(btrim(state.username), '^@+', ''), '') IS NOT NULL
     AND (identity.resource <> 'telegram' OR binding.user_id IS NULL);

  IF v_unmapped_handles > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = format('0385: %s of %s Telegram display handle(s) have no exact canonical binding',
        v_unmapped_handles, v_legacy_handles);
  END IF;

  WITH carried AS (
    UPDATE public.user_channel_bindings binding
       SET display_handle = left(NULLIF(regexp_replace(btrim(state.username), '^@+', ''), ''), 32)
      FROM integrator.telegram_state state
      JOIN integrator.identities identity ON identity.id = state.identity_id
     WHERE identity.resource = 'telegram'
       AND binding.channel_code = identity.resource
       AND binding.external_id = identity.external_id
       AND NULLIF(regexp_replace(btrim(state.username), '^@+', ''), '') IS NOT NULL
       AND NULLIF(btrim(binding.display_handle), '') IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_carried_handles FROM carried;

  RAISE NOTICE '0385: preserved % legacy Telegram display handle(s); % canonical row(s) populated.',
    v_legacy_handles, v_carried_handles;
END
$carry_channel_display_handle$;

ALTER TABLE public.user_channel_bindings
  DROP CONSTRAINT IF EXISTS user_channel_bindings_display_handle_check;
ALTER TABLE public.user_channel_bindings
  ADD CONSTRAINT user_channel_bindings_display_handle_check
  CHECK (display_handle IS NULL OR (
    display_handle = btrim(display_handle)
    AND display_handle <> ''
    AND length(display_handle) <= 32
    AND display_handle !~ '^@'
  ));

COMMENT ON COLUMN public.user_channel_bindings.display_handle IS
  'Current channel-supplied public handle without a leading @; presentation adds @ where appropriate.';


CREATE OR REPLACE FUNCTION app.read_integrator_migration_ledger()
RETURNS TABLE(version text, applied_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, integrator, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_catalog_admin_owner', 'app_service', 'service', 'migration.ledger.read',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.read_integrator_migration_ledger()'::regprocedure
  );
  RETURN QUERY SELECT m.version, m.applied_at FROM integrator.schema_migrations m ORDER BY m.version;
END
$function$;

CREATE OR REPLACE FUNCTION app.read_patient_telegram_display_handle(p_platform_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE v_handle text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner', 'app_staff', 'staff', 'messaging.patient-telegram-handle.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_platform_user_id))::app.port_typed_arg
    ]), 'app.read_patient_telegram_display_handle(uuid)'::regprocedure
  );
  IF p_platform_user_id IS NULL OR app.current_org_id() IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.be_organization_members member
     WHERE member.platform_user_id = p_platform_user_id
       AND member.organization_id = app.current_org_id()
       AND member.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active organization patient required';
  END IF;
  SELECT binding.display_handle INTO v_handle
    FROM public.user_channel_bindings binding
   WHERE binding.user_id = p_platform_user_id
     AND binding.channel_code = 'telegram'
   LIMIT 1;
  RETURN v_handle;
END
$function$;

CREATE OR REPLACE FUNCTION app.try_acquire_integrator_idempotency(p_key text, p_ttl_seconds integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, integrator, pg_temp
AS $function$
DECLARE v_key text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner', 'app_service', 'service', 'integrator.idempotency.acquire',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_key))::app.port_typed_arg,
      ROW('integer@1', int4send(p_ttl_seconds))::app.port_typed_arg
    ]), 'app.try_acquire_integrator_idempotency(text,integer)'::regprocedure
  );
  IF p_key IS NULL OR btrim(p_key) = '' OR p_ttl_seconds IS NULL
     OR p_ttl_seconds < 1 OR p_ttl_seconds > 604800 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'bounded idempotency key and ttl required';
  END IF;
  INSERT INTO integrator.idempotency_keys AS target
    (key, request_hash, status, response_body, expires_at)
  VALUES (p_key, '__integrator_incoming_event__', 200, '{}'::jsonb,
    now() + p_ttl_seconds * interval '1 second')
  ON CONFLICT (key) DO UPDATE SET expires_at = EXCLUDED.expires_at,
    request_hash = EXCLUDED.request_hash, status = EXCLUDED.status, response_body = EXCLUDED.response_body
  WHERE target.expires_at < now()
  RETURNING key INTO v_key;
  RETURN v_key IS NOT NULL;
END
$function$;

CREATE OR REPLACE FUNCTION app.release_integrator_idempotency(p_key text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, integrator, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner', 'app_service', 'service', 'integrator.idempotency.release',
    app.hash_port_typed_args(ARRAY[ROW('text@1', textsend(p_key))::app.port_typed_arg]),
    'app.release_integrator_idempotency(text)'::regprocedure
  );
  DELETE FROM integrator.idempotency_keys WHERE key = p_key;
END
$function$;

CREATE OR REPLACE FUNCTION app.upsert_integration_data_quality_incident(
  p_integration text, p_entity text, p_external_id text, p_field text,
  p_raw_value text, p_timezone_used text, p_error_reason text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, integrator, pg_temp
AS $function$
DECLARE v_occurrences integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner', 'app_service', 'service', 'integrator.data-quality.upsert',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_integration))::app.port_typed_arg,
      ROW('text@1', textsend(p_entity))::app.port_typed_arg,
      ROW('text@1', textsend(p_external_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_field))::app.port_typed_arg,
      ROW('text@1', textsend(p_raw_value))::app.port_typed_arg,
      ROW('text@1', textsend(p_timezone_used))::app.port_typed_arg,
      ROW('text@1', textsend(p_error_reason))::app.port_typed_arg
    ]), 'app.upsert_integration_data_quality_incident(text,text,text,text,text,text,text)'::regprocedure
  );
  INSERT INTO integrator.integration_data_quality_incidents
    (integration, entity, external_id, field, raw_value, timezone_used, error_reason,
     status, first_seen_at, last_seen_at, occurrences)
  VALUES (p_integration, p_entity, p_external_id, p_field, p_raw_value, p_timezone_used,
    p_error_reason, 'open', now(), now(), 1)
  ON CONFLICT (integration, entity, external_id, field, error_reason) DO UPDATE SET
    last_seen_at = now(),
    occurrences = integrator.integration_data_quality_incidents.occurrences + 1,
    raw_value = COALESCE(EXCLUDED.raw_value, integrator.integration_data_quality_incidents.raw_value),
    timezone_used = COALESCE(EXCLUDED.timezone_used, integrator.integration_data_quality_incidents.timezone_used)
  RETURNING occurrences INTO v_occurrences;
  RETURN v_occurrences;
END
$function$;

CREATE OR REPLACE FUNCTION app.get_google_calendar_event_id(p_appointment_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE v_event_id text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_tenant_service', 'tenant_service', 'calendar.map.get',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_appointment_id))::app.port_typed_arg]),
    'app.get_google_calendar_event_id(uuid)'::regprocedure
  );
  IF NOT EXISTS (SELECT 1 FROM public.be_appointments a WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'appointment organization required';
  END IF;
  SELECT m.gcal_event_id INTO v_event_id FROM public.booking_calendar_map m
   WHERE m.appointment_key = 'be:' || p_appointment_id::text;
  RETURN v_event_id;
END
$function$;

CREATE OR REPLACE FUNCTION app.upsert_google_calendar_event_id(p_appointment_id uuid, p_event_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_tenant_service', 'tenant_service', 'calendar.map.upsert',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_appointment_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_event_id))::app.port_typed_arg
    ]), 'app.upsert_google_calendar_event_id(uuid,text)'::regprocedure
  );
  IF p_event_id IS NULL OR btrim(p_event_id) = '' OR NOT EXISTS (
    SELECT 1 FROM public.be_appointments a WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()
  ) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'appointment organization and event id required'; END IF;
  INSERT INTO public.booking_calendar_map(appointment_key, gcal_event_id)
  VALUES ('be:' || p_appointment_id::text, p_event_id)
  ON CONFLICT (appointment_key) DO UPDATE SET gcal_event_id = EXCLUDED.gcal_event_id, updated_at = now();
  UPDATE public.patient_bookings SET gcal_event_id = p_event_id, updated_at = now()
   WHERE canonical_appointment_id = p_appointment_id AND organization_id = app.current_org_id();
END
$function$;

CREATE OR REPLACE FUNCTION app.delete_google_calendar_event_id(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_tenant_service', 'tenant_service', 'calendar.map.delete',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_appointment_id))::app.port_typed_arg]),
    'app.delete_google_calendar_event_id(uuid)'::regprocedure
  );
  IF NOT EXISTS (SELECT 1 FROM public.be_appointments a WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'appointment organization required';
  END IF;
  DELETE FROM public.booking_calendar_map WHERE appointment_key = 'be:' || p_appointment_id::text;
  UPDATE public.patient_bookings SET gcal_event_id = NULL, updated_at = now()
   WHERE canonical_appointment_id = p_appointment_id AND organization_id = app.current_org_id();
END
$function$;

CREATE OR REPLACE FUNCTION app.read_booking_calendar_patient_profile(p_appointment_id uuid)
RETURNS TABLE(is_problematic boolean, problematic_note text)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_tenant_service', 'tenant_service', 'calendar.patient-profile.read',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_appointment_id))::app.port_typed_arg]),
    'app.read_booking_calendar_patient_profile(uuid)'::regprocedure
  );
  RETURN QUERY SELECT p.is_problematic, p.problematic_note
    FROM public.be_appointments a
    JOIN public.be_patient_booking_profiles p
      ON p.organization_id = a.organization_id AND p.platform_user_id = a.platform_user_id
   WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id();
END
$function$;

CREATE OR REPLACE FUNCTION app.read_booking_calendar_latest_staff_comment(p_appointment_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE v_body text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_tenant_service', 'tenant_service', 'calendar.staff-comment.read',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_appointment_id))::app.port_typed_arg]),
    'app.read_booking_calendar_latest_staff_comment(uuid)'::regprocedure
  );
  SELECT c.body INTO v_body FROM public.be_appointments a
    JOIN public.be_appointment_staff_comments c
      ON c.appointment_id = a.id AND c.organization_id = a.organization_id
   WHERE a.id = p_appointment_id AND a.organization_id = app.current_org_id()
   ORDER BY c.created_at DESC LIMIT 1;
  RETURN v_body;
END
$function$;

CREATE OR REPLACE FUNCTION app.is_current_patient_self_booking_allowed()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner', 'app_patient', 'patient', 'booking.self.allowed',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.is_current_patient_self_booking_allowed()'::regprocedure
  );
  RETURN NOT EXISTS (
    SELECT 1 FROM public.be_patient_booking_profiles p
     WHERE p.organization_id = app.current_org_id()
       AND p.platform_user_id = app.current_patient_user_id()
       AND p.booking_blocked
  );
END
$function$;

DO $ownership$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('app.read_integrator_migration_ledger()', 'app_seam_catalog_admin_owner'),
    ('app.read_patient_telegram_display_handle(uuid)', 'app_seam_delivery_scope_owner'),
    ('app.try_acquire_integrator_idempotency(text,integer)', 'app_seam_delivery_scope_owner'),
    ('app.release_integrator_idempotency(text)', 'app_seam_delivery_scope_owner'),
    ('app.upsert_integration_data_quality_incident(text,text,text,text,text,text,text)', 'app_seam_delivery_scope_owner'),
    ('app.get_google_calendar_event_id(uuid)', 'app_seam_patient_booking_owner'),
    ('app.upsert_google_calendar_event_id(uuid,text)', 'app_seam_patient_booking_owner'),
    ('app.delete_google_calendar_event_id(uuid)', 'app_seam_patient_booking_owner'),
    ('app.read_booking_calendar_patient_profile(uuid)', 'app_seam_patient_booking_owner'),
    ('app.read_booking_calendar_latest_staff_comment(uuid)', 'app_seam_patient_booking_owner'),
    ('app.is_current_patient_self_booking_allowed()', 'app_seam_patient_booking_owner')
  ) AS rows(signature, owner_name) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', item.signature);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = item.owner_name) THEN
      EXECUTE format('ALTER FUNCTION %s OWNER TO %I', item.signature, item.owner_name);
    END IF;
  END LOOP;
END
$ownership$;
