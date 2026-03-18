-- Phone auth challenges (security-sensitive; must persist when DATABASE_URL is set).
CREATE TABLE IF NOT EXISTS phone_challenges (
  challenge_id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  code TEXT,
  channel_context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_challenges_expires_at ON phone_challenges (expires_at);

-- Message log for doctor-messaging (audit trail).
CREATE TABLE IF NOT EXISTS message_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  text TEXT NOT NULL,
  category TEXT NOT NULL,
  channel_bindings_used JSONB NOT NULL DEFAULT '{}',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT NOT NULL CHECK (outcome IN ('sent', 'partial', 'failed')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_message_log_user_id ON message_log (user_id);
CREATE INDEX IF NOT EXISTS idx_message_log_sent_at ON message_log (sent_at DESC);

-- Broadcast audit log for doctor-broadcasts.
CREATE TABLE IF NOT EXISTS broadcast_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT NOT NULL,
  category TEXT NOT NULL,
  audience_filter TEXT NOT NULL,
  message_title TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  preview_only BOOLEAN NOT NULL DEFAULT false,
  audience_size INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_broadcast_audit_executed_at ON broadcast_audit (executed_at DESC);
