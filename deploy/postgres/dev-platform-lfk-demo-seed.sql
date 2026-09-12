\set ON_ERROR_STOP on

-- DEV-only demonstrator for EXERCISE_STORE_PLAN §5 live acceptance of S0a (lfk_exercises) and
-- S0б (tests, recommendations and their region links).
--
-- Run only against the named DEV database, through its local administrative socket:
--   sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 \
--     -d bcb_webapp_dev -v ON_ERROR_STOP=1 -f deploy/postgres/dev-platform-lfk-demo-seed.sql
--
-- The titles below are this seed's natural key. Re-running the file preserves exactly one
-- platform parent and one child link per title, in every family it seeds.

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

-- ---------------------------------------------------------------------------
-- S0б: платформенный клинический тест и платформенная рекомендация.
--
-- Зачем это здесь, а не «потом, в S0в»: план §5 сам говорит, что живая проверка S0 упирается
-- в ручную вставку на DEV, пока нет редактора платформенного контента. Без этих строк врач на
-- DEV физически не может увидеть платформенный тест или рекомендацию — читать нечего, и
-- проверить чтение S0б невозможно ни глазами, ни запросом.
-- Дочерние ссылки на регионы обязаны нести того же владельца, что и родитель: иначе триггер
-- app.enforce_lfk_child_owner() отобьёт вставку как lfk_child_owner_mismatch.

CREATE TEMP TABLE platform_test_demo_seed (
  title text PRIMARY KEY,
  description text NOT NULL,
  region_code text NOT NULL,
  assessment_kind text
) ON COMMIT DROP;

INSERT INTO platform_test_demo_seed (title, description, region_code, assessment_kind)
VALUES
  ('Базовая библиотека: тест приседания у стены', 'Оцените глубину приседа и симметрию опоры без боли.', 'knee', 'mobility'),
  ('Базовая библиотека: тест отведения плеча', 'Оцените доступную амплитуду отведения и момент появления симптома.', 'shoulder', 'pain');

CREATE TEMP TABLE platform_recommendation_demo_seed (
  title text PRIMARY KEY,
  body_md text NOT NULL,
  region_code text NOT NULL,
  domain text
) ON COMMIT DROP;

INSERT INTO platform_recommendation_demo_seed (title, body_md, region_code, domain)
VALUES
  ('Базовая библиотека: правила нагрузки на колено', 'Увеличивайте нагрузку не более чем на 10% в неделю; боль выше 4 из 10 — сигнал отката.', 'knee', 'exercise_technique'),
  ('Базовая библиотека: режим дня при боли в плече', 'Избегайте длительных статических положений руки выше головы; делайте паузы каждые 40 минут.', 'shoulder', NULL);

-- Регион берётся ровно тем же способом, что и у упражнений выше, и якорь `EXISTS` здесь —
-- не украшение. Справочник `reference_items` живёт ТОЛЬКО в разрезе организации
-- (`organization_id NOT NULL`, платформенных элементов в нём нет), поэтому «просто активный
-- элемент с таким кодом» — это элемент ПРОИЗВОЛЬНОЙ клиники, в том числе давно удалённой.
-- Первая редакция этого блока так и промахнулась: два платформенных элемента из четырёх
-- получили регион несуществующей организации, и врач видел на карточке «Значение недоступно»,
-- а фильтр `?region=shoulder` их не находил (независимый аудит 12.09, Ф1). Якорь «элемент,
-- которым реально пользуется живой каталог» привязывает выбор к клинике, у которой этот
-- каталог есть; проверка существования организации оставлена явной, чтобы промах не вернулся
-- молча, если каталог когда-нибудь опустеет.
CREATE TEMP TABLE platform_catalog_demo_regions ON COMMIT DROP AS
SELECT DISTINCT ON (seed.region_code)
       seed.region_code,
       item.id AS region_ref_id
FROM (
  SELECT region_code FROM platform_test_demo_seed
  UNION
  SELECT region_code FROM platform_recommendation_demo_seed
) AS seed
JOIN public.reference_categories AS category ON category.code = 'body_region'
JOIN public.reference_items AS item
  ON item.category_id = category.id
 AND item.code = seed.region_code
 AND item.is_active = true
 AND item.deleted_at IS NULL
JOIN public.be_organizations AS organization
  ON organization.id = item.organization_id
 AND organization.is_active = true
WHERE EXISTS (
  SELECT 1
  FROM public.lfk_exercises AS existing
  WHERE existing.region_ref_id = item.id
)
ORDER BY seed.region_code, item.id;

SELECT count(*) = (
  SELECT count(DISTINCT region_code) FROM (
    SELECT region_code FROM platform_test_demo_seed
    UNION SELECT region_code FROM platform_recommendation_demo_seed
  ) AS wanted
) AS platform_catalog_demo_regions_resolved
FROM platform_catalog_demo_regions
\gset

