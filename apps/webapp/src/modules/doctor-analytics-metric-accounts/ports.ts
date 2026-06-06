import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";

export type DoctorAnalyticsMetricKey =
  | "appointments_past_visits"
  | "appointments_cancelled_visits"
  | "appointments_bookings_created"
  | "appointments_cancellation_actions"
  | "appointments_reschedule_actions"
  | "clients_total"
  | "clients_phone_only"
  | "clients_app_guests"
  | "clients_segment_telegram_only"
  | "clients_segment_max_only"
  | "clients_segment_email_only"
  | "clients_segment_telegram_email"
  | "clients_segment_max_email"
  | "clients_segment_phone_email_no_messenger"
  | "registrations"
  | "registrations_merges"
  | "registrations_combined"
  | "subscribers_total"
  | "subscribers_delta"
  | "today_appointments_today"
  | "today_appointments_week"
  | "today_cancellations_30d"
  | "today_new_clients_no_channels_7d"
  | "notif_reminders_sent"
  | "notif_reminders_failed"
  | "notif_push_opened";

/** Drill-down on `/app/doctor` — doctor-safe API whitelist. */
export const DOCTOR_TODAY_METRIC_KEYS = [
  "today_appointments_today",
  "today_appointments_week",
  "today_cancellations_30d",
  "today_new_clients_no_channels_7d",
] as const satisfies readonly DoctorAnalyticsMetricKey[];

export const NOTIFICATION_METRIC_KEYS = [
  "notif_reminders_sent",
  "notif_reminders_failed",
  "notif_push_opened",
] as const satisfies readonly DoctorAnalyticsMetricKey[];

export type DoctorAnalyticsMetricPeriod = {
  preset: AdminStatsTimePreset;
  customFrom?: string;
  customTo?: string;
};

export type DoctorAnalyticsMetricAccountItem = {
  userId: string;
  displayName: string;
  phone: string | null;
  eventAt: string | null;
  eventLabel: string | null;
  /** KPI drill-down for appointment metrics. */
  appointmentAt?: string | null;
  appointmentService?: string | null;
  appointmentBranch?: string | null;
};

export type DoctorAnalyticsMetricAccountsResult = {
  items: DoctorAnalyticsMetricAccountItem[];
  hasMore: boolean;
  nextOffset: number | null;
};

export type DoctorAnalyticsMetricAccountsPort = {
  listMetricAccounts(params: {
    metric: DoctorAnalyticsMetricKey;
    period: DoctorAnalyticsMetricPeriod;
    limit: number;
    offset: number;
    iana: string;
    excludedUserIds?: string[];
    /** Required for `notif_*` metrics. */
    windowHours?: number;
  }): Promise<DoctorAnalyticsMetricAccountsResult>;
};
