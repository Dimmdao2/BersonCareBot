/**
 * Wave 3 phase 15B — domain SQL via `runWebappPgText`; duplicate-email merge via
 * `runWebappTransaction` + `PlatformMergeDbClient`. `getPool()` only for Class C
 * `upsertOpenConflictLog` in `adminAuditLog` (P14C).
 */
import type { QueryResultRow } from "pg";
import { getPool } from "@/infra/db/client";
import {
  runWebappPgText,
  runWebappTransaction,
  type WebappSqlTransactionExecutor,
} from "@/infra/db/runWebappSql";
import { upsertOpenConflictLog } from "@/infra/adminAuditLog";
import type { EmailPasswordLookupPort } from "@/modules/auth/emailPasswordLookup/ports";
import type { EmailPasswordAuthState } from "@/modules/auth/emailPasswordLookup/types";
import {
  classifyMergeFailure,
  mergePlatformUsersInTransaction,
  type PlatformMergeDbClient,
} from "@bersoncare/platform-merge";

type EmailAuthStateRow = {
  id: string;
  email_verified: boolean;
  has_password: boolean;
};

function mergeDbClientFromTx(tx: WebappSqlTransactionExecutor): PlatformMergeDbClient {
  return {
    async query<R extends QueryResultRow = QueryResultRow>(queryText: string, values: unknown[] = []) {
      const r = await runWebappPgText<R>(queryText, values, tx);
      return { rows: r.rows, rowCount: r.rowCount };
    },
  };
}

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
  const candidateIds = params.candidateIds?.length ? params.candidateIds : params.rows.map((row) => row.id);
  await upsertOpenConflictLog(getPool(), {
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

async function loadEmailAuthStateRows(emailNormalized: string): Promise<EmailAuthStateRow[]> {
  const r = await runWebappPgText<EmailAuthStateRow>(
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
  return r.rows;
}

async function tryAutoMergeDuplicateEmailUsers(
  emailNormalized: string,
  rows: EmailAuthStateRow[],
): Promise<boolean> {
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
  try {
    await runWebappTransaction(async (tx) => {
      const mergeClient = mergeDbClientFromTx(tx);
      for (const duplicateId of duplicateIds) {
        await mergePlatformUsersInTransaction(mergeClient, targetId, duplicateId, "projection");
      }
    });
    return true;
  } catch (err) {
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
  }
}

export function createPgEmailPasswordLookupPort(): EmailPasswordLookupPort {
  return {
    async resolveAuthState(emailNormalized): Promise<EmailPasswordAuthState> {
      let rows = await loadEmailAuthStateRows(emailNormalized);

      if (rows.length === 0) {
        return { kind: "free" };
      }
      if (rows.length > 1) {
        const merged = await tryAutoMergeDuplicateEmailUsers(emailNormalized, rows);
        if (!merged) {
          return { kind: "email_conflict", candidateIds: rows.map((row) => row.id) };
        }
        rows = await loadEmailAuthStateRows(emailNormalized);
        if (rows.length === 0) return { kind: "free" };
        if (rows.length > 1) {
          return { kind: "email_conflict", candidateIds: rows.map((row) => row.id) };
        }
      }

      const row = rows[0]!;
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
