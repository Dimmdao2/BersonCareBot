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
  appendReminderDeliveryEventDirect,
  recordReminderOccurrenceFinalizedDirect,
  upsertContentAccessGrantDirect,
  type ContentAccessGrantDirectInput,
  type ReminderDeliveryLoggedDirectInput,
  type ReminderOccurrenceFinalizedDirectInput,
} from '../../db/directPublic/writeReminderProjectionDirect.js';
import {
  claimDueDirectPublicWriteRetries,
  completeDirectPublicWriteRetry,
  failDirectPublicWriteRetry,
  reclaimStaleDirectPublicWriteRetries,
  rescheduleDirectPublicWriteRetry,
  type DirectPublicWriteRetryRow,
} from '../../db/repos/directPublicWriteRetry.js';
import { logger } from '../../observability/logger.js';
import {
  runWithInfraPrincipal,
  runWithOrganizationPrincipal,
} from '../../principal/organizationPrincipal.js';

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
    if (retry.operation === 'support_delivery_attempt_append') {
      await appendSupportDeliveryEventDirect(
        db,
        retry.payload as AppendSupportDeliveryEventDirectInput,
      );
      return;
    }
    if (
      retry.operation === 'reminder_occurrence_sent_record' ||
      retry.operation === 'reminder_occurrence_failed_record' ||
      retry.operation === 'reminder_occurrence_expired_record'
    ) {
      await recordReminderOccurrenceFinalizedDirect(
        db,
        retry.payload as ReminderOccurrenceFinalizedDirectInput,
      );
      return;
    }
    if (retry.operation === 'reminder_delivery_log_append') {
      await appendReminderDeliveryEventDirect(
        db,
        retry.payload as ReminderDeliveryLoggedDirectInput,
      );
      return;
    }
    await upsertContentAccessGrantDirect(db, retry.payload as ContentAccessGrantDirectInput);
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
