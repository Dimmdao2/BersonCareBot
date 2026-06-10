-- System folder «Файлы клиентов» + per-patient subfolders for client-attached media.

ALTER TABLE "media_folders"
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'standard';

ALTER TABLE "media_folders"
  ADD COLUMN IF NOT EXISTS "patient_user_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'media_folders_kind_check'
  ) THEN
    ALTER TABLE "media_folders"
      ADD CONSTRAINT "media_folders_kind_check"
      CHECK ("kind" = ANY (ARRAY['standard'::text, 'client_files_root'::text, 'client_patient'::text]));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'media_folders_patient_user_id_fkey'
  ) THEN
    ALTER TABLE "media_folders"
      ADD CONSTRAINT "media_folders_patient_user_id_fkey"
      FOREIGN KEY ("patient_user_id") REFERENCES "platform_users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_media_folders_client_patient_user"
  ON "media_folders" ("patient_user_id")
  WHERE "kind" = 'client_patient' AND "patient_user_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_media_folders_client_files_root"
  ON "media_folders" ((1))
  WHERE "kind" = 'client_files_root';

UPDATE "media_folders"
SET "kind" = 'client_files_root', "updated_at" = now()
WHERE "parent_id" IS NULL
  AND "kind" = 'standard'
  AND "name_normalized" = lower(trim('Файлы клиентов'))
  AND NOT EXISTS (SELECT 1 FROM "media_folders" WHERE "kind" = 'client_files_root');

INSERT INTO "media_folders" ("name", "parent_id", "kind", "created_at", "updated_at")
SELECT 'Файлы клиентов', NULL, 'client_files_root', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "media_folders" WHERE "kind" = 'client_files_root');

-- Per-patient folders for existing submission / discussion media owners.
INSERT INTO "media_folders" ("name", "parent_id", "kind", "patient_user_id", "created_at", "updated_at")
SELECT
  LEFT(
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', pu.first_name, pu.last_name)), ''),
      NULLIF(TRIM(pu.display_name), ''),
      'Клиент'
    ),
    180
  ),
  root.id,
  'client_patient',
  pu.id,
  now(),
  now()
FROM (
  SELECT DISTINCT uid AS patient_user_id
  FROM (
    SELECT mf.uploaded_by AS uid
    FROM "media_files" mf
    WHERE mf.usage_purpose = 'program_item_submission' AND mf.uploaded_by IS NOT NULL
    UNION
    SELECT m.patient_user_id AS uid
    FROM "program_item_discussion_messages" m
    WHERE m.media_file_id IS NOT NULL
  ) owners
) o
INNER JOIN "platform_users" pu ON pu.id = o.patient_user_id
CROSS JOIN LATERAL (
  SELECT id FROM "media_folders" WHERE "kind" = 'client_files_root' LIMIT 1
) root
WHERE NOT EXISTS (
  SELECT 1 FROM "media_folders" cf
  WHERE cf."kind" = 'client_patient' AND cf."patient_user_id" = o.patient_user_id
);

-- Move existing client submission media into patient folders.
UPDATE "media_files" mf
SET "folder_id" = cf.id
FROM "media_folders" cf
WHERE mf.usage_purpose = 'program_item_submission'
  AND mf.uploaded_by IS NOT NULL
  AND cf."kind" = 'client_patient'
  AND cf."patient_user_id" = mf.uploaded_by
  AND (mf."folder_id" IS NULL OR mf."folder_id" <> cf.id);

-- Discussion-linked media uploaded by patient (same folder rule).
UPDATE "media_files" mf
SET "folder_id" = cf.id
FROM "media_folders" cf
WHERE cf."kind" = 'client_patient'
  AND cf."patient_user_id" = mf.uploaded_by
  AND mf.id IN (
    SELECT m.media_file_id
    FROM "program_item_discussion_messages" m
    WHERE m.media_file_id IS NOT NULL AND m.sender_role = 'patient'
  )
  AND (mf."folder_id" IS NULL OR mf."folder_id" <> cf.id);
