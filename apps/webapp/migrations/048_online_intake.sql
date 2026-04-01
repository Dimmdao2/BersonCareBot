-- Migration 048: Online Intake (LFK + Nutrition)
-- Aдитивная миграция, только новые таблицы. Без downtime.

CREATE TABLE online_intake_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES platform_users(id),
  type        TEXT        NOT NULL CHECK (type IN ('lfk', 'nutrition')),
  status      TEXT        NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'in_review', 'contacted', 'closed')),
  summary     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_online_intake_requests_user_id    ON online_intake_requests (user_id);
CREATE INDEX idx_online_intake_requests_status     ON online_intake_requests (status);
CREATE INDEX idx_online_intake_requests_type       ON online_intake_requests (type);
CREATE INDEX idx_online_intake_requests_created_at ON online_intake_requests (created_at DESC);

CREATE TABLE online_intake_answers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID        NOT NULL REFERENCES online_intake_requests(id) ON DELETE CASCADE,
  question_id TEXT        NOT NULL,
  ordinal     INT         NOT NULL,
  value       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, question_id)
);

CREATE INDEX idx_online_intake_answers_request_id ON online_intake_answers (request_id);

CREATE TABLE online_intake_attachments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID        NOT NULL REFERENCES online_intake_requests(id) ON DELETE CASCADE,
  attachment_type  TEXT        NOT NULL CHECK (attachment_type IN ('file', 'url')),
  s3_key           TEXT,
  url              TEXT,
  mime_type        TEXT,
  size_bytes       BIGINT,
  original_name    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (attachment_type = 'file' AND s3_key IS NOT NULL) OR
    (attachment_type = 'url'  AND url    IS NOT NULL)
  )
);

CREATE INDEX idx_online_intake_attachments_request_id ON online_intake_attachments (request_id);

CREATE TABLE online_intake_status_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID        NOT NULL REFERENCES online_intake_requests(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT        NOT NULL,
  changed_by  UUID        REFERENCES platform_users(id),
  note        TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_online_intake_status_history_request_id ON online_intake_status_history (request_id);
CREATE INDEX idx_online_intake_status_history_changed_at  ON online_intake_status_history (changed_at DESC);
