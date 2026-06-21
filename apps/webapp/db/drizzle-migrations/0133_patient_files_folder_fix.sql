-- 0133: patient_files folder fix
--
-- Four repairs in one idempotent migration:
--
-- 1. Rename the client_files_root folder from "Файлы клиентов" to "Пациенты".
--    The legacy promotion helper updated `kind` but not `name`.  The code constant
--    CLIENT_FILES_ROOT_FOLDER_NAME has always been "Пациенты"; this brings the DB row
--    in sync.
--
-- 2. Ensure client_patient subfolders exist for the two patients that have patient_files
--    rows but no client_patient folder:
--      • 923df858 — Абдулкина Анастасия Алексеевна
--      • 81c535b7 — Музюкин Дмитрий
--
-- 3. Fix the misplaced media_files row 709565e7 linked to patient_files edd8ab66:
--    it sits in "Упражнения ЛФК" (standard) instead of the patient's client_patient folder.
--      a. Insert a correct media_files row in the patient's client_patient folder using
--         the real S3 key / mime_type / size_bytes from the patient_files row.
--      b. Redirect patient_files.media_file_id to the new correct row.
--      c. Clear folder_id from the stale exercise media_files row (preserve the row;
--         other references may exist).
--
-- 4. Backfill media_files rows for the two patient_files rows that have no media_file_id
--    (e464a501 / 4beacf19), inserting them into their respective client_patient folders
--    and linking back via patient_files.media_file_id.
--
-- All statements are idempotent (ON CONFLICT DO NOTHING / guarded WHERE clauses).

-- ── 1. Rename root folder ──────────────────────────────────────────────────────
UPDATE media_folders
   SET name       = 'Пациенты',
       updated_at = NOW()
 WHERE kind = 'client_files_root'
   AND lower(trim(name)) = 'файлы клиентов';

-- ── 2. Ensure client_patient subfolders ───────────────────────────────────────
-- 2a. Абдулкина Анастасия Алексеевна (923df858)
INSERT INTO media_folders (name, parent_id, kind, patient_user_id)
SELECT 'Абдулкина Анастасия Алексеевна',
       root.id,
       'client_patient',
       '923df858-0a22-4321-8de4-5841e227166f'::uuid
  FROM media_folders root
 WHERE root.kind = 'client_files_root'
 LIMIT 1
    ON CONFLICT DO NOTHING;

-- 2b. Музюкин Дмитрий (81c535b7)
INSERT INTO media_folders (name, parent_id, kind, patient_user_id)
SELECT 'Музюкин Дмитрий',
       root.id,
       'client_patient',
       '81c535b7-f2dd-4217-885b-be5182cbbc47'::uuid
  FROM media_folders root
 WHERE root.kind = 'client_files_root'
 LIMIT 1
    ON CONFLICT DO NOTHING;

-- ── 3. Fix misplaced media_files row for patient_files edd8ab66 ───────────────
-- 3a. Insert a correct media_files row in the patient's client_patient folder.
--     Guard: only runs if patient_files.media_file_id still points to the stale row.
INSERT INTO media_files (display_name, original_name, stored_path, s3_key, mime_type, size_bytes, uploaded_by, folder_id, status, preview_status)
SELECT pf.file_name,
       pf.file_name,
       pf.s3_key,
       pf.s3_key,
       pf.mime_type,
       pf.size_bytes,
       pf.uploaded_by_user_id,
       fold.id,
       'ready',
       'pending'
  FROM patient_files pf
  JOIN media_folders fold
       ON fold.kind = 'client_patient'
      AND fold.patient_user_id = pf.patient_user_id
 WHERE pf.id = 'edd8ab66-4306-4037-8a13-e5b50c6bf903'
   AND pf.media_file_id = '709565e7-584c-4c55-a10c-053e6fc45acd';

