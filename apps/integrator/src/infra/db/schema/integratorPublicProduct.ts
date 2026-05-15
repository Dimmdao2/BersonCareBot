/**
 * Узкие Drizzle-описания таблиц `public`, с которыми работает integrator (P1 repos).
 * Колонки, индексы и CHECK сверены с `apps/webapp/db/schema/schema.ts`
 * (без FK в объект схемы — не тянем users/mailings).
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

export const mailingTopics = pgTable('mailing_topics', {
  id: bigserial({ mode: 'number' }).primaryKey().notNull(),
  code: text().notNull(),
  title: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  key: text().notNull(),
  isActive: boolean('is_active').default(true).notNull(),
}, (table) => [unique('subscriptions_code_key').on(table.code)]);

export const userSubscriptions = pgTable(
  'user_subscriptions',
  {
    userId: bigint('user_id', { mode: 'number' }).notNull(),
    topicId: bigint('topic_id', { mode: 'number' }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.topicId], name: 'user_subscriptions_pkey' }),
  ],
);

export const bookingCalendarMap = pgTable('booking_calendar_map', {
  id: bigserial({ mode: 'number' }).primaryKey().notNull(),
  rubitimeRecordId: text('rubitime_record_id').notNull(),
  gcalEventId: text('gcal_event_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  unique('booking_calendar_map_rubitime_record_id_key').on(table.rubitimeRecordId),
]);

export const mailingLogs = pgTable(
  'mailing_logs',
  {
    userId: bigint('user_id', { mode: 'number' }).notNull(),
    mailingId: bigint('mailing_id', { mode: 'number' }).notNull(),
    status: text().notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    error: text(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.mailingId], name: 'mailing_logs_pkey' }),
  ],
);

export const deliveryAttemptLogs = pgTable(
  'delivery_attempt_logs',
  {
    id: bigserial({ mode: 'number' }).primaryKey().notNull(),
    intentType: text('intent_type'),
    intentEventId: text('intent_event_id'),
    correlationId: text('correlation_id'),
    channel: text().notNull(),
    status: text().notNull(),
    attempt: integer().notNull(),
    reason: text(),
    payloadJson: jsonb('payload_json').default({}).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    /* eslint-disable no-secrets/no-secrets -- canonical index names from webapp schema */
    index('idx_delivery_attempt_logs_channel_occurred').using(
      'btree',
      table.channel.asc().nullsLast().op('text_ops'),
      table.occurredAt.desc().nullsFirst().op('text_ops'),
    ),
    index('idx_delivery_attempt_logs_correlation').using(
      'btree',
      table.correlationId.asc().nullsLast().op('text_ops'),
    ),
    index('idx_delivery_attempt_logs_event').using(
      'btree',
      table.intentEventId.asc().nullsLast().op('text_ops'),
    ),
    check('delivery_attempt_logs_attempt_check', sql`attempt > 0`),
    check(
      'delivery_attempt_logs_status_check',
      sql`status = ANY (ARRAY['success'::text, 'failed'::text])`,
    ),
    /* eslint-enable no-secrets/no-secrets */
  ],
);
