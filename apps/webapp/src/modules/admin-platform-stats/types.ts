/** Окно времени для админских графиков. Legacy `?preset=today` в HTTP нормализуется в `week`. */
export type AdminStatsTimePreset = "week" | "month" | "custom";

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

export type AdminSubscriberDayPoint = {
  /** YYYY-MM-DD в календаре `iana` */
  day: string;
  /** Кумулятивное число подписчиков на конец этого локального дня */
  cumulativeSubscribers: number;
};

export type AdminSubscriberStatsPayload = {
  iana: string;
  fromDay: string;
  toDay: string;
  startUtcIso: string;
  endExclusiveUtcIso: string;
  summary: {
    /** На конец последнего дня окна */
    cumulativeEnd: number;
    /** Прирост за окно */
    deltaInRange: number;
  };
  series: AdminSubscriberDayPoint[];
};
