/**
 * Domain SQL as typed Drizzle fragments; duplicate-email merge via `runWebappTransaction` +
 * `PlatformMergeDbClient`. `getPool()` only for Class C `upsertOpenConflictLog` in `adminAuditLog`.
 */
import { sql } from 'drizzle-orm';
import { getPool } from '@/infra/db/client';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
  runWebappSql,
} from '@/infra/db/runWebappSql';
import { upsertOpenConflictLog } from '@/infra/adminAuditLog';
import type { EmailPasswordLookupPort } from '@/modules/auth/emailPasswordLookup/ports';
import type { EmailPasswordAuthState } from '@/modules/auth/emailPasswordLookup/types';
import { classifyMergeFailure } from '@bersoncare/platform-merge';

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
  const candidateIds = rows.map((row) => row.id);
  await recordEmailAuthConflict({
    emailNormalized,
    rows,
    targetId,
    reason: 'human_account_confirmation_required',
    candidateIds,
  });
  return false;
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
