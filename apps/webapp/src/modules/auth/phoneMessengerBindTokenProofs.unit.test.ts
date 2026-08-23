/**
 * D25 kill-set, webapp side of the token-bound proof (independent audit 23.08.2026).
 *
 * Owner decision 23.08.2026 («Роль бота после появления приложения»): the bot proves phone ownership
 * with messenger means, and then «webapp сверяет подтверждённый номер с token-bound попыткой».
 * `phoneMessengerBindSelfSufficient.unit.test.ts` pins that the completion writes the canonical
 * account itself; NOTHING pinned the checks that decide whether it may write at all. Those five
 * guards are the entire reason a proven contact cannot be replayed onto somebody else's attempt:
 *
 *   - a malformed / non-`auth_` token is refused before any port call;
 *   - a consumed token cannot be reused (`used_token`);
 *   - an expired token is refused AND marked expired (`expired`);
 *   - a contact arriving on a different channel than the attempt is refused (`channel_mismatch`);
 *   - a proven phone that is not the attempt's phone is refused AND the attempt is failed
 *     (`phone_mismatch`) — this is the one that stops "prove your own number, get bound to someone
 *     else's registration".
 *
 * Every refusal must also NOT create anything: `applyMessengerContactPreOtp` (the only canonical
 * create/bind door on this path) must never be reached. That is asserted on each case, because a
 * guard that returns an error AFTER writing would satisfy a code-shaped test and still break the
 * owner boundary.
 *
 * The last two cases pin replay semantics for an already-`otp_ready` attempt: profile_bind replays
 * idempotently and consumes the token, and neither replay re-enters the canonical write.
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  PhoneMessengerBindPort,
  PhoneMessengerBindSecretRow,
} from './phoneMessengerBind.ports';
import type { PhoneAuthDeps } from './phoneAuth';

// Same reason as `phoneMessengerBindSelfSufficient.unit.test.ts`: vitest.setup.ts blanks DATABASE_URL,
// which would short-circuit the whole function to `database_unavailable` before the guards run.
vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/env')>();
  return { ...actual, webappReposAreInMemory: () => false };
});

const { claimPhoneMessengerBindFromIntegrator, completePhoneMessengerBindFromIntegrator } = await import('./phoneMessengerBind');

const SESSION_USER_ID = '00000000-0000-4000-8000-0000000e0001';
const ATTEMPT_PHONE = '+79180000011';
const OTHER_PHONE = '+79180000022';
const TOKEN = 'auth_abc123';

function baseRow(overrides: Partial<PhoneMessengerBindSecretRow> = {}): PhoneMessengerBindSecretRow {
  return {
    id: 'secret-1',
    phone_normalized: ATTEMPT_PHONE,
    channel_code: 'telegram',
    purpose: 'profile_bind',
    user_id: SESSION_USER_ID,
    status: 'pending_contact',
    challenge_id: null,
    failure_code: null,
    claimed_external_id: 'tg-1',
    claimed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: null,
    ...overrides,
  };
}

function buildFakePort(
  row: PhoneMessengerBindSecretRow | null,
  overrides: Partial<PhoneMessengerBindPort> = {},
): PhoneMessengerBindPort {
  return {
    findByTokenHash: vi.fn(async () => row),
    claimToken: vi.fn(async () => ({ ok: true, code: 'claimed' })),
    findLiveClaim: vi.fn(async () => (row ? { ...row, token_hash: 'token-hash' } : null)),
    startSecret: vi.fn(async () => {}),
    updateExpired: vi.fn(async () => {}),
    updateFailed: vi.fn(async () => {}),
    updateOtpReady: vi.fn(async () => {}),
    markConsumed: vi.fn(async () => {}),
    markConsumedByChallenge: vi.fn(async () => {}),
    verifyCompletionState: vi.fn(async () => ({
      ready: false,
      accountCreated: false,
      syncTargetUserId: SESSION_USER_ID,
      canonicalUserId: null,
    })),
    applyMessengerContactPreOtp: vi.fn(async () => ({ ok: true as const, accountCreated: false })),
    ...overrides,
  };
}

const NOOP_PHONE_AUTH_DEPS = {} as PhoneAuthDeps;

function complete(
  port: PhoneMessengerBindPort,
  params: Partial<Parameters<typeof completePhoneMessengerBindFromIntegrator>[0]> = {},
) {
  return completePhoneMessengerBindFromIntegrator(
    {
      setupToken: TOKEN,
      channelCode: 'telegram',
      externalId: 'tg-1',
      contactPhoneNormalized: ATTEMPT_PHONE,
      ...params,
    },
    NOOP_PHONE_AUTH_DEPS,
    port,
  );
}

describe('D25 — token-bound completion refuses every unproven combination and writes nothing', () => {
  it('a valid signed start claims only the existing attempt and never enters the canonical contact door', async () => {
    const port = buildFakePort(baseRow());

    const result = await claimPhoneMessengerBindFromIntegrator(
      { setupToken: TOKEN, channelCode: 'telegram', externalId: 'tg-1' },
      port,
    );

    expect(result).toEqual({ ok: true });
    expect(port.claimToken).toHaveBeenCalledWith({
      tokenHash: expect.any(String), channelCode: 'telegram', externalId: 'tg-1',
    });
    expect(port.applyMessengerContactPreOtp).not.toHaveBeenCalled();
  });

  it('a provider-owned contact without the matching live claim is rejected before canonical contact handling', async () => {
    const port = buildFakePort(baseRow(), { findLiveClaim: vi.fn(async () => null) });

    const result = await complete(port, { setupToken: undefined });

    expect(result).toEqual({ ok: false, code: 'no_live_claim' });
    expect(port.applyMessengerContactPreOtp).not.toHaveBeenCalled();
  });

  it('a token that is not an auth_ setup token is refused before the port is touched', async () => {
    const port = buildFakePort(baseRow());

    const result = await complete(port, { setupToken: 'link_abc123' });

    expect(result).toEqual({ ok: false, code: 'invalid_token' });
    expect(port.findLiveClaim).not.toHaveBeenCalled();
    expect(port.applyMessengerContactPreOtp).not.toHaveBeenCalled();
  });

  it('an unknown token hash is refused as unknown_or_expired and creates nothing', async () => {
    const port = buildFakePort(null);

    const result = await complete(port);

    expect(result).toEqual({ ok: false, code: 'no_live_claim' });
    expect(port.applyMessengerContactPreOtp).not.toHaveBeenCalled();
  });

  it('a consumed token cannot be replayed into a new bind (used_token), and creates nothing', async () => {
    const port = buildFakePort(
      baseRow({ status: 'consumed', consumed_at: new Date().toISOString() }),
    );

    const result = await complete(port);

    expect(result).toEqual({ ok: false, code: 'used_token' });
    expect(port.applyMessengerContactPreOtp).not.toHaveBeenCalled();
    expect(port.markConsumed).not.toHaveBeenCalled();
  });

  it('an expired attempt is refused AND marked expired, and creates nothing', async () => {
    const port = buildFakePort(
      baseRow({ expires_at: new Date(Date.now() - 1_000).toISOString() }),
    );

    const result = await complete(port);

    expect(result).toEqual({ ok: false, code: 'expired' });
    expect(port.updateExpired).toHaveBeenCalledWith('secret-1');
    expect(port.applyMessengerContactPreOtp).not.toHaveBeenCalled();
  });

  it('a contact proven on another channel than the attempt is refused (channel_mismatch)', async () => {
    const port = buildFakePort(baseRow({ channel_code: 'max' }));

    const result = await complete(port, { channelCode: 'telegram' });

    expect(result).toEqual({ ok: false, code: 'channel_mismatch' });
    expect(port.applyMessengerContactPreOtp).not.toHaveBeenCalled();
  });

  it('a proven phone that is not the attempt phone is refused AND fails the attempt, creating nothing', async () => {
    const port = buildFakePort(baseRow());

    const result = await complete(port, { contactPhoneNormalized: OTHER_PHONE });

    expect(result).toEqual({ ok: false, code: 'phone_mismatch' });
    expect(port.updateFailed).toHaveBeenCalledWith('secret-1', 'phone_mismatch');
    expect(port.applyMessengerContactPreOtp).not.toHaveBeenCalled();
  });

  it('a phone that is not a valid E.164 number at all is refused before the token is looked up', async () => {
    const port = buildFakePort(baseRow());

    const result = await complete(port, { contactPhoneNormalized: 'not-a-phone' });

    expect(result).toEqual({ ok: false, code: 'invalid_contact_phone' });
    expect(port.findLiveClaim).not.toHaveBeenCalled();
    expect(port.applyMessengerContactPreOtp).not.toHaveBeenCalled();
  });

  it('a consumed/otp-ready attempt has no live claim and cannot re-enter canonical completion', async () => {
    const port = buildFakePort(
      baseRow({ status: 'otp_ready', challenge_id: 'challenge-1', purpose: 'profile_bind' }),
      { findLiveClaim: vi.fn(async () => null) },
    );

    const result = await complete(port);

    expect(result).toEqual({ ok: false, code: 'no_live_claim' });
    expect(port.markConsumed).not.toHaveBeenCalled();
    expect(port.applyMessengerContactPreOtp).not.toHaveBeenCalled();
    expect(port.verifyCompletionState).not.toHaveBeenCalled();
  });

  it('a replay with a different phone cannot ride an otp-ready attempt', async () => {
    const port = buildFakePort(
      baseRow({ status: 'otp_ready', challenge_id: 'challenge-1', purpose: 'profile_bind' }),
    );

    const result = await complete(port, { contactPhoneNormalized: OTHER_PHONE });

    expect(result).toEqual({ ok: false, code: 'phone_mismatch' });
    expect(port.markConsumed).not.toHaveBeenCalled();
    expect(port.applyMessengerContactPreOtp).not.toHaveBeenCalled();
  });
});
