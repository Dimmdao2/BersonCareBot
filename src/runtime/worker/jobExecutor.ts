import type { Action, ActionResult, DeliveryJob, DomainContext } from '../../kernel/contracts/index.js';

export type JobExecutorDeps = {
  executeAction: (action: Action, context: DomainContext) => Promise<ActionResult>;
};

/** Runtime adapter: converts queued delivery job to domain action execution. */
export async function executeJob(
  job: DeliveryJob,
  context: DomainContext,
  deps: JobExecutorDeps,
): Promise<ActionResult> {
  const action: Action = {
    id: `job:${job.id}`,
    type: job.kind,
    mode: 'async',
    params: job.payload,
  };
  return deps.executeAction(action, context);
}
