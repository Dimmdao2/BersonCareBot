-- Fixups for client media folders: promote legacy root name, plain patient folder names.

UPDATE "media_folders"
SET "kind" = 'client_files_root', "updated_at" = now()
WHERE "parent_id" IS NULL
  AND "kind" = 'standard'
  AND "name_normalized" = lower(trim('Файлы клиентов'))
  AND NOT EXISTS (SELECT 1 FROM "media_folders" WHERE "kind" = 'client_files_root');

INSERT INTO "media_folders" ("name", "parent_id", "kind", "created_at", "updated_at")
SELECT 'Файлы клиентов', NULL, 'client_files_root', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "media_folders" WHERE "kind" = 'client_files_root');

-- Drop « · xxxxxxxx» suffix from patient folders when the plain name is unique under root.
UPDATE "media_folders" mf
SET "name" = sub.clean_name, "updated_at" = now()
FROM (
  SELECT
    cp.id,
    LEFT(regexp_replace(cp.name, ' · [0-9a-f]{8}$', ''), 180) AS clean_name,
    cp.parent_id
  FROM "media_folders" cp
  WHERE cp."kind" = 'client_patient'
    AND cp.name ~ ' · [0-9a-f]{8}$'
) sub
WHERE mf.id = sub.id
  AND length(trim(sub.clean_name)) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "media_folders" other
    WHERE other."parent_id" = sub.parent_id
      AND other.id <> sub.id
      AND other."name_normalized" = lower(trim(sub.clean_name))
  );
