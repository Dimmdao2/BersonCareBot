export type AdminPlatformUserStatsPort = {
  getRegistrationStats(params: {
    iana: string;
    startUtcIso: string;
    endExclusiveUtcIso: string;
    /** Все календарные дни от from до to (YYYY-MM-DD) в `iana` для выравнивания ряда */
    dayKeys: string[];
    excludedUserIds?: string[];
  }): Promise<{
    registrationsTotal: number;
    mergesTotal: number;
    registrationsByDay: Map<string, number>;
    mergesByDay: Map<string, number>;
  }>;

  /** Подписчики: клиенты с bindings; прирост по локальному дню первой привязки. */
  getSubscriberBindingStats(params: {
    iana: string;
    startUtcIso: string;
    endExclusiveUtcIso: string;
    excludedUserIds?: string[];
  }): Promise<{
    /** Число пользователей с first_binding < startUtcIso */
    countBeforeStart: number;
    /** По локальному дню MIN(binding.created_at) в [startUtcIso, endExclusiveUtcIso) */
    newByDay: Map<string, number>;
  }>;
};
