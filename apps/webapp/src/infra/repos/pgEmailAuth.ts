import type { QueryResultRow } from 'pg';
import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';
import {
  runWebappPgText,
  runWebappTransaction,
  getWebappSqlDb,
  type WebappSqlTransactionExecutor,
} from '@/infra/db/runWebappSql';
import { syncUserContactsMirrorWebapp } from '@/infra/repos/userContactsSql';
import {
  MergeConflictError,
  MergeDependentConflictError,
  mergePlatformUsersInTransaction,
  type PlatformMergeDbClient,
} from '@bersoncare/platform-merge';
import type {
  ClaimVerifiedEmailOptions,
  ClaimVerifiedEmailResult,
  EmailChallengePurpose,
} from '@/modules/auth/emailAuthPort';

export type EmailChallengeRow = {
  id: string;
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: string;
  purpose: string | null;
};

export type EmailChallengeCodeRow = {
  id: string;
  code_hash: string;
  expires_at: string;
  attempts: string;
  purpose: string | null;
};

class EmailClaimConflictError extends Error {}

function mergeDbClientFromTx(tx: WebappSqlTransactionExecutor): PlatformMergeDbClient {
  return {
    async query<R extends QueryResultRow = QueryResultRow>(
      queryText: string,
      values: unknown[] = [],
    ) {
      const result = await runWebappPgText<R>(queryText, values, tx);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
}

export async function findEmailSendCooldown(
  userId: string,
  emailNormalized: string,
): Promise<Date | null> {
  const cooldown = await runWebappPgText<{ last_sent_at: Date | string }>(
    'SELECT last_sent_at FROM app.email_auth_find_email_send_cooldown($1::uuid, $2)',
    [userId, emailNormalized],
  );
  const raw = cooldown.rows[0]?.last_sent_at;
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function deleteEmailChallengesForUser(userId: string): Promise<void> {
  await runWebappPgText('SELECT app.email_auth_delete_email_challenges_for_user($1::uuid)', [
    userId,
  ]);
}

export async function insertEmailChallenge(params: {
  userId: string;
  email: string;
  codeHash: string;
  expiresAt: number;
  purpose: EmailChallengePurpose;
  code: string;
}): Promise<{ challengeId: string; deliveryToken: string }> {
  const ins = await runWebappPgText<{ id: string }>(
    `SELECT app.email_auth_insert_email_challenge($1::uuid, $2, $3, $4::bigint)::text AS id`,
    [params.userId, params.email, params.codeHash, params.expiresAt],
  );
  const challengeId = ins.rows[0]!.id;
  // C-2 step 4: purpose is stamped via a SEPARATE, NEW accessor rather than a 5th insert argument --
  // app.email_auth_insert_email_challenge's 4-arg signature is pinned by exact arg-type list across
  // deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql's GRANT/REVOKE lines (see migration
  // 0249's header). This runs in the same request, immediately after the row exists.
  await runWebappPgText('SELECT app.email_auth_set_email_challenge_purpose($1::uuid, $2)', [
    challengeId,
    params.purpose,
  ]);
  // D27-C fix round 2: same idiom -- the plaintext code is stamped via its own accessor right after
  // insert, so app.email_auth_enqueue_otp_delivery (migration 0363) can compose the delivery email
  // from the row instead of accepting it as a caller-supplied payload.
  // D27-C fix round 3: that accessor now also mints and returns the one-shot ownership token
  // app.email_auth_enqueue_otp_delivery requires -- it is captured here and never leaves the server
  // process except via the direct call into enqueueEmailOtpDelivery further up the same request.
  const codeIns = await runWebappPgText<{ delivery_token: string }>(
    'SELECT app.email_auth_set_email_challenge_delivery_code($1::uuid, $2) AS delivery_token',
    [challengeId, params.code],
  );
  const deliveryToken = codeIns.rows[0]!.delivery_token;
  return { challengeId, deliveryToken };
}

export async function deleteEmailChallengeById(challengeId: string): Promise<void> {
  await runWebappPgText('SELECT app.email_auth_delete_email_challenge_by_id($1::uuid)', [
    challengeId,
  ]);
}

export async function upsertEmailSendCooldown(
  userId: string,
  emailNormalized: string,
): Promise<void> {
  await runWebappPgText(`SELECT app.email_auth_upsert_email_send_cooldown($1::uuid, $2)`, [
    userId,
    emailNormalized,
  ]);
}

export async function findEmailChallengeForConfirm(
  challengeId: string,
  userId: string,
): Promise<EmailChallengeRow | null> {
  const row = await runWebappPgText<EmailChallengeRow>(
    `SELECT id::text, email, code_hash, expires_at::text, attempts::text, purpose
     FROM app.email_auth_find_email_challenge_for_confirm($1::uuid, $2::uuid)`,
    [challengeId, userId],
  );
  return row.rows[0] ?? null;
}

/**
 * Atomic wrong-attempt increment (B-x, night plan C-2 step 1): the database itself computes
 * `attempts + 1` inside a row-locked SECURITY DEFINER function
 * (`app.email_auth_increment_email_challenge_attempts`, migration 0247), never the caller. Two
 * concurrent wrong-code confirms against the SAME challenge can therefore never lose an increment
 * the way the old absolute-set `updateEmailChallengeAttempts(challengeId, attempts)` could.
 * Returns null if the challenge no longer exists (e.g. a concurrent resend/expiry deleted it).
 */
export async function incrementEmailChallengeAttempts(challengeId: string): Promise<number | null> {
  const r = await runWebappPgText<{ attempts: number | string }>(
    'SELECT attempts FROM app.email_auth_increment_email_challenge_attempts($1::uuid)',
    [challengeId],
  );
  const row = r.rows[0];
  return row ? Number(row.attempts) : null;
}

export async function findEmailOwnerConflict(userId: string, email: string): Promise<boolean> {
  const conflict = await runWebappPgText<{ conflict: boolean }>(
    `SELECT app.email_auth_find_email_owner_conflict($1::uuid, $2) AS conflict`,
    [userId, email],
  );
  return Boolean(conflict.rows[0]?.conflict);
}

export async function verifyUserEmail(userId: string, email: string): Promise<void> {
  await runWebappPgText('SELECT app.email_auth_verify_user_email($1::uuid, $2)', [userId, email]);
  await syncUserContactsMirrorWebapp(getWebappSqlDb(), userId);
}

export async function claimVerifiedEmail(
  userId: string,
  email: string,
  options?: ClaimVerifiedEmailOptions,
): Promise<ClaimVerifiedEmailResult> {
  const emailNormalized = email.trim().toLowerCase();
  const hasConflict = await findEmailOwnerConflict(userId, emailNormalized);
  if (!hasConflict) {
    await verifyUserEmail(userId, email);
    return { ok: true, merged: false };
  }

  const organizationId = options?.profileBindOrganizationId?.trim();
  if (!organizationId) {
    return { ok: false, code: 'email_conflict' };
  }

  try {
    return await runWithDbOrganizationPrincipal(organizationId, () =>
      runWebappTransaction(async (tx) => {
        const users = await runWebappPgText<{
          id: string;
          email_normalized: string | null;
          merged_into_id: string | null;
          role: string;
        }>(
          `SELECT id::text, email_normalized, merged_into_id::text, role::text
         FROM platform_users
         WHERE id = $1::uuid
            OR (email_normalized = $2 AND merged_into_id IS NULL)
         ORDER BY id
         FOR UPDATE`,
          [userId, emailNormalized],
          tx,
        );
        const current = users.rows.find((row) => row.id === userId);
        if (!current || current.merged_into_id || current.role !== 'client') {
          throw new EmailClaimConflictError('current_user_not_mergeable');
        }
        const owner = users.rows.find(
          (row) =>
            row.id !== userId &&
            row.email_normalized === emailNormalized &&
            row.merged_into_id === null,
        );
        if (!owner) return { ok: false, code: 'email_conflict' };
        if (owner.role !== 'client') {
          throw new EmailClaimConflictError('email_owner_not_client');
        }

        await mergePlatformUsersInTransaction(
          mergeDbClientFromTx(tx),
          userId,
          owner.id,
          'email_bind',
        );
        await runWebappPgText(
          'SELECT app.email_auth_verify_user_email($1::uuid, $2)',
          [userId, email],
          tx,
        );
        return { ok: true, merged: true };
      }),
    );
  } catch (err) {
    if (
      err instanceof EmailClaimConflictError ||
      err instanceof MergeConflictError ||
      err instanceof MergeDependentConflictError
    ) {
      return { ok: false, code: 'email_conflict' };
    }
    throw err;
  }
}

export async function findEmailChallengeForConsume(
  challengeId: string,
  userId: string,
): Promise<EmailChallengeCodeRow | null> {
  const row = await runWebappPgText<EmailChallengeCodeRow>(
    `SELECT id::text, code_hash, expires_at::text, attempts::text, purpose
     FROM app.email_auth_find_email_challenge_for_consume($1::uuid, $2::uuid)`,
    [challengeId, userId],
  );
  return row.rows[0] ?? null;
}

export async function findLatestEmailChallengeForUser(
  userId: string,
  nowSec: number,
): Promise<EmailChallengeCodeRow | null> {
  const row = await runWebappPgText<EmailChallengeCodeRow>(
    `SELECT id::text, code_hash, expires_at::text, attempts::text, purpose
     FROM app.email_auth_find_latest_email_challenge_for_user($1::uuid, $2::bigint)`,
    [userId, nowSec],
  );
  return row.rows[0] ?? null;
}

export async function findLatestPendingEmailChallengeForUser(
  userId: string,
  nowSec: number,
): Promise<EmailChallengeRow | null> {
  const row = await runWebappPgText<EmailChallengeRow>(
    `SELECT id::text, email, code_hash, expires_at::text, attempts::text, purpose
     FROM app.email_auth_find_latest_pending_email_challenge_for_user($1::uuid, $2::bigint)`,
    [userId, nowSec],
  );
  return row.rows[0] ?? null;
}

/**
 * Decaying OTP lockout (night plan C-2 step 3): read-only gate check for `startEmailChallenge`.
 * Backed by `app.email_auth_find_email_otp_lock` (0248_otp_decaying_lockout.sql) -- app_patient has
 * no direct grant on `email_otp_locks`, same reason every other accessor in this file goes through
 * a SECURITY DEFINER function.
 */
export async function findEmailOtpLock(
  userId: string,
): Promise<{ locked_until: string | number } | null> {
  const row = await runWebappPgText<{ locked_until: string | number }>(
    'SELECT locked_until FROM app.email_auth_find_email_otp_lock($1::uuid)',
    [userId],
  );
  return row.rows[0] ?? null;
}

/**
 * Atomically escalates this user's lockout cycle and returns the new `locked_until` epoch second.
 * Backed by `app.email_auth_register_email_otp_lockout`, which does the escalation math itself
 * inside a single `INSERT ... ON CONFLICT DO UPDATE` -- see that function's comment for the formula.
 */
export async function registerEmailOtpLockout(userId: string): Promise<number> {
  const r = await runWebappPgText<{ locked_until: string | number }>(
    'SELECT locked_until FROM app.email_auth_register_email_otp_lockout($1::uuid)',
    [userId],
  );
  return Number(r.rows[0]!.locked_until);
}

/** NIST SP 800-63B §5.2.2: disregard previous failed attempts after a successful verification. */
export async function resetEmailOtpLockout(userId: string): Promise<void> {
  await runWebappPgText('SELECT app.email_auth_reset_email_otp_lockout($1::uuid)', [userId]);
}

export const pgEmailAuthPort = {
  findEmailSendCooldown,
  deleteEmailChallengesForUser,
  insertEmailChallenge,
  deleteEmailChallengeById,
  upsertEmailSendCooldown,
  findEmailChallengeForConfirm,
  incrementEmailChallengeAttempts,
  findEmailOwnerConflict,
  verifyUserEmail,
  claimVerifiedEmail,
  findEmailChallengeForConsume,
  findLatestEmailChallengeForUser,
  findLatestPendingEmailChallengeForUser,
  findEmailOtpLock,
  registerEmailOtpLockout,
  resetEmailOtpLockout,
};

export type EmailAuthDbPort = typeof pgEmailAuthPort;
