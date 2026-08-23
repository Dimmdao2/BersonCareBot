import {
  pruneContextNonceLedger,
  pruneRetentionTarget,
} from '@/infra/db/pruneRetentionTarget';
import type { JournalRetentionPort, JournalRetentionPurgeOptions } from '@/modules/db-retention/ports';

/**
 * Implements `JournalRetentionPort` over the one existing chokepoint
 * (`app.prune_retention_target` / `app.prune_context_nonce_ledger`) — same infra functions every
 * other retention caller (product-analytics, media-hls-proxy-errors) already reuses. No new pruning
 * function is added here.
 */
export function createPgJournalRetentionPort(): JournalRetentionPort {
  return {
    async pruneContextNonceLedger(graceSec, limit, options?: JournalRetentionPurgeOptions) {
      const deleted = await pruneContextNonceLedger(graceSec, limit, {
        dryRun: options?.dryRun === true,
      });
      return { deleted };
    },
    async prunePublicIdempotencyKeys(days, options?: JournalRetentionPurgeOptions) {
      const deleted = await pruneRetentionTarget('public_idempotency_keys', days, {
        dryRun: options?.dryRun === true,
      });
      return { deleted };
    },
    async pruneIntegratorIdempotencyKeys(days, options?: JournalRetentionPurgeOptions) {
      const deleted = await pruneRetentionTarget('integrator_idempotency_keys', days, {
        dryRun: options?.dryRun === true,
      });
      return { deleted };
    },
    async pruneOutgoingDeliveryQueueSent(days, options?: JournalRetentionPurgeOptions) {
      const deleted = await pruneRetentionTarget('outgoing_delivery_queue_sent', days, {
        dryRun: options?.dryRun === true,
      });
      return { deleted };
    },
    async pruneOutgoingDeliveryQueueDead(days, options?: JournalRetentionPurgeOptions) {
      const deleted = await pruneRetentionTarget('outgoing_delivery_queue_dead', days, {
        dryRun: options?.dryRun === true,
      });
      return { deleted };
    },
    async pruneNotificationDeliveryAttempts(days, options?: JournalRetentionPurgeOptions) {
      const deleted = await pruneRetentionTarget('notification_delivery_attempts', days, {
        dryRun: options?.dryRun === true,
      });
      return { deleted };
    },
  };
}
