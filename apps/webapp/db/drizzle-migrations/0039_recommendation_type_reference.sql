-- D3 (Q3): системный справочник типов рекомендаций — категория + сид v1 (коды в `recommendations.domain`).
INSERT INTO reference_categories (code, title, is_user_extensible)
VALUES ('recommendation_type', 'Типы рекомендаций', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO reference_items (category_id, code, title, sort_order, is_active, meta_json)
SELECT c.id, v.code, v.title, v.sort_order, true, '{}'::jsonb
FROM reference_categories c
CROSS JOIN (
  VALUES
    ('exercise_technique', 'Техника упражнений', 1),
    ('regimen', 'Режим / график', 2),
    ('nutrition', 'Питание', 3),
    ('device', 'Устройство / аппарат', 4),
    ('self_procedure', 'Самостоятельная процедура', 5),
    ('external_therapy', 'Внешняя терапия', 6),
    ('lifestyle', 'Образ жизни', 7),
    ('daily_activity', 'Бытовая активность', 8),
    ('physiotherapy', 'Физиотерапия', 9),
    ('motivation', 'Мотивация', 10),
    ('safety', 'Техника безопасности', 11)
) AS v(code, title, sort_order)
WHERE c.code = 'recommendation_type'
ON CONFLICT (category_id, code) DO NOTHING;
