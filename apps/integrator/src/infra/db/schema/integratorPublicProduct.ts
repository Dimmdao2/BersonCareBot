/**
 * Узкие Drizzle-описания таблиц `public`, с которыми работает integrator (P1 repos).
 * Колонки, индексы и CHECK сверены с `apps/webapp/db/schema/schema.ts`
 * (без FK в объект схемы — не тянем users/mailings).
 * Связка Google Calendar и зеркало `public.patient_bookings` меняются только через узкие
 * SECURITY DEFINER roots из `repos/bookingCalendarMap.ts`; описание map здесь остаётся каталогом схемы.
 */
import {
  bigserial,
  boolean,
  integer,
  jsonb,
  PgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// `pgSchema('public')` intentionally throws in Drizzle because the library assumes the default
// search_path always contains `public`. Our port-context runtime deliberately removes that implicit
// path, so construct the exported schema object directly and keep every generated relation explicit.
const publicSchema = new PgSchema('public');

export const bookingCalendarMap = publicSchema.table(
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

/** Narrow `public.platform_users` slice for integrator delivery/lookup repos (D18b). */
export const platformUsers = publicSchema.table('platform_users', {
  id: uuid().primaryKey().notNull(),
  mergedIntoId: uuid('merged_into_id'),
});

export const userContacts = publicSchema.table('user_contacts', {
  platformUserId: uuid('platform_user_id').notNull(),
  contactKind: text('contact_kind').notNull(),
  valueNormalized: text('value_normalized').notNull(),
  isPrimary: boolean('is_primary').notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'string' }),
});

/** Narrow `public.user_channel_bindings` slice for integrator delivery lookup (D18b). */
export const userChannelBindings = publicSchema.table('user_channel_bindings', {
  userId: uuid('user_id').notNull(),
  channelCode: text('channel_code').notNull(),
  externalId: text('external_id').notNull(),
  displayHandle: text('display_handle'),
});

/** Existing public enrollment table, mapped narrowly for shared direct-writer actor resolution. */
export const orgEnrollments = publicSchema.table('org_enrollments', {
  platformUserId: uuid('platform_user_id').notNull(),
  organizationId: uuid('organization_id').notNull(),
  status: text().notNull(),
});

/**
 * Canonical reminder business rules owned by webapp. Integrator owns only occurrence/delivery
 * mechanics, keyed by this table's stable `integrator_rule_id`.
 */
export const reminderRules = publicSchema.table('reminder_rules', {
  integratorRuleId: text('integrator_rule_id').primaryKey().notNull(),
  organizationId: uuid('organization_id'),
  /** Track D (#987): единственный ключ владельца правила; retired-id больше не читается. */
  platformUserId: uuid('platform_user_id').notNull(),
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

/**
 * The single physical occurrence store after Track D consolidation (#987) — replaces the old
 * `integrator.user_reminder_occurrences` operational table the integrator app used to read/write
 * directly. `integratorOccurrenceId` is the unique business key formerly known as `.id` on that
 * table; `id` remains the physical primary key even though integrator repos do not address rows by it.
 */
export const reminderOccurrenceHistory = publicSchema.table(
  'reminder_occurrence_history',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    integratorOccurrenceId: text('integrator_occurrence_id').notNull(),
    integratorRuleId: text('integrator_rule_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    platformUserId: uuid('platform_user_id').notNull(),
    occurrenceKey: text('occurrence_key'),
    category: text().notNull(),
    status: text().notNull(),
    plannedAt: timestamp('planned_at', { withTimezone: true, mode: 'string' }).notNull(),
    queuedAt: timestamp('queued_at', { withTimezone: true, mode: 'string' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
    failedAt: timestamp('failed_at', { withTimezone: true, mode: 'string' }),
    deliveryChannel: text('delivery_channel'),
    deliveryJobId: text('delivery_job_id'),
    errorCode: text('error_code'),
    deliveryGeneration: integer('delivery_generation').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }),
    seenAt: timestamp('seen_at', { withTimezone: true, mode: 'string' }),
    snoozedAt: timestamp('snoozed_at', { withTimezone: true, mode: 'string' }),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true, mode: 'string' }),
    skippedAt: timestamp('skipped_at', { withTimezone: true, mode: 'string' }),
    skipReason: text('skip_reason'),
    doneAt: timestamp('done_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (table) => [
    unique('reminder_occurrence_history_integrator_occurrence_id_key').on(
      table.integratorOccurrenceId,
    ),
  ],
);
