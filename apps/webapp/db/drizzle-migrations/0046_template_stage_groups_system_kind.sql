ALTER TABLE "treatment_program_template_stage_groups" ADD COLUMN "system_kind" text;--> statement-breakpoint
ALTER TABLE "treatment_program_template_stage_groups" ADD CONSTRAINT "treatment_program_template_stage_groups_system_kind_check" CHECK (system_kind IS NULL OR system_kind = ANY (ARRAY['recommendations'::text, 'tests'::text]));--> statement-breakpoint
CREATE UNIQUE INDEX "treatment_program_template_stage_groups_one_rec_per_stage" ON "treatment_program_template_stage_groups" USING btree ("stage_id") WHERE (system_kind = 'recommendations');--> statement-breakpoint
CREATE UNIQUE INDEX "treatment_program_template_stage_groups_one_tests_per_stage" ON "treatment_program_template_stage_groups" USING btree ("stage_id") WHERE (system_kind = 'tests');--> statement-breakpoint
INSERT INTO treatment_program_template_stage_groups (id, stage_id, title, description, schedule_text, sort_order, system_kind)
SELECT gen_random_uuid(), s.id, 'Рекомендации', NULL, NULL, 101, 'recommendations'::text
FROM treatment_program_template_stages s
WHERE s.sort_order > 0
  AND NOT EXISTS (
    SELECT 1 FROM treatment_program_template_stage_groups g
    WHERE g.stage_id = s.id AND g.system_kind = 'recommendations'
  );--> statement-breakpoint
INSERT INTO treatment_program_template_stage_groups (id, stage_id, title, description, schedule_text, sort_order, system_kind)
SELECT gen_random_uuid(), s.id, 'Тестирование', NULL, NULL, 102, 'tests'::text
FROM treatment_program_template_stages s
WHERE s.sort_order > 0
  AND NOT EXISTS (
    SELECT 1 FROM treatment_program_template_stage_groups g
    WHERE g.stage_id = s.id AND g.system_kind = 'tests'
  );--> statement-breakpoint
UPDATE treatment_program_instance_stage_groups
SET title = 'Тестирование'
WHERE system_kind = 'tests' AND title = 'Тесты';
