import type { DeliveryAttemptResult, DeliveryJob } from '../../kernel/contracts/index.js';

export type WorkerJobQueuePort = {
  claimDueJobs(limit: number): Promise<DeliveryJob[]>;
  completeJob(jobId: string): Promise<void>;
  failJob(jobId: string, result: DeliveryAttemptResult): Promise<void>;
  rescheduleJob(jobId: string, nextRunAt: string, attemptsMade: number): Promise<void>;
  logAttempt(jobId: string, result: DeliveryAttemptResult): Promise<void>;
};
