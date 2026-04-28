import { sql } from "drizzle-orm";
import { check, index, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contentPages } from "./schema";

export const patientPracticeCompletions = pgTable(
  "patient_practice_completions",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    contentPageId: uuid("content_page_id")
      .notNull()
      .references(() => contentPages.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    source: text("source").notNull(),
    feeling: smallint("feeling"),
    notes: text("notes").default("").notNull(),
  },
  (table) => [
    index("idx_ppc_user_completed_desc").using(
      "btree",
      table.userId.asc().nullsLast().op("uuid_ops"),
      table.completedAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    index("idx_ppc_user_page").using(
      "btree",
      table.userId.asc().nullsLast().op("uuid_ops"),
      table.contentPageId.asc().nullsLast().op("uuid_ops"),
    ),
    check("ppc_source_check", sql`source = ANY (ARRAY['home'::text, 'reminder'::text, 'section_page'::text, 'daily_warmup'::text])`),
    check("ppc_feeling_check", sql`(feeling IS NULL) OR ((feeling >= 1) AND (feeling <= 5))`),
  ],
);
