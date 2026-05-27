-- После 0081: убрать `lfk_complex` из CHECK типов пунктов шаблона и инстанса.

ALTER TABLE "treatment_program_template_stage_items" DROP CONSTRAINT IF EXISTS "treatment_program_template_stage_items_item_type_check";
--> statement-breakpoint
ALTER TABLE "treatment_program_template_stage_items" ADD CONSTRAINT "treatment_program_template_stage_items_item_type_check" CHECK (item_type = ANY (ARRAY['exercise'::text, 'recommendation'::text, 'lesson'::text, 'clinical_test'::text]));
--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" DROP CONSTRAINT IF EXISTS "treatment_program_instance_stage_items_item_type_check";
--> statement-breakpoint
ALTER TABLE "treatment_program_instance_stage_items" ADD CONSTRAINT "treatment_program_instance_stage_items_item_type_check" CHECK (item_type = ANY (ARRAY['exercise'::text, 'recommendation'::text, 'lesson'::text, 'clinical_test'::text]));
