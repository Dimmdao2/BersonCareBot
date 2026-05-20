CREATE TABLE IF NOT EXISTS "phone_messenger_bind_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"phone_normalized" text NOT NULL,
	"channel_code" text NOT NULL,
	"purpose" text NOT NULL,
	"user_id" uuid,
	"status" text DEFAULT 'pending_contact' NOT NULL,
	"challenge_id" text,
	"failure_code" text,
	"expires_at" timestamptz NOT NULL,
	"consumed_at" timestamptz,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "phone_messenger_bind_secrets_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "phone_messenger_bind_secrets_channel_code_check" CHECK (channel_code = ANY (ARRAY['telegram'::text, 'max'::text])),
	CONSTRAINT "phone_messenger_bind_secrets_purpose_check" CHECK (purpose = ANY (ARRAY['login'::text, 'profile_bind'::text])),
	CONSTRAINT "phone_messenger_bind_secrets_status_check" CHECK (status = ANY (ARRAY['pending_contact'::text, 'otp_ready'::text, 'failed'::text, 'consumed'::text, 'expired'::text]))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "phone_messenger_bind_secrets" ADD CONSTRAINT "phone_messenger_bind_secrets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_phone_messenger_bind_secrets_expires" ON "phone_messenger_bind_secrets" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_phone_messenger_bind_secrets_phone_status" ON "phone_messenger_bind_secrets" USING btree ("phone_normalized","status");
