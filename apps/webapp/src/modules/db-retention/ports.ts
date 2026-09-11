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
  /** TERMINAL occurrences only — `planned`/`queued` are unfinished work the sweep never touches. */
  pruneReminderOccurrenceHistoryTerminal(
    days: number,
    options?: JournalRetentionPurgeOptions,
  ): Promise<{ deleted: number }>;
  pruneMessageLog(
    days: number,
    options?: JournalRetentionPurgeOptions,
  ): Promise<{ deleted: number }>;
  /**
   * COMPLETED transfer bookkeeping only. A terminal `aborted`/`expired`/`failed` session is the only
   * holder of the S3 retry identity of an upload whose abort may not be confirmed yet — it dies by
   * cascade with its `media_files` row, never by age. No file is deleted here.
   */
  pruneMediaUploadSessionsCompleted(
    days: number,
    options?: JournalRetentionPurgeOptions,
  ): Promise<{ deleted: number }>;
  /** RESOLVED isolation cases only — an unresolved case is never aged out, however old. */
  pruneSaasIsolationEventsResolved(
    days: number,
    options?: JournalRetentionPurgeOptions,
  ): Promise<{ deleted: number }>;
  /** FINISHED coverage runs only — an unfinished run is an operator finding, not age-eligible waste. */
  pruneSaasIsolationCoverageRuns(
    days: number,
    options?: JournalRetentionPurgeOptions,
  ): Promise<{ deleted: number }>;
};
