-- 0136: indexes for public email-OTP login queries
-- Needed by /api/auth/email-otp/start (findLatestEmailChallengeByEmail)
-- and /api/auth/email-otp/start rate-limit check (findEmailSendCooldownByEmail).

-- Lookup active challenge by email (public OTP flow queries by email before userId is known).
CREATE INDEX IF NOT EXISTS idx_email_challenges_email
  ON email_challenges (email);

-- Lookup send-cooldown by email_normalized (rate-limit check before userId is known).
CREATE INDEX IF NOT EXISTS idx_email_send_cooldowns_email_normalized
  ON email_send_cooldowns (email_normalized);
