-- D2 (Q1): системный справочник видов оценки клинических тестов — категория + сид v1 (коды совпадают с прежним TS-enum).
INSERT INTO reference_categories (code, title, is_user_extensible)
VALUES ('clinical_assessment_kind', 'Виды оценки (клинические тесты)', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO reference_items (category_id, code, title, sort_order, is_active, meta_json)
SELECT c.id, v.code, v.title, v.sort_order, true, '{}'::jsonb
FROM reference_categories c
CROSS JOIN (
  VALUES
    ('mobility', 'Подвижность', 1),
    ('pain', 'Болезненность', 2),
    ('sensitivity', 'Чувствительность', 3),
    ('strength', 'Сила', 4),
    ('neurodynamics', 'Нейродинамика', 5),
    ('proprioception', 'Проприоцепция', 6),
    ('balance', 'Равновесие', 7),
    ('endurance', 'Выносливость', 8)
) AS v(code, title, sort_order)
WHERE c.code = 'clinical_assessment_kind'
ON CONFLICT (category_id, code) DO NOTHING;
