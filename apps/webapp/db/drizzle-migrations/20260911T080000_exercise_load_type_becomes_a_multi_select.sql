-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.lfk_exercise_load_types') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'lfk_exercise_load_types_owner_guard') AND position('lfk_exercise_load_types' in pg_catalog.pg_get_functiondef('app.enforce_lfk_child_owner()'::regprocedure)) > 0
--
-- EXERCISE_STORE_PLAN §3e (owner, 11.09.2026): «Тип нагрузки должен стать мультиполем» — an exercise
-- can be strength AND static hold, eccentric AND static, etc. Mirrors `lfk_exercise_regions` exactly
-- (same naming, constraints, org scoping): a new M2M table, and `lfk_exercises.load_type` stays the
-- primary/legacy column (dual-write, first selected) — the shape regions already use, so read sites
-- that only know the single column keep working unchanged.
--
-- Unlike `region_ref_id` (uuid FK into `reference_items`), `load_type` has never had a FK — codes are
-- governed by the `load_type` reference category in application code only (no DB CHECK, per
-- `exerciseLoadTypeReference.ts`). The M2M column follows that existing shape: `load_type text`, no FK.
CREATE TABLE public.lfk_exercise_load_types (
    exercise_id uuid NOT NULL,
    load_type text NOT NULL,
    organization_id uuid,
    owner_kind text DEFAULT 'organization'::text NOT NULL,
    CONSTRAINT lfk_exercise_load_types_pkey PRIMARY KEY (exercise_id, load_type),
    CONSTRAINT lfk_exercise_load_types_owner_check CHECK (
      ((owner_kind = 'organization'::text) AND (organization_id IS NOT NULL))
      OR ((owner_kind = 'platform'::text) AND (organization_id IS NULL))
    ),
    CONSTRAINT lfk_exercise_load_types_exercise_id_fkey
      FOREIGN KEY (exercise_id) REFERENCES public.lfk_exercises(id) ON DELETE CASCADE,
    CONSTRAINT lfk_exercise_load_types_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE
);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

CREATE INDEX idx_lfk_exercise_load_types_organization_id
  ON public.lfk_exercise_load_types USING btree (organization_id);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

CREATE INDEX idx_lfk_exercise_load_types_load_type
  ON public.lfk_exercise_load_types USING btree (load_type);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

-- Same integrity guard the two sibling child tables already run under (owner_kind/organization_id
-- must match the parent `lfk_exercises` row) — one shared trigger function, table added to its list.
CREATE TRIGGER lfk_exercise_load_types_owner_guard
  BEFORE INSERT OR UPDATE OF owner_kind, organization_id, exercise_id
  ON public.lfk_exercise_load_types
  FOR EACH ROW EXECUTE FUNCTION app.enforce_lfk_child_owner();
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

-- Parameterize the existing shared guard instead of writing a near-identical trigger function
-- (AGENTS.md §5): `lfk_exercise_load_types` joins the two tables already resolved through
-- `lfk_exercises`, everything else about the function is unchanged.
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
  IF TG_TABLE_NAME IN ('lfk_exercise_regions', 'lfk_exercise_media', 'lfk_exercise_load_types') THEN
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
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
--
-- Every existing non-null `load_type` becomes one link row — no exercise loses its type. One legacy
-- value per row, so this is a plain 1:1 copy (no splitting: `load_type` has never held more than one
-- code at a time).
INSERT INTO public.lfk_exercise_load_types (owner_kind, organization_id, exercise_id, load_type)
SELECT owner_kind, organization_id, id, load_type
FROM public.lfk_exercises
WHERE load_type IS NOT NULL
ON CONFLICT (exercise_id, load_type) DO NOTHING;
