import { sql } from "drizzle-orm";
import { pgTable, uuid, text, boolean, jsonb, timestamp, index, foreignKey, primaryKey } from "drizzle-orm/pg-core";
import { platformUsers, referenceItems } from "./schema";

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    title: text().notNull(),
    bodyMd: text("body_md").notNull(),
    media: jsonb("media")
      .$type<{ mediaUrl: string; mediaType: string; sortOrder: number }[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    tags: text("tags").array(),
    /** Код типа (колонка `domain`); UI — «Тип». См. `recommendationDomain.ts`. */
    domain: text("domain"),
    /** FK на `reference_items` (категория регионов тела, `body_region`). */
    bodyRegionId: uuid("body_region_id"),
    quantityText: text("quantity_text"),
    frequencyText: text("frequency_text"),
    durationText: text("duration_text"),
    isArchived: boolean("is_archived").default(false).notNull(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_recommendations_archived").using("btree", table.isArchived.asc().nullsLast().op("bool_ops")),
    index("idx_recommendations_domain").using("btree", table.domain.asc().nullsLast().op("text_ops")),
    index("idx_recommendations_body_region").using("btree", table.bodyRegionId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [platformUsers.id],
      name: "recommendations_created_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.bodyRegionId],
      foreignColumns: [referenceItems.id],
      name: "recommendations_body_region_id_fkey",
    }).onDelete("set null"),
  ],
);

/** M2M: рекомендация ↔ регион тела. Legacy: `recommendations.body_region_id` (dual-write). */
export const recommendationRegions = pgTable(
  "recommendation_regions",
  {
    recommendationId: uuid("recommendation_id").notNull(),
    bodyRegionId: uuid("body_region_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.recommendationId, table.bodyRegionId], name: "recommendation_regions_pkey" }),
    foreignKey({
      columns: [table.recommendationId],
      foreignColumns: [recommendations.id],
      name: "recommendation_regions_recommendation_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.bodyRegionId],
      foreignColumns: [referenceItems.id],
      name: "recommendation_regions_body_region_id_fkey",
    }).onDelete("cascade"),
    index("idx_recommendation_regions_body_region").using("btree", table.bodyRegionId.asc().nullsLast().op("uuid_ops")),
  ],
);
