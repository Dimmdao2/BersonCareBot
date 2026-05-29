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
import { beOrganizations } from "./bookingEngine";
import { platformUsers } from "./schema";
import { courses } from "./courses";
import { beSubscriptionPackages } from "./bookingMemberships";

export const BE_PRODUCT_TYPES = [
  "single_visit",
  "membership",
  "gift_certificate",
  "promo",
  "course",
  "subscription",
  "content_access",
  "individual_offer",
] as const;
export type BeProductType = (typeof BE_PRODUCT_TYPES)[number];

export const PRODUCT_PURCHASE_STATUSES = [
  "offered",
  "awaiting_payment",
  "active",
  "used",
  "expired",
  "cancelled",
] as const;
export type ProductPurchaseStatus = (typeof PRODUCT_PURCHASE_STATUSES)[number];

export const beProducts = pgTable(
  "be_products",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    productType: text("product_type").notNull(),
    title: text().notNull(),
    description: text(),
    priceMinor: integer("price_minor").notNull(),
    currency: text().notNull().default("RUB"),
    compositionJson: jsonb("composition_json").default({}).notNull(),
    accessRulesJson: jsonb("access_rules_json").default({}).notNull(),
    paymentRulesJson: jsonb("payment_rules_json").default({}).notNull(),
    validityDays: integer("validity_days"),
    courseId: uuid("course_id"),
    subscriptionPackageId: uuid("subscription_package_id"),
    showInPatientCatalog: boolean("show_in_patient_catalog").default(true).notNull(),
    payByLinkEnabled: boolean("pay_by_link_enabled").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_products_org").on(table.organizationId),
    index("idx_be_products_org_type").on(table.organizationId, table.productType),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_products_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.courseId],
      foreignColumns: [courses.id],
      name: "be_products_course_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.subscriptionPackageId],
      foreignColumns: [beSubscriptionPackages.id],
      name: "be_products_subscription_package_id_fkey",
    }).onDelete("set null"),
    check(
      "be_products_type_check",
      sql`product_type = ANY (ARRAY[
        'single_visit'::text, 'membership'::text, 'gift_certificate'::text, 'promo'::text,
        'course'::text, 'subscription'::text, 'content_access'::text, 'individual_offer'::text
      ])`,
    ),
    check("be_products_price_check", sql`price_minor >= 0`),
  ],
);

export const beProductPayLinks = pgTable(
  "be_product_pay_links",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    productId: uuid("product_id").notNull(),
    token: text().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
    maxUses: integer("max_uses"),
    useCount: integer("use_count").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("be_product_pay_links_token_uidx").on(table.token),
    index("idx_be_product_pay_links_product").on(table.productId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_product_pay_links_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.productId],
      foreignColumns: [beProducts.id],
      name: "be_product_pay_links_product_id_fkey",
    }).onDelete("cascade"),
    check("be_product_pay_links_use_count_check", sql`use_count >= 0`),
  ],
);

export const beProductPurchases = pgTable(
  "be_product_purchases",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    productId: uuid("product_id").notNull(),
    productType: text("product_type").notNull(),
    platformUserId: uuid("platform_user_id"),
    buyerPhoneNormalized: text("buyer_phone_normalized"),
    giftRecipientPhoneNormalized: text("gift_recipient_phone_normalized"),
    status: text().notNull().default("offered"),
    title: text().notNull(),
    priceMinor: integer("price_minor").notNull(),
    currency: text().notNull().default("RUB"),
    validityDays: integer("validity_days"),
    validFrom: timestamp("valid_from", { withTimezone: true, mode: "string" }),
    validUntil: timestamp("valid_until", { withTimezone: true, mode: "string" }),
    fulfillmentJson: jsonb("fulfillment_json").default({}).notNull(),
    paymentIntentId: uuid("payment_intent_id"),
    paymentRef: text("payment_ref"),
    payLinkId: uuid("pay_link_id"),
    assignedByPlatformUserId: uuid("assigned_by_platform_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_product_purchases_org_user").on(table.organizationId, table.platformUserId),
    index("idx_be_product_purchases_phone").on(table.organizationId, table.buyerPhoneNormalized),
    index("idx_be_product_purchases_product").on(table.productId),
    index("idx_be_product_purchases_status").on(table.status),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_product_purchases_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.productId],
      foreignColumns: [beProducts.id],
      name: "be_product_purchases_product_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.platformUserId],
      foreignColumns: [platformUsers.id],
      name: "be_product_purchases_platform_user_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.payLinkId],
      foreignColumns: [beProductPayLinks.id],
      name: "be_product_purchases_pay_link_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.assignedByPlatformUserId],
      foreignColumns: [platformUsers.id],
      name: "be_product_purchases_assigned_by_fkey",
    }).onDelete("set null"),
    check(
      "be_product_purchases_status_check",
      sql`status = ANY (ARRAY[
        'offered'::text, 'awaiting_payment'::text, 'active'::text,
        'used'::text, 'expired'::text, 'cancelled'::text
      ])`,
    ),
    check("be_product_purchases_price_check", sql`price_minor >= 0`),
  ],
);

export const beProductHistoryEvents = pgTable(
  "be_product_history_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    productPurchaseId: uuid("product_purchase_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadJson: jsonb("payload_json").default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_product_history_purchase").on(table.productPurchaseId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_product_history_events_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.productPurchaseId],
      foreignColumns: [beProductPurchases.id],
      name: "be_product_history_events_product_purchase_id_fkey",
    }).onDelete("cascade"),
  ],
);
