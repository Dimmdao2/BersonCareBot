-- PFI-ST-04: link patient_files to media_files library row (rule 4).
-- Adds nullable FK media_file_id → media_files.id (onDelete: set null).
-- media_files row survives patient_files deletion; linked when upload
-- is routed through the patient's «Пациенты» subfolder.

ALTER TABLE "patient_files"
  ADD COLUMN IF NOT EXISTS "media_file_id" uuid;

ALTER TABLE "patient_files"
  ADD CONSTRAINT "patient_files_media_file_id_fkey"
  FOREIGN KEY ("media_file_id")
  REFERENCES "media_files"("id")
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_patient_files_media_file_id"
  ON "patient_files" ("media_file_id")
  WHERE media_file_id IS NOT NULL;
