import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithOrganizationPrincipal } from '../principal/organizationPrincipal.js';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
}));

vi.mock('./drizzle.js', () => ({
  getIntegratorDrizzleSession: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: mocks.limit })),
      })),
    })),
  })),
}));

import { createClinicSenderNameResolver } from './clinicSenderName.js';

const ORG_A = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('clinic sender name resolution', () => {
  it('uses the exact active organization title', async () => {
    mocks.limit.mockResolvedValue([{ title: '  Клиника Мир  ' }]);
    const resolve = createClinicSenderNameResolver({} as never);

    await expect(runWithOrganizationPrincipal(ORG_A, resolve)).resolves.toBe('Клиника Мир');
  });

  it('fails visibly when the exact organization title cannot be read', async () => {
    mocks.limit.mockRejectedValue(new Error('organization DB unavailable'));
    const resolve = createClinicSenderNameResolver({} as never);

    await expect(runWithOrganizationPrincipal(ORG_A, resolve)).rejects.toThrow(
      'organization DB unavailable',
    );
  });
});
