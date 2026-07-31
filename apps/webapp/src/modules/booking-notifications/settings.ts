import type { IntegratorBookingEventType } from '@/modules/patient-booking/bookingLifecycleNotifications';

export type BookingLifecycleNotificationEventKey = IntegratorBookingEventType;

export type BookingLifecycleNotificationEventSettings = {
  enabled: boolean;
  notifyPatient: boolean;
  notifyStaff: boolean;
};

export type BookingLifecycleNotificationsSettings = {
  events: Record<BookingLifecycleNotificationEventKey, BookingLifecycleNotificationEventSettings>;
};

export type AppointmentReminderPlan = {
  enabled: boolean;
  offsetsMinutes: number[];
};

const EVENT_KEYS: BookingLifecycleNotificationEventKey[] = [
  'booking.created',
  'booking.cancelled',
  'booking.rescheduled',
  'booking.payment_captured',
];

const DEFAULT_EVENT: BookingLifecycleNotificationEventSettings = {
  enabled: true,
  notifyPatient: true,
  notifyStaff: true,
};

export function defaultBookingLifecycleNotificationsSettings(): BookingLifecycleNotificationsSettings {
  return {
    events: Object.fromEntries(
      EVENT_KEYS.map((k) => [k, { ...DEFAULT_EVENT }]),
    ) as BookingLifecycleNotificationsSettings['events'],
  };
}

export function parseBookingLifecycleNotificationsSettings(
  raw: unknown,
): BookingLifecycleNotificationsSettings {
  const defaults = defaultBookingLifecycleNotificationsSettings();
  if (raw === null || typeof raw !== 'object') return defaults;
  const inner =
    'value' in (raw as object) && (raw as { value?: unknown }).value !== undefined
      ? (raw as { value: unknown }).value
      : raw;
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return defaults;
  const eventsRaw = (inner as { events?: unknown }).events;
  if (eventsRaw === null || typeof eventsRaw !== 'object') return defaults;
  const events = { ...defaults.events };
  for (const key of EVENT_KEYS) {
    const row = (eventsRaw as Record<string, unknown>)[key];
    if (row === null || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    events[key] = {
      enabled: o.enabled !== false,
      notifyPatient: o.notifyPatient !== false,
      notifyStaff: o.notifyStaff !== false,
    };
  }
  return { events };
}

export async function loadBookingLifecycleNotificationsFromSystemSettings(
  getSetting: (
    key: 'booking_lifecycle_notifications',
    scope: 'admin',
  ) => Promise<{ valueJson: unknown } | null>,
): Promise<BookingLifecycleNotificationsSettings> {
  const row = await getSetting('booking_lifecycle_notifications', 'admin');
  return parseBookingLifecycleNotificationsSettings(row?.valueJson ?? null);
}

/**
 * Resolve the organization-scoped appointment reminder policy at lifecycle-event birth.
 * The integrator receives the resulting plan and only delivers it.
 */
export async function loadAppointmentReminderPlanFromSystemSettings(
  organizationId: string,
  getSetting: (
    key: 'doctor_appointment_reminder_enabled' | 'doctor_appointment_reminder_offsets_minutes',
    scope: 'doctor',
    options: { organizationId: string },
  ) => Promise<{ valueJson: unknown } | null>,
): Promise<AppointmentReminderPlan> {
  const [enabledRow, offsetsRow] = await Promise.all([
    getSetting('doctor_appointment_reminder_enabled', 'doctor', { organizationId }),
    getSetting('doctor_appointment_reminder_offsets_minutes', 'doctor', { organizationId }),
  ]);
  const rawOffsets = offsetsRow?.valueJson;
  return {
    enabled: enabledRow?.valueJson === true,
    offsetsMinutes: Array.isArray(rawOffsets)
      ? rawOffsets.filter((value): value is number => Number.isInteger(value) && value > 0)
      : [],
  };
}

export function resolveBookingNotifyTargets(
  eventType: BookingLifecycleNotificationEventKey,
  policy: { notifyPatient: boolean; notifyStaff: boolean },
  settings: BookingLifecycleNotificationsSettings | null,
): { notifyPatient: boolean; notifyStaff: boolean } {
  const eventSettings =
    settings?.events[eventType] ?? defaultBookingLifecycleNotificationsSettings().events[eventType];
  if (!eventSettings.enabled) {
    return { notifyPatient: false, notifyStaff: false };
  }
  return {
    notifyPatient: policy.notifyPatient && eventSettings.notifyPatient,
    notifyStaff: policy.notifyStaff && eventSettings.notifyStaff,
  };
}
