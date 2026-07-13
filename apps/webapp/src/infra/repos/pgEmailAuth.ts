import { runWebappPgText } from "@/infra/db/runWebappSql";

export type EmailChallengeRow = {
  id: string;
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: string;
};

export type EmailChallengeCodeRow = {
  id: string;
  code_hash: string;
  expires_at: string;
  attempts: string;
};

export async function findEmailSendCooldown(
  userId: string,
  emailNormalized: string,
): Promise<Date | null> {
  const cooldown = await runWebappPgText<{ last_sent_at: Date | string }>(
    "SELECT last_sent_at FROM app.email_auth_find_email_send_cooldown($1::uuid, $2)",
    [userId, emailNormalized],
  );
  const raw = cooldown.rows[0]?.last_sent_at;
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function deleteEmailChallengesForUser(userId: string): Promise<void> {
  await runWebappPgText("SELECT app.email_auth_delete_email_challenges_for_user($1::uuid)", [userId]);
}

export async function insertEmailChallenge(params: {
  userId: string;
  email: string;
  codeHash: string;
  expiresAt: number;
}): Promise<string> {
  const ins = await runWebappPgText<{ id: string }>(
    `SELECT app.email_auth_insert_email_challenge($1::uuid, $2, $3, $4::bigint)::text AS id`,
    [params.userId, params.email, params.codeHash, params.expiresAt],
  );
  return ins.rows[0]!.id;
}

export async function deleteEmailChallengeById(challengeId: string): Promise<void> {
  await runWebappPgText("SELECT app.email_auth_delete_email_challenge_by_id($1::uuid)", [challengeId]);
}

export async function upsertEmailSendCooldown(userId: string, emailNormalized: string): Promise<void> {
  await runWebappPgText(
    `SELECT app.email_auth_upsert_email_send_cooldown($1::uuid, $2)`,
    [userId, emailNormalized],
  );
}

export async function findEmailChallengeForConfirm(
  challengeId: string,
  userId: string,
): Promise<EmailChallengeRow | null> {
  const row = await runWebappPgText<EmailChallengeRow>(
    `SELECT id::text, email, code_hash, expires_at::text, attempts::text
     FROM app.email_auth_find_email_challenge_for_confirm($1::uuid, $2::uuid)`,
    [challengeId, userId],
  );
  return row.rows[0] ?? null;
}

export async function updateEmailChallengeAttempts(challengeId: string, attempts: number): Promise<void> {
  await runWebappPgText("SELECT app.email_auth_update_email_challenge_attempts($1::uuid, $2::integer)", [
    challengeId,
    attempts,
  ]);
}

export async function findEmailOwnerConflict(userId: string, email: string): Promise<boolean> {
  const conflict = await runWebappPgText<{ conflict: boolean }>(
    `SELECT app.email_auth_find_email_owner_conflict($1::uuid, $2) AS conflict`,
    [userId, email],
  );
  return Boolean(conflict.rows[0]?.conflict);
}

export async function verifyUserEmail(userId: string, email: string): Promise<void> {
  await runWebappPgText(
    "SELECT app.email_auth_verify_user_email($1::uuid, $2)",
    [userId, email],
  );
}

export async function findEmailChallengeForConsume(
  challengeId: string,
  userId: string,
): Promise<EmailChallengeCodeRow | null> {
  const row = await runWebappPgText<EmailChallengeCodeRow>(
    `SELECT id::text, code_hash, expires_at::text, attempts::text
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
    `SELECT id::text, code_hash, expires_at::text, attempts::text
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
    `SELECT id::text, email, code_hash, expires_at::text, attempts::text
     FROM app.email_auth_find_latest_pending_email_challenge_for_user($1::uuid, $2::bigint)`,
    [userId, nowSec],
  );
  return row.rows[0] ?? null;
}

export const pgEmailAuthPort = {
  findEmailSendCooldown,
  deleteEmailChallengesForUser,
  insertEmailChallenge,
  deleteEmailChallengeById,
  upsertEmailSendCooldown,
  findEmailChallengeForConfirm,
  updateEmailChallengeAttempts,
  findEmailOwnerConflict,
  verifyUserEmail,
  findEmailChallengeForConsume,
  findLatestEmailChallengeForUser,
  findLatestPendingEmailChallengeForUser,
};

export type EmailAuthDbPort = typeof pgEmailAuthPort;
