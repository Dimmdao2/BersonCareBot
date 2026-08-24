export type JournalRetentionPurgeOptions = {
  dryRun?: boolean;
};

/**
 * DB capability the module needs to sweep the Track D journal targets. Both methods go through the
 * one existing chokepoint infra side (`app.prune_retention_target` / the dedicated
 * `app.prune_context_nonce_ledger` root) — this port only names the subset of targets this module
 * drives, it does not add a parallel prune mechanism.
 */
export type JournalRetentionPort = {
  pruneContextNonceLedger(
    graceSec: number,
    limit: number,
    options?: JournalRetentionPurgeOptions,
  ): Promise<{ deleted: number }>;
  prunePublicIdempotencyKeys(
    days: number,
    options?: JournalRetentionPurgeOptions,
  ): Promise<{ deleted: number }>;
  pruneIntegratorIdempotencyKeys(
    days: number,
    options?: JournalRetentionPurgeOptions,
  ): Promise<{ deleted: number }>;
  pruneOutgoingDeliveryQueueSent(
    days: number,
    options?: JournalRetentionPurgeOptions,
  ): Promise<{ deleted: number }>;
  pruneOutgoingDeliveryQueueDead(
    days: number,
    options?: JournalRetentionPurgeOptions,
  ): Promise<{ deleted: number }>;
  pruneNotificationDeliveryAttempts(
    days: number,
    options?: JournalRetentionPurgeOptions,
  ): Promise<{ deleted: number }>;
};
