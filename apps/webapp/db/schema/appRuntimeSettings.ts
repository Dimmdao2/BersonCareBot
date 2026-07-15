import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { beOrganizations } from "./bookingEngine";
import { platformUsers } from "./schema";

/**
 * Patient-safe runtime configuration. Restricted integration/admin settings remain in
 * `system_settings`; only registry-approved safe projections are stored here.
 */
export const appRuntimeSettings = pgTable(
  "app_runtime_settings",
  {
    key: text().notNull(),
    scope: text().default("global").notNull(),
    organizationId: uuid("organization_id"),
    audience: text().notNull(),
    valueJson: jsonb("value_json").default({}).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [
    uniqueIndex("app_runtime_settings_global_key_scope_uidx")
      .on(table.key, table.scope)
      .where(sql`organization_id IS NULL`),
    uniqueIndex("app_runtime_settings_org_key_scope_uidx")
      .on(table.key, table.scope, table.organizationId)
      .where(sql`organization_id IS NOT NULL`),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "app_runtime_settings_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.updatedBy],
      foreignColumns: [platformUsers.id],
      name: "app_runtime_settings_updated_by_fkey",
    }).onDelete("set null"),
    check(
      "app_runtime_settings_scope_check",
      sql`${table.scope} = ANY (ARRAY['global'::text, 'doctor'::text, 'admin'::text])`,
    ),
    check(
      "app_runtime_settings_audience_check",
      sql`${table.audience} = ANY (ARRAY['public'::text, 'authenticated_client'::text, 'server'::text])`,
    ),
  ],
);
