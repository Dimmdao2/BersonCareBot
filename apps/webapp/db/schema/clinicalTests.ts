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
  check,
  unique,
} from "drizzle-orm/pg-core";
import { platformUsers, referenceItems } from "./schema";

/** Глобальный пул подписей измерений для клинических тестов (B2). */
export const clinicalTestMeasureKinds = pgTable(
  "clinical_test_measure_kinds",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    unique("clinical_test_measure_kinds_code_key").on(table.code),
    index("idx_clinical_test_measure_kinds_sort").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops")),
  ],
);

/** Клинические тесты (таблица БД `tests`). */
export const clinicalTests = pgTable(
  "tests",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    title: text().notNull(),
    description: text(),
    testType: text("test_type"),
    scoringConfig: jsonb("scoring_config"),
    /** Структурированная модель оценки (B2); корень с `schema_type`. Legacy: `scoring_config`. */
    scoring: jsonb("scoring"),
    /** Свободный текст / fallback при миграции из legacy JSON. */
    rawText: text("raw_text"),
    /** Вид оценки по каталогу (PRE v1 enum); NULL — не задано. */
    assessmentKind: text("assessment_kind"),
    /** FK на `reference_items` (категория регионов тела, например `body_region`). */
    bodyRegionId: uuid("body_region_id"),
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
    index("idx_tests_body_region").using("btree", table.bodyRegionId.asc().nullsLast().op("uuid_ops")),
    index("idx_tests_assessment_kind").using("btree", table.assessmentKind.asc().nullsLast().op("text_ops")),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [platformUsers.id],
      name: "tests_created_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.bodyRegionId],
      foreignColumns: [referenceItems.id],
      name: "tests_body_region_id_fkey",
    }).onDelete("set null"),
  ],
);

export const testSets = pgTable(
  "test_sets",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    title: text().notNull(),
    description: text(),
    /** Публикация каталога набора: независимо от `is_archived`. */
    publicationStatus: text("publication_status").default("draft").notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "test_sets_publication_status_check",
      sql`${table.publicationStatus} IN ('draft', 'published')`,
    ),
    index("idx_test_sets_archived").using("btree", table.isArchived.asc().nullsLast().op("bool_ops")),
    index("idx_test_sets_publication_arch").using(
      "btree",
      table.isArchived.asc().nullsLast().op("bool_ops"),
      table.publicationStatus.asc().nullsLast().op("text_ops"),
    ),
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
