-- Рост и вес пациента: добавить столбцы height_cm и weight_kg в platform_users.

-- +migrate Up
ALTER TABLE "platform_users"
  ADD COLUMN IF NOT EXISTS "height_cm" integer,
  ADD COLUMN IF NOT EXISTS "weight_kg" integer;

-- +migrate Down (run manually to revert)
-- ALTER TABLE "platform_users" DROP COLUMN IF EXISTS "height_cm";
-- ALTER TABLE "platform_users" DROP COLUMN IF EXISTS "weight_kg";
