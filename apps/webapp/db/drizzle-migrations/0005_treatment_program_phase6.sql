CREATE TABLE "test_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_stage_item_id" uuid NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "test_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"raw_value" jsonb NOT NULL,
	"normalized_decision" text NOT NULL,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_results_normalized_decision_check" CHECK (normalized_decision = ANY (ARRAY['passed'::text, 'failed'::text, 'partial'::text]))
);
--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stages" ADD COLUMN "skip_reason" text;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_instance_stage_item_id_fkey" FOREIGN KEY ("instance_stage_item_id") REFERENCES "public"."treatment_program_instance_stage_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "public"."test_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_test_attempts_stage_item" ON "test_attempts" USING btree ("instance_stage_item_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_test_attempts_patient" ON "test_attempts" USING btree ("patient_user_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_test_attempts_one_open_per_item_patient" ON "test_attempts" USING btree ("instance_stage_item_id","patient_user_id") WHERE completed_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_test_results_attempt" ON "test_results" USING btree ("attempt_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_test_results_test" ON "test_results" USING btree ("test_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_test_results_attempt_test" ON "test_results" USING btree ("attempt_id","test_id");