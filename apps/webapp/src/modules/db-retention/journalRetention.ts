import type { JournalRetentionPort } from '@/modules/db-retention/ports';

/**
 * Recorded windows: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/16-journal-retention.md
 * "Правила хранения". Every target here goes through the one existing chokepoint
 * (`app.prune_retention_target` / the dedicated `app.prune_context_nonce_ledger` root) — no parallel
 * prune mechanism, no per-table service. The DB capability arrives via `JournalRetentionPort`
 * (injected by the caller through `buildAppDeps()`), not by importing infra directly.
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

function clampContextNonceLedgerGraceSec(graceSec: number): number {
  return Math.min(86400, Math.max(0, Math.trunc(graceSec)));
}

function clampContextNonceLedgerLimit(limit: number): number {
  return Math.min(500_000, Math.max(1, Math.trunc(limit)));
}

function clampRetentionDays(retentionDays: number): number {
  return Math.min(3650, Math.max(1, Math.trunc(retentionDays)));
}

/**
 * Runs every still-live, still-unpruned journal target in one tick. Each target is independent —
 * one target failing does not stop the others; failures are collected and rethrown together so the
 * caller can report a partial success accurately instead of losing which targets actually ran.
 */
export async function runDbJournalRetention(
  port: JournalRetentionPort,
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

  const steps: Array<{ target: string; run: () => Promise<{ deleted: number }> }> = [
    {
      target: 'app.context_nonce_ledger',
      run: () => port.pruneContextNonceLedger(graceSec, limit, { dryRun }),
    },
    {
      target: 'public_idempotency_keys',
      run: () => port.prunePublicIdempotencyKeys(idempotencyDays, { dryRun }),
    },
    {
      target: 'integrator_idempotency_keys',
      run: () => port.pruneIntegratorIdempotencyKeys(idempotencyDays, { dryRun }),
    },
    {
      target: 'outgoing_delivery_queue_sent',
      run: () => port.pruneOutgoingDeliveryQueueSent(sentDays, { dryRun }),
    },
    {
      target: 'outgoing_delivery_queue_dead',
      run: () => port.pruneOutgoingDeliveryQueueDead(deadDays, { dryRun }),
    },
    {
      target: 'notification_delivery_attempts',
      run: () => port.pruneNotificationDeliveryAttempts(notificationDays, { dryRun }),
    },
  ];

  const results: JournalRetentionTargetResult[] = [];
  const errors: Array<{ target: string; error: unknown }> = [];
  for (const step of steps) {
    try {
      const { deleted } = await step.run();
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
