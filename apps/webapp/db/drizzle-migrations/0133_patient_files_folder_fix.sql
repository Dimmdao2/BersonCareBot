-- 0133: rename the client_files_root media folder "Файлы клиентов" → "Пациенты".
--
-- The legacy promotion helper updated `kind` but not `name`; the code constant
-- CLIENT_FILES_ROOT_FOLDER_NAME has always been "Пациенты". This brings existing
-- DB rows in sync. Generic + idempotent (matches by kind + legacy name only).
-- The code path pgEnsureClientFilesRootFolder also self-heals this rename on access.
--
-- NOTE: a one-time repair of pre-existing MISPLACED / unlinked patient_files media
-- rows was applied to the DEV DB separately. That repair referenced specific row IDs
-- (env-specific, NOT portable) so it is intentionally NOT baked into this deploy
-- migration — hard-coding dev UUIDs would no-op on prod and pollute migration history.
-- The current upload code (pgEnsureClientPatientFolder) already places NEW patient
-- files into the correct per-patient subfolder. If prod is later found to carry legacy
-- misplaced rows, repair them with a reviewed, generic, owner-gated data fix.
-- (Template of the dev repair lives in git history of the original commit.)

UPDATE media_folders
   SET name       = 'Пациенты',
       updated_at = NOW()
 WHERE kind = 'client_files_root'
   AND lower(trim(name)) = 'файлы клиентов';
