CREATE TABLE "material_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"stars" smallint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_ratings_target_kind_check" CHECK (target_kind = ANY (ARRAY['content_page'::text, 'lfk_exercise'::text, 'lfk_complex'::text])),
	CONSTRAINT "material_ratings_stars_check" CHECK ((stars >= 1) AND (stars <= 5))
);
--> statement-breakpoint
ALTER TABLE "material_ratings" ADD CONSTRAINT "material_ratings_user_id_platform_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "material_ratings" ADD CONSTRAINT "material_ratings_user_target_unique" UNIQUE("user_id","target_kind","target_id");
--> statement-breakpoint
CREATE INDEX "idx_material_ratings_target" ON "material_ratings" USING btree ("target_kind" text_ops,"target_id" uuid_ops);
