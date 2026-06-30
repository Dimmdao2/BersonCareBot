-- Сопутствующие заболевания пациента: soft-delete (status active/removed).
-- since хранится как свободный текст (напр. «с 2017», «с рождения»).

CREATE TABLE "patient_comorbidity" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "text" text NOT NULL,
  "since" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_by" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "removed_at" timestamptz,
  CONSTRAINT "patient_comorbidity_status_check"
    CHECK (status = ANY (ARRAY['active'::text, 'removed'::text])),
  CONSTRAINT "patient_comorbidity_patient_user_id_fkey"
    FOREIGN KEY ("patient_user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE,
  CONSTRAINT "patient_comorbidity_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "platform_users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "idx_patient_comorbidity_patient_user_id"
  ON "patient_comorbidity" ("patient_user_id");
--> statement-breakpoint
CREATE INDEX "idx_patient_comorbidity_status"
  ON "patient_comorbidity" ("patient_user_id", "status");
