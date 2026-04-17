-- Диагностика integrator: users / alias (v2)
-- Использование: подключиться к integrator DB (api.prod DATABASE_URL).
-- Не выполнять вслепую на проде без review.

-- Строки с alias (ожидаемо только после merge)
-- SELECT id, merged_into_user_id, created_at FROM users WHERE merged_into_user_id IS NOT NULL ORDER BY id;

-- Проверка self-reference (нарушение CHECK — не должно возвращать строк)
-- SELECT id FROM users WHERE merged_into_user_id IS NOT NULL AND merged_into_user_id = id;

-- Простая проверка «двухуровневой» цепочки: alias -> winner тоже alias (если политика запрещает — должно быть пусто)
-- SELECT u.id AS alias_id, u.merged_into_user_id AS hop1, w.merged_into_user_id AS hop2
-- FROM users u
-- JOIN users w ON w.id = u.merged_into_user_id
-- WHERE u.merged_into_user_id IS NOT NULL AND w.merged_into_user_id IS NOT NULL;

-- Счётчик canonical vs alias
-- SELECT
--   COUNT(*) FILTER (WHERE merged_into_user_id IS NULL) AS canonical_rows,
--   COUNT(*) FILTER (WHERE merged_into_user_id IS NOT NULL) AS alias_rows
-- FROM users;
