/**
 * Очередь integrator: projection_outbox.
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const projectionOutbox = pgTable(
  'projection_outbox',
  {
    id: bigserial({ mode: 'number' }).primaryKey().notNull(),
    eventType: text('event_type').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    payload: jsonb().default({}).notNull(),
    status: text().default('pending').notNull(),
    attemptsDone: integer('attempts_done').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(5).notNull(),
    nextTryAt: timestamp('next_try_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_projection_outbox_due')
      .using(
        'btree',
        table.status.asc().nullsLast().op('text_ops'),
        table.nextTryAt.asc().nullsLast().op('text_ops'),
      )
      .where(sql`(status = 'pending'::text)`),
    uniqueIndex('idx_projection_outbox_idempotency_key').using(
      'btree',
      table.idempotencyKey.asc().nullsLast().op('text_ops'),
    ),
  ],
);
