import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { reportSaasIsolationEventBestEffort } from '@/infra/saasIsolationReporterRuntime';
import {
  classifySaasIsolationFailure,
  isRecognizedSaasIsolationFailure,
} from '@bersoncare/db-principal';
import { resolveCronIsolationOperation } from '@/modules/operator-health/cronIsolationOperations';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';

export type RecordOperatorCronJobTickInput = {
  jobFamily: string;
  jobKey: string;
  startedAtIso: string;
  durationMs: number;
  success: boolean;
  error?: string;
  metaJson?: Record<string, unknown>;
};

/**
 * Best-effort upsert в `operator_job_status`. Не должен ломать HTTP-ответ internal job.
 */
export async function recordOperatorCronJobTickBestEffort(
  input: RecordOperatorCronJobTickInput,
): Promise<void> {
  try {
    await runWithDbInfraPrincipal({ source: 'operator-cron-job-status:write' }, async () => {
      const write = buildAppDeps().operatorHealthWrite;
      if (input.success) {
        await write.recordOperatorJobTickSuccess({
          jobFamily: input.jobFamily,
          jobKey: input.jobKey,
          startedAtIso: input.startedAtIso,
          durationMs: input.durationMs,
          metaJson: input.metaJson ?? {},
        });
      } else {
        await write.recordOperatorJobTickFailure({
          jobFamily: input.jobFamily,
          jobKey: input.jobKey,
          startedAtIso: input.startedAtIso,
          durationMs: input.durationMs,
          error: input.error ?? 'unknown_error',
          metaJson: input.metaJson ?? {},
        });
      }
    });
  } catch (err) {
    const sourceOperation = resolveCronIsolationOperation(input.jobFamily);
    if (sourceOperation && isRecognizedSaasIsolationFailure(err)) {
      void reportSaasIsolationEventBestEffort({
        eventClass: classifySaasIsolationFailure(err),
        sourceService: 'cron',
        sourceOperation,
      });
    }
    logger.warn(
      { err, jobFamily: input.jobFamily, jobKey: input.jobKey },
      'operator_job_status cron tick failed',
    );
  }
}
