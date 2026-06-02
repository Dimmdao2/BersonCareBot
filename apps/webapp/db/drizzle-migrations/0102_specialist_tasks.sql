-- Specialist tasks (global + per-patient); phase 2C

CREATE TABLE IF NOT EXISTS "specialist_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "patient_user_id" uuid,
  "title" text NOT NULL,
  "description" text,
  "due_at" timestamptz,
  "remind_at" timestamptz,
  "is_important" boolean DEFAULT false NOT NULL,
  "completed_at" timestamptz,
  "reminder_sent_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE "specialist_tasks" ADD CONSTRAINT "specialist_tasks_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "platform_users"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_specialist_tasks_owner" ON "specialist_tasks" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "idx_specialist_tasks_patient" ON "specialist_tasks" ("patient_user_id");
CREATE INDEX IF NOT EXISTS "idx_specialist_tasks_remind_open" ON "specialist_tasks" ("remind_at");
