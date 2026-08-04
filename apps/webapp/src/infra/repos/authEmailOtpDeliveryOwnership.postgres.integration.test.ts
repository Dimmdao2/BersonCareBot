/**
 * D27-C, fix round 3 (audit d27c-fix2-audit-20260804 FAIL): `app.email_auth_enqueue_otp_delivery`
 * and `app.email_auth_set_email_challenge_delivery_code` are both reachable by `app_patient` -- the
 * SAME shared DB role every anonymous public login request runs under after `SET ROLE` (see 0360's
 * header). Round 2 (migration 0369, ex-0363) stopped a caller from injecting arbitrary message
 * content, but neither accessor checked that the caller was the request that created the challenge
 * it names. The audit's live PoC, run as `app_patient` against a challenge_id it did not mint:
 *
 *   SELECT app.email_auth_enqueue_otp_delivery('<victim challenge_id>'::uuid);
 *     -> forced a second send of the victim's already-composed code
 *   SELECT app.email_auth_set_email_challenge_delivery_code('<victim challenge_id>'::uuid, '000777');
 *   SELECT app.email_auth_enqueue_otp_delivery('<victim challenge_id>'::uuid);
 *     -> victim received "Ваш код BersonCare: 000777" -- attacker-chosen code, real send
 *
 * Migration 0370 adds a one-shot ownership token (`delivery_token`, guarded by the permanent
 * `delivery_claimed_at` marker) that both accessors now require. This suite:
 *  1) replays both attacks verbatim as `app_patient` and proves each is refused;
 *  2) proves the legitimate chain (insert -> purpose -> claim delivery code -> enqueue with the
 *     token it minted) still reaches a real `pending` row on `outgoing_delivery_queue`, entirely
 *     under `app_patient` -- the same role/privilege shape the public login route runs under.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { getPool } from '@/infra/db/client';
import { getWebappSqlFromPgClient, runWebappPgText } from '@/infra/db/runWebappSql';

const RUNTIME_ROLE = 'app_patient';

function errorMessages(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return `${error.message} ${error.cause === undefined ? '' : errorMessages(error.cause)}`;
}

describe('D27-C fix round 3: email OTP delivery accessors enforce challenge ownership', () => {
  const pool = getPool();
  let client: PoolClient;
  const createdUserIds: string[] = [];
  const futureExpiresAt = Math.floor(Date.now() / 1000) + 600;

  async function run<T = unknown>(queryText: string, values: readonly unknown[] = []) {
    return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client));
  }

  async function asRuntimeRole<T>(fn: () => Promise<T>): Promise<T> {
    await run(`SET ROLE ${RUNTIME_ROLE}`);
    try {
      return await fn();
    } finally {
      await run('RESET ROLE');
    }
  }

  /**
   * A distinct user (and thus a distinct email) per test: email_auth_enqueue_otp_delivery's 60s
   * function-level resend cooldown (email_send_cooldowns, keyed by user_id+email) is shared state --
   * reusing one user across tests in the same run would make later "legit send" assertions flake on
   * that unrelated throttle instead of exercising the ownership check this suite targets.
   */
  async function mintUser(): Promise<{ userId: string; emailNormalized: string }> {
    const userId = randomUUID();
    const emailNormalized = `d27c-ownership-${userId}@example.com`;
    await run(
      `INSERT INTO public.platform_users (id, email, email_normalized, role)
       VALUES ($1::uuid, $2, $2, 'client')`,
      [userId, emailNormalized],
    );
    createdUserIds.push(userId);
    return { userId, emailNormalized };
  }

  /** Mirrors insertEmailChallenge (pgEmailAuth.ts): insert -> stamp purpose -> claim delivery code. */
  async function mintClaimedChallenge(
    userId: string,
    emailNormalized: string,
    code: string,
  ): Promise<{ challengeId: string; deliveryToken: string }> {
    return asRuntimeRole(async () => {
      const ins = await run<{ id: string }>(
        `SELECT app.email_auth_insert_email_challenge($1::uuid, $2, $3, $4::bigint)::text AS id`,
        [userId, emailNormalized, 'irrelevant-code-hash', futureExpiresAt],
      );
      const challengeId = ins.rows[0]!.id;
      await run('SELECT app.email_auth_set_email_challenge_purpose($1::uuid, $2)', [
        challengeId,
        'login',
      ]);
      const claim = await run<{ delivery_token: string }>(
        'SELECT app.email_auth_set_email_challenge_delivery_code($1::uuid, $2) AS delivery_token',
        [challengeId, code],
      );
      return { challengeId, deliveryToken: claim.rows[0]!.delivery_token };
    });
  }

  beforeAll(async () => {
    client = await pool.connect();
    const database = await run<{ name: string }>('SELECT current_database() AS name');
    expect(database.rows[0]?.name).toMatch(/^pbt_/);

    const roleHasChallengeGrant = await run<{ has: boolean }>(
      `SELECT has_function_privilege($1, 'app.email_auth_enqueue_otp_delivery(uuid,uuid)', 'EXECUTE') AS has`,
      [RUNTIME_ROLE],
    );
    expect(roleHasChallengeGrant.rows[0]?.has).toBe(true);

    // Pre-existing disposable-postgres harness gap, unrelated to this fix (confirmed: the SAME
    // "permission denied for table email_challenges" reproduces against the unmodified 0369
    // accessor too): `GRANT SELECT, UPDATE, DELETE ON TABLE public.email_challenges TO app_owner`
    // lives in the deploy/postgres/*.sql TEST/PROD overlay set, which this harness never applies --
    // it only restores the a0-greenfield baseline dump + the drizzle migration chain (see
    // buildTemplateDatabase's header in scripts/postgres-integration/harness-lib.ts). Every real
    // environment (dev/TEST/PROD) already carries this grant via that overlay; restoring it here
    // just makes the harness match that reality for this test.
    await run('GRANT SELECT, UPDATE, DELETE ON TABLE public.email_challenges TO app_owner');
  });

  afterAll(async () => {
    await run('RESET ROLE');
    await run("DELETE FROM public.outgoing_delivery_queue WHERE event_id LIKE 'auth-otp:email:%'");
    for (const userId of createdUserIds) {
      await run('DELETE FROM public.email_send_cooldowns WHERE user_id = $1::uuid', [userId]);
      await run('DELETE FROM public.email_challenges WHERE user_id = $1::uuid', [userId]);
      await run('DELETE FROM public.platform_users WHERE id = $1::uuid', [userId]);
    }
    client.release();
    await pool.end();
  });

  it('audit attack 1 verbatim: a bare challenge_id (no token) can no longer force a send', async () => {
    const { userId, emailNormalized } = await mintUser();
    const { challengeId, deliveryToken } = await mintClaimedChallenge(
      userId,
      emailNormalized,
      '654321',
    );

    // Legitimate enqueue with the real token succeeds first, exactly like startEmailChallenge.
    const legit = await asRuntimeRole(() =>
      run<{ email_auth_enqueue_otp_delivery: boolean }>(
        'SELECT app.email_auth_enqueue_otp_delivery($1::uuid, $2::uuid)',
        [challengeId, deliveryToken],
      ),
    );
    expect(legit.rows[0]?.email_auth_enqueue_otp_delivery).toBe(true);

    // Audit's exact call shape, from the same shared app_patient role, replaying the challenge_id
    // alone against a guessed/attacker-supplied token it never held.
    const forcedResend = await asRuntimeRole(() =>
      run<{ email_auth_enqueue_otp_delivery: boolean }>(
        'SELECT app.email_auth_enqueue_otp_delivery($1::uuid, $2::uuid)',
        [challengeId, randomUUID()],
      ),
    );
    expect(forcedResend.rows[0]?.email_auth_enqueue_otp_delivery).toBe(false);

    // Only ONE row was ever queued for this challenge -- the forced-resend attempt inserted nothing.
    const queued = await run<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.outgoing_delivery_queue WHERE event_id = $1",
      [`auth-otp:email:${challengeId}`],
    );
    expect(queued.rows[0]?.count).toBe('1');
  });

  it('a stranger who never claimed the row cannot enqueue it at all (unknown/absent token)', async () => {
    const { userId, emailNormalized } = await mintUser();
    const { challengeId } = await mintClaimedChallenge(userId, emailNormalized, '111222');

    const strangerEnqueue = await asRuntimeRole(() =>
      run<{ email_auth_enqueue_otp_delivery: boolean }>(
        'SELECT app.email_auth_enqueue_otp_delivery($1::uuid, $2::uuid)',
        [challengeId, randomUUID()],
      ),
    );
    expect(strangerEnqueue.rows[0]?.email_auth_enqueue_otp_delivery).toBe(false);

    const queued = await run<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.outgoing_delivery_queue WHERE event_id = $1",
      [`auth-otp:email:${challengeId}`],
    );
    expect(queued.rows[0]?.count).toBe('0');
  });

  it('audit attack 2 verbatim: overwriting a victim\'s pending code is refused, code stays the real one', async () => {
    const { userId, emailNormalized } = await mintUser();
    const { challengeId, deliveryToken } = await mintClaimedChallenge(
      userId,
      emailNormalized,
      '222333',
    );

    // Audit's exact second call: attacker tries to stamp their own chosen code onto the victim's
    // already-claimed challenge.
    await expect(
      asRuntimeRole(() =>
        run('SELECT app.email_auth_set_email_challenge_delivery_code($1::uuid, $2)', [
          challengeId,
          '000777',
        ]),
      ),
    ).rejects.toSatisfy((error: unknown) =>
      /already claimed/.test(errorMessages(error)),
    );

    // The stored plaintext is still the legitimate one, not the attacker's 000777.
    const row = await run<{ pending_delivery_code: string | null }>(
      'SELECT pending_delivery_code FROM public.email_challenges WHERE id = $1::uuid',
      [challengeId],
    );
    expect(row.rows[0]?.pending_delivery_code).toBe('222333');

    // The legitimate token still enqueues the REAL code, not the attacker's.
    const legit = await asRuntimeRole(() =>
      run<{ email_auth_enqueue_otp_delivery: boolean }>(
        'SELECT app.email_auth_enqueue_otp_delivery($1::uuid, $2::uuid)',
        [challengeId, deliveryToken],
      ),
    );
    expect(legit.rows[0]?.email_auth_enqueue_otp_delivery).toBe(true);
    const queuedRow = await run<{ payload_json: { intent: { payload: { message: { text: string } } } } }>(
      "SELECT payload_json FROM public.outgoing_delivery_queue WHERE event_id = $1",
      [`auth-otp:email:${challengeId}`],
    );
    expect(queuedRow.rows[0]?.payload_json.intent.payload.message.text).toBe(
      'Ваш код BersonCare: 222333',
    );
  });

  it('a claim cannot be reopened after the challenge has already been sent (delivery_claimed_at survives the send)', async () => {
    const { userId, emailNormalized } = await mintUser();
    const { challengeId, deliveryToken } = await mintClaimedChallenge(
      userId,
      emailNormalized,
      '333444',
    );
    const sent = await asRuntimeRole(() =>
      run<{ email_auth_enqueue_otp_delivery: boolean }>(
        'SELECT app.email_auth_enqueue_otp_delivery($1::uuid, $2::uuid)',
        [challengeId, deliveryToken],
      ),
    );
    expect(sent.rows[0]?.email_auth_enqueue_otp_delivery).toBe(true);

    // pending_delivery_code/delivery_token are NULL again post-send -- proves the guard is not
    // accidentally relying on those two columns still being non-null.
    const postSend = await run<{ pending_delivery_code: string | null; delivery_token: string | null }>(
      'SELECT pending_delivery_code, delivery_token FROM public.email_challenges WHERE id = $1::uuid',
      [challengeId],
    );
    expect(postSend.rows[0]).toEqual({ pending_delivery_code: null, delivery_token: null });

    await expect(
      asRuntimeRole(() =>
        run('SELECT app.email_auth_set_email_challenge_delivery_code($1::uuid, $2)', [
          challengeId,
          '000777',
        ]),
      ),
    ).rejects.toSatisfy((error: unknown) => /already claimed/.test(errorMessages(error)));
  });

  it('golden path under app_patient: insert -> purpose -> claim -> enqueue reaches a real pending queue row', async () => {
    const { userId, emailNormalized } = await mintUser();
    const { challengeId, deliveryToken } = await mintClaimedChallenge(
      userId,
      emailNormalized,
      '999000',
    );
    expect(challengeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(deliveryToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(deliveryToken).not.toBe(challengeId);

    const enqueued = await asRuntimeRole(() =>
      run<{ email_auth_enqueue_otp_delivery: boolean }>(
        'SELECT app.email_auth_enqueue_otp_delivery($1::uuid, $2::uuid)',
        [challengeId, deliveryToken],
      ),
    );
    expect(enqueued.rows[0]?.email_auth_enqueue_otp_delivery).toBe(true);

    const row = await run<{
      status: string;
      kind: string;
      channel: string;
      payload_json: { intent: { payload: { recipient: { email: string }; message: { text: string } } } };
    }>(
      `SELECT status, kind, channel, payload_json FROM public.outgoing_delivery_queue WHERE event_id = $1`,
      [`auth-otp:email:${challengeId}`],
    );
    expect(row.rows[0]).toMatchObject({ status: 'pending', kind: 'auth_email_otp', channel: 'email' });
    expect(row.rows[0]?.payload_json.intent.payload.recipient.email).toBe(emailNormalized);
    expect(row.rows[0]?.payload_json.intent.payload.message.text).toBe('Ваш код BersonCare: 999000');
  });
});
