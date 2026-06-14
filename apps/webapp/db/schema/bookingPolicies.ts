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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { beOrganizations, beAppointments } from "./bookingEngine";
import { platformUsers } from "./schema";

export const POLICY_SCOPE_LEVELS = ["organization", "specialist", "service", "product"] as const;
export type PolicyScopeLevel = (typeof POLICY_SCOPE_LEVELS)[number];

export const LATE_CANCELLATION_BEHAVIORS = [
  "penalty",
  "manual_review",
  "charge_package",
  "retain_prepayment",
  "refund_prepayment",
] as const;

export const RESCHEDULE_LIMIT_BEHAVIORS = ["manual_request", "deny"] as const;

export const CANCELLATION_DECISION_TYPES = [
  "free",
  "penalized",
  "package_charged",
  "no_package_charge",
  "retain_prepayment",
  "refund_prepayment",
  "custom",
] as const;

export const APPOINTMENT_ACTOR_TYPES = ["patient", "specialist", "admin", "system"] as const;

export const beCancellationPolicies = pgTable(
  "be_cancellation_policies",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    scopeLevel: text("scope_level").notNull(),
    scopeEntityId: uuid("scope_entity_id"),
    title: text().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    freeCancelHoursBefore: integer("free_cancel_hours_before").default(72).notNull(),
    cancellationAllowed: boolean("cancellation_allowed").default(true).notNull(),
    lateCancellationBehavior: text("late_cancellation_behavior").default("manual_review").notNull(),
    refundPrepaymentOnLate: text("refund_prepayment_on_late").default("manual").notNull(),
    chargePackageSessionOnLate: boolean("charge_package_session_on_late").default(false).notNull(),
    requiresStaffConfirmation: boolean("requires_staff_confirmation").default(false).notNull(),
    notifyPatient: boolean("notify_patient").default(true).notNull(),
    notifyStaff: boolean("notify_staff").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_cancel_policies_org").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
    index("idx_be_cancel_policies_scope").using(
      "btree",
      table.organizationId.asc().nullsLast().op("uuid_ops"),
      table.scopeLevel.asc().nullsLast().op("text_ops"),
      table.scopeEntityId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_cancellation_policies_organization_id_fkey",
    }).onDelete("cascade"),
    check(
      "be_cancel_policies_scope_check",
      sql`scope_level = ANY (ARRAY['organization'::text, 'specialist'::text, 'service'::text, 'product'::text])`,
    ),
    check(
      "be_cancel_policies_late_behavior_check",
      sql`late_cancellation_behavior = ANY (ARRAY[
        'penalty'::text,
        'manual_review'::text,
        'charge_package'::text,
        'retain_prepayment'::text,
        'refund_prepayment'::text
      ])`,
    ),
    uniqueIndex("uq_be_cancel_policies_scope").on(
      table.organizationId,
      table.scopeLevel,
      sql`COALESCE(${table.scopeEntityId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
  ],
);

export const beReschedulePolicies = pgTable(
  "be_reschedule_policies",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    scopeLevel: text("scope_level").notNull(),
    scopeEntityId: uuid("scope_entity_id"),
    title: text().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    selfRescheduleHoursBefore: integer("self_reschedule_hours_before").default(48).notNull(),
    maxSelfReschedules: integer("max_self_reschedules").default(1).notNull(),
    allowDifferentBranch: boolean("allow_different_branch").default(false).notNull(),
    allowDifferentCity: boolean("allow_different_city").default(false).notNull(),
    allowDifferentSpecialist: boolean("allow_different_specialist").default(false).notNull(),
    allowDifferentService: boolean("allow_different_service").default(false).notNull(),
    limitExceededBehavior: text("limit_exceeded_behavior").default("manual_request").notNull(),
    requiresStaffConfirmation: boolean("requires_staff_confirmation").default(false).notNull(),
    notifyPatient: boolean("notify_patient").default(true).notNull(),
    notifyStaff: boolean("notify_staff").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_reschedule_policies_org").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_reschedule_policies_organization_id_fkey",
    }).onDelete("cascade"),
    check(
      "be_reschedule_policies_scope_check",
      sql`scope_level = ANY (ARRAY['organization'::text, 'specialist'::text, 'service'::text, 'product'::text])`,
    ),
    check(
      "be_reschedule_policies_limit_check",
      sql`limit_exceeded_behavior = ANY (ARRAY['manual_request'::text, 'deny'::text])`,
    ),
    uniqueIndex("uq_be_reschedule_policies_scope").on(
      table.organizationId,
      table.scopeLevel,
      sql`COALESCE(${table.scopeEntityId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
  ],
);

export const beAppointmentReschedules = pgTable(
  "be_appointment_reschedules",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    fromStartAt: timestamp("from_start_at", { withTimezone: true, mode: "string" }).notNull(),
    fromEndAt: timestamp("from_end_at", { withTimezone: true, mode: "string" }).notNull(),
    toStartAt: timestamp("to_start_at", { withTimezone: true, mode: "string" }).notNull(),
    toEndAt: timestamp("to_end_at", { withTimezone: true, mode: "string" }).notNull(),
    actorType: text("actor_type").notNull(),
    actorId: uuid("actor_id"),
    wasInFreeRescheduleWindow: boolean("was_in_free_reschedule_window").notNull(),
    freeCancellationAvailableAtReschedule: boolean("free_cancellation_available_at_reschedule").notNull(),
    freeCancellationAvailableAfter: boolean("free_cancellation_available_after").notNull(),
    appliedPolicyId: uuid("applied_policy_id"),
    appliedPolicySnapshot: jsonb("applied_policy_snapshot").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    reason: text(),
    staffComment: text("staff_comment"),
    notificationsSent: jsonb("notifications_sent").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    manualOverride: boolean("manual_override").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_appt_reschedules_appt").using(
      "btree",
      table.appointmentId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_appointment_reschedules_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [beAppointments.id],
      name: "be_appointment_reschedules_appointment_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [platformUsers.id],
      name: "be_appointment_reschedules_actor_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.appliedPolicyId],
      foreignColumns: [beReschedulePolicies.id],
      name: "be_appointment_reschedules_policy_id_fkey",
    }).onDelete("set null"),
    check(
      "be_appt_reschedules_actor_check",
      sql`actor_type = ANY (ARRAY['patient'::text, 'specialist'::text, 'admin'::text, 'system'::text])`,
    ),
  ],
);

