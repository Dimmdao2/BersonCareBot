/** Окно времени для админских графиков. Legacy `?preset=today` в HTTP нормализуется в `week`. */
export type AdminStatsTimePreset = "day" | "week" | "month" | "custom";

export type AdminRegistrationDayPoint = {
  /** YYYY-MM-DD в календаре `iana` */
  day: string;
  /** Регистрации (`created_at`) без строк, merged в этом же окне аналитики */
  registrations: number;
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
    registrations: number;
    merges: number;
    /** registrations + merges */
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
