/** Порт: атомарная запись симптома разминки + обновление `patient_practice_completions.feeling`. */

export type ApplyDailyWarmupFeelingParams = {
  userId: string;
  completionId: string;
  feeling: number;
  completedAtIso: string;
  symptomTypeRefId: string;
  symptomTitle: string;
  /** Запись «Общее самочувствие» (instant) с тем же временем и значением — для графика; опционально, если нет ref в справочниках. */
  generalWellbeingSymptomTypeRefId?: string;
  generalWellbeingSymptomTitle?: string;
};

export type WarmupFeelingCompletionPort = {
  applyDailyWarmupFeeling(params: ApplyDailyWarmupFeelingParams): Promise<{ duplicate: boolean }>;
};
