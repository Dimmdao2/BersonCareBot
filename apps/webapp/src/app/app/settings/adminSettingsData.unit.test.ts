import { expect, it, vi } from 'vitest';

const listSettingsByScope = vi.fn().mockResolvedValue([]);

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ systemSettings: { listSettingsByScope } }),
}));

const { loadAdminSettingsPageData } = await import('./adminSettingsData');

it('refuses the settings page when required database rows are missing', async () => {
  await expect(loadAdminSettingsPageData()).rejects.toThrow('runtime_setting_unavailable');
});
