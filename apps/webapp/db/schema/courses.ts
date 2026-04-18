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
import { treatmentProgramTemplates } from "./treatmentProgramTemplates";
import { contentPages } from "./schema";

/**
 * §9 SYSTEM_LOGIC_SCHEMA — курс: только метаданные и ссылка на шаблон программы;
 * этапы и прохождение — в `treatment_program_*`, не здесь.
 */
export const courses = pgTable(
  "courses",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    title: text().notNull(),
    description: text(),
    programTemplateId: uuid("program_template_id").notNull(),
    introLessonPageId: uuid("intro_lesson_page_id"),
    accessSettings: jsonb("access_settings").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: text().notNull(),
    /** Цена в минимальных единицах валюты (копейки и т.п.). */
    priceMinor: integer("price_minor").default(0).notNull(),
    currency: text().default("RUB").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_courses_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
    index("idx_courses_program_template").using("btree", table.programTemplateId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.programTemplateId],
      foreignColumns: [treatmentProgramTemplates.id],
      name: "courses_program_template_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.introLessonPageId],
      foreignColumns: [contentPages.id],
      name: "courses_intro_lesson_page_id_fkey",
    }).onDelete("set null"),
    check(
      "courses_status_check",
      sql`status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])`,
    ),
  ],
);