\if :platform_catalog_demo_regions_resolved
\else
\echo 'FATAL: DEV does not contain the active body-region references required by the S0b demonstrator'
\quit 1
\endif

INSERT INTO public.tests (owner_kind, organization_id, title, description, assessment_kind, body_region_id, tags, is_archived, updated_at)
SELECT 'platform', NULL, seed.title, seed.description, seed.assessment_kind, region.region_ref_id,
       ARRAY['S0b', 'demo', 'platform'], false, now()
FROM platform_test_demo_seed AS seed
JOIN platform_catalog_demo_regions AS region ON region.region_code = seed.region_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.tests AS existing
  WHERE existing.owner_kind = 'platform' AND existing.organization_id IS NULL AND existing.title = seed.title
);

-- Починка уже посеянных строк, а не только вставка новых. Родитель узнаётся по названию, поэтому
-- повторный прогон его НЕ вставляет — и без этих двух шагов строка, посеянная промахнувшейся
-- редакцией выбора региона, осталась бы с мёртвой ссылкой навсегда, а прогон печатал бы «всё сошлось».
UPDATE public.tests AS target
   SET body_region_id = region.region_ref_id,
       updated_at = now()
  FROM platform_test_demo_seed AS seed
  JOIN platform_catalog_demo_regions AS region ON region.region_code = seed.region_code
 WHERE target.owner_kind = 'platform'
   AND target.organization_id IS NULL
   AND target.title = seed.title
   AND target.body_region_id IS DISTINCT FROM region.region_ref_id;

DELETE FROM public.clinical_test_regions AS child
 USING public.tests AS parent,
       platform_test_demo_seed AS seed,
       platform_catalog_demo_regions AS region
 WHERE child.clinical_test_id = parent.id
   AND parent.owner_kind = 'platform'
   AND parent.organization_id IS NULL
   AND parent.title = seed.title
   AND region.region_code = seed.region_code
   AND child.body_region_id <> region.region_ref_id;

INSERT INTO public.clinical_test_regions (owner_kind, organization_id, clinical_test_id, body_region_id)
SELECT 'platform', NULL, test.id, region.region_ref_id
FROM platform_test_demo_seed AS seed
JOIN platform_catalog_demo_regions AS region ON region.region_code = seed.region_code
JOIN public.tests AS test
  ON test.owner_kind = 'platform' AND test.organization_id IS NULL AND test.title = seed.title
ON CONFLICT (clinical_test_id, body_region_id) DO UPDATE
SET owner_kind = EXCLUDED.owner_kind,
    organization_id = EXCLUDED.organization_id;

INSERT INTO public.recommendations (owner_kind, organization_id, title, body_md, domain, body_region_id, tags, is_archived, updated_at)
SELECT 'platform', NULL, seed.title, seed.body_md, seed.domain, region.region_ref_id,
       ARRAY['S0b', 'demo', 'platform'], false, now()
FROM platform_recommendation_demo_seed AS seed
JOIN platform_catalog_demo_regions AS region ON region.region_code = seed.region_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.recommendations AS existing
  WHERE existing.owner_kind = 'platform' AND existing.organization_id IS NULL AND existing.title = seed.title
);

UPDATE public.recommendations AS target
   SET body_region_id = region.region_ref_id,
       updated_at = now()
  FROM platform_recommendation_demo_seed AS seed
  JOIN platform_catalog_demo_regions AS region ON region.region_code = seed.region_code
 WHERE target.owner_kind = 'platform'
   AND target.organization_id IS NULL
   AND target.title = seed.title
   AND target.body_region_id IS DISTINCT FROM region.region_ref_id;

DELETE FROM public.recommendation_regions AS child
 USING public.recommendations AS parent,
       platform_recommendation_demo_seed AS seed,
       platform_catalog_demo_regions AS region
 WHERE child.recommendation_id = parent.id
   AND parent.owner_kind = 'platform'
   AND parent.organization_id IS NULL
   AND parent.title = seed.title
   AND region.region_code = seed.region_code
   AND child.body_region_id <> region.region_ref_id;

INSERT INTO public.recommendation_regions (owner_kind, organization_id, recommendation_id, body_region_id)
SELECT 'platform', NULL, recommendation.id, region.region_ref_id
FROM platform_recommendation_demo_seed AS seed
JOIN platform_catalog_demo_regions AS region ON region.region_code = seed.region_code
JOIN public.recommendations AS recommendation
  ON recommendation.owner_kind = 'platform'
 AND recommendation.organization_id IS NULL
 AND recommendation.title = seed.title
ON CONFLICT (recommendation_id, body_region_id) DO UPDATE
SET owner_kind = EXCLUDED.owner_kind,
    organization_id = EXCLUDED.organization_id;

