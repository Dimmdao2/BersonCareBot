/**
 * Owner report 2026-08-04: "вход не работает ни по почте, ни по телефону". Two independent live-TEST
 * findings, both the same failure shape -- a pre-session (bootstrap) DB role hitting a schema-`app`
 * accessor that cannot see its own target row:
 *
 * 1. `app.email_otp_public_find_user_by_email` (and 14 siblings) were owned by the migrator role,
 *    not `app_owner`. Under `platform_users` FORCE RLS, a SECURITY DEFINER function's effective
 *    privileges are its OWNER's -- the migrator is not a member of `app_identity_bootstrap` (the
 *    role the `platform_users_identity_bootstrap_select` policy checks), so the function silently
 *    returned zero rows for a real address. Fixed by migration 0356 (`ALTER FUNCTION ... OWNER TO
 *    app_owner`, the same idiom as this table's other 24 `app_owner`-owned accessors).
 * 2. Phone login's automatic-channel resolution issued a direct `SELECT ... FROM
 *    user_channel_preferences`, which the pre-session bootstrap login has no table grant for --
 *    `permission denied for table user_channel_preferences` (42501), reproduced live 2026-08-04
 *    03:59:18. Fixed by migration 0357: a narrow `app_owner`-owned SECURITY DEFINER accessor,
 *    `app.get_preferred_auth_channel_code(uuid)`.
 *
 * This proves both fixes directly against real PostgreSQL, at the same "SET ROLE to a narrow probe,
 * exercise it" level `saasBillingWebhookBootstrapInvoiceResolver.postgres.integration.test.ts` uses.
 * `app_config_reader` stands in for the real bootstrap login: a real, pre-existing NOLOGIN role this
 * harness provisions with zero relationship to `platform_users`/`user_channel_preferences` anywhere
 * in the migration chain, so temporarily handing it ONLY the two accessors' EXECUTE reproduces the
 * bootstrap login's exact privilege shape. The plain table reads both bugs originally hit stay
 * denied under the same role throughout -- proof the fix is the two narrow accessors, not a widened
 * table grant.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { getPool } from '@/infra/db/client';
import { getWebappSqlFromPgClient, runWebappPgText } from '@/infra/db/runWebappSql';

const PROBE_ROLE = 'app_config_reader';

const userId = randomUUID();
const emailNormalized = `login-fix-probe-${randomUUID()}@example.com`;

function errorMessages(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return `${error.message} ${error.cause === undefined ? '' : errorMessages(error.cause)}`;
}

describe('login-fix bootstrap definer accessors (2026-08-04)', () => {
  const pool = getPool();
  let client: PoolClient;

  async function run<T = unknown>(queryText: string, values: readonly unknown[] = []) {
    return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client));
  }

  beforeAll(async () => {
    client = await pool.connect();
    const database = await run<{ name: string }>('SELECT current_database() AS name');
    expect(database.rows[0]?.name).toMatch(/^pbt_/);

    const probeExists = await run<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists`,
      [PROBE_ROLE],
    );
    expect(probeExists.rows[0]?.exists).toBe(true);
    const probeHasPlatformUsersAccess = await run<{ has: boolean }>(
      `SELECT has_table_privilege($1, 'public.platform_users', 'SELECT') AS has`,
      [PROBE_ROLE],
    );
    expect(probeHasPlatformUsersAccess.rows[0]?.has).toBe(false);
    const probeHasChannelPrefsAccess = await run<{ has: boolean }>(
      `SELECT has_table_privilege($1, 'public.user_channel_preferences', 'SELECT') AS has`,
      [PROBE_ROLE],
    );
    expect(probeHasChannelPrefsAccess.rows[0]?.has).toBe(false);

    await run(
      `INSERT INTO public.platform_users (id, email, email_normalized, role)
       VALUES ($1::uuid, $2, $2, 'client')`,
      [userId, emailNormalized],
    );
    await run(
      `INSERT INTO public.user_channel_preferences (
         user_id, platform_user_id, channel_code, is_preferred_for_auth
       ) VALUES ($1::text, $1::uuid, 'telegram', true)`,
      [userId],
    );

    await run(
      `GRANT EXECUTE ON FUNCTION app.email_otp_public_find_user_by_email(text) TO ${PROBE_ROLE}`,
    );
    await run(
      `GRANT EXECUTE ON FUNCTION app.get_preferred_auth_channel_code(uuid) TO ${PROBE_ROLE}`,
    );
  });

  afterAll(async () => {
    await run('RESET ROLE');
    await run(
      `REVOKE EXECUTE ON FUNCTION app.email_otp_public_find_user_by_email(text) FROM ${PROBE_ROLE}`,
    );
    await run(
      `REVOKE EXECUTE ON FUNCTION app.get_preferred_auth_channel_code(uuid) FROM ${PROBE_ROLE}`,
    );
    await run('DELETE FROM public.user_channel_preferences WHERE platform_user_id = $1::uuid', [
      userId,
    ]);
    await run('DELETE FROM public.platform_users WHERE id = $1::uuid', [userId]);
    client.release();
    await pool.end();
  });

  it('denies the plain platform_users read under this role', async () => {
    await run(`SET ROLE ${PROBE_ROLE}`);
    try {
      await expect(
        run('SELECT * FROM public.platform_users LIMIT 1'),
      ).rejects.toSatisfy((error: unknown) => /permission denied/.test(errorMessages(error)));
    } finally {
      await run('RESET ROLE');
    }
  });

  it('denies the plain user_channel_preferences read under this role', async () => {
    await run(`SET ROLE ${PROBE_ROLE}`);
    try {
      await expect(
        run('SELECT * FROM public.user_channel_preferences LIMIT 1'),
      ).rejects.toSatisfy((error: unknown) => /permission denied/.test(errorMessages(error)));
    } finally {
      await run('RESET ROLE');
    }
  });

  it('finds the exact user by email through the narrow accessor without raising 42501', async () => {
    await run(`SET ROLE ${PROBE_ROLE}`);
    try {
      const resolved = await run<{ user_id: string }>(
        `SELECT * FROM app.email_otp_public_find_user_by_email($1::text)`,
        [emailNormalized],
      );
      expect(resolved.rows).toEqual([{ user_id: userId }]);
    } finally {
      await run('RESET ROLE');
    }
  });

  it('returns no rows (not an error) for an unknown email', async () => {
    await run(`SET ROLE ${PROBE_ROLE}`);
    try {
      const resolved = await run(
        `SELECT * FROM app.email_otp_public_find_user_by_email($1::text)`,
        ['does-not-exist@example.com'],
      );
      expect(resolved.rows).toEqual([]);
    } finally {
      await run('RESET ROLE');
    }
  });

  it('resolves the preferred auth channel through the narrow accessor without raising 42501', async () => {
    await run(`SET ROLE ${PROBE_ROLE}`);
    try {
      const resolved = await run<{ get_preferred_auth_channel_code: string | null }>(
        `SELECT app.get_preferred_auth_channel_code($1::uuid)`,
        [userId],
      );
      expect(resolved.rows).toEqual([{ get_preferred_auth_channel_code: 'telegram' }]);
    } finally {
      await run('RESET ROLE');
    }
  });

  it('returns null (not an error) for a user with no preferred auth channel', async () => {
    await run(`SET ROLE ${PROBE_ROLE}`);
    try {
      const resolved = await run<{ get_preferred_auth_channel_code: string | null }>(
        `SELECT app.get_preferred_auth_channel_code($1::uuid)`,
        [randomUUID()],
      );
      expect(resolved.rows).toEqual([{ get_preferred_auth_channel_code: null }]);
    } finally {
      await run('RESET ROLE');
    }
  });
});
