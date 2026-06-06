ALTER TABLE "user_channel_bindings"
  ADD COLUMN IF NOT EXISTS "bot_blocked_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "bot_blocked_reason" text;

ALTER TABLE "outgoing_delivery_queue"
  ADD COLUMN IF NOT EXISTS "failure_class" text;

ALTER TABLE "broadcast_audit"
  ADD COLUMN IF NOT EXISTS "blocked_recipient_count" integer DEFAULT 0 NOT NULL;
