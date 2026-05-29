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
import { beOrganizations, beAppointments, beClinicServices } from "./bookingEngine";
import { platformUsers } from "./schema";

export const PREPAYMENT_MODES = ["disabled", "fixed_minor", "percent", "full_price"] as const;
export type PrepaymentMode = (typeof PREPAYMENT_MODES)[number];

export const PAYMENT_INTENT_STATUSES = [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export const PAYMENT_STATUSES = ["pending", "captured", "failed", "refunded", "partially_refunded"] as const;

export const REFUND_STATUSES = ["pending", "succeeded", "failed"] as const;

export const PAYMENT_PURPOSES = [
  "appointment_prepayment",
  "appointment_full",
  "appointment_refund",
  "package_purchase",
  "product_purchase",
  "manual",
] as const;

export const ONLINE_PREPAYMENT_CATEGORIES = ["rehab_lfk", "nutrition", "general"] as const;
export type OnlinePrepaymentCategory = (typeof ONLINE_PREPAYMENT_CATEGORIES)[number];

export const bePrepaymentPolicies = pgTable(
  "be_prepayment_policies",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    serviceId: uuid("service_id"),
    onlineCategory: text("online_category"),
    mode: text().notNull().default("disabled"),
    amountMinor: integer("amount_minor"),
    percentBps: integer("percent_bps"),
    currency: text().notNull().default("RUB"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("be_prepayment_policies_service_uidx")
      .on(table.organizationId, table.serviceId)
      .where(sql`service_id IS NOT NULL`),
    uniqueIndex("be_prepayment_policies_online_uidx")
      .on(table.organizationId, table.onlineCategory)
      .where(sql`online_category IS NOT NULL`),
    index("idx_be_prepayment_policies_org").on(table.organizationId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_prepayment_policies_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.serviceId],
      foreignColumns: [beClinicServices.id],
      name: "be_prepayment_policies_service_id_fkey",
    }).onDelete("cascade"),
    check(
      "be_prepayment_policies_mode_check",
      sql`mode = ANY (ARRAY['disabled'::text, 'fixed_minor'::text, 'percent'::text, 'full_price'::text])`,
    ),
    check(
      "be_prepayment_policies_scope_check",
      sql`(service_id IS NOT NULL AND online_category IS NULL) OR (service_id IS NULL AND online_category IS NOT NULL)`,
    ),
    check(
      "be_prepayment_policies_online_category_check",
      sql`online_category IS NULL OR online_category = ANY (ARRAY['rehab_lfk'::text, 'nutrition'::text, 'general'::text])`,
    ),
  ],
);

export const bePaymentIntents = pgTable(
  "be_payment_intents",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    providerId: text("provider_id").notNull(),
    appointmentId: uuid("appointment_id"),
    platformUserId: uuid("platform_user_id"),
    productRef: text("product_ref"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text().notNull().default("RUB"),
    status: text().notNull().default("pending"),
    purpose: text().notNull().default("appointment_prepayment"),
    providerIntentRef: text("provider_intent_ref"),
    metadataJson: jsonb("metadata_json").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("be_payment_intents_idempotency_uidx").on(table.organizationId, table.idempotencyKey),
    index("idx_be_payment_intents_appointment").on(table.appointmentId),
    index("idx_be_payment_intents_user").on(table.platformUserId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_payment_intents_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [beAppointments.id],
      name: "be_payment_intents_appointment_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.platformUserId],
      foreignColumns: [platformUsers.id],
      name: "be_payment_intents_platform_user_id_fkey",
    }).onDelete("set null"),
    check("be_payment_intents_amount_check", sql`amount_minor >= 0`),
  ],
);

export const bePayments = pgTable(
  "be_payments",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    paymentIntentId: uuid("payment_intent_id").notNull(),
    appointmentId: uuid("appointment_id"),
    platformUserId: uuid("platform_user_id"),
    providerId: text("provider_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text().notNull().default("RUB"),
    status: text().notNull().default("captured"),
    purpose: text().notNull().default("appointment_prepayment"),
    capturedAt: timestamp("captured_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("be_payments_intent_uidx").on(table.paymentIntentId),
    index("idx_be_payments_appointment").on(table.appointmentId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_payments_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.paymentIntentId],
      foreignColumns: [bePaymentIntents.id],
      name: "be_payments_payment_intent_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [beAppointments.id],
      name: "be_payments_appointment_id_fkey",
    }).onDelete("set null"),
  ],
);

export const beRefunds = pgTable(
  "be_refunds",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    paymentId: uuid("payment_id").notNull(),
    appointmentId: uuid("appointment_id"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text().notNull().default("RUB"),
    status: text().notNull().default("pending"),
    reason: text(),
    providerRefundRef: text("provider_refund_ref"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_refunds_payment").on(table.paymentId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_refunds_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.paymentId],
      foreignColumns: [bePayments.id],
      name: "be_refunds_payment_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [beAppointments.id],
      name: "be_refunds_appointment_id_fkey",
    }).onDelete("set null"),
    check("be_refunds_amount_check", sql`amount_minor >= 0`),
  ],
);

export const bePaymentProviderEvents = pgTable(
  "be_payment_provider_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    providerId: text("provider_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    eventType: text("event_type").notNull(),
    payloadJson: jsonb("payload_json").default({}).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("be_payment_provider_events_idempotency_uidx").on(
      table.organizationId,
      table.providerId,
      table.idempotencyKey,
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_payment_provider_events_organization_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const bePaymentHistoryEvents = pgTable(
  "be_payment_history_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    appointmentId: uuid("appointment_id"),
    platformUserId: uuid("platform_user_id"),
    paymentId: uuid("payment_id"),
    refundId: uuid("refund_id"),
    eventType: text("event_type").notNull(),
    amountMinor: integer("amount_minor"),
    currency: text().default("RUB"),
    providerId: text("provider_id"),
    status: text(),
    purpose: text(),
    comment: text(),
    payloadJson: jsonb("payload_json").default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_payment_history_appointment").on(table.appointmentId),
    index("idx_be_payment_history_user").on(table.platformUserId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_payment_history_events_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [beAppointments.id],
      name: "be_payment_history_events_appointment_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.paymentId],
      foreignColumns: [bePayments.id],
      name: "be_payment_history_events_payment_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.refundId],
      foreignColumns: [beRefunds.id],
      name: "be_payment_history_events_refund_id_fkey",
    }).onDelete("set null"),
  ],
);
