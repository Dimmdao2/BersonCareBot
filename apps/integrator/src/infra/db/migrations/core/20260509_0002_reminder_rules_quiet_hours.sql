-- Mirror webapp: quiet hours on integrator.user_reminder_rules for dispatch policy.

BEGIN;

ALTER TABLE integrator.user_reminder_rules
  ADD COLUMN IF NOT EXISTS quiet_hours_start_minute INTEGER,
  ADD COLUMN IF NOT EXISTS quiet_hours_end_minute INTEGER;

COMMIT;
