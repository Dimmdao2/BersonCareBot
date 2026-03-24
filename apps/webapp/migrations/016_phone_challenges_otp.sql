-- OTP: попытки ввода кода, блокировка по номеру, индекс по телефону для rate-limit.
ALTER TABLE phone_challenges
  ADD COLUMN IF NOT EXISTS verify_attempts SMALLINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS phone_otp_locks (
  phone_normalized TEXT PRIMARY KEY,
  locked_until BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phone_challenges_phone ON phone_challenges (phone);
