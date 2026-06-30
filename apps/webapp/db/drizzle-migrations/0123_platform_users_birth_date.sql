-- Add optional birth_date to platform_users (для карточки пациента: ДР + возраст).
ALTER TABLE "platform_users" ADD COLUMN "birth_date" date;
