import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  appendSupportDeliveryEventDirect,
  type AppendSupportDeliveryEventDirectInput,
} from '../../db/directPublic/writeSupportQuestionsDirect.js';
import {
  upsertReminderRuleDirect,
  type UpsertReminderRuleDirectInput,
} from '../../db/directPublic/writeReminderRulesDirect.js';
import {
  claimDueDirectPublicWriteRetries,
  completeDirectPublicWriteRetry,
  failDirectPublicWriteRetry,
  reclaimStaleDirectPublicWriteRetries,
  rescheduleDirectPublicWriteRetry,
  type DirectPublicWriteRetryRow,
} from '../../db/repos/directPublicWriteRetry.js';
import { logger } from '../../observability/logger.js';
import { runWithInfraPrincipal, runWithOrganizationPrincipal } from '../../principal/organizationPrincipal.js';

const RETRY_BASE_SECONDS = 30;
const MAX_BACKOFF_SECONDS = 3600;

export type DirectPublicWriteRetryExecutor = (
  db: DbPort,
  retry: DirectPublicWriteRetryRow,
) => Promise<void>;

export async function executeDirectPublicWriteRetry(
  db: DbPort,
  retry: DirectPublicWriteRetryRow,
): Promise<void> {
  await runWithOrganizationPrincipal(retry.organizationId, async () => {
    if (retry.operation === 'reminder_rule_upsert') {
      await upsertReminderRuleDirect(db, retry.payload as UpsertReminderRuleDirectInput);
      return;
    }
    await appendSupportDeliveryEventDirect(db, retry.payload as AppendSupportDeliveryEventDirectInput);
  });
}

export async function runDirectPublicWriteRetryWorkerTick(
  db: DbPort,
  batchSize = 10,
  execute: DirectPublicWriteRetryExecutor = executeDirectPublicWriteRetry,
): Promise<number> {
  return runWithInfraPrincipal(
    { source: 'worker:direct-public-write-retry-tick', portCapability: 'delivery' },
    async () => {
      await reclaimStaleDirectPublicWriteRetries(db);
      const retries = await claimDueDirectPublicWriteRetries(db, batchSize);
      for (const retry of retries) {
        try {
          await execute(db, retry);
          await completeDirectPublicWriteRetry(db, retry.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (retry.attemptCount >= retry.maxAttempts) {
            await failDirectPublicWriteRetry(db, retry.id, message);
            logger.warn(
              { retryId: retry.id, operation: retry.operation, attempt: retry.attemptCount },
              'direct public write retry moved to DLQ',
            );
            continue;
          }
          const delay = Math.min(
            MAX_BACKOFF_SECONDS,
            RETRY_BASE_SECONDS * Math.pow(2, retry.attemptCount - 1),
          );
          await rescheduleDirectPublicWriteRetry(db, {
            id: retry.id,
            lastError: message,
            retryDelaySeconds: delay,
          });
        }
      }
      return retries.length;
    },
  );
}
