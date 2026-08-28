import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { env } from '@/config/env';
import { isS3MediaEnabled } from '@/config/env';
import { writeAuditLog } from '@/infra/adminAuditLog';
import { getPool } from '@/infra/db/client';
import { startPoolTransaction } from '@/infra/db/withClient';
import { runPgPoolPgText } from '@/infra/db/runWebappSql';
import { pgAdvisoryXactLock } from '@/infra/db/pgAdvisoryLock';
import {
  collectPurgeArtifactKeys,
  isPlatformUserUuid,
  runWebappPurgeCoreInTransaction,
  type PurgeArtifactKeys,
  type PurgePlatformUserRow,
} from '@/infra/platformUserFullPurge';
import { deleteS3ObjectsWithPerKeyResults, type S3PerKeyDeleteResult } from '@/infra/s3/client';

/**
 * - `completed` — webapp commit + S3/media cleanup successful.
 * - `partial_failed` — webapp committed; S3/media cleanup had failures.
 */
export type StrictPurgeOutcome = 'completed' | 'partial_failed';

export type StrictPurgeSuccess = {
  ok: true;
  outcome: StrictPurgeOutcome;
  details: {
    intakeS3KeyCount: number;
    mediaFileCount: number;
    /** `patient_files` rows collected for this user (cascade-deleted with `platform_users`; object cleanup handled here). */
    patientFileS3KeyCount: number;
    s3KeysAttempted: number;
    s3Failures: { key: string; error: string }[];
    mediaRowsDeleted: number;
    mediaRowDeleteErrors: { id: string; error: string }[];
    /** Intake attachment keys were collected but bucket delete was not run (S3 disabled in this process). Objects may remain in private bucket. */
    intakeS3ObjectsNotDeletedBucketDisabled: boolean;
  };
};

export type StrictPurgeFailure = {
  ok: false;
  error: 'invalid_uuid' | 'not_found' | 'not_client' | 'transaction_failed';
  transactionError?: string;
};

export type StrictPurgeResult = StrictPurgeSuccess | StrictPurgeFailure;

type RunOpts = {
  targetId: string;
  actorId: string | null;
  audit?: { enabled?: boolean };
};

async function loadUserRow(pool: Pool, id: string): Promise<PurgePlatformUserRow | null> {
  const userRes = await runPgPoolPgText<PurgePlatformUserRow>(
    pool,
    `SELECT pu.id,
            (SELECT uc.value_normalized FROM user_contacts uc
             WHERE uc.platform_user_id = pu.id AND uc.contact_kind = 'phone' AND uc.is_primary = true LIMIT 1) AS phone_normalized,
            pu.role
     FROM platform_users pu WHERE pu.id = $1`,
    [id],
  );
  return userRes.rows[0] ?? null;
}

type PostCommitDetails = StrictPurgeSuccess['details'];

function buildExternalCleanupAuditDetails(args: {
  outcome: StrictPurgeOutcome;
  details: PostCommitDetails;
}) {
  const failureClasses = [
    ...(args.details.s3Failures.length > 0 ? ['s3_delete'] : []),
    ...(args.details.mediaRowDeleteErrors.length > 0 ? ['media_row_delete'] : []),
    ...(args.details.intakeS3ObjectsNotDeletedBucketDisabled ? ['s3_not_configured'] : []),
  ];
  return {
    outcome: args.outcome,
    failureClasses,
    mediaRowsDeleted: args.details.mediaRowsDeleted,
    mediaRowDeleteFailureCount: args.details.mediaRowDeleteErrors.length,
    patientFileS3KeyCount: args.details.patientFileS3KeyCount,
    s3KeysAttempted: args.details.s3KeysAttempted,
    s3FailureCount: args.details.s3Failures.length,
    intakeS3KeyCount: args.details.intakeS3KeyCount,
    s3Configured: isS3MediaEnabled(env),
    intakeS3ObjectsNotDeletedBucketDisabled: args.details.intakeS3ObjectsNotDeletedBucketDisabled,
  };
}

function purgeAuditTargetRef(rawId: string): string {
  return createHash('sha256').update(`user_purge:${rawId}`).digest('hex');
}

