-- Quiet hours: optional local minute-of-day range per rule (nullable = disabled).

BEGIN;

ALTER TABLE reminder_rules
  ADD COLUMN IF NOT EXISTS quiet_hours_start_minute INTEGER,
  ADD COLUMN IF NOT EXISTS quiet_hours_end_minute INTEGER;

COMMENT ON COLUMN reminder_rules.quiet_hours_start_minute IS 'Minute 0-1439 inclusive; NULL if quiet hours disabled';
COMMENT ON COLUMN reminder_rules.quiet_hours_end_minute IS 'Minute 1-1440 (exclusive upper like window_end_minute); NULL if quiet hours disabled';

COMMIT;
