-- 0115: No-show handling — per-patient counter + history table.
--
-- (a) no_show_count on be_patient_booking_profiles:
--     Per-patient lifetime counter; incremented atomically in the mark-no-show
--     transaction.  Guarded by terminal-status check → no double-counting.
--
-- (b) be_appointment_no_shows:
--     History record for each no-show (mirrors be_appointment_cancellations
--     / be_appointment_reschedules pattern); stores actor, reason, staff-comment,
--     notifications_sent JSONB for audit / the notification-patch path.
--
-- NOTE: Orchestrator branch uses 0124 for the same feature; renumber at merge.

ALTER TABLE "be_patient_booking_profiles"
  ADD COLUMN IF NOT EXISTS "no_show_count" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "be_appointment_no_shows" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id"     uuid NOT NULL,
  "appointment_id"      uuid NOT NULL,
  "actor_type"          text NOT NULL,
  "actor_id"            uuid,
  "reason"              text,
  "staff_comment"       text,
  "notifications_sent"  jsonb NOT NULL DEFAULT '{}'::jsonb,
  "manual_override"     boolean NOT NULL DEFAULT false,
  "created_at"          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "be_appointment_no_shows_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "be_organizations" ("id") ON DELETE CASCADE,
  CONSTRAINT "be_appointment_no_shows_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "be_appointments" ("id") ON DELETE CASCADE,
  CONSTRAINT "be_appointment_no_shows_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "platform_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "be_appt_no_shows_actor_check"
    CHECK (actor_type = ANY (ARRAY[
      'specialist'::text,
      'admin'::text,
      'system'::text
    ]))
);

CREATE INDEX IF NOT EXISTS "idx_be_appt_no_shows_appt"
  ON "be_appointment_no_shows" ("appointment_id", "created_at" DESC);
