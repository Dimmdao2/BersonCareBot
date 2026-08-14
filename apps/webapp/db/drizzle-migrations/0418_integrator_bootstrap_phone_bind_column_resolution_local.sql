-- BCB-MIGRATION-OWNER: app_seam_phone_binding_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Compile-time PL/pgSQL name resolution. Output column `platform_user_id` intentionally shares a
-- name with relation columns; all actual local variables carry the unambiguous `v_` prefix.

DO $migration$
DECLARE
  v_definition text;
  v_patched_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)'::regprocedure
  ) INTO v_definition;

  v_definition := replace(
    v_definition,
    E' SET "plpgsql.variable_conflict" TO ''use_column''\n',
    ''
  );

  IF position('#variable_conflict use_column' in v_definition) > 0 THEN
    RETURN;
  END IF;

  v_patched_definition := replace(
    v_definition,
    E'AS $function$\nDECLARE',
    E'AS $function$\n#variable_conflict use_column\nDECLARE'
  );
  IF v_patched_definition = v_definition THEN
    RAISE EXCEPTION 'integrator_bootstrap_phone_bind_definition_anchor_missing';
  END IF;

  EXECUTE v_patched_definition;
END
$migration$;
