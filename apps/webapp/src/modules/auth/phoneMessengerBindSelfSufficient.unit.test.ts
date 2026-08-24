/**
 * D25 kill-set: "phone-messenger-bind and channel-link give one canonical user/contact/binding,
 * not vызывают integrator identity writer". Before D25, when `verifyCompletionState` reported
 * `ready: false`, `completePhoneMessengerBindFromIntegrator` returned `status: 'phone_sync_required'`
 * and expected the INTEGRATOR to come back with a direct `user.phone.link` write, then call this
 * route a second time. That round-trip is exactly the "webapp decides, integrator only delivers"
 * boundary Р-D25 forbids: it left the canonical phone/binding write partly in the integrator's
 * hands and doubled the number of writes for one logical bind.
 *
 * These tests pin the fixed behavior directly against `completePhoneMessengerBindFromIntegrator`:
 * authenticated profile binding stays self-contained, while login completion only proves the
 * phone and creates a challenge. Account creation is deferred to the browser finish.
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  PhoneMessengerBindPort,
  PhoneMessengerBindPreOtpFailure,
  PhoneMessengerBindSecretRow,
} from './phoneMessengerBind.ports';
import type { PhoneAuthDeps } from './phoneAuth';

// `completePhoneMessengerBindFromIntegrator` short-circuits to `database_unavailable` whenever
// `webappReposAreInMemory()` is true, which vitest.setup.ts forces by blanking DATABASE_URL —
// independent of any bindPort passed in. Stub it to `false` so the injected fake port below is
// actually exercised instead of being short-circuited past.
vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/env')>();
  return { ...actual, webappReposAreInMemory: () => false };
});
vi.mock('./phoneOtpLimits', () => ({
  assertPhoneCanStartChallenge: vi.fn(async () => ({ ok: true as const })),
}));

const { completePhoneMessengerBindFromIntegrator } = await import('./phoneMessengerBind');

const SESSION_USER_ID = '00000000-0000-4000-8000-0000000e0001';
const PHONE = '+79180000011';

function baseRow(overrides: Partial<PhoneMessengerBindSecretRow> = {}): PhoneMessengerBindSecretRow {
  return {
    id: 'secret-1',
    phone_normalized: PHONE,
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

function buildFakePort(overrides: Partial<PhoneMessengerBindPort> = {}): PhoneMessengerBindPort {
  return {
    findByTokenHash: vi.fn(async () => baseRow()),
    claimToken: vi.fn(async () => ({ ok: true, code: 'claimed' })),
    findLiveClaim: vi.fn(async () => ({ ...baseRow(), token_hash: 'token-hash' })),
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

function phoneAuthDepsForChallenge(set: PhoneAuthDeps['challengeStore']['set']): PhoneAuthDeps {
  return {
    challengeStore: {
      set,
      get: vi.fn(async () => null),
      delete: vi.fn(async () => {}),
      deleteByPhone: vi.fn(async () => {}),
      incrementVerifyAttempts: vi.fn(async () => null),
    },
    smsPort: {
      sendCode: vi.fn(async () => ({ ok: false as const, code: 'delivery_failed' as const })),
      verifyCode: vi.fn(async () => ({ ok: false as const, code: 'expired_code' as const })),
    },
    userByPhonePort: {} as PhoneAuthDeps['userByPhonePort'],
  };
}

describe('D25 — phone-messenger-bind/complete is self-sufficient (no phone_sync_required round-trip)', () => {
  it('unready completion state → applies the canonical pre-OTP bind itself and succeeds, with no status field in the result', async () => {
    const port = buildFakePort();

    const result = await completePhoneMessengerBindFromIntegrator(
      {
        setupToken: 'auth_abc123',
        channelCode: 'telegram',
        externalId: 'tg-1',
        contactPhoneNormalized: PHONE,
      },
      NOOP_PHONE_AUTH_DEPS,
      port,
    );

    expect(port.applyMessengerContactPreOtp).toHaveBeenCalledWith({
      phoneNormalized: PHONE,
      channelCode: 'telegram',
      externalId: 'tg-1',
      sessionUserId: SESSION_USER_ID,
    });
    expect(result).toEqual({ ok: true, purpose: 'profile_bind' });
    expect(result).not.toHaveProperty('status');
    expect(port.markConsumed).toHaveBeenCalledWith('secret-1');
  });

  it('already-ready completion state → does NOT call applyMessengerContactPreOtp (no redundant write)', async () => {
    const port = buildFakePort({
      verifyCompletionState: vi.fn(async () => ({
        ready: true,
        accountCreated: false,
        syncTargetUserId: null,
        canonicalUserId: SESSION_USER_ID,
      })),
    });

    const result = await completePhoneMessengerBindFromIntegrator(
      {
        setupToken: 'auth_abc123',
        channelCode: 'telegram',
        externalId: 'tg-1',
        contactPhoneNormalized: PHONE,
      },
      NOOP_PHONE_AUTH_DEPS,
      port,
    );

    expect(port.applyMessengerContactPreOtp).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, purpose: 'profile_bind' });
  });

  it('pre-OTP bind reports a merge conflict → fails cleanly (fails the token), no partial success, no caller-side transaction', async () => {
    // D15b/6 conflict-audit correction: the durable `messenger_phone_bind_blocked` audit case is now
    // produced by `applyMessengerContactPreOtp` itself (the exact `pre_session_messenger_channel_
    // resolve` operation), atomically with the conflict decision — see
    // `d15b6PhoneMessengerBindMirror.unit.test.ts` for that behavior. This caller has no `withTransaction`/
    // `recordMessengerBindBlocked` on the port to attempt (removed) and must not reintroduce one.
    const conflict: PhoneMessengerBindPreOtpFailure = {
      ok: false,
      code: 'merge_blocked_medical_history',
      candidateIds: [SESSION_USER_ID, 'other-user'],
    };
    const port = buildFakePort({
      applyMessengerContactPreOtp: vi.fn(async () => conflict),
    });
    expect(port).not.toHaveProperty('withTransaction');
    expect(port).not.toHaveProperty('recordMessengerBindBlocked');

    const result = await completePhoneMessengerBindFromIntegrator(
      {
        setupToken: 'auth_abc123',
        channelCode: 'telegram',
        externalId: 'tg-1',
        contactPhoneNormalized: PHONE,
      },
      NOOP_PHONE_AUTH_DEPS,
      port,
    );

    expect(result).toEqual({ ok: false, code: 'merge_blocked_medical_history' });
    expect(port.updateFailed).toHaveBeenCalledWith('secret-1', 'merge_blocked_medical_history');
    expect(port.markConsumed).not.toHaveBeenCalled();
  });

  it('login contact proof creates only the OTP challenge and never creates or binds an account', async () => {
    const row = baseRow({ purpose: 'login', user_id: null });
    const port = buildFakePort({
      findLiveClaim: vi.fn(async () => ({ ...row, token_hash: 'token-hash' })),
    });
    const setChallenge = vi.fn(async () => {});

    const result = await completePhoneMessengerBindFromIntegrator(
      {
        setupToken: 'auth_abc123',
        channelCode: 'telegram',
        externalId: 'tg-1',
        contactPhoneNormalized: PHONE,
      },
      phoneAuthDepsForChallenge(setChallenge),
      port,
    );

    expect(port.applyMessengerContactPreOtp).not.toHaveBeenCalled();
    expect(setChallenge).toHaveBeenCalledOnce();
    expect(port.updateOtpReady).toHaveBeenCalledWith('secret-1', expect.any(String));
    expect(result).toMatchObject({ ok: true, purpose: 'login', accountCreated: false });
  });
});
