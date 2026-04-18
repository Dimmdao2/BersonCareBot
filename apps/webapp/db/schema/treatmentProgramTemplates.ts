import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";

export const TREATMENT_PROGRAM_TEMPLATE_STATUSES = ["draft", "published", "archived"] as const;

export const TREATMENT_PROGRAM_ITEM_TYPES = [
  "exercise",
  "lfk_complex",
  "recommendation",
  "lesson",
  "test_set",
] as const;

export const treatmentProgramTemplates = pgTable(
  "treatment_program_templates",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    title: text().notNull(),
    description: text(),
    status: text().default("draft").notNull(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_treatment_program_templates_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [platformUsers.id],
      name: "treatment_program_templates_created_by_fkey",
    }).onDelete("set null"),
    check(
      "treatment_program_templates_status_check",
      sql`status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])`,
    ),
  ],
);

export const treatmentProgramTemplateStages = pgTable(
  "treatment_program_template_stages",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    templateId: uuid("template_id").notNull(),
    title: text().notNull(),
    description: text(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    index("idx_treatment_program_template_stages_template_order").using(
      "btree",
      table.templateId.asc().nullsLast().op("uuid_ops"),
      table.sortOrder.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.templateId],
      foreignColumns: [treatmentProgramTemplates.id],
      name: "treatment_program_template_stages_template_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const treatmentProgramTemplateStageItems = pgTable(
  "treatment_program_template_stage_items",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    stageId: uuid("stage_id").notNull(),
    itemType: text("item_type").notNull(),
    itemRefId: uuid("item_ref_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    comment: text(),
    settings: jsonb("settings").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("idx_treatment_program_stage_items_stage_order").using(
      "btree",
      table.stageId.asc().nullsLast().op("uuid_ops"),
      table.sortOrder.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.stageId],
      foreignColumns: [treatmentProgramTemplateStages.id],
      name: "treatment_program_template_stage_items_stage_id_fkey",
    }).onDelete("cascade"),
    check(
      "treatment_program_template_stage_items_item_type_check",
      sql`item_type = ANY (ARRAY['exercise'::text, 'lfk_complex'::text, 'recommendation'::text, 'lesson'::text, 'test_set'::text])`,
    ),
  ],
);
