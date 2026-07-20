-- C4D: explicit tagged ownership for the private clinic library and the platform base library.
-- NULL organization_id is never interpreted by itself: owner_kind is mandatory and CHECK-bound.

ALTER TABLE public.lfk_exercises ADD COLUMN IF NOT EXISTS owner_kind text NOT NULL DEFAULT 'organization';
ALTER TABLE public.lfk_exercise_regions ADD COLUMN IF NOT EXISTS owner_kind text NOT NULL DEFAULT 'organization';
ALTER TABLE public.lfk_exercise_media ADD COLUMN IF NOT EXISTS owner_kind text NOT NULL DEFAULT 'organization';
ALTER TABLE public.lfk_complex_templates ADD COLUMN IF NOT EXISTS owner_kind text NOT NULL DEFAULT 'organization';
ALTER TABLE public.lfk_complex_template_exercises ADD COLUMN IF NOT EXISTS owner_kind text NOT NULL DEFAULT 'organization';
ALTER TABLE public.media_files ADD COLUMN IF NOT EXISTS owner_kind text NOT NULL DEFAULT 'organization';

DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lfk_exercises WHERE organization_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.lfk_exercise_regions WHERE organization_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.lfk_exercise_media WHERE organization_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.lfk_complex_templates WHERE organization_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.lfk_complex_template_exercises WHERE organization_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.media_files WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'C4D.0217 legacy NULL owner rows require explicit organization reconciliation; they are never promoted to platform automatically';
  END IF;
END;
$preflight$;

ALTER TABLE public.lfk_exercises
  ADD CONSTRAINT lfk_exercises_owner_check CHECK (
    (owner_kind = 'organization' AND organization_id IS NOT NULL)
    OR (owner_kind = 'platform' AND organization_id IS NULL)
  );
ALTER TABLE public.lfk_exercise_regions
  ADD CONSTRAINT lfk_exercise_regions_owner_check CHECK (
    (owner_kind = 'organization' AND organization_id IS NOT NULL)
    OR (owner_kind = 'platform' AND organization_id IS NULL)
  );
ALTER TABLE public.lfk_exercise_media
  ADD CONSTRAINT lfk_exercise_media_owner_check CHECK (
    (owner_kind = 'organization' AND organization_id IS NOT NULL)
    OR (owner_kind = 'platform' AND organization_id IS NULL)
  );
ALTER TABLE public.lfk_complex_templates
  ADD CONSTRAINT lfk_complex_templates_owner_check CHECK (
    (owner_kind = 'organization' AND organization_id IS NOT NULL)
    OR (owner_kind = 'platform' AND organization_id IS NULL)
  );
ALTER TABLE public.lfk_complex_template_exercises
  ADD CONSTRAINT lfk_complex_template_exercises_owner_check CHECK (
    (owner_kind = 'organization' AND organization_id IS NOT NULL)
    OR (owner_kind = 'platform' AND organization_id IS NULL)
  );
