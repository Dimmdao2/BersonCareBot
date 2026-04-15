import type { Pool } from "pg";
import { env } from "@/config/env";
import { isS3MediaEnabled } from "@/config/env";
import { writeAuditLog } from "@/infra/adminAuditLog";
import { getPool } from "@/infra/db/client";
import {
  collectPurgeArtifactKeys,
  deleteIntegratorPhoneDataWithResult,
  fetchMessengerBindingsForIntegratorCleanup,
  getIntegratorPoolForPurge,
  isPlatformUserUuid,
  phoneDigits,
  resolveIntegratorUserIds,
  runWebappPurgeCoreInTransaction,
  type MessengerBindingForIntegratorCleanup,
  type PurgeArtifactKeys,
  type PurgePlatformUserRow,
} from "@/infra/platformUserFullPurge";
import { deleteS3ObjectsWithPerKeyResults, type S3PerKeyDeleteResult } from "@/infra/s3/client";

/**
 * - `completed` — webapp commit + S3 + integrator cleanup successful (or integrator work not required).
 * - `partial_failed` — webapp committed; S3/media cleanup had failures.
 * - `needs_retry` — webapp committed; integrator cleanup was **required** but had no DB pool, failed, or S3 clean while integrator missed.
 */
export type StrictPurgeOutcome = "completed" | "partial_failed" | "needs_retry";

export type StrictPurgeSuccess = {
  ok: true;
  outcome: StrictPurgeOutcome;
  integratorSkipped: boolean;
  details: {
    intakeS3KeyCount: number;
    mediaFileCount: number;
    s3KeysAttempted: number;
    s3Failures: { key: string; error: string }[];
    integratorCleaned: boolean;
    integratorError: string | null;
    mediaRowsDeleted: number;
    mediaRowDeleteErrors: { id: string; error: string }[];
    /** Intake attachment keys were collected but bucket delete was not run (S3 disabled in this process). Objects may remain in private bucket. */
    intakeS3ObjectsNotDeletedBucketDisabled: boolean;
  };
};

export type StrictPurgeFailure = {
  ok: false;
  error: "invalid_uuid" | "not_found" | "not_client" | "transaction_failed";
  transactionError?: string;
};

export type StrictPurgeResult = StrictPurgeSuccess | StrictPurgeFailure;

type RunOpts = {
  targetId: string;
  actorId: string | null;
  audit?: { enabled?: boolean };
};

async function loadUserRow(pool: Pool, id: string): Promise<PurgePlatformUserRow | null> {
  const userRes = await pool.query<PurgePlatformUserRow>(
    `SELECT id, phone_normalized, integrator_user_id::text AS integrator_user_id, role
     FROM platform_users WHERE id = $1`,
    [id],
  );
  return userRes.rows[0] ?? null;
}

type PostCommitDetails = StrictPurgeSuccess["details"];

function buildExternalCleanupAuditDetails(args: {
  outcome: StrictPurgeOutcome;
  integratorSkipped: boolean;
  integratorCleanupNeeded: boolean;
  details: PostCommitDetails;
  phoneNormalized: string | null;
  webappIntegratorUserId: string | null;
  artifact: PurgeArtifactKeys;
  resolvedIntegratorUserIds: string[];
  messengerBindingsCount: number;
}) {
  return {
    outcome: args.outcome,
    integratorSkipped: args.integratorSkipped,
    integratorCleanupNeeded: args.integratorCleanupNeeded,
    phoneNormalized: args.phoneNormalized,
    webappIntegratorUserId: args.webappIntegratorUserId,
    resolvedIntegratorUserIds: args.resolvedIntegratorUserIds,
    messengerBindingsCount: args.messengerBindingsCount,
    artifact: args.artifact,
    mediaDeleted: args.details.mediaRowsDeleted,
    s3KeysAttempted: args.details.s3KeysAttempted,
    s3Failures: args.details.s3Failures,
    integratorCleaned: args.details.integratorCleaned,
    integratorError: args.details.integratorError,
    mediaRowDeleteErrors: args.details.mediaRowDeleteErrors,
    intakeS3KeyCount: args.details.intakeS3KeyCount,
    s3Configured: isS3MediaEnabled(env),
    intakeS3ObjectsNotDeletedBucketDisabled: args.details.intakeS3ObjectsNotDeletedBucketDisabled,
  };
}

/** Same rule as `resolveIntegratorUserIds`: numeric integrator.users id from webapp projection. */
function hasNumericWebappIntegratorUserId(webappIntegratorUserId: string | null | undefined): boolean {
  const t = webappIntegratorUserId?.trim() ?? "";
  return t.length > 0 && /^\d+$/.test(t);
}

