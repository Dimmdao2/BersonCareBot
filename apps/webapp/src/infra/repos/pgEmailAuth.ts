import { sql } from 'drizzle-orm';
import type { QueryResultRow } from 'pg';
import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
  runWebappSql,
  runWebappTransaction,
  webappSqlFromPgText,
  type WebappSqlTransactionExecutor,
} from '@/infra/db/runWebappSql';
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
import type { MailProfileRequest } from '@/modules/auth/mailProfile';

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

export async function startEmailChallengeInDb(params: {
  userId: string;
  email: string;
  codeHash: string;
  expiresAt: number;
  purpose: EmailChallengePurpose;
  code: string;
  mailProfile: MailProfileRequest;
}): Promise<{ challengeId: string | null; retryAfterSeconds: number }> {
  const profile =
    params.mailProfile.kind === 'platform'
      ? {
          kind: params.mailProfile.kind,
          senderDisplayName: params.mailProfile.senderDisplayName,
          organizationId: null,
          clinicName: null,
          platformName: null,
        }
      : {
          kind: params.mailProfile.kind,
          senderDisplayName: null,
          organizationId: params.mailProfile.organizationId,
          clinicName: params.mailProfile.clinicName,
          platformName: params.mailProfile.platformName,
        };
  const args = [
    params.userId,
    params.email,
    params.codeHash,
    params.expiresAt,
    params.purpose,
    params.code,
    profile.kind,
    profile.senderDisplayName,
    profile.organizationId,
    profile.clinicName,
    profile.platformName,
  ];
  const result = await runWebappNamedRoot<{
    challenge_id: string | null;
    retry_after_seconds: number | string;
  }>(
    getWebappSqlDb(),
    'app.email_auth_start_challenge(uuid,text,text,bigint,text,text,text,text,uuid,text,text)',
    args,
    sql`SELECT challenge_id::text, retry_after_seconds
    FROM app.email_auth_start_challenge(${params.userId}::uuid, ${params.email}, ${params.codeHash}, ${params.expiresAt}::bigint, ${params.purpose}, ${params.code}, ${profile.kind}, ${profile.senderDisplayName}, ${profile.organizationId}::uuid, ${profile.clinicName}, ${profile.platformName})`,
  );
  const row = result.rows[0];
  if (!row) throw new Error('email_auth_start_challenge_empty_result');
  return {
    challengeId: row.challenge_id,
    retryAfterSeconds: Number(row.retry_after_seconds),
  };
}

