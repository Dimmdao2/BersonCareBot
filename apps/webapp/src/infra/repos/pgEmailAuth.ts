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
  const cooldown = await runWebappPgText<{ last_sent_at: Date }>(
    "SELECT last_sent_at FROM email_send_cooldowns WHERE user_id = $1 AND email_normalized = $2",
    [userId, emailNormalized],
  );
  return cooldown.rows[0]?.last_sent_at ?? null;
}

export async function deleteEmailChallengesForUser(userId: string): Promise<void> {
  await runWebappPgText("DELETE FROM email_challenges WHERE user_id = $1", [userId]);
}

export async function insertEmailChallenge(params: {
  userId: string;
  email: string;
  codeHash: string;
  expiresAt: number;
}): Promise<string> {
  const ins = await runWebappPgText<{ id: string }>(
    `INSERT INTO email_challenges (user_id, email, code_hash, expires_at, attempts)
     VALUES ($1, $2, $3, $4, 0) RETURNING id`,
    [params.userId, params.email, params.codeHash, params.expiresAt],
  );
  return ins.rows[0]!.id;
}

export async function deleteEmailChallengeById(challengeId: string): Promise<void> {
  await runWebappPgText("DELETE FROM email_challenges WHERE id = $1", [challengeId]);
}

export async function upsertEmailSendCooldown(userId: string, emailNormalized: string): Promise<void> {
  await runWebappPgText(
    `INSERT INTO email_send_cooldowns (user_id, email_normalized, last_sent_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id, email_normalized) DO UPDATE SET last_sent_at = now()`,
    [userId, emailNormalized],
  );
}

export async function findEmailChallengeForConfirm(
  challengeId: string,
  userId: string,
): Promise<EmailChallengeRow | null> {
  const row = await runWebappPgText<EmailChallengeRow>(
    "SELECT id, email, code_hash, expires_at, attempts FROM email_challenges WHERE id = $1 AND user_id = $2",
    [challengeId, userId],
  );
  return row.rows[0] ?? null;
}

export async function updateEmailChallengeAttempts(challengeId: string, attempts: number): Promise<void> {
  await runWebappPgText("UPDATE email_challenges SET attempts = $1 WHERE id = $2", [attempts, challengeId]);
}

export async function findEmailOwnerConflict(userId: string, email: string): Promise<boolean> {
  const conflict = await runWebappPgText<{ id: string }>(
    `SELECT id FROM platform_users
     WHERE id <> $1::uuid
       AND merged_into_id IS NULL
       AND email_normalized = lower(btrim($2::text))
     LIMIT 1`,
    [userId, email],
  );
  return Boolean(conflict.rows[0]);
}

export async function verifyUserEmail(userId: string, email: string): Promise<void> {
  await runWebappPgText(
    "UPDATE platform_users SET email = $1, email_normalized = lower(btrim($1)), email_verified_at = now(), updated_at = now() WHERE id = $2",
    [email, userId],
  );
}

export async function findEmailChallengeForConsume(
  challengeId: string,
  userId: string,
): Promise<EmailChallengeCodeRow | null> {
  const row = await runWebappPgText<EmailChallengeCodeRow>(
    "SELECT id, code_hash, expires_at, attempts FROM email_challenges WHERE id = $1 AND user_id = $2",
    [challengeId, userId],
  );
  return row.rows[0] ?? null;
}

export async function findLatestEmailChallengeForUser(
  userId: string,
  nowSec: number,
): Promise<EmailChallengeCodeRow | null> {
  const row = await runWebappPgText<EmailChallengeCodeRow>(
    `SELECT id, code_hash, expires_at, attempts FROM email_challenges
     WHERE user_id = $1::uuid AND expires_at > $2
     ORDER BY created_at DESC
     LIMIT 1`,
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
};

export type EmailAuthDbPort = typeof pgEmailAuthPort;