ALTER TABLE public.media_files
  ADD CONSTRAINT media_files_owner_check CHECK (
    (owner_kind = 'organization' AND organization_id IS NOT NULL)
    OR (owner_kind = 'platform' AND organization_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_lfk_exercises_owner
  ON public.lfk_exercises (owner_kind, organization_id, is_archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lfk_complex_templates_owner
  ON public.lfk_complex_templates (owner_kind, organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lfk_exercise_media_owner
  ON public.lfk_exercise_media (owner_kind, organization_id, exercise_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_media_files_owner
  ON public.media_files (owner_kind, organization_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION app.enforce_lfk_child_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
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

  IF TG_TABLE_NAME = 'lfk_exercise_media'
     AND NEW.media_url ~ '^/api/media/[0-9a-fA-F-]{36}$' THEN
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

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS lfk_exercise_regions_owner_guard ON public.lfk_exercise_regions;
CREATE TRIGGER lfk_exercise_regions_owner_guard
BEFORE INSERT OR UPDATE OF owner_kind, organization_id, exercise_id
ON public.lfk_exercise_regions FOR EACH ROW EXECUTE FUNCTION app.enforce_lfk_child_owner();

DROP TRIGGER IF EXISTS lfk_exercise_media_owner_guard ON public.lfk_exercise_media;
CREATE TRIGGER lfk_exercise_media_owner_guard
BEFORE INSERT OR UPDATE OF owner_kind, organization_id, exercise_id, media_url
ON public.lfk_exercise_media FOR EACH ROW EXECUTE FUNCTION app.enforce_lfk_child_owner();

DROP TRIGGER IF EXISTS lfk_complex_template_exercises_owner_guard ON public.lfk_complex_template_exercises;
CREATE TRIGGER lfk_complex_template_exercises_owner_guard
BEFORE INSERT OR UPDATE OF owner_kind, organization_id, template_id, exercise_id
ON public.lfk_complex_template_exercises FOR EACH ROW EXECUTE FUNCTION app.enforce_lfk_child_owner();

-- Platform rows are non-clinical catalog data. RLS may expose them for application reads; the
-- exercise_catalog entitlement remains an application/API gate and never replaces tenant auth.
DROP POLICY IF EXISTS c4d_platform_library_read ON public.lfk_exercises;
CREATE POLICY c4d_platform_library_read ON public.lfk_exercises
  FOR SELECT USING (owner_kind = 'platform' AND organization_id IS NULL);
DROP POLICY IF EXISTS c4d_platform_library_read ON public.lfk_exercise_regions;
CREATE POLICY c4d_platform_library_read ON public.lfk_exercise_regions
  FOR SELECT USING (owner_kind = 'platform' AND organization_id IS NULL);
DROP POLICY IF EXISTS c4d_platform_library_read ON public.lfk_exercise_media;
CREATE POLICY c4d_platform_library_read ON public.lfk_exercise_media
  FOR SELECT USING (owner_kind = 'platform' AND organization_id IS NULL);
DROP POLICY IF EXISTS c4d_platform_library_read ON public.lfk_complex_templates;
CREATE POLICY c4d_platform_library_read ON public.lfk_complex_templates
  FOR SELECT USING (owner_kind = 'platform' AND organization_id IS NULL);
DROP POLICY IF EXISTS c4d_platform_library_read ON public.lfk_complex_template_exercises;
CREATE POLICY c4d_platform_library_read ON public.lfk_complex_template_exercises
  FOR SELECT USING (owner_kind = 'platform' AND organization_id IS NULL);
DROP POLICY IF EXISTS c4d_platform_library_read ON public.media_files;
CREATE POLICY c4d_platform_library_read ON public.media_files
  FOR SELECT USING (owner_kind = 'platform' AND organization_id IS NULL);

COMMENT ON COLUMN public.lfk_exercises.owner_kind IS
  'Explicit C4D ownership discriminator: organization requires organization_id; platform requires NULL organization_id.';
COMMENT ON COLUMN public.media_files.owner_kind IS
  'Explicit C4D ownership discriminator; NULL organization_id never implies platform without owner_kind=platform.';

-- Bounded platform-operator API. Application capability checks remain mandatory; these functions
-- only constrain the mutation target to owner_kind=platform and record an immutable audit row.
CREATE OR REPLACE FUNCTION app.c4d_platform_lfk_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'exercises', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'description', e.description,
        'isArchived', e.is_archived,
        'media', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'url', em.media_url,
            'type', em.media_type,
            'sortOrder', em.sort_order
          ) ORDER BY em.sort_order, em.id)
          FROM public.lfk_exercise_media em
          WHERE em.exercise_id = e.id
            AND em.owner_kind = 'platform'
            AND em.organization_id IS NULL
        ), '[]'::jsonb)
      ) ORDER BY e.updated_at DESC, e.id)
      FROM public.lfk_exercises e
      WHERE e.owner_kind = 'platform' AND e.organization_id IS NULL
    ), '[]'::jsonb),
    'templates', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'description', t.description,
        'status', t.status,
        'exerciseIds', COALESCE((
          SELECT jsonb_agg(te.exercise_id ORDER BY te.sort_order, te.id)
          FROM public.lfk_complex_template_exercises te
          WHERE te.template_id = t.id
            AND te.owner_kind = 'platform'
            AND te.organization_id IS NULL
        ), '[]'::jsonb)
      ) ORDER BY t.updated_at DESC, t.id)
      FROM public.lfk_complex_templates t
      WHERE t.owner_kind = 'platform' AND t.organization_id IS NULL
    ), '[]'::jsonb)
  );
$function$;

