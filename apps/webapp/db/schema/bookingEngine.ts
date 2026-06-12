import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  foreignKey,
  check,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";

/** Seed UUID for default tenant (Berson clinic). */
export const BE_DEFAULT_ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";

export const APPOINTMENT_STATUS_VALUES = [
  "created",
  "awaiting_payment",
  "paid",
  "confirmed",
  "rescheduled",
  "cancelled_by_patient",
  "cancelled_by_specialist",
  "late_cancellation",
  "no_show",
  "completed",
  "visit_confirmed",
  "charged_to_package",
  "manual_review_required",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUS_VALUES)[number];

const appointmentStatusCheckSql = sql`status = ANY (ARRAY[
  'created'::text,
  'awaiting_payment'::text,
  'paid'::text,
  'confirmed'::text,
  'rescheduled'::text,
  'cancelled_by_patient'::text,
  'cancelled_by_specialist'::text,
  'late_cancellation'::text,
  'no_show'::text,
  'completed'::text,
  'visit_confirmed'::text,
  'charged_to_package'::text,
  'manual_review_required'::text
])`;

export const beOrganizations = pgTable(
  "be_organizations",
  {
    id: uuid().primaryKey().notNull(),
    title: text().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [index("idx_be_organizations_is_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops"))],
);

export const beBranches = pgTable(
  "be_branches",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    title: text().notNull(),
    /** Short display name (e.g. «СПб», «Мск»). Migration 0117. Nullable; UI falls back to title. */
    shortTitle: text("short_title"),
    cityCode: text("city_code").notNull(),
    address: text(),
    timezone: text().default("Europe/Moscow").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_branches_org").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
    index("idx_be_branches_city").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.cityCode.asc().nullsLast().op("text_ops")),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_branches_organization_id_fkey",
    }).onDelete("cascade"),
    unique("uq_be_branches_org_city_title").on(table.organizationId, table.cityCode, table.title),
  ],
);

export const beRooms = pgTable(
  "be_rooms",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    title: text().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_rooms_branch").using("btree", table.branchId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_rooms_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [beBranches.id],
      name: "be_rooms_branch_id_fkey",
    }).onDelete("cascade"),
    unique("uq_be_rooms_branch_title").on(table.branchId, table.title),
  ],
);

export const beSpecialists = pgTable(
  "be_specialists",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    fullName: text("full_name").notNull(),
    description: text(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_specialists_org").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_specialists_organization_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const beSpecialistLocations = pgTable(
  "be_specialist_locations",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    specialistId: uuid("specialist_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_specialist_locations_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.specialistId],
      foreignColumns: [beSpecialists.id],
      name: "be_specialist_locations_specialist_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [beBranches.id],
      name: "be_specialist_locations_branch_id_fkey",
    }).onDelete("cascade"),
    unique("uq_be_specialist_locations").on(table.specialistId, table.branchId),
  ],
);

export const beSpecialistRooms = pgTable(
  "be_specialist_rooms",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    specialistId: uuid("specialist_id").notNull(),
    roomId: uuid("room_id").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_specialist_rooms_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.specialistId],
      foreignColumns: [beSpecialists.id],
      name: "be_specialist_rooms_specialist_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [beRooms.id],
      name: "be_specialist_rooms_room_id_fkey",
    }).onDelete("cascade"),
    unique("uq_be_specialist_rooms").on(table.specialistId, table.roomId),
  ],
);

export const beClinicServices = pgTable(
  "be_clinic_services",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    title: text().notNull(),
    description: text(),
    durationMinutes: integer("duration_minutes").notNull(),
    priceMinor: integer("price_minor").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    prepaymentApplicable: boolean("prepayment_applicable").default(false).notNull(),
    usableInPackages: boolean("usable_in_packages").default(true).notNull(),
    onlinePaymentApplicable: boolean("online_payment_applicable").default(false).notNull(),
    publicWidgetVisible: boolean("public_widget_visible").default(true).notNull(),
    adminManualOnly: boolean("admin_manual_only").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_clinic_services_org").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_clinic_services_organization_id_fkey",
    }).onDelete("cascade"),
    unique("uq_be_clinic_services_org_title_duration").on(
      table.organizationId,
      table.title,
      table.durationMinutes,
    ),
    check("be_clinic_services_duration_check", sql`duration_minutes > 0`),
    check("be_clinic_services_price_check", sql`price_minor >= 0`),
  ],
);

export const beSpecialistServiceAvailability = pgTable(
  "be_specialist_service_availability",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    specialistId: uuid("specialist_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    branchId: uuid("branch_id"),
    roomId: uuid("room_id"),
    cityCode: text("city_code"),
    durationMinutesOverride: integer("duration_minutes_override"),
    priceMinorOverride: integer("price_minor_override"),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_ssa_specialist").using("btree", table.specialistId.asc().nullsLast().op("uuid_ops")),
    index("idx_be_ssa_service").using("btree", table.serviceId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_ssa_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.specialistId],
      foreignColumns: [beSpecialists.id],
      name: "be_ssa_specialist_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.serviceId],
      foreignColumns: [beClinicServices.id],
      name: "be_ssa_service_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [beBranches.id],
      name: "be_ssa_branch_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [beRooms.id],
      name: "be_ssa_room_id_fkey",
    }).onDelete("set null"),
    unique("uq_be_ssa_specialist_service_scope").on(
      table.specialistId,
      table.serviceId,
      table.branchId,
      table.roomId,
      table.cityCode,
    ),
  ],
);

