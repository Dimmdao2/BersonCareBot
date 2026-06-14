-- Анамнез пациента: три секции (травмы/операции, болезни/стрессы, образ жизни).
-- Строки иммутабельные (append-log); не привязаны к визиту — биографические данные.
-- Врач добавляет строки; редактирование отдельным UPDATE (не в этой миграции).

CREATE TABLE "clinical_anamnesis_trauma" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "year" text NOT NULL,
  "what" text NOT NULL,
  "type" text NOT NULL,
  "immobilization" text NOT NULL DEFAULT '—',
  "created_by" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_anamnesis_trauma_patient_fkey" FOREIGN KEY ("patient_user_id")
    REFERENCES "platform_users"("id") ON DELETE CASCADE,
  CONSTRAINT "clinical_anamnesis_trauma_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "platform_users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "idx_clinical_anamnesis_trauma_patient" ON "clinical_anamnesis_trauma" ("patient_user_id");
--> statement-breakpoint

CREATE TABLE "clinical_anamnesis_illness" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "period" text NOT NULL,
  "what" text NOT NULL,
  "comment" text NOT NULL DEFAULT '',
  "created_by" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_anamnesis_illness_patient_fkey" FOREIGN KEY ("patient_user_id")
    REFERENCES "platform_users"("id") ON DELETE CASCADE,
  CONSTRAINT "clinical_anamnesis_illness_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "platform_users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "idx_clinical_anamnesis_illness_patient" ON "clinical_anamnesis_illness" ("patient_user_id");
--> statement-breakpoint

CREATE TABLE "clinical_anamnesis_lifestyle" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "record_date" text NOT NULL,
  "text" text NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_anamnesis_lifestyle_patient_fkey" FOREIGN KEY ("patient_user_id")
    REFERENCES "platform_users"("id") ON DELETE CASCADE,
  CONSTRAINT "clinical_anamnesis_lifestyle_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "platform_users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "idx_clinical_anamnesis_lifestyle_patient" ON "clinical_anamnesis_lifestyle" ("patient_user_id");
