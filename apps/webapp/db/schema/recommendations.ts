import { sql } from "drizzle-orm";
import { pgTable, uuid, text, boolean, jsonb, timestamp, index, foreignKey } from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";

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
    isArchived: boolean("is_archived").default(false).notNull(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_recommendations_archived").using("btree", table.isArchived.asc().nullsLast().op("bool_ops")),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [platformUsers.id],
      name: "recommendations_created_by_fkey",
    }).onDelete("set null"),
  ],
);
