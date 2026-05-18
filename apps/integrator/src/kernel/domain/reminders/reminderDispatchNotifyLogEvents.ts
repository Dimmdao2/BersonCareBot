/* eslint-disable no-secrets/no-secrets -- structured log event names, not credentials */
/** `event` field values for reminders.dispatchDue → webapp notify-channels M2M. */
export const REMINDER_DISPATCH_NOTIFY_LOG_EVENT = {
  skipped: 'reminders.dispatchDue.webapp_notify_channels.skipped',
  start: 'reminders.dispatchDue.webapp_notify_channels.start',
  result: 'reminders.dispatchDue.webapp_notify_channels.result',
} as const;
