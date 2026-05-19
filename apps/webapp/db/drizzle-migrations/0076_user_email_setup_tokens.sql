CREATE TABLE IF NOT EXISTS "user_email_setup_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "email_normalized" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "revoked_at" timestamptz,
  "source" text NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "user_email_setup_tokens_source_check" CHECK (
    source = ANY (
      ARRAY[
        'rubitime'::text,
        'doctor_profile'::text,
        'manual_resend'::text,
        'registration_claim'::text
      ]
    )
  )
);

ALTER TABLE "user_email_setup_tokens"
  ADD CONSTRAINT "user_email_setup_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "user_email_setup_tokens"
  ADD CONSTRAINT "user_email_setup_tokens_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."platform_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE UNIQUE INDEX IF NOT EXISTS "user_email_setup_tokens_token_hash_key"
  ON "user_email_setup_tokens" USING btree ("token_hash");

CREATE INDEX IF NOT EXISTS "idx_user_email_setup_tokens_user_email"
  ON "user_email_setup_tokens" USING btree ("user_id", "email_normalized");

CREATE INDEX IF NOT EXISTS "idx_user_email_setup_tokens_expires_at"
  ON "user_email_setup_tokens" USING btree ("expires_at");
