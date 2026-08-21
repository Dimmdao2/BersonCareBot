/**
 * D25 kill-set: "phone-messenger-bind and channel-link give one canonical user/contact/binding,
 * not vызывают integrator identity writer". Before D25, when `verifyCompletionState` reported
 * `ready: false`, `completePhoneMessengerBindFromIntegrator` returned `status: 'phone_sync_required'`
 * and expected the INTEGRATOR to come back with a direct `user.phone.link` write, then call this
 * route a second time. That round-trip is exactly the "webapp decides, integrator only delivers"
 * boundary Р-D25 forbids: it left the canonical phone/binding write partly in the integrator's
 * hands and doubled the number of writes for one logical bind.
 *
 * These tests pin the fixed behavior directly against `completePhoneMessengerBindFromIntegrator`
 * with a fake `PhoneMessengerBindPort`: an unready completion state is resolved IN THIS CALL via
 * `applyMessengerContactPreOtp` (the existing canonical pre-OTP transaction), never surfaced back
 * to the caller as a status requiring another write.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
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

const { completePhoneMessengerBindFromIntegrator } = await import('./phoneMessengerBind');

const SESSION_USER_ID = '00000000-0000-4000-8000-0000000e0001';
const PHONE = '+79180000011';
const FAKE_CLIENT = {} as PoolClient;

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
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: null,
    ...overrides,
  };
}

function buildFakePort(overrides: Partial<PhoneMessengerBindPort> = {}): PhoneMessengerBindPort {
  return {
    findByTokenHash: vi.fn(async () => baseRow()),
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
    withTransaction: vi.fn(async (fn) => fn(FAKE_CLIENT)),
    applyMessengerContactPreOtp: vi.fn(async () => ({ ok: true as const, accountCreated: false })),
    recordMessengerBindBlocked: vi.fn(async () => {}),
    ...overrides,
  };
}

const NOOP_PHONE_AUTH_DEPS = {} as PhoneAuthDeps;

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
      purpose: 'profile_bind',
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

  it('pre-OTP bind reports a merge conflict → fails cleanly (fails the token, records the blocked bind), no partial success', async () => {
    const conflict: PhoneMessengerBindPreOtpFailure = {
      ok: false,
      code: 'merge_blocked_medical_history',
      candidateIds: [SESSION_USER_ID, 'other-user'],
    };
    const port = buildFakePort({
      applyMessengerContactPreOtp: vi.fn(async () => conflict),
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

    expect(result).toEqual({ ok: false, code: 'merge_blocked_medical_history' });
    expect(port.updateFailed).toHaveBeenCalledWith('secret-1', 'merge_blocked_medical_history');
    expect(port.recordMessengerBindBlocked).toHaveBeenCalledWith(
      FAKE_CLIENT,
      expect.objectContaining({
        reason: 'merge_blocked_medical_history',
        candidateIds: [SESSION_USER_ID, 'other-user'],
        channelCode: 'telegram',
        externalId: 'tg-1',
        phoneNormalized: PHONE,
      }),
    );
    expect(port.markConsumed).not.toHaveBeenCalled();
  });
});
