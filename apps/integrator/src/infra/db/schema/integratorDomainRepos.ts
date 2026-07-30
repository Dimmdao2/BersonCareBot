/**
 * Таблицы домена P3 reminders.
 * Колонки и ограничения сверены с миграциями integrator + `apps/webapp/db/schema/schema.ts`
 * (FK в Drizzle не тянем — только уникальные индексы/CHECK, как в P1).
 */
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const userReminderRules = pgTable(
  'user_reminder_rules',
  {
    id: text().primaryKey().notNull(),
    userId: bigint('user_id', { mode: 'number' }).notNull(),
    category: text().notNull(),
    isEnabled: boolean('is_enabled').default(false).notNull(),
    scheduleType: text('schedule_type').default('interval_window').notNull(),
    timezone: text().default('Europe/Moscow').notNull(),
    intervalMinutes: integer('interval_minutes').notNull(),
    windowStartMinute: integer('window_start_minute').notNull(),
    windowEndMinute: integer('window_end_minute').notNull(),
    daysMask: text('days_mask').default('1111111').notNull(),
    contentMode: text('content_mode').default('none').notNull(),
    linkedObjectType: text('linked_object_type'),
    linkedObjectId: text('linked_object_id'),
    customTitle: text('custom_title'),
    customText: text('custom_text'),
    deepLink: text('deep_link'),
    scheduleData: jsonb('schedule_data'),
    reminderIntent: text('reminder_intent').default('generic'),
    quietHoursStartMinute: integer('quiet_hours_start_minute'),
    quietHoursEndMinute: integer('quiet_hours_end_minute'),
    notificationTopicCode: text('notification_topic_code'),
    organizationId: uuid('organization_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('user_reminder_rules_enabled_idx').using(
      'btree',
      table.isEnabled.asc().nullsLast().op('text_ops'),
      table.category.asc().nullsLast().op('bool_ops'),
    ),
  ],
);

export const userReminderOccurrences = pgTable(
  'user_reminder_occurrences',
  {
    id: text().primaryKey().notNull(),
    ruleId: text('rule_id').notNull(),
    occurrenceKey: text('occurrence_key').notNull(),
    plannedAt: timestamp('planned_at', { withTimezone: true, mode: 'string' }).notNull(),
    status: text().default('planned').notNull(),
    queuedAt: timestamp('queued_at', { withTimezone: true, mode: 'string' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
    failedAt: timestamp('failed_at', { withTimezone: true, mode: 'string' }),
    deliveryChannel: text('delivery_channel'),
    deliveryJobId: text('delivery_job_id'),
    errorCode: text('error_code'),
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
