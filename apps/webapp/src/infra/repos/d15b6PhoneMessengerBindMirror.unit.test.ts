/**
 * D15b/6: messenger bind secret lifecycle goes through an exact named `pre_session` root,
 * never a raw relation transaction the bootstrap principal has no door for.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import type { Pool } from 'pg';
import { drizzleSqlFragmentToPgQuery } from '@/infra/db/drizzleSqlDebugText';

const runIdentityClientPgTextMock = vi.hoisted(() => vi.fn());
const runWebappNamedRootMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/repos/identityPhoneSql', () => ({
  runIdentityClientSql: runIdentityClientPgTextMock,
  runIdentityPoolSqlOnPool: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(() => ({ tag: 'root-db' })),
  getWebappSqlFromPgClient: vi.fn(() => ({})),
  runWebappNamedRoot: runWebappNamedRootMock,
}));

import { createPgPhoneMessengerBindPort } from '@/infra/repos/pgPhoneMessengerBind';

const fakePool = {
  connect() {
    throw new Error('test unexpectedly requested a pool connection');
  },
  query() {
    throw new Error('test unexpectedly queried through the pool');
  },
} as unknown as Pool;

beforeEach(() => {
  vi.resetAllMocks();
  runWebappNamedRootMock.mockResolvedValue({ rows: [] });
});

describe('D15b/6 — pgPhoneMessengerBind canonical contact write', () => {
  it('starts the bearer secret through one exact named root instead of relation SQL', async () => {
    const port = createPgPhoneMessengerBindPort(fakePool);
    await port.startSecret({
      tokenHash: 'token-hash',
      phoneNormalized: '+79001234567',
      channelCode: 'telegram',
      purpose: 'login',
      userId: null,
      expiresAtIso: '2026-08-14T19:00:00.000Z',
    });

    expect(runWebappNamedRootMock).toHaveBeenCalledTimes(1);
    const [db, identity, args, fragment] = runWebappNamedRootMock.mock.calls[0]!;
    const expectedArgs = [
      'start',
      'token-hash',
      null,
      '+79001234567',
      'telegram',
      'login',
      null,
      null,
      null,
      '2026-08-14T19:00:00.000Z',
    ];
    expect(db).toEqual({ tag: 'root-db' });
    expect(identity).toBe(
      'app.phone_messenger_bind_secret(text,text,uuid,text,text,text,uuid,text,text,timestamp with time zone)',
    );
    expect(args).toEqual(expectedArgs);
    // The named-root identity above is what routing keys on; this is the belt-and-braces check
    // that the SQL fragment routed alongside it calls the SAME function with the SAME values —
    // not two identities that quietly drifted apart.
    const compiled = drizzleSqlFragmentToPgQuery(fragment as SQL);
    expect(compiled.sql).toMatch(/FROM app\.phone_messenger_bind_secret\(/);
    expect(compiled.values).toEqual(expectedArgs);
    expect(runIdentityClientPgTextMock).not.toHaveBeenCalled();
  });
});
