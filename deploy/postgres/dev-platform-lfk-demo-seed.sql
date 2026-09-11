\set ON_ERROR_STOP on

-- DEV-only demonstrator for EXERCISE_STORE_PLAN §5 S0a live acceptance.
--
-- Run only against the named DEV database, through its local administrative socket:
--   sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 \
--     -d bcb_webapp_dev -v ON_ERROR_STOP=1 -f deploy/postgres/dev-platform-lfk-demo-seed.sql
--
-- The five titles below are this seed's natural key. Re-running the file preserves
-- exactly one platform parent and one region/load-type child link per title.

DO $$
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'This DEV demonstrator may run only on bcb_webapp_dev (current database: %)', current_database();
  END IF;
END;
$$;

BEGIN;

CREATE TEMP TABLE lfk_platform_demo_seed (
  title text PRIMARY KEY,
  description text NOT NULL,
  region_code text NOT NULL,
  load_type text NOT NULL,
  difficulty_1_10 integer NOT NULL
) ON COMMIT DROP;

INSERT INTO lfk_platform_demo_seed (title, description, region_code, load_type, difficulty_1_10)
VALUES
  ('Базовая библиотека: разгибание колена сидя', 'Медленно выпрямляйте колено сидя на устойчивом стуле.', 'knee', 'strength', 3),
  ('Базовая библиотека: изометрическое напряжение квадрицепса', 'Напрягите переднюю поверхность бедра без движения в колене.', 'knee', 'static_hold', 2),
  ('Базовая библиотека: подъём на носки у опоры', 'Поднимайтесь на носки, удерживая равновесие у устойчивой опоры.', 'ankle', 'strength', 3),
  ('Базовая библиотека: отведение плеча с опорой', 'Поднимайте прямую руку в сторону до комфортной амплитуды.', 'shoulder', 'mobilization', 3),
  ('Базовая библиотека: нейродинамика седалищного нерва', 'Выполняйте мягкое скольжение нерва без усиления симптомов.', 'leg', 'neurodinamica', 2);

-- A platform row must point at an active region that the existing catalog actually
-- uses. This keeps the demonstrator valid after DEV is refreshed while avoiding a
-- hard-coded reference-item UUID from one particular dump.
CREATE TEMP TABLE lfk_platform_demo_resolved ON COMMIT DROP AS
SELECT seed.*, region.id AS region_ref_id
FROM lfk_platform_demo_seed AS seed
CROSS JOIN LATERAL (
  SELECT item.id
  FROM public.reference_items AS item
  JOIN public.reference_categories AS category ON category.id = item.category_id
  WHERE category.code = 'body_region'
    AND item.code = seed.region_code
    AND item.is_active = true
    AND item.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.lfk_exercises AS existing
      WHERE existing.region_ref_id = item.id
    )
  ORDER BY item.id
  LIMIT 1
) AS region;

SELECT count(*) = 5 AS lfk_platform_demo_regions_resolved
FROM lfk_platform_demo_resolved
\gset

\if :lfk_platform_demo_regions_resolved
\else
\echo 'FATAL: DEV does not contain all active, catalog-used body-region references required by this demonstrator'
\quit 1
\endif

INSERT INTO public.lfk_exercises (
  owner_kind,
  organization_id,
  catalog_scope,
  title,
  description,
  region_ref_id,
  load_type,
  difficulty_1_10,
  tags,
  is_archived,
  updated_at
)
SELECT
  'platform',
  NULL,
  'catalog',
  seed.title,
  seed.description,
  seed.region_ref_id,
  seed.load_type,
  seed.difficulty_1_10,
  ARRAY['S0a', 'demo', 'platform'],
  false,
  now()
FROM lfk_platform_demo_resolved AS seed
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lfk_exercises AS existing
  WHERE existing.owner_kind = 'platform'
    AND existing.organization_id IS NULL
    AND existing.title = seed.title
);

INSERT INTO public.lfk_exercise_regions (
  owner_kind,
  organization_id,
  exercise_id,
  region_ref_id
)
SELECT
  'platform',
  NULL,
  exercise.id,
  seed.region_ref_id
FROM lfk_platform_demo_resolved AS seed
JOIN public.lfk_exercises AS exercise
  ON exercise.owner_kind = 'platform'
 AND exercise.organization_id IS NULL
 AND exercise.title = seed.title
ON CONFLICT (exercise_id, region_ref_id) DO UPDATE
SET owner_kind = EXCLUDED.owner_kind,
    organization_id = EXCLUDED.organization_id;

INSERT INTO public.lfk_exercise_load_types (
  owner_kind,
  organization_id,
  exercise_id,
  load_type
)
SELECT
  'platform',
  NULL,
  exercise.id,
  seed.load_type
FROM lfk_platform_demo_resolved AS seed
JOIN public.lfk_exercises AS exercise
  ON exercise.owner_kind = 'platform'
 AND exercise.organization_id IS NULL
 AND exercise.title = seed.title
ON CONFLICT (exercise_id, load_type) DO UPDATE
SET owner_kind = EXCLUDED.owner_kind,
    organization_id = EXCLUDED.organization_id;

SELECT
  'platform_demo_exercises' AS proof,
  count(*) AS rows,
  count(*) FILTER (WHERE organization_id IS NULL) AS null_organization_rows,
  count(*) FILTER (WHERE owner_kind = 'platform') AS platform_owner_rows
FROM public.lfk_exercises
WHERE owner_kind = 'platform'
  AND organization_id IS NULL
  AND title IN (SELECT title FROM lfk_platform_demo_seed);

SELECT
  'platform_demo_children' AS proof,
  count(*) FILTER (WHERE child_table = 'lfk_exercise_regions') AS region_rows,
  count(*) FILTER (WHERE child_table = 'lfk_exercise_load_types') AS load_type_rows,
  count(*) FILTER (WHERE child_owner_mismatch) AS owner_mismatches
FROM (
  SELECT
    'lfk_exercise_regions'::text AS child_table,
    child.owner_kind IS DISTINCT FROM parent.owner_kind
      OR child.organization_id IS DISTINCT FROM parent.organization_id AS child_owner_mismatch
  FROM public.lfk_exercise_regions AS child
  JOIN public.lfk_exercises AS parent ON parent.id = child.exercise_id
  WHERE parent.owner_kind = 'platform'
    AND parent.organization_id IS NULL
    AND parent.title IN (SELECT title FROM lfk_platform_demo_seed)
  UNION ALL
  SELECT
    'lfk_exercise_load_types'::text AS child_table,
    child.owner_kind IS DISTINCT FROM parent.owner_kind
      OR child.organization_id IS DISTINCT FROM parent.organization_id AS child_owner_mismatch
  FROM public.lfk_exercise_load_types AS child
  JOIN public.lfk_exercises AS parent ON parent.id = child.exercise_id
  WHERE parent.owner_kind = 'platform'
    AND parent.organization_id IS NULL
    AND parent.title IN (SELECT title FROM lfk_platform_demo_seed)
) AS children;

COMMIT;
