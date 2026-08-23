import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  recordReminderOccurrenceFinalizedDirect,
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
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';
import { writeDirectPublic } from '../../db/directPublic/writePort.js';

const RETRY_BASE_SECONDS = 30;
const MAX_BACKOFF_SECONDS = 3600;

class DirectPublicWriteRetryOrganizationMismatchError extends Error {
  constructor(
    readonly retryId: number,
    readonly retryOrganizationId: string,
    readonly payloadOrganizationId: unknown,
  ) {
    super('direct public write retry organization mismatch');
    this.name = 'DirectPublicWriteRetryOrganizationMismatchError';
  }
}

export type DirectPublicWriteRetryExecutor = (
  db: DbPort,
  retry: DirectPublicWriteRetryRow,
) => Promise<void>;

export async function executeDirectPublicWriteRetry(
  db: DbPort,
  retry: DirectPublicWriteRetryRow,
): Promise<void> {
  const payloadOrganizationId = (retry.payload as { organizationId?: unknown }).organizationId;
  if (typeof payloadOrganizationId !== 'string' || payloadOrganizationId !== retry.organizationId) {
    throw new DirectPublicWriteRetryOrganizationMismatchError(
      retry.id,
      retry.organizationId,
      payloadOrganizationId,
    );
  }
  if (
    retry.operation === 'reminder_occurrence_sent_record' ||
    retry.operation === 'reminder_occurrence_failed_record' ||
    retry.operation === 'reminder_occurrence_expired_record'
  ) {
    await writeDirectPublic('reminder-occurrence-finalize', () =>
      recordReminderOccurrenceFinalizedDirect(
        db,
        retry.payload as ReminderOccurrenceFinalizedDirectInput,
      ),
    );
    return;
  }
  const exhaustive: never = retry.operation;
  throw new Error(`unknown direct public write retry operation: ${String(exhaustive)}`);
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
          if (err instanceof DirectPublicWriteRetryOrganizationMismatchError) {
            await failDirectPublicWriteRetry(db, retry.id, message);
            logger.error(
              {
                retryId: err.retryId,
                operation: retry.operation,
                retryOrganizationId: err.retryOrganizationId,
                payloadOrganizationId: err.payloadOrganizationId,
              },
              'direct public write retry rejected organization mismatch',
            );
            continue;
          }
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
