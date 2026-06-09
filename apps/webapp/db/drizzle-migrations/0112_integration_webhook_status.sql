CREATE TABLE IF NOT EXISTS "integration_webhook_last_status" (
  "source" text PRIMARY KEY NOT NULL,
  "received_at" timestamptz NOT NULL,
  "processed_ok" integer NOT NULL,
  "error_class" text,
  "http_status_returned" integer,
  "detail" text
);

CREATE TABLE IF NOT EXISTS "integration_webhook_error_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source" text NOT NULL,
  "error_class" text NOT NULL,
  "occurred_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_integration_webhook_error_events_burst"
  ON "integration_webhook_error_events" ("source", "error_class", "occurred_at" DESC);
