export type AdminRegistrationPreset = "today" | "week" | "month" | "custom";

export type AdminRegistrationDayPoint = {
  /** YYYY-MM-DD в календаре `iana` */
  day: string;
  /** Новые строки `platform_users` (клиенты) с `created_at` в этот локальный день */
  newUsers: number;
  /** Слияния: `merged_at` в этот локальный день */
  merges: number;
};

export type AdminRegistrationStatsPayload = {
  iana: string;
  fromDay: string;
  toDay: string;
  startUtcIso: string;
  endExclusiveUtcIso: string;
  summary: {
    newUsers: number;
    merges: number;
    /** newUsers + merges */
    combined: number;
  };
  series: AdminRegistrationDayPoint[];
};
