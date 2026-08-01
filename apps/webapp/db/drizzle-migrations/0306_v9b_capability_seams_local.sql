-- TEMPORARY LOCAL MIGRATION NUMBER 0306
-- #1081 V9b S02: expand-only capability seams before S04 caller adoption and direct-grant contract.
-- This migration intentionally adds no table-grant REVOKE, RLS policy, ENABLE/FORCE RLS, or caller change.

-- The four catalog functions below run as the fixed definer and qualify every accessed relation.
-- S04 adopts callers first; only its contract migration may withdraw the existing direct table ACLs.
GRANT SELECT ON TABLE public.booking_cities, public.clinical_test_measure_kinds TO app_owner;
GRANT INSERT, UPDATE ON TABLE public.clinical_test_measure_kinds TO app_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE public.email_send_cooldowns TO app_owner;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.list_active_booking_cities()
RETURNS TABLE (id uuid, code text, title text, sort_order integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT city.id, city.code, city.title, city.sort_order
  FROM public.booking_cities AS city
  WHERE city.is_active = true
  ORDER BY city.sort_order, city.title, city.code
$function$;

CREATE OR REPLACE FUNCTION app.list_clinical_test_measure_kinds()
RETURNS TABLE (id uuid, code text, label text, sort_order integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT measure_kind.id, measure_kind.code, measure_kind.label, measure_kind.sort_order
  FROM public.clinical_test_measure_kinds AS measure_kind
  ORDER BY measure_kind.sort_order, measure_kind.label
$function$;

CREATE OR REPLACE FUNCTION app.upsert_clinical_test_measure_kind_by_label(p_label text)
RETURNS TABLE (id uuid, code text, label text, sort_order integer, created boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_label text := btrim(p_label);
  v_code text;
BEGIN
  IF v_label IS NULL OR v_label = '' OR char_length(v_label) > 500 THEN
    RAISE EXCEPTION 'clinical_test_measure_kind_label_invalid' USING ERRCODE = '22023';
  END IF;

  -- This is the SQL capability counterpart of the existing label-derived global catalog key.
  v_code := left(
    regexp_replace(lower(v_label), '[^[:alnum:]]+', '-', 'g'),
    80
  );
  v_code := regexp_replace(v_code, '(^-+|-+$)', '', 'g');
  IF v_code = '' THEN
    v_code := 'kind-' || substring(gen_random_uuid()::text FROM 1 FOR 8);
  END IF;

  LOOP
    RETURN QUERY
    INSERT INTO public.clinical_test_measure_kinds AS measure_kind (code, label, sort_order)
    VALUES (v_code, v_label, 0)
    ON CONFLICT (code) DO NOTHING
    RETURNING measure_kind.id, measure_kind.code, measure_kind.label, measure_kind.sort_order, true;
    IF FOUND THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT measure_kind.id, measure_kind.code, measure_kind.label, measure_kind.sort_order, false
    FROM public.clinical_test_measure_kinds AS measure_kind
    WHERE measure_kind.code = v_code;
    IF FOUND THEN
      RETURN;
    END IF;
  END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION app.save_clinical_test_measure_kinds(p_items jsonb)
RETURNS TABLE (id uuid, code text, label text, sort_order integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_expected_count integer;
  v_input_count integer;
  v_distinct_count integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'clinical_test_measure_kinds_items_array_required' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_expected_count
  FROM public.clinical_test_measure_kinds;

  SELECT count(*)::integer, count(DISTINCT item.id)::integer
  INTO v_input_count, v_distinct_count
  FROM jsonb_to_recordset(p_items) AS item(id uuid, label text, sort_order integer);

  IF v_input_count <> v_expected_count OR v_distinct_count <> v_input_count
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_items) AS item(id uuid, label text, sort_order integer)
       WHERE item.label IS NULL OR btrim(item.label) = '' OR char_length(btrim(item.label)) > 500
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_items) AS item(id uuid, label text, sort_order integer)
       LEFT JOIN public.clinical_test_measure_kinds AS measure_kind ON measure_kind.id = item.id
       WHERE measure_kind.id IS NULL
     )
  THEN
    RAISE EXCEPTION 'clinical_test_measure_kinds_snapshot_invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clinical_test_measure_kinds AS measure_kind
  SET label = btrim(item.label),
      sort_order = item.sort_order
  FROM jsonb_to_recordset(p_items) AS item(id uuid, label text, sort_order integer)
  WHERE measure_kind.id = item.id;

  RETURN QUERY
  SELECT measure_kind.id, measure_kind.code, measure_kind.label, measure_kind.sort_order
  FROM public.clinical_test_measure_kinds AS measure_kind
  ORDER BY measure_kind.sort_order, measure_kind.label;
END
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.read_reminder_transactional_email_cooldown(p_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT cooldown.last_sent_at
  FROM public.email_send_cooldowns AS cooldown
  WHERE cooldown.user_id = p_user_id
    AND cooldown.email_normalized = '!reminder_txn_v1'
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION app.record_reminder_transactional_email_cooldown(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'reminder_transactional_email_cooldown_user_required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.email_send_cooldowns AS cooldown (user_id, email_normalized, last_sent_at)
  VALUES (p_user_id, '!reminder_txn_v1', statement_timestamp())
  ON CONFLICT (user_id, email_normalized) DO UPDATE
  SET last_sent_at = EXCLUDED.last_sent_at;
END
$function$;
--> statement-breakpoint

ALTER FUNCTION app.list_active_booking_cities() OWNER TO app_owner;
ALTER FUNCTION app.list_clinical_test_measure_kinds() OWNER TO app_owner;
ALTER FUNCTION app.upsert_clinical_test_measure_kind_by_label(text) OWNER TO app_owner;
ALTER FUNCTION app.save_clinical_test_measure_kinds(jsonb) OWNER TO app_owner;
ALTER FUNCTION app.read_reminder_transactional_email_cooldown(uuid) OWNER TO app_owner;
ALTER FUNCTION app.record_reminder_transactional_email_cooldown(uuid) OWNER TO app_owner;

REVOKE ALL ON FUNCTION app.list_active_booking_cities() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.list_clinical_test_measure_kinds() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.upsert_clinical_test_measure_kind_by_label(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.save_clinical_test_measure_kinds(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_reminder_transactional_email_cooldown(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_reminder_transactional_email_cooldown(uuid) FROM PUBLIC;

DO $v9b_s02_catalog_execute$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.list_active_booking_cities() TO app_patient;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    GRANT EXECUTE ON FUNCTION app.list_active_booking_cities() TO app_staff;
    GRANT EXECUTE ON FUNCTION app.list_clinical_test_measure_kinds() TO app_staff;
    GRANT EXECUTE ON FUNCTION app.upsert_clinical_test_measure_kind_by_label(text) TO app_staff;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform_settings') THEN
    GRANT EXECUTE ON FUNCTION app.list_clinical_test_measure_kinds() TO app_platform_settings;
    GRANT EXECUTE ON FUNCTION app.upsert_clinical_test_measure_kind_by_label(text) TO app_platform_settings;
    GRANT EXECUTE ON FUNCTION app.save_clinical_test_measure_kinds(jsonb) TO app_platform_settings;
  END IF;
END
$v9b_s02_catalog_execute$;
--> statement-breakpoint

-- Existing C4 operational roles are the only runtime capability recipients here. They already
-- have no tenant membership; S04 adopts their callers before it contracts legacy staff ACLs.
DO $v9b_s02_operational_acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_operational_delivery_worker') THEN
    GRANT SELECT, UPDATE ON TABLE public.integrator_push_outbox
      TO app_operational_delivery_worker;
    GRANT EXECUTE ON FUNCTION app.read_reminder_transactional_email_cooldown(uuid)
      TO app_operational_delivery_worker;
    GRANT EXECUTE ON FUNCTION app.record_reminder_transactional_email_cooldown(uuid)
      TO app_operational_delivery_worker;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_operational_media_worker') THEN
    GRANT SELECT, DELETE ON TABLE public.media_playback_stats_hourly
      TO app_operational_media_worker;
  END IF;
END
$v9b_s02_operational_acl$;
