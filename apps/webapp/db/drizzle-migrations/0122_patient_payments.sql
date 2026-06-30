-- Журнал платежей пациента (раздел «Учётка» кабинета врача).
-- kind='cash' — ручная запись наличных (реализовано сейчас).
-- kind='acquiring' — карточная оплата через шлюз (seam готов; провайдер подключается позже).
-- Суммы в копейках (integer); CHECK amount_minor > 0 — never float.

CREATE TABLE "patient_payment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" text DEFAULT 'RUB' NOT NULL,
  "kind" text NOT NULL,
  "status" text DEFAULT 'paid' NOT NULL,
  "comment" text,
  "service" text,
  "visit_id" uuid,
  "provider" text,
  "provider_payment_id" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "patient_payment_amount_minor_positive" CHECK (amount_minor > 0),
  CONSTRAINT "patient_payment_kind_check" CHECK (
    kind = ANY (ARRAY['cash'::text, 'acquiring'::text])
  ),
  CONSTRAINT "patient_payment_status_check" CHECK (
    status = ANY (ARRAY['paid'::text, 'pending'::text, 'refunded'::text, 'failed'::text])
  ),
  CONSTRAINT "patient_payment_patient_user_id_fkey" FOREIGN KEY ("patient_user_id")
    REFERENCES "platform_users"("id") ON DELETE CASCADE,
  CONSTRAINT "patient_payment_visit_id_fkey" FOREIGN KEY ("visit_id")
    REFERENCES "clinical_visit"("id") ON DELETE SET NULL,
  CONSTRAINT "patient_payment_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "platform_users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "idx_patient_payment_patient_user_id" ON "patient_payment" ("patient_user_id");
--> statement-breakpoint
CREATE INDEX "idx_patient_payment_created_at" ON "patient_payment" ("created_at");
