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

/**
 * Шов `app.apply_current_patient_warmup_feeling` отказывает своими кодами (P0001). Отказ —
 * ожидаемый исход, а не сбой: человек обязан прочитать причину предложением, а не увидеть
 * «Не удалось сохранить» над машинным кодом в журнале.
 */
export type WarmupFeelingRefusalReason =
  'warmup_completion_not_current_patient' | 'warmup_symptom_reference_unavailable';

export class WarmupFeelingRefusedError extends Error {
  constructor(readonly reason: WarmupFeelingRefusalReason) {
    super(reason);
    this.name = 'WarmupFeelingRefusedError';
  }
}

export function isWarmupFeelingRefusedError(e: unknown): e is WarmupFeelingRefusedError {
  return e instanceof WarmupFeelingRefusedError;
}

export function warmupFeelingRefusalMessage(reason: WarmupFeelingRefusalReason): string {
  switch (reason) {
    case 'warmup_completion_not_current_patient':
      return 'Не удалось записать самочувствие: эта разминка больше не числится за вами в текущей клинике. Отметьте разминку заново.';
    case 'warmup_symptom_reference_unavailable':
      return 'Не удалось записать самочувствие: в справочнике клиники нет активного типа симптома для разминки. Сообщите администратору клиники.';
  }
}
