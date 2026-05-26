import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contentPages } from "./schema";
import { platformUsers } from "./schema";

export const patientContentRatingFeedback = pgTable(
  "patient_content_rating_feedback",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => platformUsers.id, { onDelete: "cascade" }),
    contentPageId: uuid("content_page_id")
      .notNull()
      .references(() => contentPages.id, { onDelete: "cascade" }),
    ratingValue: smallint("rating_value").notNull(),
    reasonCodes: jsonb("reason_codes").$type<string[]>().notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_pcrf_content_page_created_desc").using(
      "btree",
      table.contentPageId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    index("idx_pcrf_user_created_desc").using(
      "btree",
      table.userId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    check("pcrf_rating_value_check", sql`(rating_value >= 1) AND (rating_value <= 5)`),
  ],
);
