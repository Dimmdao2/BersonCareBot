import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  runWebappPgText: vi.fn(),
  getCurrentDbPrincipal: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: fakes.runWebappPgText,
  runWebappSql: vi.fn(),
  runWebappTransaction: vi.fn(),
  getWebappSqlDb: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: fakes.getCurrentDbPrincipal,
  runWithDbBootstrapPrincipal: vi.fn((_opts: unknown, fn: () => unknown) => fn()),
}));

import { readAdminSystemSettingString } from './pgSystemSettings';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('readAdminSystemSettingString under the pre-login bootstrap principal', () => {
  it('reads a fixed OAuth key via the SECURITY DEFINER accessor instead of the raw table SELECT', async () => {
    fakes.getCurrentDbPrincipal.mockReturnValue({ kind: 'bootstrap' });
    fakes.runWebappPgText.mockResolvedValueOnce({
      rows: [{ value_json: { value: 'yandex-client-id' } }],
    });

    await expect(readAdminSystemSettingString('yandex_oauth_client_id')).resolves.toBe(
      'yandex-client-id',
    );

    expect(fakes.runWebappPgText).toHaveBeenCalledTimes(1);
    const [query, params] = fakes.runWebappPgText.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('app.read_webapp_preauth_provider_setting');
    expect(query).not.toMatch(/FROM\s+system_settings/i);
    expect(params).toEqual(['yandex_oauth_client_id']);
  });

  it('reads the VK ID credential keys via the same SECURITY DEFINER accessor as the other providers', async () => {
    fakes.getCurrentDbPrincipal.mockReturnValue({ kind: 'bootstrap' });
    fakes.runWebappPgText.mockResolvedValueOnce({
      rows: [{ value_json: { value: 'vk-app-id' } }],
    });

    await expect(readAdminSystemSettingString('vk_id_application_id')).resolves.toBe('vk-app-id');

    const [query, params] = fakes.runWebappPgText.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('app.read_webapp_preauth_provider_setting');
    expect(query).not.toMatch(/FROM\s+system_settings/i);
    expect(params).toEqual(['vk_id_application_id']);
  });

  it('still uses the raw table SELECT for a key outside the pre-auth allowlist', async () => {
    fakes.getCurrentDbPrincipal.mockReturnValue({ kind: 'bootstrap' });
    fakes.runWebappPgText.mockResolvedValueOnce({ rows: [] });

    await expect(readAdminSystemSettingString('max_bot_api_key')).resolves.toBeNull();

    const [query] = fakes.runWebappPgText.mock.calls[0] as [string];
    expect(query).toMatch(/FROM\s+system_settings/i);
    expect(query).not.toContain('app.read_webapp_preauth_provider_setting');
  });

  it('uses the raw table SELECT for the same OAuth key once a real principal is set', async () => {
    fakes.getCurrentDbPrincipal.mockReturnValue({ kind: 'staff' });
    fakes.runWebappPgText.mockResolvedValueOnce({
      rows: [{ scope: 'admin', organization_id: null, value_json: { value: 'yandex-client-id' } }],
    });

    await expect(readAdminSystemSettingString('yandex_oauth_client_id')).resolves.toBe(
      'yandex-client-id',
    );

    const [query] = fakes.runWebappPgText.mock.calls[0] as [string];
    expect(query).toMatch(/FROM\s+system_settings/i);
    expect(query).not.toContain('app.read_webapp_preauth_provider_setting');
  });
});
