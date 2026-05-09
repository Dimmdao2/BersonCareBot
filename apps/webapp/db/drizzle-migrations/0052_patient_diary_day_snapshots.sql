CREATE TABLE IF NOT EXISTS "patient_diary_day_snapshots" (
	"platform_user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"iana" text NOT NULL,
	"warmup_slot_limit" integer NOT NULL,
	"warmup_done_count" integer NOT NULL,
	"warmup_all_done" boolean NOT NULL,
	"plan_instance_id" uuid,
	"plan_item_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"plan_done_mask" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"captured_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "patient_diary_day_snapshots_platform_user_id_local_date_pk" PRIMARY KEY("platform_user_id","local_date")
);