function integratorCleanupNeeded(params: {
  messengerBindings: ReadonlyArray<MessengerBindingForIntegratorCleanup>;
  digs: string;
  integratorUserIds: string[];
  webappIntegratorUserId: string | null;
}): boolean {
  if (params.messengerBindings.length > 0) return true;
  if (params.integratorUserIds.length > 0) return true;
  if (hasNumericWebappIntegratorUserId(params.webappIntegratorUserId)) return true;
  if (params.digs.length >= 10) return true;
  return false;
}

async function runPostCommitArtifactCleanup(
  pool: Pool,
  artifact: PurgeArtifactKeys,
  digs: string,
  integratorUserIds: string[],
  integratorPool: ReturnType<typeof getIntegratorPoolForPurge>,
  messengerBindings: MessengerBindingForIntegratorCleanup[],
): Promise<PostCommitDetails> {
  const s3Enabled = isS3MediaEnabled(env);
  const details: PostCommitDetails = {
    intakeS3KeyCount: artifact.intakeS3Keys.length,
    mediaFileCount: artifact.mediaFiles.length,
    s3KeysAttempted: 0,
    s3Failures: [],
    integratorCleaned: false,
    integratorError: null,
    mediaRowsDeleted: 0,
    mediaRowDeleteErrors: [],
    intakeS3ObjectsNotDeletedBucketDisabled: false,
  };

  const runS3AndMedia = async (): Promise<void> => {
    const intakeKeys = [...new Set(artifact.intakeS3Keys)];
    const mediaKeys = [...new Set(artifact.mediaFiles.map((m) => m.s3Key).filter((key): key is string => Boolean(key)))];
    const allKeys = [...new Set([...intakeKeys, ...mediaKeys])];
    details.s3KeysAttempted = allKeys.length;

    if (!s3Enabled) {
      details.intakeS3ObjectsNotDeletedBucketDisabled =
        artifact.intakeS3Keys.length > 0 || artifact.mediaFiles.some((m) => Boolean(m.s3Key));
      for (const m of artifact.mediaFiles) {
        try {
          const r = await pool.query(`DELETE FROM media_files WHERE id = $1::uuid`, [m.id]);
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
          const r = await pool.query(`DELETE FROM media_files WHERE id = $1::uuid`, [m.id]);
          if ((r.rowCount ?? 0) > 0) details.mediaRowsDeleted += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          details.mediaRowDeleteErrors.push({ id: m.id, error: msg });
        }
      }
    }
  };

  const runIntegrator = async (): Promise<void> => {
    const res = await deleteIntegratorPhoneDataWithResult(
      integratorPool,
      digs,
      integratorUserIds,
      messengerBindings,
    );
    if (res.ok && res.skipped) {
      details.integratorCleaned = false;
      details.integratorError = null;
      return;
    }
    if (res.ok) {
      details.integratorCleaned = true;
      details.integratorError = null;
    } else {
      details.integratorCleaned = false;
      details.integratorError = res.message;
    }
  };

  await Promise.all([runS3AndMedia(), runIntegrator()]);
  return details;
}

function deriveOutcome(
  details: PostCommitDetails,
  integratorPool: ReturnType<typeof getIntegratorPoolForPurge>,
  cleanupNeeded: boolean,
): StrictPurgeOutcome {
  const s3Problems = details.s3Failures.length > 0 || details.mediaRowDeleteErrors.length > 0;
  const intProblem = Boolean(integratorPool && details.integratorError);
  const integratorMissed = cleanupNeeded && !integratorPool;

  if (integratorMissed && !s3Problems) {
    return "needs_retry";
  }
  if (!s3Problems && !intProblem) return "completed";
  if (s3Problems) return "partial_failed";
  if (intProblem) return "needs_retry";
  return "completed";
}

/**
 * Strict purge: advisory exclusive lock → preflight S3 keys inside same tx → webapp DELETE → commit →
 * parallel post-commit S3 + integrator (no short-circuit) → audit in a separate implicit transaction.
 */
