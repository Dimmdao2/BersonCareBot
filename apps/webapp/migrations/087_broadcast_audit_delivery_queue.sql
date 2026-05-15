-- Рассылки врача: текст в аудите + знаменатель постановки в очередь доставки.
ALTER TABLE broadcast_audit
  ADD COLUMN IF NOT EXISTS message_body text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_jobs_total integer NOT NULL DEFAULT 0;
