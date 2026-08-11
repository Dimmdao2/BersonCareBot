import type { DeliveryJob } from '../../../kernel/contracts/index.js';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';

export type SchedulerDeps = {
  claimDueScheduledJobs: (nowIso: string, limit: number) => Promise<DeliveryJob[]>;
  enqueueRuntimeJob: (job: DeliveryJob) => Promise<void>;
  markScheduledAsQueued: (jobId: string) => Promise<void>;
};

/** Moves due scheduled jobs into runtime queue. */
export async function runSchedulerTick(
  deps: SchedulerDeps,
  nowIso: string,
  limit = 50,
): Promise<number> {
  return runWithInfraPrincipal({ source: 'scheduler:claim-due-jobs', portCapability: 'scheduler' }, () =>
    runSchedulerTickInner(deps, nowIso, limit),
  );
}

async function runSchedulerTickInner(
  deps: SchedulerDeps,
  nowIso: string,
  limit: number,
): Promise<number> {
  const jobs = await deps.claimDueScheduledJobs(nowIso, limit);
  for (const job of jobs) {
    await deps.enqueueRuntimeJob(job);
    await deps.markScheduledAsQueued(job.id);
  }
  return jobs.length;
}
