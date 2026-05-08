/** Порт: атомарная запись симптома разминки + обновление `patient_practice_completions.feeling`. */

export type ApplyDailyWarmupFeelingParams = {
  userId: string;
  completionId: string;
  feeling: number;
  completedAtIso: string;
  symptomTypeRefId: string;
  symptomTitle: string;
};

export type WarmupFeelingCompletionPort = {
  applyDailyWarmupFeeling(params: ApplyDailyWarmupFeelingParams): Promise<{ duplicate: boolean }>;
};
