import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  namedRoot: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => ({ kind: 'db' }),
  runWebappNamedRoot: mocks.namedRoot,
}));

import { createPgDomainHealthCandidatesPort } from '@/infra/repos/pgDomainHealthCandidates';

describe('createPgDomainHealthCandidatesPort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed on a malformed root payload', async () => {
    mocks.namedRoot.mockResolvedValueOnce({ rows: [{ hostnames: { hostname: 'wrong-shape' } }] });
    await expect(createPgDomainHealthCandidatesPort().listConfiguredTargets()).rejects.toThrow(
      'custom_domain_hostname_list_invalid',
    );
  });
});
