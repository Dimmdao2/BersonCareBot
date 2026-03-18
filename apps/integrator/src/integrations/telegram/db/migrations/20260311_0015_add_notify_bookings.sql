-- Add "записи на приём" to notification settings.
ALTER TABLE telegram_state
  ADD COLUMN IF NOT EXISTS notify_bookings BOOLEAN NOT NULL DEFAULT false;
