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

-- The same platform patient may receive the same platform template independently in multiple
-- organizations. Reject legacy ownership holes or same-organization duplicates before replacing
-- the historical global partial unique index.
DO $assignment_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.patient_lfk_assignments
     WHERE organization_id IS NULL
  ) THEN
    RAISE EXCEPTION 'C4D.0217 patient_lfk_assignments require exact organization ownership before index replacement';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.patient_lfk_assignments
     WHERE is_active = true
     GROUP BY organization_id, patient_user_id, template_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'C4D.0217 duplicate active patient LFK assignment inside one organization';
  END IF;
END;
$assignment_preflight$;

DROP INDEX IF EXISTS public.idx_patient_lfk_assign_active_template;
CREATE UNIQUE INDEX idx_patient_lfk_assign_active_template
  ON public.patient_lfk_assignments (organization_id, patient_user_id, template_id)
  WHERE is_active = true;

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

-- media_files is an existing hot table. Its owner index is intentionally built outside the
-- Drizzle transaction by deploy/postgres/c4d-platform-lfk-media-owner-online-index.sql.

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
