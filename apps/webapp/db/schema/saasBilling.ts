import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { beOrganizations } from './bookingEngine';
import { saasTariffs } from './saasEntitlements';

export const SAAS_BILLING_SOURCE_VALUES = ['manual', 'paid_subscription'] as const;
export type SaasBillingSource = (typeof SAAS_BILLING_SOURCE_VALUES)[number];

export const SAAS_BILLING_SUBSCRIPTION_STATUS_VALUES = [
  'pending_payment',
  'active',
  'expired',
  'cancelled',
] as const;
export type SaasBillingSubscriptionStatus =
  (typeof SAAS_BILLING_SUBSCRIPTION_STATUS_VALUES)[number];

export const SAAS_BILLING_LIFECYCLE_VALUES = ['active', 'grace', 'read_only', 'blocked'] as const;
export type SaasBillingLifecycleState = (typeof SAAS_BILLING_LIFECYCLE_VALUES)[number];

export const SAAS_BILLING_INVOICE_STATUS_VALUES = [
  'draft',
  'pending',
  'paid',
  'failed',
  'void',
] as const;
export type SaasBillingInvoiceStatus = (typeof SAAS_BILLING_INVOICE_STATUS_VALUES)[number];

/**
 * К2 — `pending` until the provider webhook confirms it (see `PAYMENTS_CABINET_PLAN.md` К2: "пока
 * не подтверждён — «в обработке», а не «возвращено»"). `failed` is a provider-call error (network,
 * rejected) and frees the amount for a fresh attempt; it is never surfaced as money returned.
 */
export const SAAS_BILLING_REFUND_STATUS_VALUES = ['pending', 'succeeded', 'failed', 'canceled'] as const;
export type SaasBillingRefundStatus = (typeof SAAS_BILLING_REFUND_STATUS_VALUES)[number];

export const saasBillingAccounts = pgTable(
  'saas_billing_accounts',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    billingEmail: text('billing_email'),
    legalName: text('legal_name'),
    taxIdentifier: text('tax_identifier'),
    registrationReasonCode: text('registration_reason_code'),
    billingAddress: jsonb('billing_address')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    billingRequisites: jsonb('billing_requisites')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('saas_billing_accounts_organization_uidx').on(table.organizationId),
    unique('saas_billing_accounts_id_organization_uidx').on(table.id, table.organizationId),
    index('idx_saas_billing_accounts_org_updated').on(table.organizationId, table.updatedAt),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'saas_billing_accounts_organization_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const saasBillingSubscriptions = pgTable(
  'saas_billing_subscriptions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    saasBillingAccountId: uuid('saas_billing_account_id').notNull(),
    tariffId: uuid('tariff_id').notNull(),
    source: text().$type<SaasBillingSource>().notNull(),
    status: text().$type<SaasBillingSubscriptionStatus>().notNull(),
    lifecycleState: text('lifecycle_state').$type<SaasBillingLifecycleState>().notNull(),
    providerId: text('provider_id'),
    savedPaymentMethodId: text('saved_payment_method_id'),
    currentPeriodStartsAt: timestamp('current_period_starts_at', {
      withTimezone: true,
      mode: 'string',
    }),
    currentPeriodEndsAt: timestamp('current_period_ends_at', {
      withTimezone: true,
      mode: 'string',
    }),
    graceEndsAt: timestamp('grace_ends_at', { withTimezone: true, mode: 'string' }),
    readOnlyEndsAt: timestamp('read_only_ends_at', { withTimezone: true, mode: 'string' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('saas_billing_subscriptions_org_source_uidx').on(table.organizationId, table.source),
    unique('saas_billing_subscriptions_id_organization_uidx').on(table.id, table.organizationId),
    index('idx_saas_billing_subscriptions_org_status').on(table.organizationId, table.status),
    index('idx_saas_billing_subscriptions_lifecycle').on(
      table.lifecycleState,
      table.graceEndsAt,
      table.readOnlyEndsAt,
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'saas_billing_subscriptions_organization_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.saasBillingAccountId, table.organizationId],
      foreignColumns: [saasBillingAccounts.id, saasBillingAccounts.organizationId],
      name: 'saas_billing_subscriptions_account_org_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tariffId],
      foreignColumns: [saasTariffs.id],
      name: 'saas_billing_subscriptions_tariff_id_fkey',
    }).onDelete('restrict'),
    check(
      'saas_billing_subscriptions_source_check',
      sql`${table.source} = ANY (ARRAY['manual'::text, 'paid_subscription'::text])`,
    ),
    check(
      'saas_billing_subscriptions_status_check',
      sql`${table.status} = ANY (ARRAY['pending_payment'::text, 'active'::text, 'expired'::text, 'cancelled'::text])`,
    ),
    check(
      'saas_billing_subscriptions_lifecycle_check',
      sql`${table.lifecycleState} = ANY (ARRAY['active'::text, 'grace'::text, 'read_only'::text, 'blocked'::text])`,
    ),
    check(
      'saas_billing_subscriptions_period_check',
      sql`(${table.currentPeriodStartsAt} IS NULL AND ${table.currentPeriodEndsAt} IS NULL) OR (${table.currentPeriodStartsAt} IS NOT NULL AND ${table.currentPeriodEndsAt} IS NOT NULL AND ${table.currentPeriodStartsAt} < ${table.currentPeriodEndsAt})`,
    ),
    check(
      'saas_billing_subscriptions_lifecycle_dates_check',
      sql`(${table.graceEndsAt} IS NULL OR ${table.currentPeriodEndsAt} IS NULL OR ${table.graceEndsAt} >= ${table.currentPeriodEndsAt}) AND (${table.readOnlyEndsAt} IS NULL OR ${table.graceEndsAt} IS NULL OR ${table.readOnlyEndsAt} >= ${table.graceEndsAt})`,
    ),
  ],
);

