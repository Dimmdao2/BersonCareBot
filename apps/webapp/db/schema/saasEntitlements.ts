import { sql } from "drizzle-orm";
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
} from "drizzle-orm/pg-core";
import { beOrganizations } from "./bookingEngine";

/**
 * Store P0 — entitlement foundation (dormant). Mirrors
 * deploy/postgres/store-p0-entitlements-rls.sql exactly (RLS/grants live in that overlay, NOT here).
 * See docs/_TODO/SAAS_FOUNDATION/STORE_P0_ENTITLEMENTS_PLAN.md.
 *
 * Platform-global tariff catalog. `mechanics` is a map mechanic -> bool; an absent key defaults to
 * enabled for every mechanic except `clinic_team`, which defaults to disabled (see
 * `MECHANIC_DEFAULT_ENABLED` in src/modules/org-entitlements/types.ts).
 */
export const saasTariffs = pgTable(
  "saas_tariffs",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    description: text().default("").notNull(),
    priceMinor: integer("price_minor"),
    currency: text(),
    mechanics: jsonb().$type<Record<string, boolean>>().notNull().default(sql`'{}'::jsonb`),
    /**
     * C4A — included specialist seats for the `clinic_team` mechanic. `null` means not explicitly
     * configured (resolver falls back to a finite fail-closed baseline, never unlimited); a stored
     * value must be nonnegative.
     */
    includedSeats: integer("included_seats"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "saas_tariffs_included_seats_nonnegative_check",
      sql`${table.includedSeats} IS NULL OR ${table.includedSeats} >= 0`,
    ),
  ],
);

/** Per-clinic entitlement OVERRIDES (tariff defaults + per-org override, owner decision 2026-07-13). */
export const saasOrgEntitlementOverrides = pgTable(
  "saas_org_entitlement_overrides",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    mechanic: text().notNull(),
    enabled: boolean().notNull(),
    /**
     * C4A — per-org override of the `clinic_team` included-seats count; unused for other
     * mechanics. `null` means not explicitly configured; a stored value must be nonnegative.
     */
    seatLimitOverride: integer("seat_limit_override"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_saas_org_entitlement_overrides_org").using(
      "btree",
      table.organizationId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "saas_org_entitlement_overrides_organization_id_fkey",
    }).onDelete("cascade"),
    unique("saas_org_entitlement_overrides_org_mechanic_uidx").on(table.organizationId, table.mechanic),
    check(
      "saas_org_entitlement_overrides_seat_limit_nonnegative_check",
      sql`${table.seatLimitOverride} IS NULL OR ${table.seatLimitOverride} >= 0`,
    ),
  ],
);
