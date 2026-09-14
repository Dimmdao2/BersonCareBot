import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

const ISSUE_ROOT =
  'app.issue_login_security_action(uuid,uuid,text,timestamp with time zone)';
const CONSUME_ROOT = 'app.consume_login_security_action(text)';

export const LOGIN_SECURITY_ACTION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function tokenHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export async function issueLoginSecurityAction(input: {
  userId: string;
  sourceLoginEventId: string;
}): Promise<string> {
  const value = randomBytes(32).toString('base64url');
  const hash = tokenHash(value);
  const expiresAt = new Date(Date.now() + LOGIN_SECURITY_ACTION_LIFETIME_MS).toISOString();
  await runWithDbBootstrapPrincipal({ source: 'login-security-action/issue' }, () =>
    runWebappNamedRoot(
      getWebappSqlDb(),
      ISSUE_ROOT,
      [input.userId, input.sourceLoginEventId, hash, expiresAt],
      sql`SELECT app.issue_login_security_action(
        ${input.userId}::uuid,
        ${input.sourceLoginEventId}::uuid,
        ${hash}::text,
        ${expiresAt}::timestamptz
      )`,
    ),
  );
  return value;
}

export type ConsumeLoginSecurityActionResult =
  | { outcome: 'invalid' | 'used' | 'expired' }
  | { outcome: 'consumed'; userId: string; email: string | null; sourceLoginEventId: string };

export async function consumeLoginSecurityAction(
  value: string,
): Promise<ConsumeLoginSecurityActionResult> {
  const hash = tokenHash(value);
  const result = await runWithDbBootstrapPrincipal(
    { source: 'login-security-action/consume' },
    () =>
      runWebappNamedRoot<{
        outcome: 'invalid' | 'used' | 'expired' | 'consumed';
        user_id: string | null;
        email: string | null;
        source_login_event_id: string | null;
      }>(
        getWebappSqlDb(),
        CONSUME_ROOT,
        [hash],
        sql`SELECT outcome, user_id::text, email, source_login_event_id::text
            FROM app.consume_login_security_action(${hash}::text)`,
      ),
  );
  const row = result.rows[0];
  if (!row) return { outcome: 'invalid' };
  if (row.outcome !== 'consumed') return { outcome: row.outcome };
  if (!row.user_id || !row.source_login_event_id) {
    throw new Error('consumed_login_security_action_missing_identity');
  }
  return {
    outcome: 'consumed',
    userId: row.user_id,
    email: row.email,
    sourceLoginEventId: row.source_login_event_id,
  };
}
