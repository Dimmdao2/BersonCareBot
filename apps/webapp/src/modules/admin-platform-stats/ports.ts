import type { AnalyticsTestAccountSpec } from '@/modules/analytics/analyticsAudience';

export type AdminPlatformUserStatsSnapshot = {
  registrationsTotal: number;
  mergesTotal: number;
  registrationsByDay: Map<string, number>;
  mergesByDay: Map<string, number>;
  /** Подписчиков с первой привязкой раньше `startUtcIso` */
  subscribersBeforeStart: number;
  /** По локальному дню первой привязки в [startUtcIso, endExclusiveUtcIso) */
  subscribersNewByDay: Map<string, number>;
};

export type AdminPlatformUserStatsPort = {
  /**
   * ОДИН снимок на оба экрана («Регистрации и слияния» и «Подписчики приложения»): оба спрашивают
   * одно и то же — сколько людей за окно локальных суток за вычетом служебных учёток — теми же
   * аргументами, поэтому это колонки одного ответа, а не два обращения к порту (AGENTS §5).
   *
   * Аудитория приезжает СПИСКОМ идентификаторов, а не списком id: резолв id читает
   * `platform_users` и `user_channel_bindings`, а у платформенного принципала на них прав нет и по
   * решению владельца Р-АДМИН не будет — отсев живёт за той же дверью, что и сами агрегаты.
   */
  readStats(params: {
    iana: string;
    startUtcIso: string;
    endExclusiveUtcIso: string;
    audience: AnalyticsTestAccountSpec;
  }): Promise<AdminPlatformUserStatsSnapshot>;
};
