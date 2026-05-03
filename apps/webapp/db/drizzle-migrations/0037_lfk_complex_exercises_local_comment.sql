-- B7: per-row override for assigned LFK complex exercises (template comment remains frozen in `comment`).
ALTER TABLE "lfk_complex_exercises" ADD COLUMN IF NOT EXISTS "local_comment" text;
