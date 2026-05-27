import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { contentPages, platformUsers } from "./schema";

/** Текущая разминка дня на главной (обновляется при открытии push-напоминания). */
export const patientDailyWarmupPresentations = pgTable(
  "patient_daily_warmup_presentations",
  {
    userId: uuid("user_id")
      .primaryKey()
      .notNull()
      .references(() => platformUsers.id, { onDelete: "cascade" }),
    contentPageId: uuid("content_page_id")
      .notNull()
      .references(() => contentPages.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_patient_daily_warmup_presentations_content_page").on(table.contentPageId),
  ],
);
