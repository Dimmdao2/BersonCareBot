import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';

const fakes = vi.hoisted(() => ({
  runNamedRoot: vi.fn(
    async (_db: unknown, _identity: string, _args: readonly unknown[], _fragment: unknown) => ({
      rows: [{
        platform_user_id: '11111111-1111-4111-8111-111111111111',
        organization_id: '00000000-0000-0000-0000-000000000001',
      }],
    }),
  ),
}));

vi.mock('../runIntegratorSql.js', () => ({ runIntegratorNamedRoot: fakes.runNamedRoot }));

import { resolveActiveTenantForIntegratorUserId } from './channelUsers.js';

describe('integrator-user organization exact resolver', () => {
  beforeEach(() => vi.clearAllMocks());

  it('attests the complete bigint lookup argument', async () => {
    const db = {} as DbPort;

    await expect(resolveActiveTenantForIntegratorUserId(db, '126')).resolves.toEqual({
      platformUserId: '11111111-1111-4111-8111-111111111111',
      organizationId: '00000000-0000-0000-0000-000000000001',
    });
    expect(fakes.runNamedRoot.mock.calls[0]?.slice(0, 3)).toEqual([
      db,
      'app.resolve_active_organization_for_integrator_user_id(bigint)',
      ['126'],
    ]);
  });
});
