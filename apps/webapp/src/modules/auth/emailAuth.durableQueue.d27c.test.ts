/**
 * D27-C (docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md — D27-C): the DB-backed branch
 * of `startEmailChallenge` must enqueue the auth-code email onto the durable delivery queue
 * instead of awaiting a provider send inline. Proves:
 *  1) the code is enqueued (not sent synchronously) — `EmailSendPort.sendCode` is never called;
 *  2) a successful enqueue keeps the challenge and sets the cooldown, same contract as before;
 *  3) an enqueue failure still folds into `email_send_failed` and deletes the challenge — the
 *     public route's anti-enumeration handling of that code path is untouched by this slice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/env')>();
  return { ...actual, env: { ...actual.env, DATABASE_URL: 'postgres://test/bersoncarebot_test' } };
});

import {
  bindEmailAuthDbPort,
  startEmailChallenge,
  type PendingEmailChallenge,
} from './emailAuth';
import type { EmailAuthDbPort } from './emailAuthPort';
import {
  bindEmailOtpDeliveryQueuePort,
  type EnqueueEmailOtpDeliveryInput,
} from './emailOtpDeliveryQueuePort';
import { bindEmailSendPort, type EmailSendResult } from './emailSendPort';

const USER_ID = '00000000-0000-4000-8000-000000000042';
const EMAIL = 'person@example.test';

function neverCalled(name: string) {
  return vi.fn(async () => {
    throw new Error(`unexpected call: ${name}`);
  });
}

function fakeDbPort(overrides: Partial<EmailAuthDbPort> = {}): EmailAuthDbPort {
  return {
    findEmailSendCooldown: vi.fn(async () => null),
    deleteEmailChallengesForUser: vi.fn(async () => undefined),
    insertEmailChallenge: vi.fn(async () => 'challenge-1'),
    deleteEmailChallengeById: vi.fn(async () => undefined),
    upsertEmailSendCooldown: vi.fn(async () => undefined),
    findEmailChallengeForConfirm: neverCalled('findEmailChallengeForConfirm'),
    incrementEmailChallengeAttempts: neverCalled('incrementEmailChallengeAttempts'),
    findEmailOwnerConflict: neverCalled('findEmailOwnerConflict'),
    verifyUserEmail: neverCalled('verifyUserEmail'),
    claimVerifiedEmail: neverCalled('claimVerifiedEmail'),
    findEmailChallengeForConsume: neverCalled('findEmailChallengeForConsume'),
    findLatestEmailChallengeForUser: neverCalled('findLatestEmailChallengeForUser'),
    findLatestPendingEmailChallengeForUser: vi.fn(async (): Promise<PendingEmailChallenge> => null) as never,
    findEmailOtpLock: vi.fn(async () => null),
    registerEmailOtpLockout: neverCalled('registerEmailOtpLockout'),
    resetEmailOtpLockout: neverCalled('resetEmailOtpLockout'),
    ...overrides,
  };
}

describe('D27-C: startEmailChallenge enqueues onto the durable queue instead of sending inline', () => {
  let sendCode: ReturnType<typeof vi.fn<(to: string, code: string) => Promise<EmailSendResult>>>;

  beforeEach(() => {
    sendCode = vi.fn<(to: string, code: string) => Promise<EmailSendResult>>();
    sendCode.mockImplementation(async () => {
      throw new Error('EmailSendPort.sendCode must never be called from the DB-backed branch');
    });
    bindEmailSendPort({ sendCode });
  });

  it('дано: очередь принимает задание → когда startEmailChallenge → тогда провайдер НЕ вызывается синхронно, challenge и cooldown сохраняются', async () => {
    const db = fakeDbPort();
    bindEmailAuthDbPort(db);
    const enqueue = vi.fn<(input: EnqueueEmailOtpDeliveryInput) => Promise<void>>();
    enqueue.mockResolvedValue(undefined);
    bindEmailOtpDeliveryQueuePort({ enqueue });

    const result = await startEmailChallenge(USER_ID, EMAIL, 'login');

    expect(result).toMatchObject({ ok: true, challengeId: 'challenge-1' });
    expect(sendCode).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'auth-otp:email:challenge-1',
        email: EMAIL,
      }),
    );
    // The raw code is a required part of the enqueue payload (the worker sends it later) but must
    // never be logged or asserted verbatim here beyond confirming it was actually passed through.
    expect(typeof enqueue.mock.calls[0]?.[0]?.code).toBe('string');
    expect(db.deleteEmailChallengeById).not.toHaveBeenCalled();
    expect(db.upsertEmailSendCooldown).toHaveBeenCalledWith(USER_ID, EMAIL);
  });

  it('дано: постановка в очередь падает (например, недоступна БД) → когда startEmailChallenge → тогда challenge удаляется и результат email_send_failed, как и раньше при провале доставки', async () => {
    const db = fakeDbPort();
    bindEmailAuthDbPort(db);
    const enqueue = vi.fn<(input: EnqueueEmailOtpDeliveryInput) => Promise<void>>();
    enqueue.mockImplementation(async () => {
      throw new Error('queue insert failed');
    });
    bindEmailOtpDeliveryQueuePort({ enqueue });

    const result = await startEmailChallenge(USER_ID, EMAIL, 'login');

    expect(result).toEqual({ ok: false, code: 'email_send_failed' });
    expect(sendCode).not.toHaveBeenCalled();
    expect(db.deleteEmailChallengeById).toHaveBeenCalledWith('challenge-1');
    expect(db.upsertEmailSendCooldown).not.toHaveBeenCalled();
  });
});
