-- Identity: canonical email_normalized, password credentials, phone history, appointment_records.platform_user_id

ALTER TABLE "platform_users" ADD COLUMN IF NOT EXISTS "email_normalized" text;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_platform_users_email_normalized_active"
ON "platform_users" USING btree ("email_normalized")
WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL;

CREATE TABLE IF NOT EXISTS "user_password_credentials" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "platform_users"("id") ON DELETE CASCADE,
  "password_hash" text NOT NULL,
  "algo" text DEFAULT 'argon2id' NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_phone_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "platform_user_id" uuid NOT NULL REFERENCES "platform_users"("id") ON DELETE CASCADE,
  "phone_normalized" text NOT NULL,
  "valid_from" timestamptz DEFAULT now() NOT NULL,
  "valid_to" timestamptz,
  "source" text NOT NULL,
  CONSTRAINT "user_phone_history_source_check" CHECK (
    source = ANY (ARRAY['otp'::text, 'messenger'::text, 'merge'::text, 'admin'::text, 'projection'::text])
  )
);

CREATE INDEX IF NOT EXISTS "idx_user_phone_history_phone"
ON "user_phone_history" USING btree ("phone_normalized");

CREATE INDEX IF NOT EXISTS "idx_user_phone_history_user"
ON "user_phone_history" USING btree ("platform_user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_phone_history_phone_active"
ON "user_phone_history" USING btree ("phone_normalized")
WHERE valid_to IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_phone_history_user_active"
ON "user_phone_history" USING btree ("platform_user_id")
WHERE valid_to IS NULL;

ALTER TABLE "appointment_records" ADD COLUMN IF NOT EXISTS "platform_user_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointment_records_platform_user_id_fkey'
  ) THEN
    ALTER TABLE "appointment_records"
      ADD CONSTRAINT "appointment_records_platform_user_id_fkey"
      FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_appointment_records_platform_user_id"
ON "appointment_records" USING btree ("platform_user_id")
WHERE platform_user_id IS NOT NULL;

-- Backfill normalized email for existing canonical rows (verified emails).
UPDATE platform_users pu
SET email_normalized = lower(btrim(pu.email))
WHERE pu.merged_into_id IS NULL
  AND pu.email IS NOT NULL
  AND btrim(pu.email) <> ''
  AND pu.email_normalized IS DISTINCT FROM lower(btrim(pu.email));

-- Seed phone history for current verified phones (one open spell per user).
INSERT INTO user_phone_history (platform_user_id, phone_normalized, valid_from, valid_to, source)
SELECT pu.id, pu.phone_normalized, pu.created_at, NULL::timestamptz, 'otp'::text
FROM platform_users pu
WHERE pu.merged_into_id IS NULL
  AND pu.phone_normalized IS NOT NULL
  AND btrim(pu.phone_normalized) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM user_phone_history h
    WHERE h.platform_user_id = pu.id AND h.valid_to IS NULL
  );
