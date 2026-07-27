-- The calendar map now stores canonical appointment keys only.
ALTER TABLE public.booking_calendar_map
  RENAME COLUMN rubitime_record_id TO appointment_key;

ALTER TABLE public.booking_calendar_map
  RENAME CONSTRAINT booking_calendar_map_rubitime_record_id_key
  TO booking_calendar_map_appointment_key_key;