export const saasBillingInvoices = pgTable(
  'saas_billing_invoices',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    saasBillingAccountId: uuid('saas_billing_account_id').notNull(),
    saasBillingSubscriptionId: uuid('saas_billing_subscription_id').notNull(),
    tariffId: uuid('tariff_id').notNull(),
    tariffName: text('tariff_name').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text().notNull(),
    tariffBillingPeriod: text('tariff_billing_period').notNull(),
    servicePeriodStartsAt: timestamp('service_period_starts_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    servicePeriodEndsAt: timestamp('service_period_ends_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    status: text().$type<SaasBillingInvoiceStatus>().default('draft').notNull(),
    providerId: text('provider_id').notNull(),
    providerInvoiceRef: text('provider_invoice_ref'),
    providerCheckoutUrl: text('provider_checkout_url'),
    providerIdempotencyKey: text('provider_idempotency_key').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('saas_billing_invoices_id_organization_uidx').on(table.id, table.organizationId),
    unique('saas_billing_invoices_provider_idempotency_uidx').on(
      table.providerId,
      table.providerIdempotencyKey,
    ),
    unique('saas_billing_invoices_period_uidx').on(
      table.saasBillingSubscriptionId,
      table.servicePeriodStartsAt,
      table.servicePeriodEndsAt,
    ),
    index('idx_saas_billing_invoices_org_created').on(table.organizationId, table.createdAt),
    index('idx_saas_billing_invoices_status_created').on(table.status, table.createdAt),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'saas_billing_invoices_organization_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.saasBillingAccountId, table.organizationId],
      foreignColumns: [saasBillingAccounts.id, saasBillingAccounts.organizationId],
      name: 'saas_billing_invoices_account_org_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.saasBillingSubscriptionId, table.organizationId],
      foreignColumns: [saasBillingSubscriptions.id, saasBillingSubscriptions.organizationId],
      name: 'saas_billing_invoices_saas_billing_subscription_org_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tariffId],
      foreignColumns: [saasTariffs.id],
      name: 'saas_billing_invoices_tariff_id_fkey',
    }).onDelete('restrict'),
    check('saas_billing_invoices_amount_check', sql`${table.amountMinor} >= 0`),
    check('saas_billing_invoices_currency_check', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      'saas_billing_invoices_period_check',
      sql`${table.servicePeriodStartsAt} < ${table.servicePeriodEndsAt}`,
    ),
    check(
      'saas_billing_invoices_tariff_billing_period_check',
      sql`${table.tariffBillingPeriod} = ANY (ARRAY['day'::text, 'month'::text, 'year'::text])`,
    ),
    check(
      'saas_billing_invoices_status_check',
      sql`${table.status} = ANY (ARRAY['draft'::text, 'pending'::text, 'paid'::text, 'failed'::text, 'void'::text])`,
    ),
  ],
);