CREATE OR REPLACE FUNCTION app.c4d_platform_lfk_save_exercise(p_actor uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  target_id uuid;
  title_value text;
  media_value jsonb;
  region_value jsonb;
BEGIN
  title_value := btrim(COALESCE(p_payload->>'title', ''));
  IF title_value = '' THEN
    RAISE EXCEPTION 'platform_lfk_title_required' USING ERRCODE = '22023';
  END IF;
  target_id := CASE
    WHEN COALESCE(p_payload->>'id', '') = '' THEN gen_random_uuid()
    ELSE (p_payload->>'id')::uuid
  END;

  INSERT INTO public.lfk_exercises (
    id, owner_kind, organization_id, title, description, load_type,
    difficulty_1_10, contraindications, tags, created_by, is_archived, updated_at
  ) VALUES (
    target_id, 'platform', NULL, title_value, NULLIF(btrim(p_payload->>'description'), ''),
    NULLIF(btrim(p_payload->>'loadType'), ''),
    CASE WHEN COALESCE(p_payload->>'difficulty1_10', '') = '' THEN NULL ELSE (p_payload->>'difficulty1_10')::integer END,
    NULLIF(btrim(p_payload->>'contraindications'), ''),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'tags', '[]'::jsonb))),
    p_actor, false, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    load_type = EXCLUDED.load_type,
    difficulty_1_10 = EXCLUDED.difficulty_1_10,
    contraindications = EXCLUDED.contraindications,
    tags = EXCLUDED.tags,
    updated_at = now()
  WHERE public.lfk_exercises.owner_kind = 'platform'
    AND public.lfk_exercises.organization_id IS NULL;

  IF NOT EXISTS (
    SELECT 1 FROM public.lfk_exercises e
    WHERE e.id = target_id AND e.owner_kind = 'platform' AND e.organization_id IS NULL
  ) THEN
    RAISE EXCEPTION 'platform_lfk_owner_mismatch' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.lfk_exercise_regions
   WHERE exercise_id = target_id AND owner_kind = 'platform' AND organization_id IS NULL;
  region_value := COALESCE(p_payload->'regionRefIds', '[]'::jsonb);
  INSERT INTO public.lfk_exercise_regions (owner_kind, organization_id, exercise_id, region_ref_id)
  SELECT 'platform', NULL, target_id, value::text::uuid
    FROM jsonb_array_elements_text(region_value);
  UPDATE public.lfk_exercises
     SET region_ref_id = (SELECT value::text::uuid FROM jsonb_array_elements_text(region_value) LIMIT 1)
   WHERE id = target_id AND owner_kind = 'platform' AND organization_id IS NULL;

  DELETE FROM public.lfk_exercise_media
   WHERE exercise_id = target_id AND owner_kind = 'platform' AND organization_id IS NULL;
  media_value := COALESCE(p_payload->'media', '[]'::jsonb);
  INSERT INTO public.lfk_exercise_media (
    owner_kind, organization_id, exercise_id, media_url, media_type, sort_order
  )
  SELECT 'platform', NULL, target_id, x.url, x.media_type, x.sort_order
    FROM jsonb_to_recordset(media_value) AS x(url text, media_type text, sort_order integer)
   WHERE NULLIF(btrim(x.url), '') IS NOT NULL
     AND x.media_type IN ('image', 'video', 'gif');

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, target_id, details, status
  ) VALUES (
    NULL, p_actor, 'platform_lfk_exercise_save', target_id::text,
    jsonb_build_object('ownerKind', 'platform', 'mediaCount', jsonb_array_length(media_value)), 'ok'
  );
  RETURN target_id;
END;
$function$;