export const beAppointmentNoShows = pgTable(
  "be_appointment_no_shows",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: uuid("actor_id"),
    reason: text(),
    staffComment: text("staff_comment"),
    notificationsSent: jsonb("notifications_sent").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    manualOverride: boolean("manual_override").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_appt_no_shows_appt").using(
      "btree",
      table.appointmentId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_appointment_no_shows_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [beAppointments.id],
      name: "be_appointment_no_shows_appointment_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [platformUsers.id],
      name: "be_appointment_no_shows_actor_id_fkey",
    }).onDelete("set null"),
    check(
      "be_appt_no_shows_actor_check",
      sql`actor_type = ANY (ARRAY['specialist'::text, 'admin'::text, 'system'::text])`,
    ),
  ],
);

export const beAppointmentCancellations = pgTable(
  "be_appointment_cancellations",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: uuid("actor_id"),
    cancellationType: text("cancellation_type").notNull(),
    reason: text(),
    wasFree: boolean("was_free").notNull(),
    wasPenalized: boolean("was_penalized").notNull(),
    packageSessionCharged: boolean("package_session_charged").notNull(),
    prepaymentRetained: boolean("prepayment_retained").notNull(),
    prepaymentRefunded: boolean("prepayment_refunded").notNull(),
    staffComment: text("staff_comment"),
    notificationsSent: jsonb("notifications_sent").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    manualOverride: boolean("manual_override").default(false).notNull(),
    appliedPolicyId: uuid("applied_policy_id"),
    appliedPolicySnapshot: jsonb("applied_policy_snapshot").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_appt_cancellations_appt").using(
      "btree",
      table.appointmentId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_appointment_cancellations_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [beAppointments.id],
      name: "be_appointment_cancellations_appointment_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [platformUsers.id],
      name: "be_appointment_cancellations_actor_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.appliedPolicyId],
      foreignColumns: [beCancellationPolicies.id],
      name: "be_appointment_cancellations_policy_id_fkey",
    }).onDelete("set null"),
    check(
      "be_appt_cancellations_actor_check",
      sql`actor_type = ANY (ARRAY['patient'::text, 'specialist'::text, 'admin'::text, 'system'::text])`,
    ),
    check(
      "be_appt_cancellations_type_check",
      sql`cancellation_type = ANY (ARRAY[
        'free'::text,
        'penalized'::text,
        'package_charged'::text,
        'no_package_charge'::text,
        'retain_prepayment'::text,
        'refund_prepayment'::text,
        'custom'::text
      ])`,
    ),
  ],
);
