-- LFK exercise line `side`: add damaged / healthy (шаблон и строки комплекса пациента).

ALTER TABLE "lfk_complex_template_exercises" DROP CONSTRAINT "lfk_complex_template_exercises_side_check";--> statement-breakpoint
ALTER TABLE "lfk_complex_template_exercises" ADD CONSTRAINT "lfk_complex_template_exercises_side_check" CHECK ((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text, 'damaged'::text, 'healthy'::text])));--> statement-breakpoint
ALTER TABLE "lfk_complex_exercises" DROP CONSTRAINT "lfk_complex_exercises_side_check";--> statement-breakpoint
ALTER TABLE "lfk_complex_exercises" ADD CONSTRAINT "lfk_complex_exercises_side_check" CHECK ((side IS NULL) OR (side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text, 'damaged'::text, 'healthy'::text])));
