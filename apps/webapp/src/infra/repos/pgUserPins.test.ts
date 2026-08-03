import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { pgUserPinsPort } from '@/infra/repos/pgUserPins';

describe('pgUserPinsPort principal boundaries', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
  });

  it('uses the target-free self accessor for an authenticated PIN presence read', async () => {
    await pgUserPinsPort.getForCurrentPrincipal('53000000-0000-4000-8000-000000000001');

    expect(runWebappPgTextMock).toHaveBeenCalledOnce();
    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      expect.stringContaining('FROM app.auth_user_pin_read_self()'),
    );
  });

  it('passes only the PIN hash to the target-free self upsert', async () => {
    await pgUserPinsPort.upsertPinHashForCurrentPrincipal(
      '53000000-0000-4000-8000-000000000001',
      'argon2-hash',
    );

    expect(runWebappPgTextMock).toHaveBeenCalledOnce();
    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      expect.stringContaining('app.auth_user_pin_upsert_self($1::text)'),
      ['argon2-hash'],
    );
  });

  it('preserves exact-UUID accessors for pre-session PIN login', async () => {
    const userId = '53000000-0000-4000-8000-000000000001';

    await pgUserPinsPort.getByUserId(userId);
    await pgUserPinsPort.upsertPinHash(userId, 'argon2-hash');

    expect(runWebappPgTextMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM app.auth_user_pin_read($1::uuid)'),
      [userId],
    );
    expect(runWebappPgTextMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('app.auth_user_pin_upsert($1::uuid, $2::text)'),
      [userId, 'argon2-hash'],
    );
  });
});
