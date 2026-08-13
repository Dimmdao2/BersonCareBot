-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- PostgreSQL treats COALESCE as SQL syntax, not as a schema-qualified function. Migration 0399
-- accidentally emitted pg_catalog.coalesce in the archive seam, so the function compiled but
-- failed only when the outgoing-delivery branch executed. Repair the already-installed body
-- without duplicating the large function definition; fail loudly if its expected shape drifted.
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
    'pg_catalog\.coalesce'
  );

  IF invalid_qualifier_count = 0 THEN
    RETURN;
  END IF;

  IF invalid_qualifier_count <> 2 THEN
    RAISE EXCEPTION
      'unexpected archive seam definition: expected 2 pg_catalog.coalesce occurrences, found %',
      invalid_qualifier_count;
  END IF;

  EXECUTE pg_catalog.replace(function_definition, 'pg_catalog.coalesce', 'COALESCE');
END
$migration$;
