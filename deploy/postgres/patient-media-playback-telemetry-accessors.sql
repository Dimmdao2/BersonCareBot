-- Pin the narrow playback telemetry accessors to the existing protected NOLOGIN definer role.
-- Runtime roles receive EXECUTE only; they never receive DML on the aggregate/event tables.

DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
     OR to_regprocedure('app.increment_media_playback_resolution_stat(uuid,uuid,text,boolean)') IS NULL
     OR to_regprocedure('app.record_media_playback_resolution_event(uuid,uuid,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'patient_media_playback_telemetry_accessor_preflight_failed';
  END IF;
END
$preflight$;

GRANT SELECT ON TABLE public.media_files TO app_owner;
-- INSERT .. ON CONFLICT DO UPDATE reads the existing counters in the UPDATE
-- expression, so PostgreSQL also requires SELECT for the protected definer.
GRANT SELECT, INSERT, UPDATE ON TABLE public.media_playback_stats_hourly TO app_owner;
GRANT INSERT ON TABLE public.media_playback_resolution_events TO app_owner;

ALTER FUNCTION app.increment_media_playback_resolution_stat(uuid, uuid, text, boolean)
  OWNER TO app_owner;
ALTER FUNCTION app.record_media_playback_resolution_event(uuid, uuid, text, boolean)
  OWNER TO app_owner;

REVOKE ALL ON FUNCTION app.increment_media_playback_resolution_stat(uuid, uuid, text, boolean)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_media_playback_resolution_event(uuid, uuid, text, boolean)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.increment_media_playback_resolution_stat(uuid, uuid, text, boolean)
  FROM app_staff;
REVOKE EXECUTE ON FUNCTION app.record_media_playback_resolution_event(uuid, uuid, text, boolean)
  FROM app_staff;
GRANT EXECUTE ON FUNCTION app.increment_media_playback_resolution_stat(uuid, uuid, text, boolean)
  TO app_patient;
GRANT EXECUTE ON FUNCTION app.record_media_playback_resolution_event(uuid, uuid, text, boolean)
  TO app_patient;
