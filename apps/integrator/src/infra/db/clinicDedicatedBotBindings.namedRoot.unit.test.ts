import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';

const fakes = vi.hoisted(() => ({
  runNamedRoot: vi.fn(
    async (_db: unknown, _identity: string, _args: readonly unknown[], _fragment: unknown) => ({
      rows: [{ organization_id: '00000000-0000-0000-0000-000000000001' }],
    }),
  ),
}));

vi.mock('./runIntegratorSql.js', () => ({ runIntegratorNamedRoot: fakes.runNamedRoot }));

import { resolveDedicatedClinicBotOrganization } from './clinicDedicatedBotBindings.js';

describe('dedicated clinic bot exact resolver', () => {
  beforeEach(() => vi.clearAllMocks());

  it('attests the channel and complete credential fingerprint', async () => {
    const db = {} as DbPort;
    const fingerprint = 'a'.repeat(64);

    await expect(
      resolveDedicatedClinicBotOrganization(db, 'telegram', fingerprint),
    ).resolves.toBe('00000000-0000-0000-0000-000000000001');
    expect(fakes.runNamedRoot.mock.calls[0]?.slice(0, 3)).toEqual([
      db,
      'app.resolve_clinic_dedicated_bot_organization(text,text)',
      ['telegram', fingerprint],
    ]);
  });

  it('rejects a malformed fingerprint before checking out a database client', async () => {
    await expect(
      resolveDedicatedClinicBotOrganization({} as DbPort, 'max', 'not-a-fingerprint'),
    ).resolves.toBeNull();
    expect(fakes.runNamedRoot).not.toHaveBeenCalled();
  });
});
