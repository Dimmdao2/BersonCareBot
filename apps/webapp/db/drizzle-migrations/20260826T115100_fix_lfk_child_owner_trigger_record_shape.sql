-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- The shared trigger runs for three child tables with different row shapes. Referencing
-- NEW.media_url in a compound boolean still resolves that field for rows which do not have it.
-- Keep the media-only field access inside its own table-specific branch.
-- BCB-MIGRATION-VERIFY: SELECT position('IF TG_TABLE_NAME = ''lfk_exercise_media'' THEN' in pg_catalog.pg_get_functiondef('app.enforce_lfk_child_owner()'::regprocedure)) > 0 AND position('AND NEW.media_url' in pg_catalog.pg_get_functiondef('app.enforce_lfk_child_owner()'::regprocedure)) = 0
CREATE OR REPLACE FUNCTION app.enforce_lfk_child_owner() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  parent_kind text;
  parent_org uuid;
  media_kind text;
  media_org uuid;
  media_id uuid;
BEGIN
  IF TG_TABLE_NAME IN ('lfk_exercise_regions', 'lfk_exercise_media') THEN
    SELECT owner_kind, organization_id
      INTO parent_kind, parent_org
      FROM public.lfk_exercises
     WHERE id = NEW.exercise_id;
  ELSE
    SELECT owner_kind, organization_id
      INTO parent_kind, parent_org
      FROM public.lfk_complex_templates
     WHERE id = NEW.template_id;
  END IF;

  IF parent_kind IS NULL
     OR parent_kind IS DISTINCT FROM NEW.owner_kind
     OR parent_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'lfk_child_owner_mismatch' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'lfk_complex_template_exercises' THEN
    SELECT owner_kind, organization_id
      INTO media_kind, media_org
      FROM public.lfk_exercises
     WHERE id = NEW.exercise_id;
    IF media_kind IS NULL
       OR (
         NEW.owner_kind = 'platform'
         AND (media_kind IS DISTINCT FROM 'platform' OR media_org IS NOT NULL)
       )
       OR (
         NEW.owner_kind = 'organization'
         AND NOT (
           (media_kind = 'organization' AND media_org IS NOT DISTINCT FROM NEW.organization_id)
           OR (media_kind = 'platform' AND media_org IS NULL)
         )
       ) THEN
      RAISE EXCEPTION 'lfk_template_exercise_owner_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'lfk_exercise_media' THEN
    IF NEW.media_url ~ '^/api/media/[0-9a-fA-F-]{36}$' THEN
      media_id := substring(NEW.media_url FROM '^/api/media/([0-9a-fA-F-]{36})$')::uuid;
      SELECT owner_kind, organization_id
        INTO media_kind, media_org
        FROM public.media_files
       WHERE id = media_id;
      IF media_kind IS NULL
         OR media_kind IS DISTINCT FROM NEW.owner_kind
         OR media_org IS DISTINCT FROM NEW.organization_id THEN
        RAISE EXCEPTION 'lfk_media_owner_mismatch' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$_$;
