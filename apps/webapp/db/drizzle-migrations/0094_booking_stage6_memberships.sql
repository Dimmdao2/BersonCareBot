-- Stage 6: composite membership packages

CREATE TABLE IF NOT EXISTS "be_subscription_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "price_minor" integer NOT NULL,
  "currency" text DEFAULT 'RUB' NOT NULL,
  "validity_days" integer,
  "deduction_mode" text DEFAULT 'auto_on_visit_confirmed' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "be_subscription_packages_deduction_mode_check" CHECK (
    deduction_mode = ANY (ARRAY['auto_on_visit_confirmed'::text, 'manual'::text])
  ),
  CONSTRAINT "be_subscription_packages_price_check" CHECK (price_minor >= 0)
);

CREATE INDEX IF NOT EXISTS "idx_be_subscription_packages_org" ON "be_subscription_packages" ("organization_id");
ALTER TABLE "be_subscription_packages" ADD CONSTRAINT "be_subscription_packages_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;

CREATE TABLE IF NOT EXISTS "be_package_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "package_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "quantity" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "be_package_items_quantity_check" CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS "idx_be_package_items_package" ON "be_package_items" ("package_id");
ALTER TABLE "be_package_items" ADD CONSTRAINT "be_package_items_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES "be_subscription_packages"("id") ON DELETE cascade;
ALTER TABLE "be_package_items" ADD CONSTRAINT "be_package_items_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "be_clinic_services"("id") ON DELETE restrict;

CREATE TABLE IF NOT EXISTS "be_patient_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "platform_user_id" uuid NOT NULL,
  "subscription_package_id" uuid,
  "status" text DEFAULT 'offered' NOT NULL,
  "title" text NOT NULL,
  "price_minor" integer NOT NULL,
  "currency" text DEFAULT 'RUB' NOT NULL,
  "validity_days" integer,
  "valid_from" timestamptz,
  "valid_until" timestamptz,
  "deduction_mode" text DEFAULT 'auto_on_visit_confirmed' NOT NULL,
  "payment_intent_id" uuid,
  "payment_ref" text,
  "assigned_by_platform_user_id" uuid,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "be_patient_packages_status_check" CHECK (
    status = ANY (ARRAY['offered'::text, 'awaiting_payment'::text, 'active'::text, 'expired'::text, 'cancelled'::text])
  ),
  CONSTRAINT "be_patient_packages_deduction_mode_check" CHECK (
    deduction_mode = ANY (ARRAY['auto_on_visit_confirmed'::text, 'manual'::text])
  ),
  CONSTRAINT "be_patient_packages_price_check" CHECK (price_minor >= 0)
);

CREATE INDEX IF NOT EXISTS "idx_be_patient_packages_org_user" ON "be_patient_packages" ("organization_id", "platform_user_id");
CREATE INDEX IF NOT EXISTS "idx_be_patient_packages_status" ON "be_patient_packages" ("status");
ALTER TABLE "be_patient_packages" ADD CONSTRAINT "be_patient_packages_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;
ALTER TABLE "be_patient_packages" ADD CONSTRAINT "be_patient_packages_platform_user_id_fkey"
  FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE cascade;
ALTER TABLE "be_patient_packages" ADD CONSTRAINT "be_patient_packages_subscription_package_id_fkey"
  FOREIGN KEY ("subscription_package_id") REFERENCES "be_subscription_packages"("id") ON DELETE set null;
ALTER TABLE "be_patient_packages" ADD CONSTRAINT "be_patient_packages_assigned_by_fkey"
  FOREIGN KEY ("assigned_by_platform_user_id") REFERENCES "platform_users"("id") ON DELETE set null;

CREATE TABLE IF NOT EXISTS "be_patient_package_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_package_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "quantity_initial" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "be_patient_package_items_quantity_check" CHECK (quantity_initial > 0)
);

CREATE INDEX IF NOT EXISTS "idx_be_patient_package_items_pkg" ON "be_patient_package_items" ("patient_package_id");
ALTER TABLE "be_patient_package_items" ADD CONSTRAINT "be_patient_package_items_patient_package_id_fkey"
  FOREIGN KEY ("patient_package_id") REFERENCES "be_patient_packages"("id") ON DELETE cascade;
ALTER TABLE "be_patient_package_items" ADD CONSTRAINT "be_patient_package_items_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "be_clinic_services"("id") ON DELETE restrict;

CREATE TABLE IF NOT EXISTS "be_package_usages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "patient_package_id" uuid NOT NULL,
  "patient_package_item_id" uuid NOT NULL,
  "appointment_id" uuid,
  "usage_kind" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "comment" text,
  "created_by_platform_user_id" uuid,
  "occurred_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "be_package_usages_kind_check" CHECK (
    usage_kind = ANY (ARRAY['reserve'::text, 'consume'::text, 'release'::text, 'penalty'::text, 'manual_adjust'::text])
  ),
  CONSTRAINT "be_package_usages_quantity_check" CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS "idx_be_package_usages_pkg" ON "be_package_usages" ("patient_package_id");
CREATE INDEX IF NOT EXISTS "idx_be_package_usages_appointment" ON "be_package_usages" ("appointment_id");
ALTER TABLE "be_package_usages" ADD CONSTRAINT "be_package_usages_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;
ALTER TABLE "be_package_usages" ADD CONSTRAINT "be_package_usages_patient_package_id_fkey"
  FOREIGN KEY ("patient_package_id") REFERENCES "be_patient_packages"("id") ON DELETE cascade;
ALTER TABLE "be_package_usages" ADD CONSTRAINT "be_package_usages_patient_package_item_id_fkey"
  FOREIGN KEY ("patient_package_item_id") REFERENCES "be_patient_package_items"("id") ON DELETE cascade;
ALTER TABLE "be_package_usages" ADD CONSTRAINT "be_package_usages_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "be_appointments"("id") ON DELETE set null;
ALTER TABLE "be_package_usages" ADD CONSTRAINT "be_package_usages_created_by_fkey"
  FOREIGN KEY ("created_by_platform_user_id") REFERENCES "platform_users"("id") ON DELETE set null;

CREATE TABLE IF NOT EXISTS "be_package_history_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "patient_package_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_be_package_history_pkg" ON "be_package_history_events" ("patient_package_id");
ALTER TABLE "be_package_history_events" ADD CONSTRAINT "be_package_history_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;
ALTER TABLE "be_package_history_events" ADD CONSTRAINT "be_package_history_events_patient_package_id_fkey"
  FOREIGN KEY ("patient_package_id") REFERENCES "be_patient_packages"("id") ON DELETE cascade;
