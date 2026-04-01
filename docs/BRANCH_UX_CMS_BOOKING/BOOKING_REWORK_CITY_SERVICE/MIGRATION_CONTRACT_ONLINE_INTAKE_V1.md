# Migration Contract: Online Intake V1

DDL-план и миграционная стратегия для online intake (LFK + Nutrition).

## Файл миграции

`apps/webapp/migrations/048_online_intake.sql`

## DDL

```sql
-- =========================================================
-- online_intake_requests: основная таблица заявок
-- =========================================================
CREATE TABLE online_intake_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES platform_users(id),
  type        TEXT        NOT NULL CHECK (type IN ('lfk', 'nutrition')),
  status      TEXT        NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'in_review', 'contacted', 'closed')),
  summary     TEXT,         -- first 200 chars, populated at insert
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_online_intake_requests_user_id   ON online_intake_requests (user_id);
CREATE INDEX idx_online_intake_requests_status     ON online_intake_requests (status);
CREATE INDEX idx_online_intake_requests_type       ON online_intake_requests (type);
CREATE INDEX idx_online_intake_requests_created_at ON online_intake_requests (created_at DESC);

-- =========================================================
-- online_intake_answers: ответы анкет и описание LFK
-- =========================================================
CREATE TABLE online_intake_answers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID        NOT NULL REFERENCES online_intake_requests(id) ON DELETE CASCADE,
  question_id TEXT        NOT NULL,  -- 'lfk_description' | 'q1'..'q5'
  ordinal     INT         NOT NULL,  -- display/sort order
  value       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, question_id)
);

CREATE INDEX idx_online_intake_answers_request_id ON online_intake_answers (request_id);

-- =========================================================
-- online_intake_attachments: файлы и URL-ссылки
-- =========================================================
CREATE TABLE online_intake_attachments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID        NOT NULL REFERENCES online_intake_requests(id) ON DELETE CASCADE,
  attachment_type  TEXT        NOT NULL CHECK (attachment_type IN ('file', 'url')),
  s3_key           TEXT,       -- для type='file', ключ в S3
  url              TEXT,       -- для type='url', внешняя ссылка
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

-- =========================================================
-- online_intake_status_history: audit trail смен статусов
-- =========================================================
CREATE TABLE online_intake_status_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID        NOT NULL REFERENCES online_intake_requests(id) ON DELETE CASCADE,
  from_status TEXT,                  -- NULL при первой записи
  to_status   TEXT        NOT NULL,
  changed_by  UUID        REFERENCES platform_users(id),
  note        TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_online_intake_status_history_request_id ON online_intake_status_history (request_id);
CREATE INDEX idx_online_intake_status_history_changed_at  ON online_intake_status_history (changed_at DESC);
```

## Rollback (DOWN)

```sql
DROP TABLE IF EXISTS online_intake_status_history;
DROP TABLE IF EXISTS online_intake_attachments;
DROP TABLE IF EXISTS online_intake_answers;
DROP TABLE IF EXISTS online_intake_requests;
```

## Cutover notes

- Миграция аддитивная (только новые таблицы) — безопасна для rolling deploy.
- Нет изменений в существующих таблицах.
- Можно применить при работающем webapp — нет downtime.

## Health check queries

```sql
-- После применения миграции
SELECT to_regclass('public.online_intake_requests');
SELECT to_regclass('public.online_intake_answers');
SELECT to_regclass('public.online_intake_attachments');
SELECT to_regclass('public.online_intake_status_history');

-- Проверить constraints
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name LIKE '%online_intake%';
```
