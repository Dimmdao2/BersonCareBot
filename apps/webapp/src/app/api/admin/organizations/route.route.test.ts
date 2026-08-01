import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePlatformOperationsApiContext: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.requirePlatformOperationsApiContext,
}));

import { GET } from './route';

const activeAccess = { lifecycle: 'active' as const, tariffId: 'tariff', source: 'assignment' as const };

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requirePlatformOperationsApiContext.mockResolvedValue({ ok: true });
});

describe('§5a stage 6.2 — platform report names who is over a numeric limit and their ladder step', () => {
  it('flags an organization whose usage has reached its configured limit', async () => {
    fakes.buildAppDeps.mockReturnValue({
      platformEntitlements: {
        listOrganizations: async () => [
          {
            id: 'org-over',
            title: 'За пределом',
            tariffId: 'tariff',
            manualTariffId: 'tariff',
            isActive: true,
            effectiveAccess: activeAccess,
            overrides: [],
            trial: null,
          },
          {
            id: 'org-ok',
            title: 'В пределах',
            tariffId: 'tariff',
            manualTariffId: 'tariff',
            isActive: true,
            effectiveAccess: activeAccess,
            overrides: [],
            trial: null,
          },
        ],
        listTariffs: async () => [],
      },
      orgEntitlements: {
        getSnapshot: async (organizationId: string) => ({
          tariff: {
            mechanics: {},
            quotas: { branches: { kind: 'numeric', limit: 2, unit: 'items' } },
            includedSeats: null,
            systemAccessPolicy: null,
            mechanicAccessPolicies: {},
          },
          overrides: [],
          access: activeAccess,
        }),
        getEnforcedQuotaUsage: async (organizationId: string) => ({
          branches: organizationId === 'org-over' ? 2 : 1,
        }),
      },
    });

    const response = await GET();
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.quotaProjections['org-over']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mechanic: 'branches', usage: 2, threshold: 'reached' }),
      ]),
    );
    expect(body.quotaProjections['org-ok']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mechanic: 'branches', usage: 1, threshold: 'below_warning' }),
      ]),
    );
  });
});
