import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type { SymptomDiaryPort } from '@/modules/diaries/ports';
import type { PatientPracticePort } from '@/modules/patient-practice/ports';
import {
  WarmupFeelingRefusedError,
  type ApplyDailyWarmupFeelingParams,
  type WarmupFeelingCompletionPort,
  type WarmupFeelingRefusalReason,
} from '@/modules/patient-practice/warmupFeelingCompletionPort';

/**
 * Коды отказа шва, объявленные в его теле (миграции 0017/0026), → причина порта. Другие коды —
 * не отказ, а сбой: они летят дальше нетронутыми.
 */
const SEAM_REFUSAL_REASONS: Readonly<Record<string, WarmupFeelingRefusalReason>> = {
  current_patient_warmup_feeling_rejected: 'warmup_completion_not_current_patient',
  current_patient_warmup_reference_rejected: 'warmup_symptom_reference_unavailable',
};

/** Драйвер прячет отказ PostgreSQL в `cause`; ищем именованный код на всей цепочке. */
function seamRefusalReason(e: unknown): WarmupFeelingRefusalReason | null {
  let current: unknown = e;
  for (let depth = 0; current !== null && current !== undefined && depth < 8; depth += 1) {
    const carrier = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (carrier.code === 'P0001' && typeof carrier.message === 'string') {
      const reason = SEAM_REFUSAL_REASONS[carrier.message];
      if (reason) return reason;
    }
    current = carrier.cause;
  }
  return null;
}

export function createPgWarmupFeelingCompletionPort(opts: {
  diaries: Pick<
    SymptomDiaryPort,
    'upsertWarmupFeelingTrackingIdInTx' | 'ensureGeneralWellbeingTracking'
  >;
  completions: Pick<PatientPracticePort, 'getByIdForUser' | 'updateFeelingById'>;
}): WarmupFeelingCompletionPort {
  void opts;
  return {
    async applyDailyWarmupFeeling(
      params: ApplyDailyWarmupFeelingParams,
    ): Promise<{ duplicate: boolean }> {
      const args = [
        params.completionId,
        params.feeling,
        params.symptomTypeRefId,
        params.symptomTitle,
        params.generalWellbeingSymptomTypeRefId ?? null,
        params.generalWellbeingSymptomTitle ?? null,
      ] as const;
      try {
        const result = await runWebappNamedRoot<{ duplicate: boolean }>(
          getWebappSqlDb(),
          'app.apply_current_patient_warmup_feeling(uuid,integer,uuid,text,uuid,text)',
          args,
          sql`SELECT app.apply_current_patient_warmup_feeling(
            ${params.completionId}::uuid,
            ${params.feeling}::integer,
            ${params.symptomTypeRefId}::uuid,
            ${params.symptomTitle}::text,
            ${params.generalWellbeingSymptomTypeRefId ?? null}::uuid,
            ${params.generalWellbeingSymptomTitle ?? null}::text
          ) AS duplicate`,
        );
        return { duplicate: result.rows[0]?.duplicate === true };
      } catch (e) {
        const reason = seamRefusalReason(e);
        if (reason) throw new WarmupFeelingRefusedError(reason);
        throw e;
      }
    },
  };
}
