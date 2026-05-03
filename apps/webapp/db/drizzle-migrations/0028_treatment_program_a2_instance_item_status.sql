ALTER TABLE "treatment_program_events" DROP CONSTRAINT "treatment_program_events_event_type_check";--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" ADD COLUMN "is_actionable" boolean;--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" ADD CONSTRAINT "treatment_program_instance_stage_items_status_check" CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text]));--> statement-breakpoint
ALTER TABLE "treatment_program_events" ADD CONSTRAINT "treatment_program_events_event_type_check" CHECK (event_type = ANY (ARRAY[
        'item_added'::text,
        'item_removed'::text,
        'item_disabled'::text,
        'item_enabled'::text,
        'item_replaced'::text,
        'comment_changed'::text,
        'stage_added'::text,
        'stage_removed'::text,
        'stage_skipped'::text,
        'stage_completed'::text,
        'status_changed'::text,
        'test_completed'::text
      ]));