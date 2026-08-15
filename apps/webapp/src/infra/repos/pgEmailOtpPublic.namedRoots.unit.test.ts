import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: fakes.getWebappSqlDb,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));

import { createPgEmailOtpPublicPort } from './pgEmailOtpPublic';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getWebappSqlDb.mockReturnValue(fakes.db);
});

describe('public email OTP exact pre-session roots', () => {
  it('uses the declared exact capability for every anonymous DB operation', async () => {
    const port = createPgEmailOtpPublicPort();

    fakes.runWebappNamedRoot
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1', was_created: true }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })
      .mockResolvedValueOnce({ rows: [{ ok: true, user_id: 'user-1', was_created: false }] })
      .mockResolvedValueOnce({ rows: [{ ok: true, code: null, user_id: 'user-1', retry_after_seconds: null }] })
      .mockResolvedValueOnce({ rows: [{ last_sent_at: '2026-08-15T14:00:00.000Z' }] });

    await expect(port.findOrCreatePublicEmailUser('person@example.test')).resolves.toEqual({
      userId: 'user-1',
      wasCreated: true,
    });
    await expect(port.findPublicEmailUser('person@example.test')).resolves.toEqual({ userId: 'user-1' });
    await expect(port.registerPublicEmailPatient({
      emailNormalized: 'person@example.test',
      lastName: 'Berson',
      firstName: 'Dmitry',
      patronymic: null,
    })).resolves.toEqual({ ok: true, userId: 'user-1', wasCreated: false });
    await expect(port.consumeLatestEmailChallenge('person@example.test', 'hash')).resolves.toEqual({
      ok: true,
      userId: 'user-1',
    });
    await expect(port.findEmailSendCooldownByEmail('person@example.test')).resolves.toEqual(
      new Date('2026-08-15T14:00:00.000Z'),
    );

    const roots = fakes.runWebappNamedRoot.mock.calls.map((call) => ({
      db: call[0],
      identity: call[1],
      args: call[2],
    }));
    expect(roots).toEqual([
      {
        db: fakes.db,
        identity: 'app.email_otp_public_find_or_create_user(text)',
        args: ['person@example.test'],
      },
      {
        db: fakes.db,
        identity: 'app.email_otp_public_find_user_by_email(text)',
        args: ['person@example.test'],
      },
      {
        db: fakes.db,
        identity: 'app.email_otp_public_register_patient(text,text,text,text)',
        args: ['person@example.test', 'Berson', 'Dmitry', null],
      },
      {
        db: fakes.db,
        identity: 'app.email_otp_public_consume_latest_challenge(text,text)',
        args: ['person@example.test', 'hash'],
      },
      {
        db: fakes.db,
        identity: 'app.email_otp_public_find_email_send_cooldown_by_email(text)',
        args: ['person@example.test'],
      },
    ]);
  });
});
