-- Transitional read: doctor list/dashboard default to Rubitime legacy until explicit cutover.
INSERT INTO system_settings (key, scope, value_json, updated_at, updated_by)
VALUES
  (
    'booking_doctor_appointments_read_source',
    'admin',
    jsonb_build_object('value', 'rubitime_legacy'),
    now(),
    NULL
  )
ON CONFLICT (key, scope) DO NOTHING;
