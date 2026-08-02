/**
 * Таблицы домена P3 reminders.
 * Колонки и ограничения сверены с миграциями integrator + `apps/webapp/db/schema/schema.ts`
 * (FK в Drizzle не тянем — только уникальные индексы/CHECK, как в P1).
 */
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const userReminderOccurrences = pgTable(
  'user_reminder_occurrences',
  {
    id: text().primaryKey().notNull(),
    ruleId: text('rule_id').notNull(),
    platformUserId: uuid('platform_user_id').notNull(),
    occurrenceKey: text('occurrence_key').notNull(),
    plannedAt: timestamp('planned_at', { withTimezone: true, mode: 'string' }).notNull(),
    status: text().default('planned').notNull(),
    queuedAt: timestamp('queued_at', { withTimezone: true, mode: 'string' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
    failedAt: timestamp('failed_at', { withTimezone: true, mode: 'string' }),
    deliveryChannel: text('delivery_channel'),
    deliveryJobId: text('delivery_job_id'),
    errorCode: text('error_code'),
    deliveryGeneration: integer('delivery_generation').notNull().default(0),
    organizationId: uuid('organization_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('user_reminder_occurrences_occurrence_key_key').on(table.occurrenceKey),
    index('user_reminder_occurrences_due_idx').using(
      'btree',
      table.status.asc().nullsLast().op('text_ops'),
      table.plannedAt.asc().nullsLast().op('text_ops'),
    ),
  ],
);

export const userReminderDeliveryLogs = pgTable(
  'user_reminder_delivery_logs',
  {
    id: text().primaryKey().notNull(),
    occurrenceId: text('occurrence_id').notNull(),
    channel: text().notNull(),
    status: text().notNull(),
    errorCode: text('error_code'),
    payloadJson: jsonb('payload_json').default({}).notNull(),
    organizationId: uuid('organization_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('user_reminder_delivery_logs_occurrence_idx').using(
      'btree',
      table.occurrenceId.asc().nullsLast().op('text_ops'),
      table.createdAt.desc().nullsFirst().op('text_ops'),
    ),
  ],
);

export const contentAccessGrants = pgTable(
  'content_access_grants',
  {
    id: text().primaryKey().notNull(),
    userId: bigint('user_id', { mode: 'number' }).notNull(),
    contentId: text('content_id').notNull(),
    purpose: text().notNull(),
    tokenHash: text('token_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    metaJson: jsonb('meta_json').default({}).notNull(),
    organizationId: uuid('organization_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('content_access_grants_user_expires_idx').using(
      'btree',
      table.userId.asc().nullsLast().op('int8_ops'),
      table.expiresAt.desc().nullsFirst().op('int8_ops'),
    ),
  ],
);
