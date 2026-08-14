-- The calendar map now stores canonical appointment keys only.
--
-- 2026-07-28: this migration used to be a plain RENAME, which broke the deploy after the Rubitime
-- removal dropped `booking_calendar_map` outright. That drop was a lead error: the table is NOT a
-- Rubitime artefact — it is what Google Calendar sync uses to remember which calendar event belongs
-- to which appointment (`integrations/google-calendar/sync.ts`). Rubitime only supplied the key.
-- So the table stays, keyed by a neutral `appointment_key`, and this migration now handles both
-- shapes: an old database that still has the provider-named column, and one where the table is
-- missing entirely.

CREATE TABLE IF NOT EXISTS public.booking_calendar_map (
  id bigserial PRIMARY KEY,
  appointment_key text NOT NULL,
  gcal_event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'booking_calendar_map'
      AND column_name = 'rubitime_record_id'
  ) THEN
    ALTER TABLE public.booking_calendar_map RENAME COLUMN rubitime_record_id TO appointment_key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.booking_calendar_map'::regclass
      AND conname = 'booking_calendar_map_rubitime_record_id_key'
  ) THEN
    ALTER TABLE public.booking_calendar_map
      RENAME CONSTRAINT booking_calendar_map_rubitime_record_id_key
      TO booking_calendar_map_appointment_key_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.booking_calendar_map'::regclass
      AND conname = 'booking_calendar_map_appointment_key_key'
  ) THEN
    ALTER TABLE public.booking_calendar_map
      ADD CONSTRAINT booking_calendar_map_appointment_key_key UNIQUE (appointment_key);
  END IF;
END $$;
