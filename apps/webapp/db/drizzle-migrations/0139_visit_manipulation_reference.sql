-- 0139: reference category for visit manipulations picker in doctor client card.
INSERT INTO reference_categories (code, title, is_user_extensible)
VALUES ('visit_manipulation', 'Манипуляции визита', true)
ON CONFLICT (code) DO UPDATE
SET title = EXCLUDED.title,
    is_user_extensible = true;
