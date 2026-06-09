import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Dedup отправленных операторских алертов (critical / digest / account_conflicts). */
export const operatorHealthAlertSent = pgTable(
  "operator_health_alert_sent",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    dedupKey: text("dedup_key").notNull(),
    severity: text("severity").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_operator_health_alert_sent_dedup_sent_at").using(
      "btree",
      table.dedupKey.asc().nullsLast().op("text_ops"),
      table.sentAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
  ],
);
