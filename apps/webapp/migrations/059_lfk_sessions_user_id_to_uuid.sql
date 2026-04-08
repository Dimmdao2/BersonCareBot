-- Migrate lfk_sessions.user_id from TEXT to UUID.
-- All existing values are valid UUIDs (verified before applying).
ALTER TABLE lfk_sessions ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
