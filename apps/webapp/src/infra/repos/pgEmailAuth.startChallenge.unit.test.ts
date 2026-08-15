import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
  runWebappPgText: vi.fn(),
  runWebappTransaction: vi.fn(),
  webappSqlFromPgText: vi.fn(() => ({ kind: 'sql-fragment' })),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: fakes.getWebappSqlDb,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappPgText: fakes.runWebappPgText,
  runWebappTransaction: fakes.runWebappTransaction,
  webappSqlFromPgText: fakes.webappSqlFromPgText,
}));

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
    };
    await expect(startEmailChallengeInDb(params)).resolves.toEqual({
      challengeId: 'challenge-1',
      retryAfterSeconds: 60,
    });

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
    const [db, identity, args] = fakes.runWebappNamedRoot.mock.calls[0] as unknown[];
    expect(db).toBe(fakes.db);
    expect(identity).toBe(
      'app.email_auth_start_challenge(uuid,text,text,bigint,text,text)',
    );
    expect(args).toEqual([
      params.userId,
      params.email,
      params.codeHash,
      params.expiresAt,
      params.purpose,
      params.code,
    ]);
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
      }),
    ).resolves.toEqual({ challengeId: null, retryAfterSeconds: 23 });
  });
});
