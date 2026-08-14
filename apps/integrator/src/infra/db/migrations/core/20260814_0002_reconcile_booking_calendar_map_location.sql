-- Forward reconciliation for a split-ledger state observed on TEST: the integrator ledger marked
-- 20260727_0002 as applied, but only the old integrator.booking_calendar_map remained. Runtime named
-- roots and the access declaration use the canonical public relation.

CREATE TABLE IF NOT EXISTS public.booking_calendar_map (
  id bigserial PRIMARY KEY,
  appointment_key text NOT NULL UNIQUE,
  gcal_event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  source_column text;
  noncanonical_count bigint;
  conflict_count bigint;
BEGIN
  -- Reconcile the earlier public shape as well, if a target retained it under the provider-era name.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'booking_calendar_map'
      AND column_name = 'rubitime_record_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'booking_calendar_map'
      AND column_name = 'appointment_key'
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
      AND contype = 'u'
  ) THEN
    ALTER TABLE public.booking_calendar_map
      ADD CONSTRAINT booking_calendar_map_appointment_key_key UNIQUE (appointment_key);
  END IF;

  IF to_regclass('integrator.booking_calendar_map') IS NOT NULL THEN
    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'integrator' AND table_name = 'booking_calendar_map'
          AND column_name = 'appointment_key'
      ) THEN 'appointment_key'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'integrator' AND table_name = 'booking_calendar_map'
          AND column_name = 'rubitime_record_id'
      ) THEN 'rubitime_record_id'
      ELSE NULL
    END INTO source_column;

    IF source_column IS NULL THEN
      RAISE EXCEPTION 'booking_calendar_map reconciliation: legacy key column is unknown'
        USING ERRCODE = '23514';
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM integrator.booking_calendar_map WHERE %I !~ %L',
      source_column,
      '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    ) INTO noncanonical_count;
    IF noncanonical_count > 0 THEN
      RAISE EXCEPTION
        'booking_calendar_map reconciliation: % legacy rows have non-canonical appointment keys',
        noncanonical_count
        USING ERRCODE = '23514';
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM integrator.booking_calendar_map legacy '
      || 'JOIN public.booking_calendar_map canonical ON canonical.appointment_key = legacy.%I '
      || 'WHERE canonical.gcal_event_id IS DISTINCT FROM legacy.gcal_event_id',
      source_column
    ) INTO conflict_count;
    IF conflict_count > 0 THEN
      RAISE EXCEPTION
        'booking_calendar_map reconciliation: % canonical/legacy event mappings conflict',
        conflict_count
        USING ERRCODE = '23514';
    END IF;

    EXECUTE format(
      'INSERT INTO public.booking_calendar_map (appointment_key, gcal_event_id, created_at, updated_at) '
      || 'SELECT %I, gcal_event_id, created_at, updated_at FROM integrator.booking_calendar_map '
      || 'ON CONFLICT (appointment_key) DO NOTHING',
      source_column
    );
    DROP TABLE integrator.booking_calendar_map;
  END IF;
END $$;
