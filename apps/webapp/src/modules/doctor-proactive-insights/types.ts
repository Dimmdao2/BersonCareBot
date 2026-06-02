/** Тип проактивного сигнала для ленты «Сегодня» (этап 8 RECOMMENDATIONS_AND_ROADMAP, MVP). */
export const PROACTIVE_INSIGHT_KINDS = ["wellbeing_low_streak", "program_inactivity"] as const;
export type ProactiveInsightKind = (typeof PROACTIVE_INSIGHT_KINDS)[number];

export type ProactiveInsightRow = {
  kind: ProactiveInsightKind;
  patientUserId: string;
  patientDisplayName: string;
  /** Короткая подпись для списка (без имени пациента). */
  summary: string;
  /** ISO для сортировки (свежее — выше). */
  sortAt: string;
  /** Активный instance doctor-программы (только `program_inactivity`). */
  activeProgramInstanceId?: string;
};
