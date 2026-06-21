-- 090: system_settings_audit — history of every change to system_settings (who/when/old→new)
CREATE TABLE IF NOT EXISTS system_settings_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT        NOT NULL,
  scope           TEXT        NOT NULL,
  old_value_json  JSONB,
  new_value_json  JSONB       NOT NULL,
  changed_by      UUID        REFERENCES platform_users(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  source          TEXT
);

CREATE INDEX IF NOT EXISTS idx_system_settings_audit_key_at
  ON system_settings_audit (key, changed_at DESC);
