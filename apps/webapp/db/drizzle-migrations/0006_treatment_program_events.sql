CREATE TABLE "treatment_program_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"actor_id" uuid,
	"event_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "treatment_program_events" ADD CONSTRAINT "treatment_program_events_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."treatment_program_instances"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "treatment_program_events" ADD CONSTRAINT "treatment_program_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "treatment_program_events" ADD CONSTRAINT "treatment_program_events_event_type_check" CHECK (event_type = ANY (ARRAY[
  'item_added'::text,
  'item_removed'::text,
  'item_replaced'::text,
  'comment_changed'::text,
  'stage_added'::text,
  'stage_removed'::text,
  'stage_skipped'::text,
  'stage_completed'::text,
  'status_changed'::text,
  'test_completed'::text
]));
--> statement-breakpoint
ALTER TABLE "treatment_program_events" ADD CONSTRAINT "treatment_program_events_target_type_check" CHECK (target_type = ANY (ARRAY['stage'::text, 'stage_item'::text, 'program'::text]));
--> statement-breakpoint
CREATE INDEX "idx_treatment_program_events_instance_created" ON "treatment_program_events" USING btree ("instance_id" uuid_ops,"created_at" timestamptz_ops DESC NULLS FIRST);
