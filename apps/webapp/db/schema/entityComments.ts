import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";

/** Единая таблица комментариев — `SYSTEM_LOGIC_SCHEMA.md` § 7. Имя экспорта `entityComments` (таблица БД `comments`). */
export const entityComments = pgTable(
  "comments",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    authorId: uuid("author_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    commentType: text("comment_type").notNull(),
    body: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_comments_target_type_target_id").using(
      "btree",
      table.targetType.asc().nullsLast().op("text_ops"),
      table.targetId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.authorId],
      foreignColumns: [platformUsers.id],
      name: "comments_author_id_fkey",
    }).onDelete("restrict"),
    check(
      "comments_target_type_check",
      sql`target_type = ANY (ARRAY['exercise'::text, 'lfk_complex'::text, 'test'::text, 'test_set'::text, 'recommendation'::text, 'lesson'::text, 'stage_item_instance'::text, 'stage_instance'::text, 'program_instance'::text])`,
    ),
    check(
      "comments_comment_type_check",
      sql`comment_type = ANY (ARRAY['template'::text, 'individual_override'::text, 'clinical_note'::text])`,
    ),
  ],
);
