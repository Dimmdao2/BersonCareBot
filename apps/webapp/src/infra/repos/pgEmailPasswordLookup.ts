import { getPool } from "@/infra/db/client";
import { upsertOpenConflictLog } from "@/infra/adminAuditLog";
import type { EmailPasswordLookupPort } from "@/modules/auth/emailPasswordLookup/ports";
import type { EmailPasswordAuthState } from "@/modules/auth/emailPasswordLookup/types";
import {
  classifyMergeFailure,
  mergePlatformUsersInTransaction,
} from "@bersoncare/platform-merge";

type EmailAuthStateRow = {
  id: string;
  email_verified: boolean;
  has_password: boolean;
};

function pickEmailConflictTarget(rows: EmailAuthStateRow[]): string {
  const verifiedWithPassword = rows.filter((row) => row.email_verified && row.has_password);
  if (verifiedWithPassword.length === 1) return verifiedWithPassword[0]!.id;
  const withPassword = rows.filter((row) => row.has_password);
  if (withPassword.length === 1) return withPassword[0]!.id;
  const verified = rows.filter((row) => row.email_verified);
  if (verified.length === 1) return verified[0]!.id;
  return rows[0]!.id;
}

async function recordEmailAuthConflict(params: {
  emailNormalized: string;
  rows: EmailAuthStateRow[];
  targetId: string;
  reason: string;
  candidateIds?: string[];
}): Promise<void> {
  const pool = getPool();
  const candidateIds = params.candidateIds?.length ? params.candidateIds : params.rows.map((row) => row.id);
  await upsertOpenConflictLog(pool, {
    actorId: null,
    action: "email_auth_conflict",
    candidateIds,
    targetId: params.targetId,
    details: {
      source: "email_password_lookup",
      emailNormalized: params.emailNormalized,
      reason: params.reason,
      eventType: "email_auth_conflict",
    },
    status: "error",
  });
}

async function tryAutoMergeDuplicateEmailUsers(
  emailNormalized: string,
  rows: EmailAuthStateRow[],
): Promise<boolean> {
  const pool = getPool();
  const targetId = pickEmailConflictTarget(rows);
  const passwordOwners = rows.filter((row) => row.has_password);
  if (passwordOwners.length > 1) {
    await recordEmailAuthConflict({
      emailNormalized,
      rows,
      targetId,
      reason: "email_conflict_multiple_password_credentials",
    });
    return false;
  }
  const duplicateIds = rows.map((row) => row.id).filter((id) => id !== targetId);
  if (duplicateIds.length === 0) return true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const duplicateId of duplicateIds) {
      await mergePlatformUsersInTransaction(client, targetId, duplicateId, "projection");
    }
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    const candidateIds = rows.map((row) => row.id);
    const classified = classifyMergeFailure(err, candidateIds);
    await recordEmailAuthConflict({
      emailNormalized,
      rows,
      targetId,
      reason: classified.code,
      candidateIds: classified.candidateIds.length > 0 ? classified.candidateIds : candidateIds,
    });
    return false;
  } finally {
    client.release();
  }
}

export function createPgEmailPasswordLookupPort(): EmailPasswordLookupPort {
  return {
    async resolveAuthState(emailNormalized): Promise<EmailPasswordAuthState> {
      const pool = getPool();
      const loadRows = () =>
        pool.query<EmailAuthStateRow>(
          `SELECT pu.id::text AS id,
                  (pu.email_verified_at IS NOT NULL) AS email_verified,
                  EXISTS (
                    SELECT 1 FROM user_password_credentials upc WHERE upc.user_id = pu.id
                  ) AS has_password
           FROM platform_users pu
           WHERE pu.email_normalized = $1
             AND pu.merged_into_id IS NULL`,
          [emailNormalized],
        );
      let r = await loadRows();

      if (r.rows.length === 0) {
        return { kind: "free" };
      }
      if (r.rows.length > 1) {
        const merged = await tryAutoMergeDuplicateEmailUsers(emailNormalized, r.rows);
        if (!merged) {
          return { kind: "email_conflict", candidateIds: r.rows.map((row) => row.id) };
        }
        r = await loadRows();
        if (r.rows.length === 0) return { kind: "free" };
        if (r.rows.length > 1) {
          return { kind: "email_conflict", candidateIds: r.rows.map((row) => row.id) };
        }
      }

      const row = r.rows[0]!;
      if (row.email_verified && row.has_password) {
        return { kind: "verified_with_password", userId: row.id };
      }
      if (!row.email_verified && row.has_password) {
        return { kind: "pending_registration", userId: row.id };
      }
      return { kind: "needs_email_setup", userId: row.id };
    },
  };
}

export const inMemoryEmailPasswordLookupPort: EmailPasswordLookupPort = {
  async resolveAuthState() {
    return { kind: "free" };
  },
};
