import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** Исходящая доставка уведомлений (очередь integrator worker, таблица в public). */
export const outgoingDeliveryQueue = pgTable(
  "outgoing_delivery_queue",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    eventId: text("event_id").notNull(),
    kind: text("kind").notNull(),
    channel: text("channel").notNull(),
    payloadJson: jsonb("payload_json").notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(6),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: "string" }).notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, mode: "string" }),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
    deadAt: timestamp("dead_at", { withTimezone: true, mode: "string" }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_outgoing_delivery_queue_event_id").on(table.eventId),
    index("idx_outgoing_delivery_queue_due").on(table.status, table.nextRetryAt),
  ],
);