async function runPostCommitArtifactCleanup(
  pool: Pool,
  artifact: PurgeArtifactKeys,
): Promise<PostCommitDetails> {
  const s3Enabled = isS3MediaEnabled(env);
  const details: PostCommitDetails = {
    intakeS3KeyCount: artifact.intakeS3Keys.length,
    mediaFileCount: artifact.mediaFiles.length,
    patientFileS3KeyCount: artifact.patientFileS3Keys.length,
    s3KeysAttempted: 0,
    s3Failures: [],
    mediaRowsDeleted: 0,
    mediaRowDeleteErrors: [],
    intakeS3ObjectsNotDeletedBucketDisabled: false,
  };

  const runS3AndMedia = async (): Promise<void> => {
    const intakeKeys = [...new Set(artifact.intakeS3Keys)];
    const mediaKeys = [
      ...new Set(
        artifact.mediaFiles.map((m) => m.s3Key).filter((key): key is string => Boolean(key)),
      ),
    ];
    const patientFileKeys = [...new Set(artifact.patientFileS3Keys)];
    const allKeys = [...new Set([...intakeKeys, ...mediaKeys, ...patientFileKeys])];
    details.s3KeysAttempted = allKeys.length;

    if (!s3Enabled) {
      details.intakeS3ObjectsNotDeletedBucketDisabled =
        artifact.intakeS3Keys.length > 0 ||
        artifact.patientFileS3Keys.length > 0 ||
        artifact.mediaFiles.some((m) => Boolean(m.s3Key));
      for (const m of artifact.mediaFiles) {
        try {
          const r = await runPgPoolPgText(pool, `DELETE FROM media_files WHERE id = $1::uuid`, [
            m.id,
          ]);
          if ((r.rowCount ?? 0) > 0) details.mediaRowsDeleted += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          details.mediaRowDeleteErrors.push({ id: m.id, error: msg });
        }
      }
      return;
    }

    const s3Results: S3PerKeyDeleteResult[] = await deleteS3ObjectsWithPerKeyResults(allKeys);
    const keyOk = new Map<string, boolean>();
    for (const r of s3Results) {
      if (r.ok) {
        keyOk.set(r.key, true);
      } else {
        keyOk.set(r.key, false);
        details.s3Failures.push({ key: r.key, error: r.error });
      }
    }

    for (const m of artifact.mediaFiles) {
      if (!m.s3Key || keyOk.get(m.s3Key) === true) {
        try {
          const r = await runPgPoolPgText(pool, `DELETE FROM media_files WHERE id = $1::uuid`, [
            m.id,
          ]);
          if ((r.rowCount ?? 0) > 0) details.mediaRowsDeleted += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          details.mediaRowDeleteErrors.push({ id: m.id, error: msg });
        }
      }
    }
  };

  await runS3AndMedia();
  return details;
}

function deriveOutcome(details: PostCommitDetails): StrictPurgeOutcome {
  const hasProblems =
    details.s3Failures.length > 0 ||
    details.mediaRowDeleteErrors.length > 0 ||
    details.intakeS3ObjectsNotDeletedBucketDisabled;
  return hasProblems ? 'partial_failed' : 'completed';
}

/**
 * Strict purge: advisory exclusive lock → preflight S3 keys inside same tx → webapp DELETE → commit →
 * post-commit S3/media cleanup → audit in a separate implicit transaction.
 */
export async function runStrictPurgePlatformUser(opts: RunOpts): Promise<StrictPurgeResult> {
  const auditEnabled = opts.audit?.enabled !== false;
  const rawId = opts.targetId.trim();
  const auditTargetRef = purgeAuditTargetRef(rawId);
  const pool = getPool();

  if (!isPlatformUserUuid(rawId)) {
    if (auditEnabled) {
      await writeAuditLog(pool, {
        actorId: opts.actorId,
        action: 'user_purge',
        targetId: auditTargetRef,
        status: 'error',
        details: { reason: 'invalid_uuid' },
      });
    }
    return { ok: false, error: 'invalid_uuid' };
  }

  const userBefore = await loadUserRow(pool, rawId);
  if (!userBefore) {
    if (auditEnabled) {
      await writeAuditLog(pool, {
        actorId: opts.actorId,
        action: 'user_purge',
        targetId: auditTargetRef,
        status: 'error',
        details: { reason: 'not_found' },
      });
    }
    return { ok: false, error: 'not_found' };
  }
  if (userBefore.role !== 'client') {
    if (auditEnabled) {
      await writeAuditLog(pool, {
        actorId: opts.actorId,
        action: 'user_purge',
        targetId: auditTargetRef,
        status: 'error',
        details: { reason: 'not_client' },
      });
    }
    return { ok: false, error: 'not_client' };
  }

  const userSnapshot: PurgePlatformUserRow = { ...userBefore };
  let artifact: PurgeArtifactKeys = { intakeS3Keys: [], mediaFiles: [], patientFileS3Keys: [] };
  const tx = await startPoolTransaction(pool);
  const client = tx.client;
  try {
    await pgAdvisoryXactLock(client, userSnapshot.id);
    artifact = await collectPurgeArtifactKeys(client, userSnapshot.id);
    await runWebappPurgeCoreInTransaction(client, userSnapshot);
    await tx.commit();
  } catch (e) {
    try {
      await tx.rollback();
    } catch {
      /* ignore */
    }
    const message = e instanceof Error ? e.message : String(e);
    if (auditEnabled) {
      await writeAuditLog(pool, {
        actorId: opts.actorId,
        action: 'user_purge',
        targetId: auditTargetRef,
        status: 'error',
        details: { reason: 'transaction_failed', phase: 'webapp_transaction' },
      });
    }
    return { ok: false, error: 'transaction_failed', transactionError: message };
  } finally {
    await tx.release();
  }

  const details = await runPostCommitArtifactCleanup(pool, artifact);
  const outcome = deriveOutcome(details);

  if (auditEnabled) {
    const auditStatus = outcome === 'completed' ? 'ok' : 'partial_failure';
    await writeAuditLog(pool, {
      actorId: opts.actorId,
      action: 'user_purge',
      targetId: auditTargetRef,
      status: auditStatus,
      details: buildExternalCleanupAuditDetails({
        outcome,
        details,
      }),
    });
  }

  return {
    ok: true,
    outcome,
    details,
  };
}
