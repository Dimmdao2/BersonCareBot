-- Клиническое ядро карты пациента: визиты, жалобы, диагнозы, справочник диагнозов.
-- Жалобы/диагнозы — «состояние» во времени; severity/уточнения пишутся в *_update,
-- каждая привязана к визиту. Справочник диагнозов — собственный, общеклиничный.
-- patient_files.visit_id получает FK на clinical_visit (единый источник файлов).

CREATE TABLE "clinical_diagnosis_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "label" text NOT NULL,
  "note" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_diagnosis_catalog_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "platform_users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "idx_clinical_diagnosis_catalog_label" ON "clinical_diagnosis_catalog" ("label");
--> statement-breakpoint

CREATE TABLE "clinical_visit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "visit_type" text NOT NULL,
  "visited_at" timestamptz NOT NULL,
  "location" text,
  "service" text,
  "duration" text,
  "appointment_record_id" uuid,
  "exam" text,
  "manipulations" text,
  "trial_results" text,
  "recommendations" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_visit_visit_type_check" CHECK (
    visit_type = ANY (ARRAY['first'::text, 'repeat'::text])
  ),
  CONSTRAINT "clinical_visit_patient_user_id_fkey" FOREIGN KEY ("patient_user_id")
    REFERENCES "platform_users"("id") ON DELETE CASCADE,
  CONSTRAINT "clinical_visit_appointment_record_id_fkey" FOREIGN KEY ("appointment_record_id")
    REFERENCES "appointment_records"("id") ON DELETE SET NULL,
  CONSTRAINT "clinical_visit_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "platform_users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "idx_clinical_visit_patient_user_id" ON "clinical_visit" ("patient_user_id");
--> statement-breakpoint
CREATE INDEX "idx_clinical_visit_visited_at" ON "clinical_visit" ("visited_at");
--> statement-breakpoint

CREATE TABLE "clinical_complaint" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "text" text NOT NULL,
  "priority" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "source_visit_id" uuid NOT NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_complaint_status_check" CHECK (
    status = ANY (ARRAY['active'::text, 'resolved'::text])
  ),
  CONSTRAINT "clinical_complaint_patient_user_id_fkey" FOREIGN KEY ("patient_user_id")
    REFERENCES "platform_users"("id") ON DELETE CASCADE,
  CONSTRAINT "clinical_complaint_source_visit_id_fkey" FOREIGN KEY ("source_visit_id")
    REFERENCES "clinical_visit"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "idx_clinical_complaint_patient_user_id" ON "clinical_complaint" ("patient_user_id");
--> statement-breakpoint

CREATE TABLE "clinical_complaint_update" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "complaint_id" uuid NOT NULL,
  "visit_id" uuid NOT NULL,
  "note" text,
  "severity" integer NOT NULL,
  "resolved" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_complaint_update_severity_check" CHECK (severity >= 0 AND severity <= 10),
  CONSTRAINT "clinical_complaint_update_complaint_id_fkey" FOREIGN KEY ("complaint_id")
    REFERENCES "clinical_complaint"("id") ON DELETE CASCADE,
  CONSTRAINT "clinical_complaint_update_visit_id_fkey" FOREIGN KEY ("visit_id")
    REFERENCES "clinical_visit"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "idx_clinical_complaint_update_complaint_id" ON "clinical_complaint_update" ("complaint_id");
--> statement-breakpoint
CREATE INDEX "idx_clinical_complaint_update_visit_id" ON "clinical_complaint_update" ("visit_id");
--> statement-breakpoint

CREATE TABLE "clinical_diagnosis" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "catalog_id" uuid,
  "text" text NOT NULL,
  "priority" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "source_visit_id" uuid NOT NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_diagnosis_status_check" CHECK (
    status = ANY (ARRAY['active'::text, 'refined'::text, 'resolved'::text])
  ),
  CONSTRAINT "clinical_diagnosis_patient_user_id_fkey" FOREIGN KEY ("patient_user_id")
    REFERENCES "platform_users"("id") ON DELETE CASCADE,
  CONSTRAINT "clinical_diagnosis_catalog_id_fkey" FOREIGN KEY ("catalog_id")
    REFERENCES "clinical_diagnosis_catalog"("id") ON DELETE SET NULL,
  CONSTRAINT "clinical_diagnosis_source_visit_id_fkey" FOREIGN KEY ("source_visit_id")
    REFERENCES "clinical_visit"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "idx_clinical_diagnosis_patient_user_id" ON "clinical_diagnosis" ("patient_user_id");
--> statement-breakpoint

CREATE TABLE "clinical_diagnosis_update" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "diagnosis_id" uuid NOT NULL,
  "visit_id" uuid NOT NULL,
  "refinement" text,
  "status" text NOT NULL,
  "removed" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_diagnosis_update_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id")
    REFERENCES "clinical_diagnosis"("id") ON DELETE CASCADE,
  CONSTRAINT "clinical_diagnosis_update_visit_id_fkey" FOREIGN KEY ("visit_id")
    REFERENCES "clinical_visit"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "idx_clinical_diagnosis_update_diagnosis_id" ON "clinical_diagnosis_update" ("diagnosis_id");
--> statement-breakpoint
CREATE INDEX "idx_clinical_diagnosis_update_visit_id" ON "clinical_diagnosis_update" ("visit_id");
--> statement-breakpoint

-- patient_files.visit_id уже существует (миграция 0120) как nullable uuid без FK;
-- добавляем FK на clinical_visit (единый источник файлов).
ALTER TABLE "patient_files"
  ADD CONSTRAINT "patient_files_visit_id_fkey" FOREIGN KEY ("visit_id")
  REFERENCES "clinical_visit"("id") ON DELETE SET NULL;
