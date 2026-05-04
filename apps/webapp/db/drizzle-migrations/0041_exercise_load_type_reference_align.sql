-- Ensure canonical `load_type` rows exist for UI / validation alongside `lfk_exercises.load_type` CHECK.
-- Idempotent merge: adds missing (category_id, code) only; does not delete or overwrite existing reference rows.

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
WHERE c.code = 'load_type'
ON CONFLICT (category_id, code) DO NOTHING;
