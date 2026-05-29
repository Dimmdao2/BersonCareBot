-- Stage 9: booking reputation (separate from messaging block) + appointment staff comments

CREATE TABLE IF NOT EXISTS "be_patient_booking_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "platform_user_id" uuid NOT NULL,
  "is_problematic" boolean DEFAULT false NOT NULL,
  "booking_blocked" boolean DEFAULT false NOT NULL,
  "problematic_note" text,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_be_patient_booking_profiles_org_user"
  ON "be_patient_booking_profiles" ("organization_id", "platform_user_id");
CREATE INDEX IF NOT EXISTS "idx_be_patient_booking_profiles_user"
  ON "be_patient_booking_profiles" ("platform_user_id");

ALTER TABLE "be_patient_booking_profiles" ADD CONSTRAINT "be_patient_booking_profiles_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;
ALTER TABLE "be_patient_booking_profiles" ADD CONSTRAINT "be_patient_booking_profiles_platform_user_id_fkey"
  FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE cascade;
ALTER TABLE "be_patient_booking_profiles" ADD CONSTRAINT "be_patient_booking_profiles_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "platform_users"("id") ON DELETE set null;

CREATE TABLE IF NOT EXISTS "be_appointment_staff_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "appointment_id" uuid NOT NULL,
  "platform_user_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_be_appt_staff_comments_appt"
  ON "be_appointment_staff_comments" ("appointment_id");
CREATE INDEX IF NOT EXISTS "idx_be_appt_staff_comments_user"
  ON "be_appointment_staff_comments" ("platform_user_id", "created_at");

ALTER TABLE "be_appointment_staff_comments" ADD CONSTRAINT "be_appointment_staff_comments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;
ALTER TABLE "be_appointment_staff_comments" ADD CONSTRAINT "be_appointment_staff_comments_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "be_appointments"("id") ON DELETE cascade;
ALTER TABLE "be_appointment_staff_comments" ADD CONSTRAINT "be_appointment_staff_comments_platform_user_id_fkey"
  FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE cascade;
ALTER TABLE "be_appointment_staff_comments" ADD CONSTRAINT "be_appointment_staff_comments_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "platform_users"("id") ON DELETE cascade;
