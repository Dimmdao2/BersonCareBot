import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeSettingUnavailableError } from './runtimeSettingUnavailable';
import { bindConfigAdapterPort } from './configAdapterPort';

vi.mock('@/app-layer/di/bindSystemSettingsConfigAdapter', () => ({
  ensureSystemSettingsConfigAdapterBound: vi.fn(),
}));

const readAdminSystemSettingString = vi.fn();
const readExactOrganizationAdminSystemSettingString = vi.fn();
const readPublicAuthChannelConfigured = vi.fn();
const getEffective = vi.fn();
const getSnapshotRows = vi.fn();
const upsert = vi.fn();

const {
  getConfigValue,
  getServerRuntimeInteger,
  getServerConfigStructuredValue,
  getExactOrganizationConfigValue,
  getPublicAuthChannelConfigured,
  invalidateConfigCache,
  invalidateConfigKey,
} = await import('./configAdapter');

bindConfigAdapterPort({
  runtimeSettings: { getEffective, getSnapshotRows, upsert },
  readAdminSystemSettingString,
  readExactOrganizationAdminSystemSettingString,
  readPublicAuthChannelConfigured,
});

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

  it('does not turn a missing required row into an empty value', async () => {
    readAdminSystemSettingString.mockResolvedValueOnce(null);

    await expect(getConfigValue('google_client_id')).rejects.toBeInstanceOf(
      RuntimeSettingUnavailableError,
    );
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

  it('reads a zero min notice from the requested organization runtime setting', async () => {
    getEffective.mockResolvedValueOnce({ valueJson: { value: 0 } });

    await expect(
      getServerRuntimeInteger('booking_min_notice_hours', 'clinic-1'),
    ).resolves.toBe(0);
    expect(getEffective).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'booking_min_notice_hours',
        organizationId: 'clinic-1',
        allowedAudiences: ['server'],
      }),
    );
  });

  it('parses structured server configuration without substituting an empty value', async () => {
    readAdminSystemSettingString.mockResolvedValueOnce('{"phones":["+79990000000"]}');

    await expect(getServerConfigStructuredValue('test_account_identifiers')).resolves.toEqual({
      phones: ['+79990000000'],
    });
  });

  it.each([
    ['missing value', () => readAdminSystemSettingString.mockResolvedValueOnce(null)],
    ['database error', () => readAdminSystemSettingString.mockRejectedValueOnce(new Error('db unavailable'))],
    ['malformed JSON', () => readAdminSystemSettingString.mockResolvedValueOnce('{not-json')],
  ])('fails closed for structured server configuration with %s', async (_caseName, arrange) => {
    arrange();

    await expect(
      getServerConfigStructuredValue('test_account_identifiers'),
    ).rejects.toBeInstanceOf(RuntimeSettingUnavailableError);
  });
});
