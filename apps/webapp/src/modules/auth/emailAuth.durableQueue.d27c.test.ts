/**
 * D27-C (docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md — D27-C): the DB-backed branch
 * of `startEmailChallenge` must enqueue the auth-code email onto the durable delivery queue
 * instead of awaiting a provider send inline. Proves:
 *  1) the code is enqueued (not sent synchronously) — `EmailSendPort.sendCode` is never called;
 *  2) challenge replacement, cooldown and enqueue are one exact DB-root call;
 *  3) a root failure still folds into `email_send_failed` — the
 *     public route's anti-enumeration handling of that code path is untouched by this slice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/env')>();
  return {
    ...actual,
    env: { ...actual.env, DATABASE_URL: 'postgres://test/bersoncarebot_test' },
    webappRuntimeDatabaseIsConfigured: () => true,
  };
});

import {
  bindEmailAuthDbPort,
  startEmailChallenge,
  type PendingEmailChallenge,
} from './emailAuth';
import type { EmailAuthDbPort } from './emailAuthPort';
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
    startEmailChallenge: vi.fn(async () => ({
      challengeId: 'challenge-1',
      retryAfterSeconds: 60,
    })),
    findEmailSendCooldown: vi.fn(async () => null),
    deleteEmailChallengesForUser: vi.fn(async () => undefined),
    insertEmailChallenge: vi.fn(async () => ({
      challengeId: 'challenge-1',
      deliveryToken: 'delivery-token-1',
    })),
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
    const result = await startEmailChallenge(USER_ID, EMAIL, 'login');

    expect(result).toMatchObject({ ok: true, challengeId: 'challenge-1' });
    expect(sendCode).not.toHaveBeenCalled();
    expect(db.startEmailChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        email: EMAIL,
        code: expect.stringMatching(/^\d{6}$/),
        codeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        purpose: 'login',
      }),
    );
    expect(db.insertEmailChallenge).not.toHaveBeenCalled();
  });

  it('дано: постановка в очередь падает (например, недоступна БД) → когда startEmailChallenge → тогда challenge удаляется и результат email_send_failed, как и раньше при провале доставки', async () => {
    const db = fakeDbPort({
      startEmailChallenge: vi.fn(async () => {
        throw new Error('queue insert failed');
      }),
    });
    bindEmailAuthDbPort(db);

    const result = await startEmailChallenge(USER_ID, EMAIL, 'login');

    expect(result).toEqual({ ok: false, code: 'email_send_failed' });
    expect(sendCode).not.toHaveBeenCalled();
    expect(db.startEmailChallenge).toHaveBeenCalledTimes(1);
  });
});
