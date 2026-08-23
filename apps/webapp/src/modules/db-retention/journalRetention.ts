import {
  clampContextNonceLedgerGraceSec,
  clampContextNonceLedgerLimit,
  clampRetentionDays,
  pruneContextNonceLedger,
  pruneRetentionTarget,
} from '@/infra/db/pruneRetentionTarget';

/**
 * Recorded windows: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/16-journal-retention.md
 * "Правила хранения". Every target here goes through the one existing chokepoint
 * (`app.prune_retention_target` / the dedicated `app.prune_context_nonce_ledger` root) — no parallel
 * prune mechanism, no per-table service.
 */
export const CONTEXT_NONCE_LEDGER_GRACE_SEC_DEFAULT = 60 * 60; // 1 hour (formal minimum is 300s)
export const CONTEXT_NONCE_LEDGER_LIMIT_DEFAULT = 200_000;
export const IDEMPOTENCY_KEYS_RETENTION_DAYS_DEFAULT = 1; // expired + 24h
export const OUTGOING_DELIVERY_QUEUE_SENT_RETENTION_DAYS_DEFAULT = 30;
export const OUTGOING_DELIVERY_QUEUE_DEAD_RETENTION_DAYS_DEFAULT = 180;
export const NOTIFICATION_DELIVERY_ATTEMPTS_RETENTION_DAYS_DEFAULT = 180;

export type JournalRetentionTargetResult = {
  target: string;
  deleted: number;
};

export type JournalRetentionRunResult = {
  dryRun: boolean;
  results: JournalRetentionTargetResult[];
};

export type JournalRetentionOverrides = {
  dryRun?: boolean;
  contextNonceLedgerGraceSec?: number;
  contextNonceLedgerLimit?: number;
  idempotencyKeysRetentionDays?: number;
  outgoingDeliveryQueueSentRetentionDays?: number;
  outgoingDeliveryQueueDeadRetentionDays?: number;
  notificationDeliveryAttemptsRetentionDays?: number;
};

/**
 * Runs every still-live, still-unpruned journal target in one tick. Each target is independent —
 * one target failing does not stop the others; failures are collected and rethrown together so the
 * caller can report a partial success accurately instead of losing which targets actually ran.
 */
export async function runDbJournalRetention(
  overrides: JournalRetentionOverrides = {},
): Promise<JournalRetentionRunResult> {
  const dryRun = overrides.dryRun === true;
  const graceSec = clampContextNonceLedgerGraceSec(
    overrides.contextNonceLedgerGraceSec ?? CONTEXT_NONCE_LEDGER_GRACE_SEC_DEFAULT,
  );
  const limit = clampContextNonceLedgerLimit(
    overrides.contextNonceLedgerLimit ?? CONTEXT_NONCE_LEDGER_LIMIT_DEFAULT,
  );
  const idempotencyDays = clampRetentionDays(
    overrides.idempotencyKeysRetentionDays ?? IDEMPOTENCY_KEYS_RETENTION_DAYS_DEFAULT,
  );
  const sentDays = clampRetentionDays(
    overrides.outgoingDeliveryQueueSentRetentionDays ??
      OUTGOING_DELIVERY_QUEUE_SENT_RETENTION_DAYS_DEFAULT,
  );
  const deadDays = clampRetentionDays(
    overrides.outgoingDeliveryQueueDeadRetentionDays ??
      OUTGOING_DELIVERY_QUEUE_DEAD_RETENTION_DAYS_DEFAULT,
  );
  const notificationDays = clampRetentionDays(
    overrides.notificationDeliveryAttemptsRetentionDays ??
      NOTIFICATION_DELIVERY_ATTEMPTS_RETENTION_DAYS_DEFAULT,
  );

  const steps: Array<{ target: string; run: () => Promise<number> }> = [
    {
      target: 'app.context_nonce_ledger',
      run: () => pruneContextNonceLedger(graceSec, limit, { dryRun }),
    },
    {
      target: 'public_idempotency_keys',
      run: () => pruneRetentionTarget('public_idempotency_keys', idempotencyDays, { dryRun }),
    },
    {
      target: 'integrator_idempotency_keys',
      run: () => pruneRetentionTarget('integrator_idempotency_keys', idempotencyDays, { dryRun }),
    },
    {
      target: 'outgoing_delivery_queue_sent',
      run: () => pruneRetentionTarget('outgoing_delivery_queue_sent', sentDays, { dryRun }),
    },
    {
      target: 'outgoing_delivery_queue_dead',
      run: () => pruneRetentionTarget('outgoing_delivery_queue_dead', deadDays, { dryRun }),
    },
    {
      target: 'notification_delivery_attempts',
      run: () =>
        pruneRetentionTarget('notification_delivery_attempts', notificationDays, { dryRun }),
    },
  ];

  const results: JournalRetentionTargetResult[] = [];
  const errors: Array<{ target: string; error: unknown }> = [];
  for (const step of steps) {
    try {
      const deleted = await step.run();
      results.push({ target: step.target, deleted });
    } catch (error) {
      errors.push({ target: step.target, error });
    }
  }

  if (errors.length > 0) {
    const message = errors
      .map(({ target, error }) => `${target}: ${error instanceof Error ? error.message : String(error)}`)
      .join('; ');
    throw new Error(
      `db_journal_retention: ${errors.length}/${steps.length} targets failed (${message}); ` +
        `${results.length} succeeded: ${results.map((r) => r.target).join(', ') || 'none'}`,
    );
  }

  return { dryRun, results };
}