export const beServiceLocationAvailability = pgTable(
  "be_service_location_availability",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_sla_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.serviceId],
      foreignColumns: [beClinicServices.id],
      name: "be_sla_service_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [beBranches.id],
      name: "be_sla_branch_id_fkey",
    }).onDelete("cascade"),
    unique("uq_be_sla_service_branch").on(table.serviceId, table.branchId),
  ],
);

export const beAppointments = pgTable(
  "be_appointments",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    branchId: uuid("branch_id"),
    roomId: uuid("room_id"),
    specialistId: uuid("specialist_id"),
    serviceId: uuid("service_id"),
    platformUserId: uuid("platform_user_id"),
    startAt: timestamp("start_at", { withTimezone: true, mode: "string" }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "string" }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    source: text().notNull(),
    status: text().notNull(),
    originalStartAt: timestamp("original_start_at", { withTimezone: true, mode: "string" }),
    rescheduleCount: integer("reschedule_count").default(0).notNull(),
    paymentRef: text("payment_ref"),
    packageUsageRef: text("package_usage_ref"),
    phoneNormalized: text("phone_normalized"),
    attributionJson: jsonb("attribution_json").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_appointments_org_start").using(
      "btree",
      table.organizationId.asc().nullsLast().op("uuid_ops"),
      table.startAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    index("idx_be_appointments_patient").using("btree", table.platformUserId.asc().nullsLast().op("uuid_ops")),
    index("idx_be_appointments_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_appointments_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [beBranches.id],
      name: "be_appointments_branch_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [beRooms.id],
      name: "be_appointments_room_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.specialistId],
      foreignColumns: [beSpecialists.id],
      name: "be_appointments_specialist_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.serviceId],
      foreignColumns: [beClinicServices.id],
      name: "be_appointments_service_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.platformUserId],
      foreignColumns: [platformUsers.id],
      name: "be_appointments_platform_user_id_fkey",
    }).onDelete("set null"),
    check("be_appointments_time_check", sql`end_at > start_at`),
    check("be_appointments_source_check", sql`source = ANY (ARRAY[
      'native'::text,
      'rubitime_projection'::text,
      'admin_manual'::text,
      'public_widget'::text
    ])`),
    check("be_appointments_status_check", appointmentStatusCheckSql),
  ],
);

export const beAppointmentEvents = pgTable(
  "be_appointment_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    eventType: text("event_type").notNull(),
    actorId: uuid("actor_id"),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_appointment_events_appt_created").using(
      "btree",
      table.appointmentId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_appointment_events_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [beAppointments.id],
      name: "be_appointment_events_appointment_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [platformUsers.id],
      name: "be_appointment_events_actor_id_fkey",
    }).onDelete("set null"),
  ],
);

export const bePatientTimelineEvents = pgTable(
  "be_patient_timeline_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    platformUserId: uuid("platform_user_id").notNull(),
    domain: text().notNull(),
    eventType: text("event_type").notNull(),
    linkedObjectType: text("linked_object_type").notNull(),
    linkedObjectId: text("linked_object_id").notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_patient_timeline_user_occurred").using(
      "btree",
      table.platformUserId.asc().nullsLast().op("uuid_ops"),
      table.occurredAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_patient_timeline_events_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.platformUserId],
      foreignColumns: [platformUsers.id],
      name: "be_patient_timeline_events_platform_user_id_fkey",
    }).onDelete("cascade"),
    check(
      "be_patient_timeline_domain_check",
      sql`domain = ANY (ARRAY['appointment'::text, 'payment'::text, 'package'::text])`,
    ),
  ],
);

export const beAppointmentHistoryEvents = pgTable(
  "be_appointment_history_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    eventType: text("event_type").notNull(),
    actorId: uuid("actor_id"),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_appointment_history_appt").using(
      "btree",
      table.appointmentId.asc().nullsLast().op("uuid_ops"),
      table.occurredAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_appointment_history_events_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [beAppointments.id],
      name: "be_appointment_history_events_appointment_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [platformUsers.id],
      name: "be_appointment_history_events_actor_id_fkey",
    }).onDelete("set null"),
  ],
);

export const beExternalEntityMappings = pgTable(
  "be_external_entity_mappings",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    entityType: text("entity_type").notNull(),
    canonicalId: uuid("canonical_id").notNull(),
    externalSystem: text("external_system").notNull(),
    externalId: text("external_id").notNull(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_be_external_mapping_unique").using(
      "btree",
      table.externalSystem.asc().nullsLast().op("text_ops"),
      table.entityType.asc().nullsLast().op("text_ops"),
      table.externalId.asc().nullsLast().op("text_ops"),
    ),
    index("idx_be_external_mapping_canonical").using(
      "btree",
      table.entityType.asc().nullsLast().op("text_ops"),
      table.canonicalId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_external_entity_mappings_organization_id_fkey",
    }).onDelete("cascade"),
    check(
      "be_external_entity_type_check",
      sql`entity_type = ANY (ARRAY[
        'branch'::text,
        'specialist'::text,
        'service'::text,
        'appointment'::text,
        'availability'::text
      ])`,
    ),
    check(
      "be_external_system_check",
      sql`external_system = ANY (ARRAY['rubitime'::text])`,
    ),
  ],
);