export async function runStrictPurgePlatformUser(opts: RunOpts): Promise<StrictPurgeResult> {
  const auditEnabled = opts.audit?.enabled !== false;
  const rawId = opts.targetId.trim();
  const pool = getPool();

  if (!isPlatformUserUuid(rawId)) {
    if (auditEnabled) {
      await writeAuditLog(pool, {
        actorId: opts.actorId,
        action: "user_purge",
        targetId: rawId,
        status: "error",
        details: { reason: "invalid_uuid" },
      });
    }
    return { ok: false, error: "invalid_uuid" };
  }

  const userBefore = await loadUserRow(pool, rawId);
  if (!userBefore) {
    if (auditEnabled) {
      await writeAuditLog(pool, {
        actorId: opts.actorId,
        action: "user_purge",
        targetId: rawId,
        status: "error",
        details: { reason: "not_found" },
      });
    }
    return { ok: false, error: "not_found" };
  }
  if (userBefore.role !== "client") {
    if (auditEnabled) {
      await writeAuditLog(pool, {
        actorId: opts.actorId,
        action: "user_purge",
        targetId: rawId,
        status: "error",
        details: { reason: "not_client" },
      });
    }
    return { ok: false, error: "not_client" };
  }

  const userSnapshot: PurgePlatformUserRow = { ...userBefore };
  let artifact: PurgeArtifactKeys = { intakeS3Keys: [], mediaFiles: [] };
  let messengerBindings: MessengerBindingForIntegratorCleanup[] = [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [userSnapshot.id]);
    artifact = await collectPurgeArtifactKeys(client, userSnapshot.id);
    messengerBindings = await fetchMessengerBindingsForIntegratorCleanup(client, userSnapshot.id);
    await runWebappPurgeCoreInTransaction(client, userSnapshot);
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    const message = e instanceof Error ? e.message : String(e);
    if (auditEnabled) {
      await writeAuditLog(pool, {
        actorId: opts.actorId,
        action: "user_purge",
        targetId: rawId,
        status: "error",
        details: { error: message, phase: "webapp_transaction" },
      });
    }
    return { ok: false, error: "transaction_failed", transactionError: message };
  } finally {
    client.release();
  }

  const digs = userSnapshot.phone_normalized?.trim() ? phoneDigits(userSnapshot.phone_normalized) : "";
  const integratorPool = getIntegratorPoolForPurge();
  const intIds = await resolveIntegratorUserIds(
    integratorPool,
    digs,
    userSnapshot.integrator_user_id,
    messengerBindings,
  );

  const details = await runPostCommitArtifactCleanup(pool, artifact, digs, intIds, integratorPool, messengerBindings);

  const integratorSkipped = !integratorPool;
  const cleanupNeeded = integratorCleanupNeeded({
    messengerBindings,
    digs,
    integratorUserIds: intIds,
    webappIntegratorUserId: userSnapshot.integrator_user_id,
  });
  const outcome = deriveOutcome(details, integratorPool, cleanupNeeded);

  if (auditEnabled) {
    const auditStatus = outcome === "completed" ? "ok" : "partial_failure";
    await writeAuditLog(pool, {
      actorId: opts.actorId,
      action: "user_purge",
      targetId: rawId,
      status: auditStatus,
      details: buildExternalCleanupAuditDetails({
        outcome,
        integratorSkipped,
        integratorCleanupNeeded: cleanupNeeded,
        details,
        phoneNormalized: userSnapshot.phone_normalized,
        webappIntegratorUserId: userSnapshot.integrator_user_id,
        artifact,
        resolvedIntegratorUserIds: intIds,
        messengerBindingsCount: messengerBindings.length,
      }),
    });
  }

  return {
    ok: true,
    outcome,
    integratorSkipped,
    details,
  };
}

/**
 * Post-commit-only retry (no `platform_users` row required). Uses the same parallel S3/integrator paths as strict purge.
 * Persist `artifact` + phone/integrator ids from audit `details` or ops notes before calling.
 */
export async function retryStrictPurgeExternalCleanup(params: {
  phoneNormalized: string | null;
  webappIntegratorUserId: string | null;
  artifact: PurgeArtifactKeys;
  actorId: string | null;
  /** Stored in `admin_audit_log.target_id` when possible (e.g. original platform user id). */
  auditTargetId?: string | null;
  audit?: { enabled?: boolean };
}): Promise<StrictPurgeSuccess> {
  const auditEnabled = params.audit?.enabled !== false;
  const pool = getPool();
  const digs = params.phoneNormalized?.trim() ? phoneDigits(params.phoneNormalized) : "";
  const integratorPool = getIntegratorPoolForPurge();
  const intIds = await resolveIntegratorUserIds(integratorPool, digs, params.webappIntegratorUserId);

  const details = await runPostCommitArtifactCleanup(pool, params.artifact, digs, intIds, integratorPool, []);
  const integratorSkipped = !integratorPool;
  const cleanupNeeded = integratorCleanupNeeded({
    messengerBindings: [],
    digs,
    integratorUserIds: intIds,
    webappIntegratorUserId: params.webappIntegratorUserId,
  });
  const outcome = deriveOutcome(details, integratorPool, cleanupNeeded);

  if (auditEnabled) {
    await writeAuditLog(pool, {
      actorId: params.actorId,
      action: "user_purge_external_retry",
      targetId: params.auditTargetId ?? null,
      status: outcome === "completed" ? "ok" : "partial_failure",
      details: buildExternalCleanupAuditDetails({
        outcome,
        integratorSkipped,
        integratorCleanupNeeded: cleanupNeeded,
        details,
        phoneNormalized: params.phoneNormalized,
        webappIntegratorUserId: params.webappIntegratorUserId,
        artifact: params.artifact,
        resolvedIntegratorUserIds: intIds,
        messengerBindingsCount: 0,
      }),
    });
  }

  return {
    ok: true,
    outcome,
    integratorSkipped,
    details,
  };
}
