import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  bound: false,
  calls: [] as string[],
  getEffective: vi.fn(),
  ensureSystemSettingsConfigAdapterBound: vi.fn(() => {
    fakes.calls.push('bind');
    fakes.bound = true;
  }),
}));

vi.mock('@/app-layer/di/bindSystemSettingsConfigAdapter', () => ({
  ensureSystemSettingsConfigAdapterBound: fakes.ensureSystemSettingsConfigAdapterBound,
}));
vi.mock('@/modules/system-settings/configAdapterPort', () => ({
  requireConfigAdapterPort: () => {
    fakes.calls.push('require-port');
    if (!fakes.bound) throw new Error('ConfigAdapterPort is not bound');
    return {
      runtimeSettings: {
        getEffective: fakes.getEffective,
        getSnapshotRows: vi.fn(),
        upsert: vi.fn(),
      },
      readAdminSystemSettingString: vi.fn(),
      readExactOrganizationAdminSystemSettingString: vi.fn(),
      readPublicAuthChannelConfigured: vi.fn(),
    };
  },
}));

import { getServerRuntimeInteger } from './configAdapter';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.bound = false;
  fakes.calls.length = 0;
  fakes.getEffective.mockResolvedValue({ valueJson: { value: 24 } });
});

describe('cold route system-settings composition', () => {
  it('binds the DB adapter before the first runtime setting read', async () => {
    await expect(getServerRuntimeInteger('booking_min_notice_hours')).resolves.toBe(24);

    expect(fakes.calls.slice(0, 2)).toEqual(['bind', 'require-port']);
    expect(fakes.getEffective).toHaveBeenCalledOnce();
  });
});
