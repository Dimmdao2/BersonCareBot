import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { beOrganizations } from "./bookingEngine";

/**
 * Minimal seed of the S6 `clinic_public_directory_entries` public-catalog projection
 * (`docs/_TODO/SAAS_FOUNDATION/SAAS_S6_CLINIC_DIRECTORY_AND_ORG_BOUNDARY.md` §5).
 *
 * Scope for #805 (owner canon `/book/{publicSlug}`, `OWNER_RULINGS_2026-07-17.md` §1): only the
 * columns needed to resolve a public booking slug to a published organization. The full marketing
 * projection (description/locations/specialists/services JSON, owner publish flow) is future S6.3
 * scope and can `ALTER TABLE ADD COLUMN` onto this same table without touching this slice.
 */
export const clinicPublicDirectoryEntries = pgTable(
  "clinic_public_directory_entries",
  {
    /** One-to-one with the organization; never exposed publicly, only used for internal joins. */
    organizationId: uuid("organization_id").primaryKey().notNull(),
    /** Public, stable, lower-case URL id. Never the organization UUID. */
    slug: text().notNull(),
    /** Explicit copy of `be_organizations.title` at publish time; owner-editable afterwards. */
    displayName: text("display_name").notNull(),
    isPublished: boolean("is_published").default(false).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_clinic_public_directory_entries_slug").using(
      "btree",
      table.slug.asc().nullsLast().op("text_ops"),
    ),
    index("idx_clinic_public_directory_entries_published").using(
      "btree",
      table.isPublished.asc().nullsLast().op("bool_ops"),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "clinic_public_directory_entries_organization_id_fkey",
    }).onDelete("cascade"),
    check("clinic_public_directory_entries_slug_lower_check", sql`${table.slug} = lower(${table.slug})`),
    check("clinic_public_directory_entries_slug_not_blank_check", sql`length(btrim(${table.slug})) > 0`),
  ],
);
