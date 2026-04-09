-- Persistent admin/doctor operational audit trail (admin UI «Лог операций»).
-- See docs/REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md and strict purge plan §0.

CREATE TABLE admin_audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID        REFERENCES platform_users(id) ON DELETE SET NULL,
  action       TEXT        NOT NULL,
  target_id    TEXT,
  conflict_key TEXT,
  details      JSONB       NOT NULL DEFAULT '{}',
  status       TEXT        NOT NULL DEFAULT 'ok',
  repeat_count INTEGER     NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_log_status_check CHECK (status IN ('ok', 'partial_failure', 'error'))
);

CREATE INDEX idx_admin_audit_log_created ON admin_audit_log (created_at DESC);
CREATE INDEX idx_admin_audit_log_action ON admin_audit_log (action);
CREATE INDEX idx_admin_audit_log_target ON admin_audit_log (target_id) WHERE target_id IS NOT NULL;
CREATE INDEX idx_admin_audit_log_conflict_key ON admin_audit_log (conflict_key) WHERE conflict_key IS NOT NULL;

-- At most one open row per conflict_key (dedup for auto_merge_conflict).
CREATE UNIQUE INDEX idx_admin_audit_log_conflict_open ON admin_audit_log (conflict_key)
  WHERE conflict_key IS NOT NULL AND resolved_at IS NULL;
