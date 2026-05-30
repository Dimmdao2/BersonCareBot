-- Supplementary patient contacts for doctor UI (not identity / login).

CREATE TABLE IF NOT EXISTS "platform_user_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "platform_user_id" uuid NOT NULL,
  "contact_type" text NOT NULL,
  "value" text NOT NULL,
  "value_normalized" text NOT NULL,
  "source" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "platform_user_contacts_type_check" CHECK (
    contact_type = ANY (ARRAY[
      'phone'::text,
      'email'::text,
      'whatsapp'::text,
      'telegram'::text,
      'max'::text,
      'vk'::text,
      'other'::text
    ])
  ),
  CONSTRAINT "platform_user_contacts_source_check" CHECK (
    source = ANY (ARRAY[
      'merge'::text,
      'booking'::text,
      'doctor'::text,
      'admin'::text
    ])
  )
);

ALTER TABLE "platform_user_contacts" ADD CONSTRAINT "platform_user_contacts_platform_user_id_fkey"
  FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE cascade;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_platform_user_contacts_user_type_value"
  ON "platform_user_contacts" ("platform_user_id", "contact_type", "value_normalized");

CREATE INDEX IF NOT EXISTS "idx_platform_user_contacts_user"
  ON "platform_user_contacts" ("platform_user_id");
