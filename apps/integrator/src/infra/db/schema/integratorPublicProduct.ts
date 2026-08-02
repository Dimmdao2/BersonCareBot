/**
 * Узкие Drizzle-описания таблиц `public`, с которыми работает integrator (P1 repos).
 * Колонки, индексы и CHECK сверены с `apps/webapp/db/schema/schema.ts`
 * (без FK в объект схемы — не тянем users/mailings).
 * Обновления `public.patient_bookings` из `repos/bookingCalendarMap.ts` — через `runIntegratorSql` + `sql`
 * (отдельная таблица здесь не регистрируется).
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const bookingCalendarMap = pgTable(
  'booking_calendar_map',
  {
    id: bigserial({ mode: 'number' }).primaryKey().notNull(),
    appointmentKey: text('appointment_key').notNull(),
    gcalEventId: text('gcal_event_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique('booking_calendar_map_appointment_key_key').on(table.appointmentKey)],
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
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
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
  ],
);

/** Existing public enrollment table, mapped narrowly for shared direct-writer actor resolution. */
export const orgEnrollments = pgTable('org_enrollments', {
  platformUserId: uuid('platform_user_id').notNull(),
  organizationId: uuid('organization_id').notNull(),
  status: text().notNull(),
});

/**
 * Canonical reminder business rules owned by webapp. Integrator owns only occurrence/delivery
 * mechanics, keyed by this table's stable `integrator_rule_id`.
 */
export const reminderRules = pgTable('reminder_rules', {
  integratorRuleId: text('integrator_rule_id').primaryKey().notNull(),
  organizationId: uuid('organization_id'),
  integratorUserId: bigint('integrator_user_id', { mode: 'number' }),
  category: text().notNull(),
  isEnabled: boolean('is_enabled').notNull(),
  scheduleType: text('schedule_type').notNull(),
  timezone: text().notNull(),
  intervalMinutes: integer('interval_minutes').notNull(),
  windowStartMinute: integer('window_start_minute').notNull(),
  windowEndMinute: integer('window_end_minute').notNull(),
  daysMask: text('days_mask').notNull(),
  contentMode: text('content_mode').notNull(),
  linkedObjectType: text('linked_object_type'),
  linkedObjectId: text('linked_object_id'),
  customTitle: text('custom_title'),
  customText: text('custom_text'),
  scheduleData: jsonb('schedule_data'),
  reminderIntent: text('reminder_intent'),
  quietHoursStartMinute: integer('quiet_hours_start_minute'),
  quietHoursEndMinute: integer('quiet_hours_end_minute'),
  notificationTopicCode: text('notification_topic_code'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
});
