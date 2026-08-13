-- 0393: the table function returns a column named `code`, so PL/pgSQL treats
-- `ON CONFLICT (code)` as ambiguous between that output variable and the table column.
-- Name the existing unique constraint explicitly; behavior and capability surface stay unchanged.

-- BCB-MIGRATION-OWNER: app_seam_catalog_admin_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
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
  PERFORM app.require_attested_context_for_roles(
    'app_seam_catalog_admin_owner'::name,
    ARRAY['app_platform_settings'::name, 'app_staff'::name]::name[]
  );
  IF v_label IS NULL OR v_label = '' OR char_length(v_label) > 500 THEN
    RAISE EXCEPTION 'clinical_test_measure_kind_label_invalid' USING ERRCODE = '22023';
  END IF;

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
    ON CONFLICT ON CONSTRAINT clinical_test_measure_kinds_code_key DO NOTHING
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
