import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type { SymptomDiaryPort } from '@/modules/diaries/ports';
import type { PatientPracticePort } from '@/modules/patient-practice/ports';
import type {
  ApplyDailyWarmupFeelingParams,
  WarmupFeelingCompletionPort,
} from '@/modules/patient-practice/warmupFeelingCompletionPort';

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
    },
  };
}
