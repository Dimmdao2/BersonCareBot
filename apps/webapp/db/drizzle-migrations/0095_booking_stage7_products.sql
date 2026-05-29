-- Stage 7: universal products, purchases, pay links

CREATE TABLE IF NOT EXISTS "be_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "product_type" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "price_minor" integer NOT NULL,
  "currency" text DEFAULT 'RUB' NOT NULL,
  "composition_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "access_rules_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "payment_rules_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "validity_days" integer,
  "course_id" uuid,
  "subscription_package_id" uuid,
  "show_in_patient_catalog" boolean DEFAULT true NOT NULL,
  "pay_by_link_enabled" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "be_products_type_check" CHECK (
    product_type = ANY (ARRAY[
      'single_visit'::text, 'membership'::text, 'gift_certificate'::text, 'promo'::text,
      'course'::text, 'subscription'::text, 'content_access'::text, 'individual_offer'::text
    ])
  ),
  CONSTRAINT "be_products_price_check" CHECK (price_minor >= 0)
);

CREATE INDEX IF NOT EXISTS "idx_be_products_org" ON "be_products" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_be_products_org_type" ON "be_products" ("organization_id", "product_type");
ALTER TABLE "be_products" ADD CONSTRAINT "be_products_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;
ALTER TABLE "be_products" ADD CONSTRAINT "be_products_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE set null;
ALTER TABLE "be_products" ADD CONSTRAINT "be_products_subscription_package_id_fkey"
  FOREIGN KEY ("subscription_package_id") REFERENCES "be_subscription_packages"("id") ON DELETE set null;

CREATE TABLE IF NOT EXISTS "be_product_pay_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "token" text NOT NULL,
  "expires_at" timestamptz,
  "max_uses" integer,
  "use_count" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "be_product_pay_links_use_count_check" CHECK (use_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "be_product_pay_links_token_uidx" ON "be_product_pay_links" ("token");
CREATE INDEX IF NOT EXISTS "idx_be_product_pay_links_product" ON "be_product_pay_links" ("product_id");
ALTER TABLE "be_product_pay_links" ADD CONSTRAINT "be_product_pay_links_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;
ALTER TABLE "be_product_pay_links" ADD CONSTRAINT "be_product_pay_links_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "be_products"("id") ON DELETE cascade;

CREATE TABLE IF NOT EXISTS "be_product_purchases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "product_type" text NOT NULL,
  "platform_user_id" uuid,
  "buyer_phone_normalized" text,
  "gift_recipient_phone_normalized" text,
  "status" text DEFAULT 'offered' NOT NULL,
  "title" text NOT NULL,
  "price_minor" integer NOT NULL,
  "currency" text DEFAULT 'RUB' NOT NULL,
  "validity_days" integer,
  "valid_from" timestamptz,
  "valid_until" timestamptz,
  "fulfillment_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "payment_intent_id" uuid,
  "payment_ref" text,
  "pay_link_id" uuid,
  "assigned_by_platform_user_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "be_product_purchases_status_check" CHECK (
    status = ANY (ARRAY[
      'offered'::text, 'awaiting_payment'::text, 'active'::text,
      'used'::text, 'expired'::text, 'cancelled'::text
    ])
  ),
  CONSTRAINT "be_product_purchases_price_check" CHECK (price_minor >= 0)
);

CREATE INDEX IF NOT EXISTS "idx_be_product_purchases_org_user" ON "be_product_purchases" ("organization_id", "platform_user_id");
CREATE INDEX IF NOT EXISTS "idx_be_product_purchases_phone" ON "be_product_purchases" ("organization_id", "buyer_phone_normalized");
CREATE INDEX IF NOT EXISTS "idx_be_product_purchases_product" ON "be_product_purchases" ("product_id");
CREATE INDEX IF NOT EXISTS "idx_be_product_purchases_status" ON "be_product_purchases" ("status");
ALTER TABLE "be_product_purchases" ADD CONSTRAINT "be_product_purchases_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;
ALTER TABLE "be_product_purchases" ADD CONSTRAINT "be_product_purchases_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "be_products"("id") ON DELETE restrict;
ALTER TABLE "be_product_purchases" ADD CONSTRAINT "be_product_purchases_platform_user_id_fkey"
  FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE set null;
ALTER TABLE "be_product_purchases" ADD CONSTRAINT "be_product_purchases_pay_link_id_fkey"
  FOREIGN KEY ("pay_link_id") REFERENCES "be_product_pay_links"("id") ON DELETE set null;
ALTER TABLE "be_product_purchases" ADD CONSTRAINT "be_product_purchases_assigned_by_fkey"
  FOREIGN KEY ("assigned_by_platform_user_id") REFERENCES "platform_users"("id") ON DELETE set null;

CREATE TABLE IF NOT EXISTS "be_product_history_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "product_purchase_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_be_product_history_purchase" ON "be_product_history_events" ("product_purchase_id");
ALTER TABLE "be_product_history_events" ADD CONSTRAINT "be_product_history_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "be_organizations"("id") ON DELETE cascade;
ALTER TABLE "be_product_history_events" ADD CONSTRAINT "be_product_history_events_product_purchase_id_fkey"
  FOREIGN KEY ("product_purchase_id") REFERENCES "be_product_purchases"("id") ON DELETE cascade;
