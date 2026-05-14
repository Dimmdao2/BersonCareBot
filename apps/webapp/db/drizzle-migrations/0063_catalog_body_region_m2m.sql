-- M2M body regions for doctor catalog entities (exercises, recommendations, clinical tests).
-- Legacy single-FK columns remain; dual-write: apps set legacy `*_id` to first selected region and sync junction rows.

CREATE TABLE "lfk_exercise_regions" (
	"exercise_id" uuid NOT NULL,
	"region_ref_id" uuid NOT NULL,
	CONSTRAINT "lfk_exercise_regions_pkey" PRIMARY KEY("exercise_id","region_ref_id"),
	CONSTRAINT "lfk_exercise_regions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."lfk_exercises"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "lfk_exercise_regions_region_ref_id_fkey" FOREIGN KEY ("region_ref_id") REFERENCES "public"."reference_items"("id") ON DELETE cascade ON UPDATE no action
);
CREATE INDEX "idx_lfk_exercise_regions_region_ref" ON "lfk_exercise_regions" USING btree ("region_ref_id");

CREATE TABLE "recommendation_regions" (
	"recommendation_id" uuid NOT NULL,
	"body_region_id" uuid NOT NULL,
	CONSTRAINT "recommendation_regions_pkey" PRIMARY KEY("recommendation_id","body_region_id"),
	CONSTRAINT "recommendation_regions_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "recommendation_regions_body_region_id_fkey" FOREIGN KEY ("body_region_id") REFERENCES "public"."reference_items"("id") ON DELETE cascade ON UPDATE no action
);
CREATE INDEX "idx_recommendation_regions_body_region" ON "recommendation_regions" USING btree ("body_region_id");

CREATE TABLE "clinical_test_regions" (
	"clinical_test_id" uuid NOT NULL,
	"body_region_id" uuid NOT NULL,
	CONSTRAINT "clinical_test_regions_pkey" PRIMARY KEY("clinical_test_id","body_region_id"),
	CONSTRAINT "clinical_test_regions_clinical_test_id_fkey" FOREIGN KEY ("clinical_test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "clinical_test_regions_body_region_id_fkey" FOREIGN KEY ("body_region_id") REFERENCES "public"."reference_items"("id") ON DELETE cascade ON UPDATE no action
);
CREATE INDEX "idx_clinical_test_regions_body_region" ON "clinical_test_regions" USING btree ("body_region_id");

INSERT INTO "lfk_exercise_regions" ("exercise_id", "region_ref_id")
SELECT "id", "region_ref_id" FROM "lfk_exercises" WHERE "region_ref_id" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "recommendation_regions" ("recommendation_id", "body_region_id")
SELECT "id", "body_region_id" FROM "recommendations" WHERE "body_region_id" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "clinical_test_regions" ("clinical_test_id", "body_region_id")
SELECT "id", "body_region_id" FROM "tests" WHERE "body_region_id" IS NOT NULL
ON CONFLICT DO NOTHING;
