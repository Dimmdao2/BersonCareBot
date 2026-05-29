CREATE TABLE IF NOT EXISTS "be_organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_organizations_is_active" ON "be_organizations" USING btree ("is_active");
--> statement-breakpoint
INSERT INTO "be_organizations" ("id", "title", "is_active", "sort_order")
VALUES ('a0000000-0000-4000-8000-000000000001', 'Клиника Берсона', true, 0)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "be_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"city_code" text NOT NULL,
	"address" text,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "uq_be_branches_org_city_title" UNIQUE("organization_id","city_code","title")
);
--> statement-breakpoint
ALTER TABLE "be_branches" ADD CONSTRAINT "be_branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_branches_org" ON "be_branches" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_branches_city" ON "be_branches" USING btree ("organization_id","city_code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "be_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"title" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "uq_be_rooms_branch_title" UNIQUE("branch_id","title")
);
--> statement-breakpoint
ALTER TABLE "be_rooms" ADD CONSTRAINT "be_rooms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_rooms" ADD CONSTRAINT "be_rooms_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."be_branches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_rooms_branch" ON "be_rooms" USING btree ("branch_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "be_specialists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "be_specialists" ADD CONSTRAINT "be_specialists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_specialists_org" ON "be_specialists" USING btree ("organization_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "be_specialist_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"specialist_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "uq_be_specialist_locations" UNIQUE("specialist_id","branch_id")
);
--> statement-breakpoint
ALTER TABLE "be_specialist_locations" ADD CONSTRAINT "be_specialist_locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_specialist_locations" ADD CONSTRAINT "be_specialist_locations_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."be_specialists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_specialist_locations" ADD CONSTRAINT "be_specialist_locations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."be_branches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "be_specialist_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"specialist_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "uq_be_specialist_rooms" UNIQUE("specialist_id","room_id")
);
--> statement-breakpoint
ALTER TABLE "be_specialist_rooms" ADD CONSTRAINT "be_specialist_rooms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_specialist_rooms" ADD CONSTRAINT "be_specialist_rooms_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."be_specialists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_specialist_rooms" ADD CONSTRAINT "be_specialist_rooms_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."be_rooms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "be_clinic_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"price_minor" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"prepayment_applicable" boolean DEFAULT false NOT NULL,
	"usable_in_packages" boolean DEFAULT true NOT NULL,
	"online_payment_applicable" boolean DEFAULT false NOT NULL,
	"public_widget_visible" boolean DEFAULT true NOT NULL,
	"admin_manual_only" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "uq_be_clinic_services_org_title_duration" UNIQUE("organization_id","title","duration_minutes"),
	CONSTRAINT "be_clinic_services_duration_check" CHECK (duration_minutes > 0),
	CONSTRAINT "be_clinic_services_price_check" CHECK (price_minor >= 0)
);
--> statement-breakpoint
ALTER TABLE "be_clinic_services" ADD CONSTRAINT "be_clinic_services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_clinic_services_org" ON "be_clinic_services" USING btree ("organization_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "be_specialist_service_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"specialist_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"branch_id" uuid,
	"room_id" uuid,
	"city_code" text,
	"duration_minutes_override" integer,
	"price_minor_override" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "uq_be_ssa_specialist_service_scope" UNIQUE("specialist_id","service_id","branch_id","room_id","city_code")
);
--> statement-breakpoint
ALTER TABLE "be_specialist_service_availability" ADD CONSTRAINT "be_ssa_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_specialist_service_availability" ADD CONSTRAINT "be_ssa_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."be_specialists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_specialist_service_availability" ADD CONSTRAINT "be_ssa_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."be_clinic_services"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_specialist_service_availability" ADD CONSTRAINT "be_ssa_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."be_branches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_specialist_service_availability" ADD CONSTRAINT "be_ssa_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."be_rooms"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_ssa_specialist" ON "be_specialist_service_availability" USING btree ("specialist_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_ssa_service" ON "be_specialist_service_availability" USING btree ("service_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "be_service_location_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "uq_be_sla_service_branch" UNIQUE("service_id","branch_id")
);
--> statement-breakpoint
ALTER TABLE "be_service_location_availability" ADD CONSTRAINT "be_sla_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_service_location_availability" ADD CONSTRAINT "be_sla_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."be_clinic_services"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_service_location_availability" ADD CONSTRAINT "be_sla_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."be_branches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "be_appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid,
	"room_id" uuid,
	"specialist_id" uuid,
	"service_id" uuid,
	"platform_user_id" uuid,
	"start_at" timestamptz NOT NULL,
	"end_at" timestamptz NOT NULL,
	"duration_minutes" integer NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"original_start_at" timestamptz,
	"reschedule_count" integer DEFAULT 0 NOT NULL,
	"payment_ref" text,
	"package_usage_ref" text,
	"phone_normalized" text,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "be_appointments_time_check" CHECK (end_at > start_at),
	CONSTRAINT "be_appointments_source_check" CHECK (source = ANY (ARRAY['native'::text, 'rubitime_projection'::text, 'admin_manual'::text, 'public_widget'::text])),
	CONSTRAINT "be_appointments_status_check" CHECK (status = ANY (ARRAY[
		'created'::text, 'awaiting_payment'::text, 'paid'::text, 'confirmed'::text, 'rescheduled'::text,
		'cancelled_by_patient'::text, 'cancelled_by_specialist'::text, 'late_cancellation'::text,
		'no_show'::text, 'completed'::text, 'visit_confirmed'::text, 'charged_to_package'::text,
		'manual_review_required'::text
	]))
);
--> statement-breakpoint
ALTER TABLE "be_appointments" ADD CONSTRAINT "be_appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_appointments" ADD CONSTRAINT "be_appointments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."be_branches"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_appointments" ADD CONSTRAINT "be_appointments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."be_rooms"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_appointments" ADD CONSTRAINT "be_appointments_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."be_specialists"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_appointments" ADD CONSTRAINT "be_appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."be_clinic_services"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_appointments" ADD CONSTRAINT "be_appointments_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_appointments_org_start" ON "be_appointments" USING btree ("organization_id","start_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_appointments_patient" ON "be_appointments" USING btree ("platform_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_appointments_status" ON "be_appointments" USING btree ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "be_appointment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "be_appointment_events" ADD CONSTRAINT "be_appointment_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_appointment_events" ADD CONSTRAINT "be_appointment_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."be_appointments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_appointment_events" ADD CONSTRAINT "be_appointment_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_appointment_events_appt_created" ON "be_appointment_events" USING btree ("appointment_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "be_patient_timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"platform_user_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"event_type" text NOT NULL,
	"linked_object_type" text NOT NULL,
	"linked_object_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamptz DEFAULT now() NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "be_patient_timeline_domain_check" CHECK (domain = ANY (ARRAY['appointment'::text, 'payment'::text, 'package'::text]))
);
--> statement-breakpoint
ALTER TABLE "be_patient_timeline_events" ADD CONSTRAINT "be_patient_timeline_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_patient_timeline_events" ADD CONSTRAINT "be_patient_timeline_events_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_patient_timeline_user_occurred" ON "be_patient_timeline_events" USING btree ("platform_user_id","occurred_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "be_appointment_history_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamptz DEFAULT now() NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "be_appointment_history_events" ADD CONSTRAINT "be_appointment_history_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_appointment_history_events" ADD CONSTRAINT "be_appointment_history_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."be_appointments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "be_appointment_history_events" ADD CONSTRAINT "be_appointment_history_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_appointment_history_appt" ON "be_appointment_history_events" USING btree ("appointment_id","occurred_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "be_external_entity_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"canonical_id" uuid NOT NULL,
	"external_system" text NOT NULL,
	"external_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "be_external_entity_type_check" CHECK (entity_type = ANY (ARRAY['branch'::text, 'specialist'::text, 'service'::text, 'appointment'::text, 'availability'::text])),
	CONSTRAINT "be_external_system_check" CHECK (external_system = ANY (ARRAY['rubitime'::text]))
);
--> statement-breakpoint
ALTER TABLE "be_external_entity_mappings" ADD CONSTRAINT "be_external_entity_mappings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_be_external_mapping_unique" ON "be_external_entity_mappings" USING btree ("external_system","entity_type","external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_be_external_mapping_canonical" ON "be_external_entity_mappings" USING btree ("entity_type","canonical_id");
