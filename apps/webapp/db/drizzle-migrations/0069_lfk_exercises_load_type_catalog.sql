-- `load_type` is driven by `reference_items` (category `load_type`). A fixed CHECK on
-- `lfk_exercises` caused 23514 when admins add new catalog codes (e.g. `static_hold`).
ALTER TABLE lfk_exercises DROP CONSTRAINT IF EXISTS lfk_exercises_load_type_check;

-- Bootstrap row for fresh DBs / parity with EXERCISE_LOAD_TYPE_SEED_V1 (ON CONFLICT if already created in admin UI).
INSERT INTO reference_items (category_id, code, title, sort_order, is_active, meta_json)
SELECT c.id, v.code, v.title, v.sort_order, true, '{}'::jsonb
FROM reference_categories c
CROSS JOIN (
  VALUES
    ('static_hold', 'Статическое укрепление / удержание', 6)
) AS v(code, title, sort_order)
WHERE c.code = 'load_type'
ON CONFLICT (category_id, code) DO NOTHING;
