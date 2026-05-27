import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";

/** Fact row per logical Web Push send; `id` is `trackingId` in SW payload. */
export const productPushNotifications = pgTable(
  "product_push_notifications",
  {
    id: uuid("id").primaryKey().notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => platformUsers.id, { onDelete: "cascade" }),
    topicCode: text("topic_code"),
    intentType: text("intent_type"),
    occurrenceId: uuid("occurrence_id"),
    pushKind: text("push_kind"),
    warmupSloganKey: text("warmup_slogan_key"),
    warmupSloganText: text("warmup_slogan_text"),
    openUrl: text("open_url"),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_product_push_notifications_user_created").on(table.userId, table.createdAt),
    index("idx_product_push_notifications_topic_created").on(table.topicCode, table.createdAt),
    index("idx_product_push_notifications_kind_slogan_created").on(
      table.pushKind,
      table.warmupSloganKey,
      table.createdAt,
    ),
  ],
);

/** Short-retention raw events for drill-down (main reports use hourly rollups). */
export const productAnalyticsEventsRecent = pgTable(
  "product_analytics_events_recent",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    eventType: text("event_type").notNull(),
    entryChannel: text("entry_channel").notNull(),
    pageKey: text("page_key"),
    userId: uuid("user_id").references(() => platformUsers.id, { onDelete: "set null" }),
    clientSessionId: text("client_session_id"),
    pushTrackingId: uuid("push_tracking_id"),
    topicCode: text("topic_code"),
    pushKind: text("push_kind"),
    warmupSloganKey: text("warmup_slogan_key"),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  },
  (table) => [
    index("idx_product_analytics_events_recent_occurred").on(table.occurredAt),
    index("idx_product_analytics_events_recent_type_occurred").on(table.eventType, table.occurredAt),
    uniqueIndex("idx_product_analytics_events_recent_push_open_dedupe")
      .on(table.pushTrackingId)
      .where(sql`${table.eventType} = 'push_open' AND ${table.pushTrackingId} IS NOT NULL`),
  ],
);

/** UTC hourly platform aggregates. */
export const productAnalyticsHourly = pgTable(
  "product_analytics_hourly",
  {
    bucketHour: timestamp("bucket_hour", { withTimezone: true, mode: "string" }).notNull(),
    eventType: text("event_type").notNull(),
    entryChannel: text("entry_channel").notNull(),
    pageKey: text("page_key").notNull(),
    topicCode: text("topic_code").notNull(),
    pushKind: text("push_kind").notNull(),
    warmupSloganKey: text("warmup_slogan_key").notNull(),
    eventCount: integer("event_count").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.bucketHour,
        table.eventType,
        table.entryChannel,
        table.pageKey,
        table.topicCode,
        table.pushKind,
        table.warmupSloganKey,
      ],
      name: "product_analytics_hourly_pkey",
    }),
    index("idx_product_analytics_hourly_bucket").on(table.bucketHour),
  ],
);

/** Per-user hourly activity (page_key `__all__` for session-level counters). */
export const productAnalyticsUserHourly = pgTable(
  "product_analytics_user_hourly",
  {
    bucketHour: timestamp("bucket_hour", { withTimezone: true, mode: "string" }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => platformUsers.id, { onDelete: "cascade" }),
    entryChannel: text("entry_channel").notNull(),
    pageKey: text("page_key").notNull(),
    appOpens: integer("app_opens").default(0).notNull(),
    pageViews: integer("page_views").default(0).notNull(),
    pushOpens: integer("push_opens").default(0).notNull(),
    activeMinutes: integer("active_minutes").default(0).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.bucketHour, table.userId, table.entryChannel, table.pageKey],
      name: "product_analytics_user_hourly_pkey",
    }),
    index("idx_product_analytics_user_hourly_user_bucket").on(table.userId, table.bucketHour),
  ],
);
