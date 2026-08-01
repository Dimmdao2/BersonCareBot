import { expect, it, vi } from 'vitest';

const getServerRuntimeBool = vi.fn<() => Promise<boolean>>();

vi.mock('@/modules/system-settings/configAdapter', () => ({ getServerRuntimeBool }));

const { platformRequiresStaffTwoFactor } = await import('./platformPolicy');

it('propagates an unavailable 2FA setting instead of choosing a policy', async () => {
  getServerRuntimeBool.mockRejectedValueOnce(
    new Error('runtime_setting_unavailable:auth_2fa_enabled'),
  );

  await expect(platformRequiresStaffTwoFactor()).rejects.toThrow(
    'runtime_setting_unavailable:auth_2fa_enabled',
  );
});
