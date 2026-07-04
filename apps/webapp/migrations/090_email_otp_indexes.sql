-- Indexes for public email-OTP login flow (task #372).
-- New queries search email_challenges by email (not user_id) and email_send_cooldowns by email_normalized alone.

-- findLatestEmailChallengeByEmail: WHERE email = $1 AND expires_at > $2 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_email_challenges_email
  ON email_challenges (email, expires_at);

-- findEmailSendCooldownByEmail: WHERE email_normalized = $1 ORDER BY last_sent_at DESC
-- PK is (user_id, email_normalized) — cannot use for email_normalized-only lookup.
CREATE INDEX IF NOT EXISTS idx_email_send_cooldowns_email_normalized
  ON email_send_cooldowns (email_normalized, last_sent_at DESC);
