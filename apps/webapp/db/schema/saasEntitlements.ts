import { sql } from 'drizzle-orm';
import {
  boolean,
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

/**
 * Store P0 — entitlement foundation (dormant). Mirrors
 * deploy/postgres/store-p0-entitlements-rls.sql exactly (RLS/grants live in that overlay, NOT here).
 * See docs/_TODO/SAAS_FOUNDATION/STORE_P0_ENTITLEMENTS_PLAN.md.
 *
 * Platform-global tariff catalog. `mechanics` is the operator-configured mechanic -> bool map.
 * No per-mechanic fallback policy is selected in code.
 */
export const saasTariffs = pgTable(
  'saas_tariffs',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    description: text().default('').notNull(),
    priceMinor: integer('price_minor'),
    currency: text(),
    billingPeriod: text('billing_period').default('month').notNull(),
    mechanics: jsonb()
      .$type<Record<string, boolean>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    quotas: jsonb()
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    systemAccessPolicy: jsonb('system_access_policy').$type<Record<string, unknown>>(),
    mechanicAccessPolicies: jsonb('mechanic_access_policies')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** §5a stage 4b.3 — per-mechanic "переход на тариф меньше" policy; see `DowngradePolicyMap`. */
    downgradePolicies: jsonb('downgrade_policies')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /**
     * C4A — included specialist seats for the `clinic_team` mechanic. §5a item 2.6a (owner 31.07):
     * the tariff constructor refuses to SAVE without this number, so "empty" is only reachable for
     * rows written before that rule; such a row refuses growth and is never given a baseline in
     * code. A stored value must be nonnegative.
     *
     * There is no seat warning threshold: overage on seats is billed, not blocked (owner 30.07),
     * so the column was dropped in `0285_tariff_ladder_notifications_local.sql`.
     */
    includedSeats: integer('included_seats'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'saas_tariffs_included_seats_nonnegative_check',
      sql`${table.includedSeats} IS NULL OR ${table.includedSeats} >= 0`,
    ),
    check(
      'saas_tariffs_billing_period_check',
      sql`${table.billingPeriod} = ANY (ARRAY['day'::text, 'month'::text, 'year'::text])`,
    ),
  ],
);

/** Per-clinic entitlement OVERRIDES (tariff defaults + per-org override, owner decision 2026-07-13). */
export const saasOrgEntitlementOverrides = pgTable(
  'saas_org_entitlement_overrides',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    mechanic: text().notNull(),
    enabled: boolean().notNull(),
    quota: jsonb().$type<Record<string, unknown>>(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    /**
     * C4A — per-org override of the `clinic_team` included-seats count; unused for other
     * mechanics. `null` means not explicitly configured; a stored value must be nonnegative.
     */
    seatLimitOverride: integer('seat_limit_override'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_saas_org_entitlement_overrides_org').using(
      'btree',
      table.organizationId.asc().nullsLast().op('uuid_ops'),
    ),
    index('idx_saas_org_entitlement_overrides_org_expiry').on(
      table.organizationId,
      table.expiresAt,
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'saas_org_entitlement_overrides_organization_id_fkey',
    }).onDelete('cascade'),
    unique('saas_org_entitlement_overrides_org_mechanic_uidx').on(
      table.organizationId,
      table.mechanic,
    ),
    check(
      'saas_org_entitlement_overrides_seat_limit_nonnegative_check',
      sql`${table.seatLimitOverride} IS NULL OR ${table.seatLimitOverride} >= 0`,
    ),
  ],
);

/** Singleton, platform-global trial policy. Values are operator-configured data, never product defaults. */
export const saasTrialPolicy = pgTable(
  'saas_trial_policy',
  {
    key: text().primaryKey().default('global').notNull(),
    tariffId: uuid('tariff_id').notNull(),
    durationDays: integer('duration_days').notNull(),
    graceDays: integer('grace_days').notNull(),
    startEvent: text('start_event').notNull(),
    postTrialBehavior: text('post_trial_behavior').notNull(),
    postTrialTariffId: uuid('post_trial_tariff_id'),
    isActive: boolean('is_active').default(true).notNull(),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tariffId],
      foreignColumns: [saasTariffs.id],
      name: 'saas_trial_policy_tariff_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.postTrialTariffId],
      foreignColumns: [saasTariffs.id],
      name: 'saas_trial_policy_post_trial_tariff_id_fkey',
    }).onDelete('restrict'),
    check('saas_trial_policy_key_check', sql`${table.key} = 'global'`),
    check('saas_trial_policy_duration_check', sql`${table.durationDays} > 0`),
    check('saas_trial_policy_grace_check', sql`${table.graceDays} >= 0`),
    check('saas_trial_policy_start_event_check', sql`length(btrim(${table.startEvent})) > 0`),
    check(
      'saas_trial_policy_post_behavior_check',
      sql`${table.postTrialBehavior} = ANY (ARRAY['read_only'::text, 'blocked'::text, 'tariff'::text])`,
    ),
    check(
      'saas_trial_policy_post_tariff_check',
      sql`(${table.postTrialBehavior} = 'tariff' AND ${table.postTrialTariffId} IS NOT NULL) OR (${table.postTrialBehavior} <> 'tariff' AND ${table.postTrialTariffId} IS NULL)`,
    ),
  ],
);

/** One immutable trial identity per organization; dates may only move through audited platform operations. */
export const saasOrganizationTrials = pgTable(
  'saas_organization_trials',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    tariffId: uuid('tariff_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'string' }).notNull(),
    graceEndsAt: timestamp('grace_ends_at', { withTimezone: true, mode: 'string' }).notNull(),
    postTrialBehavior: text('post_trial_behavior').notNull(),
    postTrialTariffId: uuid('post_trial_tariff_id'),
    status: text().default('active').notNull(),
    extensionCount: integer('extension_count').default(0).notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('saas_organization_trials_organization_uidx').on(table.organizationId),
    index('idx_saas_organization_trials_lifecycle').on(table.status, table.graceEndsAt),
    index('idx_saas_organization_trials_org_updated').on(table.organizationId, table.updatedAt),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'saas_organization_trials_org_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tariffId],
      foreignColumns: [saasTariffs.id],
      name: 'saas_organization_trials_tariff_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.postTrialTariffId],
      foreignColumns: [saasTariffs.id],
      name: 'saas_organization_trials_post_tariff_fkey',
    }).onDelete('restrict'),
    check(
      'saas_organization_trials_dates_check',
      sql`${table.startedAt} < ${table.endsAt} AND ${table.endsAt} <= ${table.graceEndsAt}`,
    ),
    check('saas_organization_trials_extension_count_check', sql`${table.extensionCount} >= 0`),
    check(
      'saas_organization_trials_status_check',
      sql`${table.status} = ANY (ARRAY['active'::text, 'ended'::text])`,
    ),
    check(
      'saas_organization_trials_post_behavior_check',
      sql`${table.postTrialBehavior} = ANY (ARRAY['read_only'::text, 'blocked'::text, 'tariff'::text])`,
    ),
    check(
      'saas_organization_trials_post_tariff_check',
      sql`(${table.postTrialBehavior} = 'tariff' AND ${table.postTrialTariffId} IS NOT NULL) OR (${table.postTrialBehavior} <> 'tariff' AND ${table.postTrialTariffId} IS NULL)`,
    ),
  ],
);