/**
 * К2 — one refund attempt against a paid invoice. `providerIdempotencyKey` is what makes a
 * repeated click a no-op: the reservation transaction inserts this row under a unique
 * `(provider_id, provider_idempotency_key)` key, so a second request with the same key returns the
 * row already reserved instead of inserting a second one. See `PAYMENTS_CABINET_PLAN.md` К2.
 */
export const saasBillingRefunds = pgTable(
  'saas_billing_refunds',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    saasBillingInvoiceId: uuid('saas_billing_invoice_id').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text().notNull(),
    status: text().$type<SaasBillingRefundStatus>().default('pending').notNull(),
    providerId: text('provider_id').notNull(),
    providerRefundRef: text('provider_refund_ref'),
    providerIdempotencyKey: text('provider_idempotency_key').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('saas_billing_refunds_provider_idempotency_uidx').on(
      table.providerId,
      table.providerIdempotencyKey,
    ),
    index('idx_saas_billing_refunds_invoice_created').on(
      table.saasBillingInvoiceId,
      table.createdAt,
    ),
    index('idx_saas_billing_refunds_status_created').on(table.status, table.createdAt),
    index('idx_saas_billing_refunds_provider_ref').on(table.providerId, table.providerRefundRef),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'saas_billing_refunds_organization_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.saasBillingInvoiceId, table.organizationId],
      foreignColumns: [saasBillingInvoices.id, saasBillingInvoices.organizationId],
      name: 'saas_billing_refunds_invoice_org_fkey',
    }).onDelete('restrict'),
    check('saas_billing_refunds_amount_check', sql`${table.amountMinor} > 0`),
    check('saas_billing_refunds_currency_check', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      'saas_billing_refunds_status_check',
      sql`${table.status} = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text])`,
    ),
  ],
);

export const saasBillingProviderEvents = pgTable(
  'saas_billing_provider_events',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    saasBillingInvoiceId: uuid('saas_billing_invoice_id'),
    providerId: text('provider_id').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('saas_billing_provider_events_provider_event_uidx').on(
      table.providerId,
      table.providerEventId,
    ),
    index('idx_saas_billing_provider_events_org_created').on(table.organizationId, table.createdAt),
    index('idx_saas_billing_provider_events_unprocessed')
      .on(table.createdAt)
      .where(sql`${table.processedAt} IS NULL`),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'saas_billing_provider_events_organization_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.saasBillingInvoiceId, table.organizationId],
      foreignColumns: [saasBillingInvoices.id, saasBillingInvoices.organizationId],
      name: 'saas_billing_provider_events_invoice_org_fkey',
    }).onDelete('restrict'),
    check(
      'saas_billing_provider_events_payload_check',
      sql`jsonb_typeof(${table.rawPayload}) = 'object' AND ${table.rawPayload} - ARRAY['providerId', 'providerEventId', 'type', 'status', 'amountMinor', 'currency', 'invoiceReference', 'subscriptionReference', 'occurredAt'] = '{}'::jsonb`,
    ),
  ],
);
