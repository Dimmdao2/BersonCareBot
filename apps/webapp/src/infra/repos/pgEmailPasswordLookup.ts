/**
 * Wave 3 phase 15B — domain SQL via `runWebappPgText`; duplicate-email merge via
 * `runWebappTransaction` + `PlatformMergeDbClient`. `getPool()` only for Class C
 * `upsertOpenConflictLog` in `adminAuditLog` (P14C).
 */
import type { QueryResultRow } from 'pg';
import { sql } from 'drizzle-orm';
import { getPool } from '@/infra/db/client';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
  runWebappSql,
  runWebappTransaction,
  webappSqlFromPgText,
  type WebappSqlTransactionExecutor,
} from '@/infra/db/runWebappSql';
import { upsertOpenConflictLog } from '@/infra/adminAuditLog';
import type { EmailPasswordLookupPort } from '@/modules/auth/emailPasswordLookup/ports';
import type { EmailPasswordAuthState } from '@/modules/auth/emailPasswordLookup/types';
import {
  classifyMergeFailure,
  mergePlatformUsersInTransaction,
  type PlatformMergeDbClient,
} from '@bersoncare/platform-merge';

type EmailAuthStateRow = {
  id: string;
  email_verified: boolean;
  has_password: boolean;
};

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
      const r = await runWebappSql<R>(tx, webappSqlFromPgText(queryText, values));
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
  const candidateIds = params.candidateIds?.length
    ? params.candidateIds
    : params.rows.map((row) => row.id);
  await upsertOpenConflictLog(getPool(), {
    actorId: null,
    action: 'email_auth_conflict',
    candidateIds,
    targetId: params.targetId,
    details: {
      source: 'email_password_lookup',
      emailNormalized: params.emailNormalized,
      reason: params.reason,
      eventType: 'email_auth_conflict',
    },
    status: 'error',
  });
}

/**
 * F6 §2a item 7 (equal-rights login, migration 0342): resolves through
 * `app.find_platform_user_ids_by_any_confirmed_email` so an account is recognized here even when
 * `emailNormalized` is only its confirmed OAuth-linked secondary, not its primary — otherwise
 * register/forgot/setup-access would treat that address as `free` and create a competing account
 * with the same confirmed email. `matched_primary = false` counts as verified: a
 * `user_oauth_bindings` row only ever exists because the provider already vouched for it.
 */
async function loadEmailAuthStateRows(emailNormalized: string): Promise<EmailAuthStateRow[]> {
  const r = await runWebappNamedRoot<EmailAuthStateRow>(
    getWebappSqlDb(),
    'app.pre_session_load_email_auth_state(text)',
    [emailNormalized],
    sql`SELECT state.id::text AS id, state.email_verified, state.has_password
        FROM app.pre_session_load_email_auth_state(${emailNormalized}::text) AS state`,
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
      reason: 'email_conflict_multiple_password_credentials',
    });
    return false;
  }
  const duplicateIds = rows.map((row) => row.id).filter((id) => id !== targetId);
  if (duplicateIds.length === 0) return true;
  try {
    await runWebappTransaction(async (tx) => {
      const mergeClient = mergeDbClientFromTx(tx);
      for (const duplicateId of duplicateIds) {
        await mergePlatformUsersInTransaction(mergeClient, targetId, duplicateId, 'projection', {
          mergeContext: { source: 'email_password_lookup' },
        });
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
        return { kind: 'free' };
      }
      if (rows.length > 1) {
        const merged = await tryAutoMergeDuplicateEmailUsers(emailNormalized, rows);
        if (!merged) {
          return { kind: 'email_conflict', candidateIds: rows.map((row) => row.id) };
        }
        rows = await loadEmailAuthStateRows(emailNormalized);
        if (rows.length === 0) return { kind: 'free' };
        if (rows.length > 1) {
          return { kind: 'email_conflict', candidateIds: rows.map((row) => row.id) };
        }
      }

      const row = rows[0]!;
      if (row.email_verified && row.has_password) {
        return { kind: 'verified_with_password', userId: row.id };
      }
      if (!row.email_verified && row.has_password) {
        return { kind: 'pending_registration', userId: row.id };
      }
      return { kind: 'needs_email_setup', userId: row.id };
    },
  };
}

export const inMemoryEmailPasswordLookupPort: EmailPasswordLookupPort = {
  async resolveAuthState() {
    return { kind: 'free' };
  },
};
