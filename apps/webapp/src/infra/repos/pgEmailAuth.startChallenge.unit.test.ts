import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
  runWebappTransaction: vi.fn(),
  webappSqlFromPgText: vi.fn(() => ({ kind: 'sql-fragment' })),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: fakes.getWebappSqlDb,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappTransaction: fakes.runWebappTransaction,
  webappSqlFromPgText: fakes.webappSqlFromPgText,
}));

import { drizzleSqlFragmentToPgQuery } from '@/infra/db/drizzleSqlDebugText';
import { startEmailChallengeInDb } from './pgEmailAuth';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getWebappSqlDb.mockReturnValue(fakes.db);
});

describe('email challenge exact pre-session root', () => {
  it('binds challenge replacement and durable enqueue to one named capability', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{ challenge_id: 'challenge-1', retry_after_seconds: '60' }],
    });

    const params = {
      userId: '00000000-0000-4000-8000-000000000042',
      email: 'person@example.test',
      codeHash: 'a'.repeat(64),
      expiresAt: 1_800_000_000,
      purpose: 'password_reset' as const,
      code: '123456',
      mailProfile: { kind: 'platform', senderDisplayName: 'Therapysto' } as const,
    };
    await expect(startEmailChallengeInDb(params)).resolves.toEqual({
      challengeId: 'challenge-1',
      retryAfterSeconds: 60,
    });

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
    const [db, identity, args, fragment] = fakes.runWebappNamedRoot.mock.calls[0] as unknown[];
    expect(db).toBe(fakes.db);
    expect(identity).toBe(
      'app.email_auth_start_challenge(uuid,text,text,bigint,text,text,text,text,uuid,text,text)',
    );
    const expectedArgs = [
      params.userId,
      params.email,
      params.codeHash,
      params.expiresAt,
      params.purpose,
      params.code,
      'platform',
      'Therapysto',
      null,
      null,
      null,
    ];
    expect(args).toEqual(expectedArgs);
    // The statement the root actually receives binds those same eleven values in the same order,
    // and carries neither the address nor the one-time code as literal text.
    const executed = drizzleSqlFragmentToPgQuery(fragment as never);
    expect(executed.values).toEqual(expectedArgs);
    expect(executed.sql).not.toContain(params.email);
    expect(executed.sql).not.toContain(params.code);
  });

  it('preserves the root cooldown result without inventing a challenge', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{ challenge_id: null, retry_after_seconds: 23 }],
    });

    await expect(
      startEmailChallengeInDb({
        userId: '00000000-0000-4000-8000-000000000042',
        email: 'person@example.test',
        codeHash: 'b'.repeat(64),
        expiresAt: 1_800_000_000,
        purpose: 'login',
        code: '654321',
        mailProfile: { kind: 'platform', senderDisplayName: 'Therapygo' },
      }),
    ).resolves.toEqual({ challengeId: null, retryAfterSeconds: 23 });
  });
});
