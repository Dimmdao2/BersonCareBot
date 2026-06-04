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
  | "subscribers_delta";

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
  }): Promise<DoctorAnalyticsMetricAccountsResult>;
};
