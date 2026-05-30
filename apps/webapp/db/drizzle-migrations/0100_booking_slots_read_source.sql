-- Transitional read: patient slots default to Rubitime until explicit cutover to canonical scheduling.
INSERT INTO system_settings (key, scope, value_json, updated_at, updated_by)
VALUES
  (
    'booking_slots_read_source',
    'admin',
    jsonb_build_object('value', 'rubitime'),
    now(),
    NULL
  )
ON CONFLICT (key, scope) DO NOTHING;

INSERT INTO integrator.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES
  (
    'booking_slots_read_source',
    'admin',
    jsonb_build_object('value', 'rubitime'),
    now(),
    NULL
  )
ON CONFLICT (key, scope) DO NOTHING;