function mergeDbClientFromTx(tx: WebappSqlTransactionExecutor): PlatformMergeDbClient {
  return {
    async query<R extends QueryResultRow = QueryResultRow>(
      queryText: string,
      values: unknown[] = [],
    ) {
      // `@bersoncare/platform-merge` is shared with the integrator and so cannot depend on the
      // webapp's Drizzle port: it builds typed `sql` fragments and hands this client the `$n` text
      // its own dialect compiled. Nothing here is hand-numbered — `webappSqlFromPgText` only puts
      // that machine-generated text back on the Drizzle `execute` channel.
      const result = await runWebappSql<R>(tx, webappSqlFromPgText(queryText, values));
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
}

export async function findEmailSendCooldown(
  userId: string,
  emailNormalized: string,
): Promise<Date | null> {
  const cooldown = await runWebappSql<{ last_sent_at: Date | string }>(
    getWebappSqlDb(),
    sql`SELECT last_sent_at FROM app.email_auth_find_email_send_cooldown(${userId}::uuid, ${emailNormalized})`,
  );
  const raw = cooldown.rows[0]?.last_sent_at;
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function deleteEmailChallengesForUser(userId: string): Promise<void> {
  await runWebappNamedRoot(
    getWebappSqlDb(),
    'app.email_auth_delete_email_challenges_for_user(uuid)',
    [userId],
    sql`SELECT app.email_auth_delete_email_challenges_for_user(${userId}::uuid)`,
  );
}

export async function insertEmailChallenge(params: {
  userId: string;
  email: string;
  codeHash: string;
  expiresAt: number;
  purpose: EmailChallengePurpose;
  code: string;
}): Promise<{ challengeId: string; deliveryToken: string }> {
  const ins = await runWebappSql<{ id: string }>(
    getWebappSqlDb(),
    sql`SELECT app.email_auth_insert_email_challenge(${params.userId}::uuid, ${params.email}, ${params.codeHash}, ${params.expiresAt}::bigint)::text AS id`,
  );
  const challengeId = ins.rows[0]!.id;
  // C-2 step 4: purpose is stamped via a SEPARATE, NEW accessor rather than a 5th insert argument --
  // app.email_auth_insert_email_challenge's 4-arg signature is pinned by exact arg-type list across
  // deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql's GRANT/REVOKE lines (see migration
  // 0249's header). This runs in the same request, immediately after the row exists.
  await runWebappSql(
    getWebappSqlDb(),
    sql`SELECT app.email_auth_set_email_challenge_purpose(${challengeId}::uuid, ${params.purpose})`,
  );
  // The legacy separate-insert helper still stamps the plaintext code and mints its ownership token.
  // The active request path uses startEmailChallengeInDb, which creates the challenge and enqueues
  // delivery atomically without these intermediate fields.
  const codeIns = await runWebappSql<{ delivery_token: string }>(
    getWebappSqlDb(),
    sql`SELECT app.email_auth_set_email_challenge_delivery_code(${challengeId}::uuid, ${params.code}) AS delivery_token`,
  );
  const deliveryToken = codeIns.rows[0]!.delivery_token;
  return { challengeId, deliveryToken };
}

export async function deleteEmailChallengeById(challengeId: string): Promise<void> {
  await runWebappSql(
    getWebappSqlDb(),
    sql`SELECT app.email_auth_delete_email_challenge_by_id(${challengeId}::uuid)`,
  );
}

export async function upsertEmailSendCooldown(
  userId: string,
  emailNormalized: string,
): Promise<void> {
  await runWebappSql(
    getWebappSqlDb(),
    sql`SELECT app.email_auth_upsert_email_send_cooldown(${userId}::uuid, ${emailNormalized})`,
  );
}

export async function findEmailChallengeForConfirm(
  challengeId: string,
  userId: string,
): Promise<EmailChallengeRow | null> {
  const row = await runWebappNamedRoot<EmailChallengeRow>(
    getWebappSqlDb(),
    'app.email_auth_find_email_challenge_for_confirm(uuid,uuid)',
    [challengeId, userId],
    sql`SELECT id::text, email, code_hash, expires_at::text, attempts::text, purpose
     FROM app.email_auth_find_email_challenge_for_confirm(${challengeId}::uuid, ${userId}::uuid)`,
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
  const r = await runWebappNamedRoot<{ attempts: number | string }>(
    getWebappSqlDb(),
    'app.email_auth_increment_email_challenge_attempts(uuid)',
    [challengeId],
    sql`SELECT attempts FROM app.email_auth_increment_email_challenge_attempts(${challengeId}::uuid)`,
  );
  const row = r.rows[0];
  return row ? Number(row.attempts) : null;
}

export async function findEmailOwnerConflict(userId: string, email: string): Promise<boolean> {
  const conflict = await runWebappNamedRoot<{ conflict: boolean }>(
    getWebappSqlDb(),
    'app.email_auth_find_email_owner_conflict(uuid,text)',
    [userId, email],
    sql`SELECT app.email_auth_find_email_owner_conflict(${userId}::uuid, ${email}) AS conflict`,
  );
  return Boolean(conflict.rows[0]?.conflict);
}

/**
 * Binding a confirmed e-mail to an account is ONE operation and it belongs to ONE root
 * (AGENTS.md §5). Until 22.08.2026 this function ran the root and then wrote the very same
 * `public.user_contacts` row a second time through the raw canonical-contacts engine. The second
 * pass carried no named operation, so under the bootstrap principal of the e-mail doors it asked
 * for a generic `pre_session` capability, which does not exist in the catalog and must not: every
 * pre-session capability names its function. Result — `Missing declared webapp port capability:
 * pre_session` on a confirmation whose root had already succeeded, i.e. the row was written and the
 * caller was told the confirmation failed.
 *
 * The root owns the whole operation now, including demoting whatever e-mail used to be primary
 * (`20260822T110000_the_email_verify_root_demotes_the_previous_primary.sql`) — the one thing the
 * removed second pass did that the root did not, and the one thing whose absence would have turned
 * this refusal into a `23505` on `uq_user_contacts_primary_email` when a person changes address.
 */
export async function verifyUserEmail(userId: string, email: string): Promise<void> {
  await runWebappNamedRoot(
    getWebappSqlDb(),
    'app.email_auth_verify_user_email(uuid,text)',
    [userId, email],
    sql`SELECT app.email_auth_verify_user_email(${userId}::uuid, ${email})`,
  );
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
        const users = await runWebappSql<{
          id: string;
          email_normalized: string | null;
          merged_into_id: string | null;
          role: string;
        }>(
          tx,
          sql`SELECT pu.id::text, email.value_normalized AS email_normalized,
                  pu.merged_into_id::text, pu.role::text
         FROM platform_users pu
         LEFT JOIN user_contacts email ON email.platform_user_id = pu.id
           AND email.contact_kind = 'email' AND email.is_primary = true
         WHERE pu.id = ${userId}::uuid
            OR (email.value_normalized = ${emailNormalized} AND pu.merged_into_id IS NULL)
         ORDER BY pu.id
         FOR UPDATE OF pu`,
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
          { mergeContext: { source: 'email_confirmation' } },
        );
        await runWebappSql(
          tx,
          sql`SELECT app.email_auth_verify_user_email(${userId}::uuid, ${email})`,
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
  const row = await runWebappSql<EmailChallengeCodeRow>(
    getWebappSqlDb(),
    sql`SELECT id::text, code_hash, expires_at::text, attempts::text, purpose
     FROM app.email_auth_find_email_challenge_for_consume(${challengeId}::uuid, ${userId}::uuid)`,
  );
  return row.rows[0] ?? null;
}

export async function findLatestEmailChallengeForUser(
  userId: string,
  nowSec: number,
): Promise<EmailChallengeCodeRow | null> {
  const row = await runWebappSql<EmailChallengeCodeRow>(
    getWebappSqlDb(),
    sql`SELECT id::text, code_hash, expires_at::text, attempts::text, purpose
     FROM app.email_auth_find_latest_email_challenge_for_user(${userId}::uuid, ${nowSec}::bigint)`,
  );
  return row.rows[0] ?? null;
}

export async function findLatestPendingEmailChallengeForUser(
  userId: string,
  nowSec: number,
): Promise<EmailChallengeRow | null> {
  const row = await runWebappSql<EmailChallengeRow>(
    getWebappSqlDb(),
    sql`SELECT id::text, email, code_hash, expires_at::text, attempts::text, purpose
     FROM app.email_auth_find_latest_pending_email_challenge_for_user(${userId}::uuid, ${nowSec}::bigint)`,
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
  const row = await runWebappNamedRoot<{ locked_until: string | number }>(
    getWebappSqlDb(),
    'app.email_auth_find_email_otp_lock(uuid)',
    [userId],
    sql`SELECT locked_until FROM app.email_auth_find_email_otp_lock(${userId}::uuid)`,
  );
  return row.rows[0] ?? null;
}

/**
 * Atomically escalates this user's lockout cycle and returns the new `locked_until` epoch second.
 * Backed by `app.email_auth_register_email_otp_lockout`, which does the escalation math itself
 * inside a single `INSERT ... ON CONFLICT DO UPDATE` -- see that function's comment for the formula.
 */
export async function registerEmailOtpLockout(userId: string): Promise<number> {
  const r = await runWebappNamedRoot<{ locked_until: string | number }>(
    getWebappSqlDb(),
    'app.email_auth_register_email_otp_lockout(uuid)',
    [userId],
    sql`SELECT locked_until FROM app.email_auth_register_email_otp_lockout(${userId}::uuid)`,
  );
  return Number(r.rows[0]!.locked_until);
}

/** NIST SP 800-63B §5.2.2: disregard previous failed attempts after a successful verification. */
export async function resetEmailOtpLockout(userId: string): Promise<void> {
  await runWebappNamedRoot(
    getWebappSqlDb(),
    'app.email_auth_reset_email_otp_lockout(uuid)',
    [userId],
    sql`SELECT app.email_auth_reset_email_otp_lockout(${userId}::uuid)`,
  );
}

export const pgEmailAuthPort = {
  startEmailChallenge: startEmailChallengeInDb,
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
