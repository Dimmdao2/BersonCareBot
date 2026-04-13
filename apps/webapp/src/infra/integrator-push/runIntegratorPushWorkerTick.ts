import { getPool } from "@/infra/db/client";
import { deliverIntegratorPushPayload } from "./deliverIntegratorPushPayload";
import {
  claimDueIntegratorPushJobs,
  completeIntegratorPushJob,
  failIntegratorPushJobDead,
  isRecoverableIntegratorPushFailure,
  rescheduleIntegratorPushJob,
} from "./integratorPushOutbox";

const RETRY_BASE_SECONDS = 30;
const MAX_BACKOFF_SECONDS = 3600;

/**
 * Process one batch of pending integrator_push_outbox rows (cron / systemd timer).
 */
export async function runIntegratorPushWorkerTick(batchSize = 15): Promise<number> {
  const pool = getPool();
  const rows = await claimDueIntegratorPushJobs(pool, batchSize);
  let done = 0;
  for (const row of rows) {
    const attempt = row.attemptsDone + 1;
    try {
      await deliverIntegratorPushPayload(row);
      await completeIntegratorPushJob(pool, row.id);
      done += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRecoverableIntegratorPushFailure(err)) {
        await failIntegratorPushJobDead(pool, row.id, msg);
        continue;
      }
      if (attempt >= row.maxAttempts) {
        await failIntegratorPushJobDead(pool, row.id, msg);
        continue;
      }
      const delay = Math.min(MAX_BACKOFF_SECONDS, RETRY_BASE_SECONDS * Math.pow(2, attempt - 1));
      await rescheduleIntegratorPushJob(pool, row.id, attempt, delay, msg);
    }
  }
  return done;
}
