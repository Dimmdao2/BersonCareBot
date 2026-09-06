-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 3 AND bool_and(is_nullable = 'YES') FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'clinical_complaint' AND column_name = 'source_visit_id') OR (table_name = 'clinical_complaint_update' AND column_name = 'visit_id') OR (table_name = 'clinical_diagnosis' AND column_name = 'source_visit_id'));
-- Clinical symptoms and diagnoses may be recorded from the patient card without inventing a visit.
ALTER TABLE "clinical_complaint"
  ALTER COLUMN "source_visit_id" DROP NOT NULL;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE "clinical_complaint_update"
  ALTER COLUMN "visit_id" DROP NOT NULL;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE "clinical_diagnosis"
  ALTER COLUMN "source_visit_id" DROP NOT NULL;