-- 3b. Update patient_files.media_file_id to the newly inserted correct row.
UPDATE patient_files
   SET media_file_id = (
         SELECT mf.id
           FROM media_files mf
           JOIN media_folders fold ON fold.id = mf.folder_id
                                  AND fold.kind = 'client_patient'
                                  AND fold.patient_user_id = '923df858-0a22-4321-8de4-5841e227166f'
          WHERE mf.s3_key = (SELECT s3_key FROM patient_files WHERE id = 'edd8ab66-4306-4037-8a13-e5b50c6bf903')
          ORDER BY mf.created_at DESC
          LIMIT 1
       )
 WHERE id = 'edd8ab66-4306-4037-8a13-e5b50c6bf903'
   AND media_file_id = '709565e7-584c-4c55-a10c-053e6fc45acd';

-- 3c. Clear folder_id from the stale exercise media_files row.
--     Guard: only if this row is still in "Упражнения ЛФК" (standard folder 002128e4).
UPDATE media_files
   SET folder_id = NULL
 WHERE id = '709565e7-584c-4c55-a10c-053e6fc45acd'
   AND folder_id = '002128e4-89a1-4adc-9479-027a6a97770e';

-- ── 4. Backfill unlinked patient_files rows ───────────────────────────────────
-- Insert missing media_files rows and link them for each patient_files row that
-- has no media_file_id.

-- 4a. Invoice file for Абдулкина (patient_files e455a501)
INSERT INTO media_files (display_name, original_name, stored_path, s3_key, mime_type, size_bytes, uploaded_by, folder_id, status, preview_status)
SELECT pf.file_name,
       pf.file_name,
       pf.s3_key,
       pf.s3_key,
       pf.mime_type,
       pf.size_bytes,
       pf.uploaded_by_user_id,
       fold.id,
       'ready',
       'pending'
  FROM patient_files pf
  JOIN media_folders fold
       ON fold.kind = 'client_patient'
      AND fold.patient_user_id = pf.patient_user_id
 WHERE pf.id = 'e455a501-d827-4a44-97cf-19aba4337307'
   AND pf.media_file_id IS NULL;

UPDATE patient_files
   SET media_file_id = (
         SELECT mf.id
           FROM media_files mf
           JOIN media_folders fold ON fold.id = mf.folder_id
                                  AND fold.kind = 'client_patient'
                                  AND fold.patient_user_id = '923df858-0a22-4321-8de4-5841e227166f'
          WHERE mf.s3_key = (SELECT s3_key FROM patient_files WHERE id = 'e455a501-d827-4a44-97cf-19aba4337307')
          ORDER BY mf.created_at DESC
          LIMIT 1
       )
 WHERE id = 'e455a501-d827-4a44-97cf-19aba4337307'
   AND media_file_id IS NULL;

-- 4b. Screenshot file for Музюкин (patient_files 4beacf19)
INSERT INTO media_files (display_name, original_name, stored_path, s3_key, mime_type, size_bytes, uploaded_by, folder_id, status, preview_status)
SELECT pf.file_name,
       pf.file_name,
       pf.s3_key,
       pf.s3_key,
       pf.mime_type,
       pf.size_bytes,
       pf.uploaded_by_user_id,
       fold.id,
       'ready',
       'pending'
  FROM patient_files pf
  JOIN media_folders fold
       ON fold.kind = 'client_patient'
      AND fold.patient_user_id = pf.patient_user_id
 WHERE pf.id = '4beacf19-8e33-49db-b228-7f018f21ca64'
   AND pf.media_file_id IS NULL;

UPDATE patient_files
   SET media_file_id = (
         SELECT mf.id
           FROM media_files mf
           JOIN media_folders fold ON fold.id = mf.folder_id
                                  AND fold.kind = 'client_patient'
                                  AND fold.patient_user_id = '81c535b7-f2dd-4217-885b-be5182cbbc47'
          WHERE mf.s3_key = (SELECT s3_key FROM patient_files WHERE id = '4beacf19-8e33-49db-b228-7f018f21ca64')
          ORDER BY mf.created_at DESC
          LIMIT 1
       )
 WHERE id = '4beacf19-8e33-49db-b228-7f018f21ca64'
   AND media_file_id IS NULL;
