-- 002_mailings_status.sql
ALTER TABLE mailings
ADD COLUMN status text NOT NULL DEFAULT 'draft',
ADD COLUMN scheduled_at timestamptz,
ADD COLUMN started_at timestamptz,
ADD COLUMN completed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_mailings_status ON mailings(status);