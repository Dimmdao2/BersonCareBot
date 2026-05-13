-- Operator health MVP: persistent incidents + backup job status ticks.
CREATE TABLE IF NOT EXISTS "operator_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedup_key" text NOT NULL,
	"direction" text NOT NULL,
	"integration" text NOT NULL,
	"error_class" text NOT NULL,
	"error_detail" text,
	"opened_at" timestamptz DEFAULT now() NOT NULL,
	"last_seen_at" timestamptz DEFAULT now() NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"resolved_at" timestamptz,
	"alert_sent_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "operator_incidents_open_dedup_key_uniq"
	ON "operator_incidents" USING btree ("dedup_key" text_ops)
	WHERE (resolved_at IS NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_operator_incidents_open_last_seen"
	ON "operator_incidents" USING btree ("last_seen_at" timestamptz_ops DESC)
	WHERE (resolved_at IS NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "operator_job_status" (
	"job_key" text PRIMARY KEY NOT NULL,
	"job_family" text NOT NULL,
	"last_status" text NOT NULL,
	"last_started_at" timestamptz,
	"last_finished_at" timestamptz,
	"last_success_at" timestamptz,
	"last_failure_at" timestamptz,
	"last_duration_ms" integer,
	"last_error" text,
	"meta_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_operator_job_status_family_key"
	ON "operator_job_status" USING btree ("job_family" text_ops, "job_key" text_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_operator_job_status_last_finished"
	ON "operator_job_status" USING btree ("last_finished_at" timestamptz_ops DESC);
