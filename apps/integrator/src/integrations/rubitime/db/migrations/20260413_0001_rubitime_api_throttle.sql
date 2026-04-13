-- Global spacing between Rubitime API2 calls (integrator process pool + multi-instance via advisory lock).
-- Rubitime: "Отправлять запросы можно не чаще одного раза в 5 секунд."
CREATE TABLE IF NOT EXISTS rubitime_api_throttle (
  id smallint PRIMARY KEY CHECK (id = 1),
  last_completed_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z'
);

INSERT INTO rubitime_api_throttle (id, last_completed_at)
VALUES (1, '1970-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
