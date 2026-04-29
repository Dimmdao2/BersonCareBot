import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const patientHomeBlocks = pgTable(
  "patient_home_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    code: text("code").notNull(),
    isVisible: boolean("is_visible").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    unique("patient_home_blocks_code_key").on(table.code),
    index("idx_patient_home_blocks_sort").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops")),
  ],
);

export const patientHomeBlockItems = pgTable(
  "patient_home_block_items",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    blockId: uuid("block_id")
      .notNull()
      .references(() => patientHomeBlocks.id, { onDelete: "cascade", onUpdate: "no action" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    isVisible: boolean("is_visible").default(true).notNull(),
    targetType: text("target_type").notNull(),
    targetRef: text("target_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_patient_home_block_items_block_sort").using(
      "btree",
      table.blockId.asc().nullsLast().op("uuid_ops"),
      table.sortOrder.asc().nullsLast().op("int4_ops"),
    ),
    check(
      "patient_home_block_items_target_type_check",
      sql`target_type = ANY (ARRAY['content_section'::text, 'content_page'::text, 'course'::text])`,
    ),
  ],
);
