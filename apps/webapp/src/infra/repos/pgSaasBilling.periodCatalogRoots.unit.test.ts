import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { kind: 'webapp-sql' },
  getCurrentDbPrincipal: vi.fn(),
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: fakes.getCurrentDbPrincipal,
}));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: fakes.getWebappSqlDb,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappPgText: vi.fn(),
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: vi.fn() }));

import { createPgSaasBillingRepository } from './pgSaasBilling';

const PERIOD_ROW = {
  code: 'month',
  label: 'Месяц',
  months: 1,
  is_selectable: true,
  sort_order: 10,
};

describe('SaaS billing period catalog principal roots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.getWebappSqlDb.mockReturnValue(fakes.db);
    fakes.runWebappNamedRoot.mockResolvedValue({ rows: [PERIOD_ROW] });
  });

  it.each([
    [
      'clinic billing',
      {
        kind: 'clinicBilling',
        organizationId: '11111111-1111-4111-8111-111111111111',
        platformUserId: 'clinic-owner',
      },
      'app.list_saas_billing_period_catalog()',
    ],
    [
      'platform operations',
      { kind: 'platform', platformUserId: 'platform-operator' },
      'app.list_saas_billing_period_catalog_platform()',
    ],
  ])('binds %s to its exact period-catalog root and maps the readback', async (_label, principal, root) => {
    fakes.getCurrentDbPrincipal.mockReturnValue(principal);

    await expect(createPgSaasBillingRepository().listBillingPeriods()).resolves.toEqual([
      {
        code: 'month',
        label: 'Месяц',
        months: 1,
        isSelectable: true,
        sortOrder: 10,
      },
    ]);

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
    expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(0, 3)).toEqual([
      fakes.db,
      root,
      [],
    ]);
  });
});
