import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";

/** Клинические тесты (таблица БД `tests`). */
export const clinicalTests = pgTable(
  "tests",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    title: text().notNull(),
    description: text(),
    testType: text("test_type"),
    scoringConfig: jsonb("scoring_config"),
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
    index("idx_tests_archived").using("btree", table.isArchived.asc().nullsLast().op("bool_ops")),
    index("idx_tests_title_search").using("btree", table.title.asc().nullsLast().op("text_ops")),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [platformUsers.id],
      name: "tests_created_by_fkey",
    }).onDelete("set null"),
  ],
);

export const testSets = pgTable(
  "test_sets",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    title: text().notNull(),
    description: text(),
    isArchived: boolean("is_archived").default(false).notNull(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_test_sets_archived").using("btree", table.isArchived.asc().nullsLast().op("bool_ops")),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [platformUsers.id],
      name: "test_sets_created_by_fkey",
    }).onDelete("set null"),
  ],
);

export const testSetItems = pgTable(
  "test_set_items",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    testSetId: uuid("test_set_id").notNull(),
    testId: uuid("test_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    index("idx_test_set_items_set_order").using(
      "btree",
      table.testSetId.asc().nullsLast().op("uuid_ops"),
      table.sortOrder.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.testSetId],
      foreignColumns: [testSets.id],
      name: "test_set_items_test_set_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.testId],
      foreignColumns: [clinicalTests.id],
      name: "test_set_items_test_id_fkey",
    }).onDelete("restrict"),
  ],
);
