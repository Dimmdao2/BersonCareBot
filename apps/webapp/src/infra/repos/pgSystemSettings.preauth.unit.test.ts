import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  runWebappNamedRoot: vi.fn(),
  runWebappSql: vi.fn(),
  runWebappTransaction: vi.fn(),
  getCurrentDbPrincipal: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappSql: fakes.runWebappSql,
  runWebappTransaction: fakes.runWebappTransaction,
  getWebappSqlDb: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: fakes.getCurrentDbPrincipal,
  runWithDbBootstrapPrincipal: vi.fn((_opts: unknown, fn: () => unknown) => fn()),
}));

import { drizzleSqlFragmentToPgQuery } from '@/infra/db/drizzleSqlDebugText';
import { createPgSystemSettingsPort, readAdminSystemSettingString } from './pgSystemSettings';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.runWebappTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({}),
  );
});

describe('readAdminSystemSettingString under the pre-login bootstrap principal', () => {
  it('reads a fixed OAuth key via the SECURITY DEFINER accessor instead of the raw table SELECT', async () => {
    fakes.getCurrentDbPrincipal.mockReturnValue({ kind: 'bootstrap' });
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{ value_json: { value: 'yandex-client-id' } }],
    });

    await expect(readAdminSystemSettingString('yandex_oauth_client_id')).resolves.toBe(
      'yandex-client-id',
    );

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(1);
    const [, identity, params] = fakes.runWebappNamedRoot.mock.calls[0] as [
      unknown,
      string,
      unknown[],
    ];
    expect(identity).toBe('app.read_webapp_preauth_provider_setting(text)');
    expect(params).toEqual(['yandex_oauth_client_id']);
    expect(fakes.runWebappSql).not.toHaveBeenCalled();
  });

  it('reads the VK ID credential keys via the same SECURITY DEFINER accessor as the other providers', async () => {
    fakes.getCurrentDbPrincipal.mockReturnValue({ kind: 'bootstrap' });
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{ value_json: { value: 'vk-app-id' } }],
    });

    await expect(readAdminSystemSettingString('vk_id_application_id')).resolves.toBe('vk-app-id');

    const [, identity, params] = fakes.runWebappNamedRoot.mock.calls[0] as [
      unknown,
      string,
      unknown[],
    ];
    expect(identity).toBe('app.read_webapp_preauth_provider_setting(text)');
    expect(params).toEqual(['vk_id_application_id']);
    expect(fakes.runWebappSql).not.toHaveBeenCalled();
  });

  it('still uses the raw table SELECT for a key outside the pre-auth allowlist', async () => {
    fakes.getCurrentDbPrincipal.mockReturnValue({ kind: 'bootstrap' });
    fakes.runWebappSql.mockResolvedValueOnce({ rows: [] });

    await expect(readAdminSystemSettingString('max_bot_api_key')).resolves.toBeNull();

    const { sql: query } = drizzleSqlFragmentToPgQuery(fakes.runWebappSql.mock.calls[0]![1]);
    expect(query).toMatch(/FROM\s+system_settings/i);
    expect(query).not.toContain('app.read_webapp_preauth_provider_setting');
  });

  it('uses the raw table SELECT for the same OAuth key once a real principal is set', async () => {
    fakes.getCurrentDbPrincipal.mockReturnValue({ kind: 'staff' });
    fakes.runWebappSql.mockResolvedValueOnce({
      rows: [{ scope: 'admin', organization_id: null, value_json: { value: 'yandex-client-id' } }],
    });

    await expect(readAdminSystemSettingString('yandex_oauth_client_id')).resolves.toBe(
      'yandex-client-id',
    );

    const { sql: query } = drizzleSqlFragmentToPgQuery(fakes.runWebappSql.mock.calls[0]![1]);
    expect(query).toMatch(/FROM\s+system_settings/i);
    expect(query).not.toContain('app.read_webapp_preauth_provider_setting');
  });
});

describe('system settings durable audit side effect', () => {
  it('never binds raw old/new composite secrets into the upsert audit INSERT', async () => {
    const oldSecret = 'old-vapid-private-do-not-bind-12f4';
    const newSecret = 'new-vapid-private-do-not-bind-49a1';
    const oldValueJson = { value: { publicKey: 'old-public', privateKey: oldSecret } };
    const newValueJson = { value: { publicKey: 'new-public', privateKey: newSecret } };
    fakes.runWebappSql
      .mockResolvedValueOnce({ rows: [{ value_json: oldValueJson }] })
      .mockResolvedValueOnce({
        rows: [
          {
            key: 'web_push_vapid',
            scope: 'admin',
            organization_id: null,
            value_json: newValueJson,
            updated_at: '2026-09-02T00:00:00.000Z',
            updated_by: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await createPgSystemSettingsPort().upsert('web_push_vapid', 'admin', newValueJson, null);

    const auditFragment = fakes.runWebappSql.mock.calls[2]?.[1];
    expect(auditFragment).toBeDefined();
    const auditQuery = drizzleSqlFragmentToPgQuery(auditFragment);
    expect(auditQuery.sql).toMatch(/INSERT INTO system_settings_audit/i);
    expect(JSON.stringify(auditQuery.values)).not.toContain(oldSecret);
    expect(JSON.stringify(auditQuery.values)).not.toContain(newSecret);
    expect(JSON.stringify(auditQuery.values)).toContain('[REDACTED]');
  });

  it('never binds a deleted raw payment credential into the audit INSERT', async () => {
    const deletedSecret = 'deleted-payment-api-key-do-not-bind-a831';
    fakes.runWebappSql
      .mockResolvedValueOnce({
        rows: [
          {
            value_json: {
              value: {
                defaultProviderId: 'future-pay',
                providers: [{ id: 'future-pay', enabled: true, apiKey: deletedSecret }],
              },
            },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      createPgSystemSettingsPort().delete?.('saas_billing_payment_provider', 'admin', null),
    ).resolves.toBe(true);

    const auditFragment = fakes.runWebappSql.mock.calls[1]?.[1];
    expect(auditFragment).toBeDefined();
    const auditQuery = drizzleSqlFragmentToPgQuery(auditFragment);
    expect(auditQuery.sql).toMatch(/INSERT INTO system_settings_audit/i);
    expect(JSON.stringify(auditQuery.values)).not.toContain(deletedSecret);
    expect(JSON.stringify(auditQuery.values)).toContain('[REDACTED]');
  });
});
