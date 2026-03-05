import type { DeliveryJob, DomainContext } from '../../kernel/contracts/index.js';
import { executeJob } from './jobExecutor.js';
import { decideRetry } from './retryPolicy.js';

export type WorkerDeps = {
  claimNextJob: () => Promise<DeliveryJob | null>;
  completeJob: (jobId: string) => Promise<void>;
  rescheduleJob: (jobId: string, runAt: string, attempts: number) => Promise<void>;
  buildContext: (job: DeliveryJob) => Promise<DomainContext>;
  executeAction: (action: { id: string; type: string; mode: 'sync' | 'async'; params: Record<string, unknown> }, context: DomainContext) => Promise<{ status: 'success' | 'failed' | 'queued' | 'skipped' }>;
  retryDelaySeconds: number;
};

/** Executes one worker tick: claim -> execute -> complete/reschedule. */
export async function runWorkerTick(deps: WorkerDeps): Promise<'idle' | 'processed'> {
  const job = await deps.claimNextJob();
  if (!job) return 'idle';

  const context = await deps.buildContext(job);
  const result = await executeJob(job, context, {
    executeAction: deps.executeAction as never,
  });

  if (result.status === 'success' || result.status === 'skipped') {
    await deps.completeJob(job.id);
    return 'processed';
  }

  const decision = decideRetry({
    job,
    nowIso: context.nowIso,
    retryDelaySeconds: deps.retryDelaySeconds,
  });

  if (decision.kind === 'complete') {
    await deps.completeJob(job.id);
    return 'processed';
  }

  await deps.rescheduleJob(job.id, decision.runAt, decision.nextAttempts);
  return 'processed';
}
