import type { DeliveryJob } from '../../../kernel/contracts/index.js';
import { executeJob } from './jobExecutor.js';
import { decideRetry } from './retryPolicy.js';

export type WorkerRunnerDeps = {
  claimNextJob: () => Promise<DeliveryJob | null>;
  completeJob: (jobId: string) => Promise<void>;
  failJob: (jobId: string, errorCode: string) => Promise<void>;
  rescheduleJob: (jobId: string, runAt: string, attempts: number) => Promise<void>;
  logAttempt: (jobId: string, input: { ok: boolean; errorCode?: string; nextRunAt?: string; final?: boolean }) => Promise<void>;
  dispatchOutgoing: (intent: import('../../../kernel/contracts/index.js').OutgoingIntent) => Promise<
    import('../../../kernel/contracts/index.js').DeliverySendResult
  >;
  nowIso: () => string;
  retryDelaySeconds: number;
};

/** Executes one worker tick: claim -> execute -> complete/reschedule. */
export async function runWorkerTick(deps: WorkerRunnerDeps): Promise<'idle' | 'processed'> {
  const job = await deps.claimNextJob();
  if (!job) return 'idle';

  const result = await executeJob(job, {
    dispatchOutgoing: deps.dispatchOutgoing,
  });
  if (result.ok) {
    await deps.logAttempt(job.id, result);
    await deps.completeJob(job.id);
    return 'processed';
  }

  const decision = decideRetry({
    job,
    nowIso: deps.nowIso(),
    retryDelaySeconds: deps.retryDelaySeconds,
  });

  if (decision.kind === 'complete') {
    const failureLog: { ok: boolean; final: boolean; errorCode?: string } = {
      ok: false,
      final: true,
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    };
    await deps.logAttempt(job.id, failureLog);
    await deps.failJob(job.id, result.errorCode ?? 'DELIVERY_FAILED');
    return 'processed';
  }

  const retryLog: { ok: boolean; nextRunAt: string; final: boolean; errorCode?: string } = {
    ok: false,
    nextRunAt: decision.runAt,
    final: false,
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
  };
  await deps.logAttempt(job.id, retryLog);
  await deps.rescheduleJob(job.id, decision.runAt, decision.nextAttempts);
  return 'processed';
}
