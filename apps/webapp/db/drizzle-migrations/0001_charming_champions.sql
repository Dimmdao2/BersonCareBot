CREATE TABLE "tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"test_type" text,
	"scoring_config" jsonb,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" text[],
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_set_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_set_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" text[],
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_set_items" ADD CONSTRAINT "test_set_items_test_set_id_fkey" FOREIGN KEY ("test_set_id") REFERENCES "public"."test_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_set_items" ADD CONSTRAINT "test_set_items_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_sets" ADD CONSTRAINT "test_sets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tests_archived" ON "tests" USING btree ("is_archived" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_tests_title_search" ON "tests" USING btree ("title" text_ops);--> statement-breakpoint
CREATE INDEX "idx_test_set_items_set_order" ON "test_set_items" USING btree ("test_set_id" uuid_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_test_sets_archived" ON "test_sets" USING btree ("is_archived" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_recommendations_archived" ON "recommendations" USING btree ("is_archived" bool_ops);--> statement-breakpoint