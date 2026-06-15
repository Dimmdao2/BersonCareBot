-- Добавить отчество (patronymic) в таблицу platform_users

-- +migrate Up
ALTER TABLE platform_users ADD COLUMN IF NOT EXISTS patronymic TEXT;

-- +migrate Down (run manually to revert)
-- ALTER TABLE platform_users DROP COLUMN IF EXISTS patronymic;
