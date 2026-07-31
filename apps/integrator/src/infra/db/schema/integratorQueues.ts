/**
 * Очереди integrator: projection_outbox, message retry jobs.
 * `messageRetryJobs` maps to the `message_retry_jobs` physical table (renamed from the legacy
 * Provider-specific retry queue renamed by the 2026-07-24 core migration; see
 * `apps/integrator/src/infra/db/migrations/core/` for the exact file).
 * Сверено с `apps/webapp/db/schema/schema.ts` (колонки, индексы; без FK).
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const integratorSchema = pgSchema('integrator');

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

export const messageRetryJobs = integratorSchema.table(
  'message_retry_jobs',
  {
    id: bigserial({ mode: 'number' }).primaryKey().notNull(),
    phoneNormalized: text('phone_normalized'),
    messageText: text('message_text'),
    nextTryAt: timestamp('next_try_at', { withTimezone: true, mode: 'string' }).notNull(),
    attemptsDone: integer('attempts_done').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(2).notNull(),
    status: text().default('pending').notNull(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    kind: text().default('message.deliver').notNull(),
    payloadJson: jsonb('payload_json'),
  },
  (table) => [
    index('idx_message_retry_jobs_due').using(
      'btree',
      table.status.asc().nullsLast().op('text_ops'),
      table.nextTryAt.asc().nullsLast().op('text_ops'),
    ),
  ],
);
