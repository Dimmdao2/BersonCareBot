import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeSettingUnavailableError } from './runtimeSettingUnavailable';

const readAdminSystemSettingString = vi.fn();
const readExactOrganizationAdminSystemSettingString = vi.fn();
const readPublicAuthChannelConfigured = vi.fn();

vi.mock('@/infra/repos/pgSystemSettings', () => ({
  readAdminSystemSettingString,
  readExactOrganizationAdminSystemSettingString,
  readPublicAuthChannelConfigured,
}));

vi.mock('@/infra/repos/pgAppRuntimeSettings', () => ({
  createPgAppRuntimeSettingsPort: () => ({ getEffective: vi.fn() }),
}));

const {
  getConfigValue,
  getExactOrganizationConfigValue,
  getPublicAuthChannelConfigured,
  invalidateConfigCache,
  invalidateConfigKey,
} = await import('./configAdapter');

describe('configAdapter DB-only legacy reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateConfigCache();
  });

  it('does not turn a failed read into an answer or cache the failure', async () => {
    readAdminSystemSettingString
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce('db-value');

    await expect(getConfigValue('google_client_id')).rejects.toBeInstanceOf(
      RuntimeSettingUnavailableError,
    );
    await expect(getConfigValue('google_client_id')).resolves.toBe('db-value');
    expect(readAdminSystemSettingString).toHaveBeenCalledTimes(2);
  });

  it('invalidates an exact-organization entry by its setting key', async () => {
    readExactOrganizationAdminSystemSettingString
      .mockResolvedValueOnce('old-token')
      .mockResolvedValueOnce('new-token');

    await expect(getExactOrganizationConfigValue('google_refresh_token', 'clinic-1')).resolves.toBe(
      'old-token',
    );
    await expect(getExactOrganizationConfigValue('google_refresh_token', 'clinic-1')).resolves.toBe(
      'old-token',
    );
    expect(readExactOrganizationAdminSystemSettingString).toHaveBeenCalledTimes(1);

    invalidateConfigKey('google_refresh_token');

    await expect(getExactOrganizationConfigValue('google_refresh_token', 'clinic-1')).resolves.toBe(
      'new-token',
    );
    expect(readExactOrganizationAdminSystemSettingString).toHaveBeenCalledTimes(2);
  });

  it('does not turn a failed public SMTP capability read into “not configured”', async () => {
    readPublicAuthChannelConfigured.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(getPublicAuthChannelConfigured('sms')).rejects.toThrow('database unavailable');
  });
});
