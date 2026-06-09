import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const INTEGRATION_WEBHOOK_SOURCES = ["rubitime", "telegram", "max"] as const;
export type IntegrationWebhookSource = (typeof INTEGRATION_WEBHOOK_SOURCES)[number];

/** Последний статус обработки входящего вебхука (одна строка на source). */
export const integrationWebhookLastStatus = pgTable("integration_webhook_last_status", {
  source: text("source").primaryKey().notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" }).notNull(),
  processedOk: integer("processed_ok").notNull(),
  errorClass: text("error_class"),
  httpStatusReturned: integer("http_status_returned"),
  detail: text("detail"),
});

/** События ошибок вебхуков для burst P8 (скользящее окно в webapp). */
export const integrationWebhookErrorEvents = pgTable(
  "integration_webhook_error_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    source: text("source").notNull(),
    errorClass: text("error_class").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_integration_webhook_error_events_burst").using(
      "btree",
      table.source.asc().nullsLast(),
      table.errorClass.asc().nullsLast(),
      table.occurredAt.desc().nullsFirst(),
    ),
  ],
);
