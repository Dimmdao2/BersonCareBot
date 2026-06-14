-- Файлы пациента: единый источник файлов (standalone + из визита).
-- Категории: выписка | снимок | анализ | фото_теста | прочее
-- visit_id nullable — FK к визиту (TODO: add FK constraint when visits table exists).

CREATE TABLE "patient_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "category" text NOT NULL,
  "file_name" text NOT NULL,
  "s3_key" text NOT NULL,
  "s3_bucket" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "visit_id" uuid,
  "uploaded_by_user_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "patient_files_category_check" CHECK (
    category = ANY (ARRAY['выписка'::text, 'снимок'::text, 'анализ'::text, 'фото_теста'::text, 'прочее'::text])
  ),
  CONSTRAINT "patient_files_patient_user_id_fkey" FOREIGN KEY ("patient_user_id")
    REFERENCES "platform_users"("id") ON DELETE CASCADE,
  CONSTRAINT "patient_files_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id")
    REFERENCES "platform_users"("id") ON DELETE RESTRICT
);

CREATE INDEX "idx_patient_files_patient_user_id" ON "patient_files" ("patient_user_id");
CREATE INDEX "idx_patient_files_category" ON "patient_files" ("category");
CREATE INDEX "idx_patient_files_visit_id" ON "patient_files" ("visit_id") WHERE visit_id IS NOT NULL;
