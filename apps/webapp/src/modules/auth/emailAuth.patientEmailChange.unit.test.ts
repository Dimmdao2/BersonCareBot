import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EmailAuthDbPort,
  EmailChallengePurpose,
  EmailChallengeRow,
} from './emailAuthPort';

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/env')>();
  return {
    ...actual,
    webappRuntimeDatabaseIsConfigured: () => true,
  };
});

import {
  bindEmailAuthDbPort,
  confirmLatestEmailChallengeCodeForUser,
  getPendingEmailChallenge,
  hashEmailChallengeCode,
} from './emailAuth';

const USER_ID = '00000000-0000-4000-8000-000000000201';
const CODE = '421337';
const NOW_SEC = Math.floor(new Date('2026-09-02T02:00:00.000Z').getTime() / 1000);

const patientChange: EmailChallengeRow = {
  id: '00000000-0000-4000-8000-000000000211',
  email: 'patient-new@example.test',
  code_hash: hashEmailChallengeCode(CODE),
  expires_at: String(NOW_SEC + 900),
  attempts: '0',
  purpose: 'patient_email_change',
};

const newerSelfService: EmailChallengeRow = {
  id: '00000000-0000-4000-8000-000000000212',
  email: 'self-service@example.test',
  code_hash: hashEmailChallengeCode('989898'),
  expires_at: String(NOW_SEC + 1200),
  attempts: '0',
  purpose: 'email_verify',
};

type PurposeAwarePendingLookup = (
  userId: string,
  nowSec: number,
  purpose?: EmailChallengePurpose,
) => Promise<EmailChallengeRow | null>;

function unexpected(name: string) {
  return vi.fn(async () => {
    throw new Error(`unexpected call: ${name}`);
  });
}

function dbPort(
  findPending: ReturnType<typeof vi.fn<PurposeAwarePendingLookup>>,
): EmailAuthDbPort {
  return {
    startEmailChallenge: unexpected('startEmailChallenge'),
    findEmailSendCooldown: unexpected('findEmailSendCooldown'),
    deleteEmailChallengesForUser: vi.fn(async () => undefined),
    insertEmailChallenge: unexpected('insertEmailChallenge'),
    deleteEmailChallengeById: vi.fn(async () => undefined),
    upsertEmailSendCooldown: unexpected('upsertEmailSendCooldown'),
    findEmailChallengeForConfirm: unexpected('findEmailChallengeForConfirm'),
    incrementEmailChallengeAttempts: vi.fn(async () => 1),
    findEmailOwnerConflict: unexpected('findEmailOwnerConflict'),
    verifyUserEmail: unexpected('verifyUserEmail'),
    claimVerifiedEmail: vi.fn(async () => ({ ok: true as const, merged: false })),
    findEmailChallengeForConsume: unexpected('findEmailChallengeForConsume'),
    findLatestEmailChallengeForUser: unexpected('findLatestEmailChallengeForUser'),
    findLatestPendingEmailChallengeForUser: findPending,
    findEmailOtpLock: vi.fn(async () => null),
    registerEmailOtpLockout: unexpected('registerEmailOtpLockout'),
    resetEmailOtpLockout: vi.fn(async () => undefined),
  };
}

function competingLookup() {
  return vi.fn<PurposeAwarePendingLookup>(async (userId, _nowSec, purpose) => {
    if (userId !== USER_ID) return null;
    return purpose === 'patient_email_change' ? patientChange : newerSelfService;
  });
}

describe('patient confirmation of a staff-started email change', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_SEC * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('surfaces the latest pending challenge matching user and patient_email_change purpose', async () => {
    const findPending = competingLookup();
    bindEmailAuthDbPort(dbPort(findPending));

    await expect(getPendingEmailChallenge(USER_ID, 'patient_email_change')).resolves.toEqual({
      email: patientChange.email,
      expiresAt: new Date(Number(patientChange.expires_at) * 1000).toISOString(),
    });
  });

  it('confirms the matching patient_email_change even when a newer email_verify challenge exists', async () => {
    const findPending = competingLookup();
    const db = dbPort(findPending);
    bindEmailAuthDbPort(db);

    await expect(
      confirmLatestEmailChallengeCodeForUser(USER_ID, CODE, 'patient_email_change'),
    ).resolves.toEqual({ ok: true });
    expect(db.claimVerifiedEmail).toHaveBeenCalledWith(USER_ID, patientChange.email, undefined);
    expect(db.incrementEmailChallengeAttempts).not.toHaveBeenCalled();
  });

  it('does not claim the target email when the matching challenge receives a wrong code', async () => {
    const findPending = vi.fn<PurposeAwarePendingLookup>(async () => patientChange);
    const db = dbPort(findPending);
    bindEmailAuthDbPort(db);

    await expect(
      confirmLatestEmailChallengeCodeForUser(USER_ID, '000000', 'patient_email_change'),
    ).resolves.toEqual({ ok: false, code: 'invalid_code' });
    expect(db.claimVerifiedEmail).not.toHaveBeenCalled();
    expect(db.incrementEmailChallengeAttempts).toHaveBeenCalledWith(patientChange.id);
  });
});
