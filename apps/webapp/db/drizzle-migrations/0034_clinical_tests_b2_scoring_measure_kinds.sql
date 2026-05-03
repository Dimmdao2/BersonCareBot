CREATE TABLE "clinical_test_measure_kinds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_test_measure_kinds_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE INDEX "idx_clinical_test_measure_kinds_sort" ON "clinical_test_measure_kinds" USING btree ("sort_order");
--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "scoring" jsonb;
--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "raw_text" text;
--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "assessment_kind" text;
--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "body_region_id" uuid;
--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_body_region_id_fkey" FOREIGN KEY ("body_region_id") REFERENCES "reference_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX "idx_tests_body_region" ON "tests" USING btree ("body_region_id");
--> statement-breakpoint
CREATE INDEX "idx_tests_assessment_kind" ON "tests" USING btree ("assessment_kind");
--> statement-breakpoint
UPDATE "tests"
SET
	"scoring" = CASE
		WHEN "scoring_config" IS NULL THEN NULL
		WHEN jsonb_typeof("scoring_config") = 'object'
			AND ("scoring_config"->>'schema_type') IN ('numeric', 'likert', 'binary', 'qualitative')
			AND jsonb_typeof("scoring_config"->'measure_items') = 'array'
		THEN "scoring_config"
		ELSE jsonb_build_object(
			'schema_type', 'qualitative',
			'measure_items', '[]'::jsonb
		)
	END,
	"raw_text" = CASE
		WHEN "scoring_config" IS NULL THEN "raw_text"
		WHEN jsonb_typeof("scoring_config") = 'object'
			AND ("scoring_config"->>'schema_type') IN ('numeric', 'likert', 'binary', 'qualitative')
			AND jsonb_typeof("scoring_config"->'measure_items') = 'array'
		THEN "raw_text"
		ELSE COALESCE(
			"raw_text",
			CASE
				WHEN "scoring_config" IS NOT NULL
				THEN ('Legacy scoring_config (JSON):' || E'\n' || "scoring_config"::text)
				ELSE NULL
			END
		)
	END
WHERE "scoring" IS NULL;
