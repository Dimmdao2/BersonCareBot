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
} from "drizzle-orm/pg-core";
import { beOrganizations, beClinicServices, beAppointments } from "./bookingEngine";
import { platformUsers } from "./schema";

export const PACKAGE_DEDUCTION_MODES = ["auto_on_visit_confirmed", "manual"] as const;
export type PackageDeductionMode = (typeof PACKAGE_DEDUCTION_MODES)[number];

export const PATIENT_PACKAGE_STATUSES = [
  "offered",
  "awaiting_payment",
  "active",
  "expired",
  "cancelled",
] as const;
export type PatientPackageStatus = (typeof PATIENT_PACKAGE_STATUSES)[number];

export const PACKAGE_USAGE_KINDS = [
  "reserve",
  "consume",
  "release",
  "penalty",
  "manual_adjust",
  "refund",
] as const;
export type PackageUsageKind = (typeof PACKAGE_USAGE_KINDS)[number];

export const beSubscriptionPackages = pgTable(
  "be_subscription_packages",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    title: text().notNull(),
    description: text(),
    priceMinor: integer("price_minor").notNull(),
    currency: text().notNull().default("RUB"),
    validityDays: integer("validity_days"),
    deductionMode: text("deduction_mode").notNull().default("auto_on_visit_confirmed"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_subscription_packages_org").on(table.organizationId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_subscription_packages_organization_id_fkey",
    }).onDelete("cascade"),
    check(
      "be_subscription_packages_deduction_mode_check",
      sql`deduction_mode = ANY (ARRAY['auto_on_visit_confirmed'::text, 'manual'::text])`,
    ),
    check("be_subscription_packages_price_check", sql`price_minor >= 0`),
  ],
);

export const bePackageItems = pgTable(
  "be_package_items",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    packageId: uuid("package_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    quantity: integer().notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_package_items_package").on(table.packageId),
    foreignKey({
      columns: [table.packageId],
      foreignColumns: [beSubscriptionPackages.id],
      name: "be_package_items_package_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.serviceId],
      foreignColumns: [beClinicServices.id],
      name: "be_package_items_service_id_fkey",
    }).onDelete("restrict"),
    check("be_package_items_quantity_check", sql`quantity > 0`),
  ],
);

export const bePatientPackages = pgTable(
  "be_patient_packages",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    platformUserId: uuid("platform_user_id").notNull(),
    subscriptionPackageId: uuid("subscription_package_id"),
    status: text().notNull().default("offered"),
    title: text().notNull(),
    priceMinor: integer("price_minor").notNull(),
    currency: text().notNull().default("RUB"),
    validityDays: integer("validity_days"),
    validFrom: timestamp("valid_from", { withTimezone: true, mode: "string" }),
    validUntil: timestamp("valid_until", { withTimezone: true, mode: "string" }),
    deductionMode: text("deduction_mode").notNull().default("auto_on_visit_confirmed"),
    paymentIntentId: uuid("payment_intent_id"),
    paymentRef: text("payment_ref"),
    soldAt: timestamp("sold_at", { withTimezone: true, mode: "string" }),
    paidAmountMinor: integer("paid_amount_minor"),
    paidCurrency: text("paid_currency"),
    assignedByPlatformUserId: uuid("assigned_by_platform_user_id"),
    notes: text(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_patient_packages_org_user").on(table.organizationId, table.platformUserId),
    index("idx_be_patient_packages_status").on(table.status),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_patient_packages_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.platformUserId],
      foreignColumns: [platformUsers.id],
      name: "be_patient_packages_platform_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.subscriptionPackageId],
      foreignColumns: [beSubscriptionPackages.id],
      name: "be_patient_packages_subscription_package_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.assignedByPlatformUserId],
      foreignColumns: [platformUsers.id],
      name: "be_patient_packages_assigned_by_fkey",
    }).onDelete("set null"),
    check(
      "be_patient_packages_status_check",
      sql`status = ANY (ARRAY['offered'::text, 'awaiting_payment'::text, 'active'::text, 'expired'::text, 'cancelled'::text])`,
    ),
    check(
      "be_patient_packages_deduction_mode_check",
      sql`deduction_mode = ANY (ARRAY['auto_on_visit_confirmed'::text, 'manual'::text])`,
    ),
    check("be_patient_packages_price_check", sql`price_minor >= 0`),
    check(
      "be_patient_packages_paid_amount_check",
      sql`paid_amount_minor IS NULL OR paid_amount_minor >= 0`,
    ),
  ],
);

export const bePatientPackageItems = pgTable(
  "be_patient_package_items",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    patientPackageId: uuid("patient_package_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    quantityInitial: integer("quantity_initial").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_patient_package_items_pkg").on(table.patientPackageId),
    foreignKey({
      columns: [table.patientPackageId],
      foreignColumns: [bePatientPackages.id],
      name: "be_patient_package_items_patient_package_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.serviceId],
      foreignColumns: [beClinicServices.id],
      name: "be_patient_package_items_service_id_fkey",
    }).onDelete("restrict"),
    check("be_patient_package_items_quantity_check", sql`quantity_initial > 0`),
  ],
);

export const bePackageUsages = pgTable(
  "be_package_usages",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    patientPackageId: uuid("patient_package_id").notNull(),
    patientPackageItemId: uuid("patient_package_item_id").notNull(),
    appointmentId: uuid("appointment_id"),
    usageKind: text("usage_kind").notNull(),
    quantity: integer().notNull().default(1),
    comment: text(),
    createdByPlatformUserId: uuid("created_by_platform_user_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_package_usages_pkg").on(table.patientPackageId),
    index("idx_be_package_usages_appointment").on(table.appointmentId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_package_usages_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientPackageId],
      foreignColumns: [bePatientPackages.id],
      name: "be_package_usages_patient_package_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientPackageItemId],
      foreignColumns: [bePatientPackageItems.id],
      name: "be_package_usages_patient_package_item_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [beAppointments.id],
      name: "be_package_usages_appointment_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.createdByPlatformUserId],
      foreignColumns: [platformUsers.id],
      name: "be_package_usages_created_by_fkey",
    }).onDelete("set null"),
    check(
      "be_package_usages_kind_check",
      sql`usage_kind = ANY (ARRAY['reserve'::text, 'consume'::text, 'release'::text, 'penalty'::text, 'manual_adjust'::text, 'refund'::text])`,
    ),
    check("be_package_usages_quantity_check", sql`quantity > 0`),
  ],
);

export const bePackageHistoryEvents = pgTable(
  "be_package_history_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    patientPackageId: uuid("patient_package_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadJson: jsonb("payload_json").default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_package_history_pkg").on(table.patientPackageId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_package_history_events_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientPackageId],
      foreignColumns: [bePatientPackages.id],
      name: "be_package_history_events_patient_package_id_fkey",
    }).onDelete("cascade"),
  ],
);
