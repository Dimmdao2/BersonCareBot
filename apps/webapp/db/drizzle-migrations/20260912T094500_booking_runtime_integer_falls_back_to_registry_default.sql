-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_functiondef('app.read_current_patient_booking_runtime_integer(text)'::regprocedure) LIKE '%booking_max_consecutive_slot_hours%THEN%RETURN 3%' AND pg_catalog.pg_get_functiondef('app.read_current_patient_booking_runtime_integer(text)'::regprocedure) LIKE '%booking_min_notice_hours%THEN%RETURN 0%'
--
-- Live audit 2026-09-12: patient booking wizard bounced from the service step back to the
-- booking list for every organization without an explicit per-org `booking_max_consecutive_slot_hours`
-- row in `system_settings` (confirmed live: SQLSTATE 22023, "patient booking runtime integer is
-- unavailable: booking_max_consecutive_slot_hours", raised inside this function and silently
-- swallowed by the RSC caller into a generic redirect). The twin key `booking_min_notice_hours`
-- has the identical gap and would fail the same way once a caller reaches it (the sibling public
-- door `app.read_public_booking_slot_snapshot` already tolerates a missing row for both keys via
-- COALESCE — this definer-scoped door never got the equivalent fallback for these two).
-- `booking_availability_horizon_days` and `booking_prepayment_wait_minutes` already degrade to
-- their registry default when no row exists (BAH-01/F2); this closes the same gap for the other
-- two declared keys so all four match their `registry.ts` defaults. A stored-but-invalid value
-- still fails loud (ERRCODE 22023) below — only a genuinely missing row now takes the default.
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.read_current_patient_booking_runtime_integer(p_key text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_value text;
  v_result integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.patient-runtime-integer.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_current_patient_booking_runtime_integer(text)'::regprocedure);

  IF v_org IS NULL OR v_patient IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_key NOT IN (
    'booking_min_notice_hours',
    'booking_availability_horizon_days',
    'booking_max_consecutive_slot_hours',
    'booking_prepayment_wait_minutes'
  ) THEN
    RAISE EXCEPTION 'unsupported patient booking runtime integer: %', p_key
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT setting.value_json ->> 'value'
  INTO v_value
  FROM public.system_settings setting
  WHERE setting.key = p_key
    AND setting.scope = 'admin'
    AND (setting.organization_id = v_org OR setting.organization_id IS NULL)
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;

  IF v_value IS NULL AND p_key = 'booking_prepayment_wait_minutes' THEN
    RETURN 20;
  END IF;
  -- BAH-01/F2: клиника без per-org строки получает реестровый дефолт; сломанное сохранённое
  -- значение по-прежнему падает громко (ERRCODE 22023) ниже.
  IF v_value IS NULL AND p_key = 'booking_availability_horizon_days' THEN
    RETURN 30;
  END IF;
  -- Живой аудит 12.09: тот же класс BAH-01/F2 для двух оставшихся ключей — реестровые
  -- дефолты из registry.ts (booking_max_consecutive_slot_hours='3', booking_min_notice_hours='0'),
  -- иначе клиника без per-org строки получала громкий 22023 вместо шага записи.
  IF v_value IS NULL AND p_key = 'booking_max_consecutive_slot_hours' THEN
    RETURN 3;
  END IF;
  IF v_value IS NULL AND p_key = 'booking_min_notice_hours' THEN
    RETURN 0;
  END IF;
  IF v_value IS NULL OR v_value !~ '^\d+$' THEN
    RAISE EXCEPTION 'patient booking runtime integer is unavailable: %', p_key
      USING ERRCODE = '22023';
  END IF;
  v_result := v_value::integer;
  IF (p_key = 'booking_min_notice_hours' AND (v_result < 0 OR v_result > 168))
     OR (p_key = 'booking_availability_horizon_days' AND (v_result < 1 OR v_result > 92))
     OR (p_key = 'booking_max_consecutive_slot_hours' AND (v_result < 1 OR v_result > 24))
     OR (p_key = 'booking_prepayment_wait_minutes' AND (v_result < 1 OR v_result > 525600)) THEN
    RAISE EXCEPTION 'patient booking runtime integer is out of range: %', p_key
      USING ERRCODE = '22023';
  END IF;
  RETURN v_result;
END
$function$;
