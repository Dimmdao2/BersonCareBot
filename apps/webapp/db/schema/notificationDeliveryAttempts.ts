import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Фактические попытки доставки уведомлений по каналам (операторский health, без SMS). */
export const notificationDeliveryAttempts = pgTable(
  "notification_delivery_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    userId: uuid("user_id"),
    integratorUserId: text("integrator_user_id"),
    topicCode: text("topic_code"),
    intentType: text("intent_type"),
    channel: text("channel").notNull(),
    status: text("status").notNull(),
    reason: text("reason"),
    providerStatusCode: integer("provider_status_code"),
    eventId: text("event_id"),
    occurrenceId: uuid("occurrence_id"),
    endpointHash: text("endpoint_hash"),
    recipientRef: text("recipient_ref"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  },
  (table) => [
    index("idx_notification_delivery_attempts_created_at").on(table.createdAt),
    index("idx_notification_delivery_attempts_channel_created").on(table.channel, table.createdAt),
    index("idx_notification_delivery_attempts_status_created").on(table.status, table.createdAt),
    index("idx_notification_delivery_attempts_user_created").on(table.userId, table.createdAt),
    index("idx_notification_delivery_attempts_topic_created").on(table.topicCode, table.createdAt),
    index("idx_notification_delivery_attempts_occurrence_created").on(table.occurrenceId, table.createdAt),
  ],
);