CREATE OR REPLACE FUNCTION app.c4d_platform_lfk_archive_exercise(p_actor uuid, p_id uuid, p_archived boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  touched boolean;
BEGIN
  UPDATE public.lfk_exercises
     SET is_archived = p_archived, updated_at = now()
   WHERE id = p_id AND owner_kind = 'platform' AND organization_id IS NULL
  RETURNING true INTO touched;
  IF COALESCE(touched, false) THEN
    INSERT INTO public.admin_audit_log (organization_id, actor_id, action, target_id, details, status)
    VALUES (NULL, p_actor, 'platform_lfk_exercise_archive', p_id::text,
      jsonb_build_object('ownerKind', 'platform', 'archived', p_archived), 'ok');
  END IF;
  RETURN COALESCE(touched, false);
END;
$function$;

CREATE OR REPLACE FUNCTION app.c4d_platform_lfk_save_template(p_actor uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  target_id uuid;
  title_value text;
  exercise_value jsonb;
  expected_count integer;
  inserted_count integer;
BEGIN
  title_value := btrim(COALESCE(p_payload->>'title', ''));
  IF title_value = '' THEN
    RAISE EXCEPTION 'platform_lfk_template_title_required' USING ERRCODE = '22023';
  END IF;
  target_id := CASE
    WHEN COALESCE(p_payload->>'id', '') = '' THEN gen_random_uuid()
    ELSE (p_payload->>'id')::uuid
  END;

  INSERT INTO public.lfk_complex_templates (
    id, owner_kind, organization_id, title, description, status, created_by, updated_at
  ) VALUES (
    target_id, 'platform', NULL, title_value, NULLIF(btrim(p_payload->>'description'), ''),
    'published', p_actor, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    updated_at = now()
  WHERE public.lfk_complex_templates.owner_kind = 'platform'
    AND public.lfk_complex_templates.organization_id IS NULL;

  IF NOT EXISTS (
    SELECT 1 FROM public.lfk_complex_templates t
    WHERE t.id = target_id AND t.owner_kind = 'platform' AND t.organization_id IS NULL
  ) THEN
    RAISE EXCEPTION 'platform_lfk_template_owner_mismatch' USING ERRCODE = '42501';
  END IF;

  exercise_value := COALESCE(p_payload->'exerciseIds', '[]'::jsonb);
  expected_count := jsonb_array_length(exercise_value);
  DELETE FROM public.lfk_complex_template_exercises
   WHERE template_id = target_id AND owner_kind = 'platform' AND organization_id IS NULL;
  INSERT INTO public.lfk_complex_template_exercises (
    owner_kind, organization_id, template_id, exercise_id, sort_order
  )
  SELECT 'platform', NULL, target_id, e.id, x.ordinality::integer - 1
    FROM jsonb_array_elements_text(exercise_value) WITH ORDINALITY AS x(raw_id, ordinality)
    JOIN public.lfk_exercises e
      ON e.id = x.raw_id::uuid
     AND e.owner_kind = 'platform'
     AND e.organization_id IS NULL
     AND e.is_archived = false;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count <> expected_count THEN
    RAISE EXCEPTION 'platform_lfk_template_exercise_mismatch' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.admin_audit_log (organization_id, actor_id, action, target_id, details, status)
  VALUES (NULL, p_actor, 'platform_lfk_template_save', target_id::text,
    jsonb_build_object('ownerKind', 'platform', 'exerciseCount', expected_count), 'ok');
  RETURN target_id;
END;
$function$;

CREATE OR REPLACE FUNCTION app.c4d_platform_lfk_archive_template(p_actor uuid, p_id uuid, p_archived boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  touched boolean;
BEGIN
  UPDATE public.lfk_complex_templates
     SET status = CASE WHEN p_archived THEN 'archived' ELSE 'published' END, updated_at = now()
   WHERE id = p_id AND owner_kind = 'platform' AND organization_id IS NULL
  RETURNING true INTO touched;
  IF COALESCE(touched, false) THEN
    INSERT INTO public.admin_audit_log (organization_id, actor_id, action, target_id, details, status)
    VALUES (NULL, p_actor, 'platform_lfk_template_archive', p_id::text,
      jsonb_build_object('ownerKind', 'platform', 'archived', p_archived), 'ok');
  END IF;
  RETURN COALESCE(touched, false);
END;
$function$;

REVOKE ALL ON FUNCTION app.c4d_platform_lfk_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.c4d_platform_lfk_save_exercise(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.c4d_platform_lfk_archive_exercise(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.c4d_platform_lfk_save_template(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.c4d_platform_lfk_archive_template(uuid, uuid, boolean) FROM PUBLIC;

DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.c4d_platform_lfk_snapshot() TO app_staff';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.c4d_platform_lfk_save_exercise(uuid, jsonb) TO app_staff';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.c4d_platform_lfk_archive_exercise(uuid, uuid, boolean) TO app_staff';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.c4d_platform_lfk_save_template(uuid, jsonb) TO app_staff';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.c4d_platform_lfk_archive_template(uuid, uuid, boolean) TO app_staff';
  END IF;
END;
$grant$;