SELECT
  'platform_demo_catalog' AS proof,
  (SELECT count(*) FROM public.tests
    WHERE owner_kind = 'platform' AND organization_id IS NULL
      AND title IN (SELECT title FROM platform_test_demo_seed)) AS tests,
  (SELECT count(*) FROM public.recommendations
    WHERE owner_kind = 'platform' AND organization_id IS NULL
      AND title IN (SELECT title FROM platform_recommendation_demo_seed)) AS recommendations,
  (SELECT count(*) FROM public.clinical_test_regions AS child
     JOIN public.tests AS parent ON parent.id = child.clinical_test_id
    WHERE parent.title IN (SELECT title FROM platform_test_demo_seed)
      AND (child.owner_kind IS DISTINCT FROM parent.owner_kind
        OR child.organization_id IS DISTINCT FROM parent.organization_id)) AS test_region_owner_mismatches,
  (SELECT count(*) FROM public.recommendation_regions AS child
     JOIN public.recommendations AS parent ON parent.id = child.recommendation_id
    WHERE parent.title IN (SELECT title FROM platform_recommendation_demo_seed)
      AND (child.owner_kind IS DISTINCT FROM parent.owner_kind
        OR child.organization_id IS DISTINCT FROM parent.organization_id)) AS recommendation_region_owner_mismatches,
  -- Мёртвая ссылка на справочник — это и есть дефект, ради которого появились UPDATE и DELETE выше:
  -- элемент существует в `reference_items`, но его организации в `be_organizations` уже нет, и врач
  -- видит на карточке «Значение недоступно». Число обязано быть нулём.
  (SELECT count(*)
     FROM (
       SELECT body_region_id FROM public.tests
        WHERE owner_kind = 'platform' AND organization_id IS NULL
          AND title IN (SELECT title FROM platform_test_demo_seed)
       UNION ALL
       SELECT body_region_id FROM public.recommendations
        WHERE owner_kind = 'platform' AND organization_id IS NULL
          AND title IN (SELECT title FROM platform_recommendation_demo_seed)
     ) AS seeded
     LEFT JOIN public.reference_items AS item ON item.id = seeded.body_region_id
     LEFT JOIN public.be_organizations AS organization ON organization.id = item.organization_id
    WHERE seeded.body_region_id IS NOT NULL
      AND (item.id IS NULL OR organization.id IS NULL)) AS dead_region_references;

-- ---------------------------------------------------------------------------
-- S0 (дополнение 12.09): платформенный ШАБЛОН КОМПЛЕКСА и его элементы.
--
-- Зачем: независимый аудит нашёл, что платформенного чтения у `lfk_complex_templates` и
-- `lfk_complex_template_exercises` не было вовсе — SQL ветку строил, RLS строку не отдавала.
-- Политики объявлены, но проверить их живьём нечем: платформенных шаблонов на DEV ноль, а создаёт
-- их только S0в. Поэтому шаблон сеется здесь, ровно как тесты и рекомендации выше.
--
-- Элементы шаблона обязаны ссылаться на ПЛАТФОРМЕННЫЕ упражнения: триггер
-- app.enforce_lfk_child_owner() отбивает платформенный элемент, указывающий на упражнение
-- организации (lfk_template_exercise_owner_mismatch). Берём платформенные упражнения этого же
-- сеятеля — они посеяны блоком S0а выше.

CREATE TEMP TABLE platform_complex_demo_seed (title text PRIMARY KEY, description text)
  ON COMMIT DROP;
INSERT INTO platform_complex_demo_seed (title, description) VALUES
  ('Базовая библиотека: комплекс на колено',
   'Демонстрационный платформенный комплекс: разгибание и изометрия квадрицепса.');

INSERT INTO public.lfk_complex_templates (owner_kind, organization_id, title, description, status)
SELECT 'platform', NULL, seed.title, seed.description, 'published'
  FROM platform_complex_demo_seed AS seed
 WHERE NOT EXISTS (
   SELECT 1 FROM public.lfk_complex_templates AS existing
    WHERE existing.owner_kind = 'platform' AND existing.organization_id IS NULL
      AND existing.title = seed.title);

-- Состав: все платформенные упражнения этого сеятеля, по порядку названия. Идемпотентно —
-- пара (template_id, exercise_id) уникальна, поэтому повторный прогон ничего не добавляет.
INSERT INTO public.lfk_complex_template_exercises
  (owner_kind, organization_id, template_id, exercise_id, sort_order)
SELECT 'platform', NULL, template.id, exercise.id,
       (row_number() OVER (ORDER BY exercise.title) - 1)::int
  FROM public.lfk_complex_templates AS template
  JOIN platform_complex_demo_seed AS seed ON seed.title = template.title
  JOIN public.lfk_exercises AS exercise
    ON exercise.owner_kind = 'platform' AND exercise.organization_id IS NULL
   AND exercise.catalog_scope = 'catalog' AND exercise.is_archived = false
   AND exercise.title IN (SELECT title FROM lfk_platform_demo_seed)
 WHERE template.owner_kind = 'platform' AND template.organization_id IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.lfk_complex_template_exercises AS existing
      WHERE existing.template_id = template.id AND existing.exercise_id = exercise.id);

COMMIT;
