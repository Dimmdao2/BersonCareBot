import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumePublicBookingVerification,
  issuePublicBookingVerification,
  PUBLIC_BOOKING_CHALLENGE_TTL_SEC,
} from './publicBookingVerification';
import {
  channelProvesPhoneControl,
  parsePublicBookingIntent,
  PUBLIC_BOOKING_INTENT_VERSION,
  type PublicBookingIntent,
} from './publicBookingIntent';
import type { PublicBookingOtpPort } from './publicBookingOtpPort';
import {
  inMemoryPublicBookingOtpPort,
  resetPublicBookingOtpMemStateForTests,
} from '@/infra/repos/pgPublicBookingOtp';
import { OTP_RESEND_COOLDOWN_SEC } from '@/modules/auth/otpConstants';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '550e8400-e29b-41d4-a716-446655440001';
const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440002';

const intent: PublicBookingIntent = {
  v: PUBLIC_BOOKING_INTENT_VERSION,
  organizationId: ORG_ID,
  branchId: BRANCH_ID,
  serviceId: SERVICE_ID,
  slotStart: '2026-06-01T10:00:00.000Z',
  slotEnd: '2026-06-01T11:00:00.000Z',
  contactName: 'Иван',
  contactPhone: '+79001234567',
};

/**
 * The store side is the in-memory twin of the two SECURITY DEFINER accessors, so these tests
 * exercise the same contract the DB enforces: the code goes IN and never comes back out, and the
 * challenge is spent by the call that accepts it.
 */
function deps() {
  resetPublicBookingOtpMemStateForTests();
  const issued: { challengeId: string; code: string }[] = [];
  const otp: PublicBookingOtpPort = {
    issueChallenge: vi.fn(async (input) => {
      const ok = await inMemoryPublicBookingOtpPort.issueChallenge(input);
      if (ok) issued.push({ challengeId: input.challengeId, code: input.code });
      return ok;
    }),
    consumeChallenge: vi.fn(async (challengeId, code, maxAttempts, lockDurationSec) =>
      inMemoryPublicBookingOtpPort.consumeChallenge(
        challengeId,
        code,
        maxAttempts,
        lockDurationSec,
      ),
    ),
  };
  return {
    otp,
    deliverCode: vi.fn(async () => ({ ok: true })),
    issued,
  };
}

describe('public booking verification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('issues the challenge before it sends, with the shared phone-OTP constants', async () => {
    const d = deps();

    const result = await issuePublicBookingVerification(d, intent);

    expect(result).toMatchObject({ ok: true, expiresInSeconds: PUBLIC_BOOKING_CHALLENGE_TTL_SEC });
    expect(d.otp.issueChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+79001234567',
        ttlSec: PUBLIC_BOOKING_CHALLENGE_TTL_SEC,
        resendCooldownSec: OTP_RESEND_COOLDOWN_SEC,
        deliveryChannel: 'sms',
        intent,
      }),
    );
    // Delivery gets the code; nothing ever reads it back out of the store.
    expect(d.deliverCode).toHaveBeenCalledWith('+79001234567', d.issued[0]!.code);
  });

  it('pins the intent onto the challenge and gets it back verbatim', async () => {
    const d = deps();
    const issued = await issuePublicBookingVerification(d, intent);
    if (!issued.ok) throw new Error('unreachable');

    const consumed = await consumePublicBookingVerification(
      d,
      issued.challengeId,
      d.issued[0]!.code,
    );

    expect(consumed).toMatchObject({ ok: true });
    if (!consumed.ok) throw new Error('unreachable');
    expect(consumed.verified.intent).toEqual(intent);
    expect(consumed.verified.phoneProven).toBe(true);
  });

  it('refuses to normalise an unusable phone before anything is sent', async () => {
    const d = deps();

    const result = await issuePublicBookingVerification(d, { ...intent, contactPhone: 'nope' });

    expect(result).toEqual({ ok: false, code: 'invalid_phone' });
    expect(d.otp.issueChallenge).not.toHaveBeenCalled();
    expect(d.deliverCode).not.toHaveBeenCalled();
  });

  it('collapses a refused issue into the one uniform failure, with no countdown', async () => {
    const d = deps();
    vi.mocked(d.otp.issueChallenge).mockResolvedValueOnce(false);

    const result = await issuePublicBookingVerification(d, intent);

    expect(result).toEqual({ ok: false, code: 'verification_unavailable' });
    expect(d.deliverCode).not.toHaveBeenCalled();
  });

  it('refuses a challenge that carries no booking intent', async () => {
    const d = deps();

    const consumed = await consumePublicBookingVerification(d, 'chal-unknown', '123456');

    expect(consumed).toEqual({ ok: false, code: 'verification_failed' });
  });

  it('refuses a wrong code with the same body as every other failure', async () => {
    const d = deps();
    const issued = await issuePublicBookingVerification(d, intent);
    if (!issued.ok) throw new Error('unreachable');

    const wrong = d.issued[0]!.code === '000000' ? '111111' : '000000';
    expect(await consumePublicBookingVerification(d, issued.challengeId, wrong)).toEqual({
      ok: false,
      code: 'verification_failed',
    });
  });

  it('spends the challenge on success, so the code cannot be replayed', async () => {
    const d = deps();
    const issued = await issuePublicBookingVerification(d, intent);
    if (!issued.ok) throw new Error('unreachable');
    const code = d.issued[0]!.code;

    expect(await consumePublicBookingVerification(d, issued.challengeId, code)).toMatchObject({
      ok: true,
    });
    expect(await consumePublicBookingVerification(d, issued.challengeId, code)).toEqual({
      ok: false,
      code: 'verification_failed',
    });
  });
});

describe('what a delivery channel proves', () => {
  it('only SMS proves control of the phone number', () => {
    expect(channelProvesPhoneControl('sms')).toBe(true);
    for (const other of ['email', 'telegram', 'max', undefined] as const) {
      expect(channelProvesPhoneControl(other)).toBe(false);
    }
  });
});

describe('intent parsing', () => {
  it('accepts a well-formed intent', () => {
    expect(parsePublicBookingIntent(intent)).toEqual(intent);
  });

  it('rejects an intent of an unknown version, so a shape change cannot be replayed', () => {
    expect(parsePublicBookingIntent({ ...intent, v: 99 })).toBeNull();
  });

  it.each([
    ['missing organisation', { ...intent, organizationId: undefined }],
    ['non-uuid branch', { ...intent, branchId: 'not-a-uuid' }],
    ['empty contact name', { ...intent, contactName: '' }],
    ['not an object', 'chal-1'],
    ['null', null],
  ])('rejects %s', (_label, raw) => {
    expect(parsePublicBookingIntent(raw)).toBeNull();
  });
});
