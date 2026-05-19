CREATE TABLE IF NOT EXISTS "webapp_reminder_occurrences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "integrator_rule_id" text NOT NULL,
  "platform_user_id" uuid NOT NULL,
  "occurrence_key" text NOT NULL,
  "planned_at" timestamptz NOT NULL,
  "status" text DEFAULT 'planned' NOT NULL,
  "sent_at" timestamptz,
  "failed_at" timestamptz,
  "error_code" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE "webapp_reminder_occurrences"
  ADD CONSTRAINT "webapp_reminder_occurrences_platform_user_id_fkey"
  FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE UNIQUE INDEX IF NOT EXISTS "webapp_reminder_occurrences_rule_key_uniq"
  ON "webapp_reminder_occurrences" USING btree ("integrator_rule_id", "occurrence_key");

CREATE INDEX IF NOT EXISTS "webapp_reminder_occurrences_due_idx"
  ON "webapp_reminder_occurrences" USING btree ("status", "planned_at")
  WHERE (status = 'planned');

CREATE INDEX IF NOT EXISTS "webapp_reminder_occurrences_platform_user_idx"
  ON "webapp_reminder_occurrences" USING btree ("platform_user_id");

CREATE INDEX IF NOT EXISTS "webapp_reminder_occurrences_rule_idx"
  ON "webapp_reminder_occurrences" USING btree ("integrator_rule_id");
