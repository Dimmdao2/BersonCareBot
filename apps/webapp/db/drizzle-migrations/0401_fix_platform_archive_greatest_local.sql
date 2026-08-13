-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- GREATEST, like COALESCE, is SQL syntax and cannot be schema-qualified. Migration 0400 repaired
-- both COALESCE occurrences; this forward migration repairs the remaining live-only branch failure.
DO $migration$
DECLARE
  function_definition text;
  invalid_qualifier_count integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
           'app.archive_operator_health_failures(text,integer,uuid)'::pg_catalog.regprocedure
         )
    INTO function_definition;

  invalid_qualifier_count := pg_catalog.regexp_count(
    function_definition,
    'pg_catalog\.greatest'
  );

  IF invalid_qualifier_count = 0 THEN
    RETURN;
  END IF;

  IF invalid_qualifier_count <> 1 THEN
    RAISE EXCEPTION
      'unexpected archive seam definition: expected 1 pg_catalog.greatest occurrence, found %',
      invalid_qualifier_count;
  END IF;

  EXECUTE pg_catalog.replace(function_definition, 'pg_catalog.greatest', 'GREATEST');
END
$migration$;
