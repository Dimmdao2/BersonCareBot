-- Align `load_type` reference items with `lfk_exercises.load_type` CHECK (strength|stretch|balance|cardio|other).
-- Replaces legacy seed rows (high_rep, static_hold, …) from apps/webapp/migrations/022_reference_tables_and_seed.sql.

DELETE FROM reference_items
WHERE category_id = (SELECT id FROM reference_categories WHERE code = 'load_type');

INSERT INTO reference_items (category_id, code, title, sort_order, is_active, meta_json)
SELECT c.id, v.code, v.title, v.sort_order, true, '{}'::jsonb
FROM reference_categories c
CROSS JOIN (
  VALUES
    ('strength', 'Силовая', 1),
    ('stretch', 'Растяжка', 2),
    ('balance', 'Баланс', 3),
    ('cardio', 'Кардио', 4),
    ('other', 'Другое', 5)
) AS v(code, title, sort_order)
WHERE c.code = 'load_type';
