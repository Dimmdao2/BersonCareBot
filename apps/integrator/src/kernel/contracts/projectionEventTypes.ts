/**
 * Stage 7 projection event type strings (reminders + content access).
 * Used by writePort when enqueueing and by webapp events.ts when dispatching.
 */
export const REMINDER_RULE_UPSERTED = 'reminder.rule.upserted';
export const REMINDER_OCCURRENCE_FINALIZED = 'reminder.occurrence.finalized';
export const REMINDER_DELIVERY_LOGGED = 'reminder.delivery.logged';
export const CONTENT_ACCESS_GRANTED = 'content.access.granted';

export type ReminderProjectionEventType =
  | typeof REMINDER_RULE_UPSERTED
  | typeof REMINDER_OCCURRENCE_FINALIZED
  | typeof REMINDER_DELIVERY_LOGGED
  | typeof CONTENT_ACCESS_GRANTED;

export const APPOINTMENT_RECORD_UPSERTED = 'appointment.record.upserted';

export type AppointmentProjectionEventType = typeof APPOINTMENT_RECORD_UPSERTED;

export const MAILING_TOPIC_UPSERTED = 'mailing.topic.upserted';
export const USER_SUBSCRIPTION_UPSERTED = 'user.subscription.upserted';
export const MAILING_LOG_SENT = 'mailing.log.sent';

export type SubscriptionMailingProjectionEventType =
  | typeof MAILING_TOPIC_UPSERTED
  | typeof USER_SUBSCRIPTION_UPSERTED
  | typeof MAILING_LOG_SENT;
