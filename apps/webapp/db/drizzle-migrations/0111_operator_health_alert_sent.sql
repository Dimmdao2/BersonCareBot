CREATE TABLE IF NOT EXISTS "operator_health_alert_sent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dedup_key" text NOT NULL,
  "severity" text NOT NULL,
  "sent_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_operator_health_alert_sent_dedup_sent_at"
  ON "operator_health_alert_sent" USING btree ("dedup_key", "sent_at" DESC);
