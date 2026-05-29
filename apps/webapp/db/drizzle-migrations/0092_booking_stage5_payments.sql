-- Stage 5: payments layer + prepayment policies

ALTER TABLE "patient_bookings" DROP CONSTRAINT IF EXISTS "patient_bookings_status_check";
ALTER TABLE "patient_bookings" ADD CONSTRAINT "patient_bookings_status_check" CHECK (
  status = ANY (ARRAY[
    'creating'::text, 'awaiting_payment'::text, 'confirmed'::text, 'cancelling'::text,
    'cancel_failed'::text, 'cancelled'::text, 'rescheduled'::text, 'completed'::text,
    'no_show'::text, 'failed_sync'::text
  ])
);

CREATE TABLE IF NOT EXISTS "be_prepayment_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "mode" text DEFAULT 'disabled' NOT NULL,
  "amount_minor" integer,
  "percent_bps" integer,
  "currency" text DEFAULT 'RUB' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "be_prepayment_policies_mode_check" CHECK (
    mode = ANY (ARRAY['disabled'::text, 'fixed_minor'::text, 'percent'::text, 'full_price'::text])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "be_prepayment_policies_service_uidx"
  ON "be_prepayment_policies" ("organization_id", "service_id");
CREATE INDEX IF NOT EXISTS "idx_be_prepayment_policies_org" ON "be_prepayment_policies" ("organization_id");

ALTER TABLE "be_prepayment_policies" ADD CONSTRAINT "be_prepayment_policies_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;
ALTER TABLE "be_prepayment_policies" ADD CONSTRAINT "be_prepayment_policies_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "be_clinic_services"("id") ON DELETE cascade;

CREATE TABLE IF NOT EXISTS "be_payment_intents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "provider_id" text NOT NULL,
  "appointment_id" uuid,
  "platform_user_id" uuid,
  "product_ref" text,
  "amount_minor" integer NOT NULL,
  "currency" text DEFAULT 'RUB' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "purpose" text DEFAULT 'appointment_prepayment' NOT NULL,
  "provider_intent_ref" text,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "be_payment_intents_amount_check" CHECK (amount_minor >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "be_payment_intents_idempotency_uidx"
  ON "be_payment_intents" ("organization_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "idx_be_payment_intents_appointment" ON "be_payment_intents" ("appointment_id");

ALTER TABLE "be_payment_intents" ADD CONSTRAINT "be_payment_intents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;
ALTER TABLE "be_payment_intents" ADD CONSTRAINT "be_payment_intents_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "be_appointments"("id") ON DELETE set null;
ALTER TABLE "be_payment_intents" ADD CONSTRAINT "be_payment_intents_platform_user_id_fkey"
  FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE set null;

CREATE TABLE IF NOT EXISTS "be_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "payment_intent_id" uuid NOT NULL,
  "appointment_id" uuid,
  "platform_user_id" uuid,
  "provider_id" text NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" text DEFAULT 'RUB' NOT NULL,
  "status" text DEFAULT 'captured' NOT NULL,
  "purpose" text DEFAULT 'appointment_prepayment' NOT NULL,
  "captured_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "be_payments_intent_uidx" ON "be_payments" ("payment_intent_id");
CREATE INDEX IF NOT EXISTS "idx_be_payments_appointment" ON "be_payments" ("appointment_id");

ALTER TABLE "be_payments" ADD CONSTRAINT "be_payments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;
ALTER TABLE "be_payments" ADD CONSTRAINT "be_payments_payment_intent_id_fkey"
  FOREIGN KEY ("payment_intent_id") REFERENCES "be_payment_intents"("id") ON DELETE cascade;
ALTER TABLE "be_payments" ADD CONSTRAINT "be_payments_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "be_appointments"("id") ON DELETE set null;

CREATE TABLE IF NOT EXISTS "be_refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "payment_id" uuid NOT NULL,
  "appointment_id" uuid,
  "amount_minor" integer NOT NULL,
  "currency" text DEFAULT 'RUB' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "reason" text,
  "provider_refund_ref" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "be_refunds_amount_check" CHECK (amount_minor >= 0)
);

CREATE INDEX IF NOT EXISTS "idx_be_refunds_payment" ON "be_refunds" ("payment_id");

ALTER TABLE "be_refunds" ADD CONSTRAINT "be_refunds_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;
ALTER TABLE "be_refunds" ADD CONSTRAINT "be_refunds_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "be_payments"("id") ON DELETE cascade;
ALTER TABLE "be_refunds" ADD CONSTRAINT "be_refunds_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "be_appointments"("id") ON DELETE set null;

CREATE TABLE IF NOT EXISTS "be_payment_provider_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "provider_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "event_type" text NOT NULL,
  "payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "processed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "be_payment_provider_events_idempotency_uidx"
  ON "be_payment_provider_events" ("organization_id", "provider_id", "idempotency_key");

ALTER TABLE "be_payment_provider_events" ADD CONSTRAINT "be_payment_provider_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;

CREATE TABLE IF NOT EXISTS "be_payment_history_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "appointment_id" uuid,
  "platform_user_id" uuid,
  "payment_id" uuid,
  "refund_id" uuid,
  "event_type" text NOT NULL,
  "amount_minor" integer,
  "currency" text DEFAULT 'RUB',
  "provider_id" text,
  "status" text,
  "purpose" text,
  "comment" text,
  "payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_be_payment_history_appointment" ON "be_payment_history_events" ("appointment_id");
CREATE INDEX IF NOT EXISTS "idx_be_payment_history_user" ON "be_payment_history_events" ("platform_user_id");

ALTER TABLE "be_payment_history_events" ADD CONSTRAINT "be_payment_history_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;
ALTER TABLE "be_payment_history_events" ADD CONSTRAINT "be_payment_history_events_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "be_appointments"("id") ON DELETE set null;
ALTER TABLE "be_payment_history_events" ADD CONSTRAINT "be_payment_history_events_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "be_payments"("id") ON DELETE set null;
ALTER TABLE "be_payment_history_events" ADD CONSTRAINT "be_payment_history_events_refund_id_fkey"
  FOREIGN KEY ("refund_id") REFERENCES "be_refunds"("id") ON DELETE set null;
