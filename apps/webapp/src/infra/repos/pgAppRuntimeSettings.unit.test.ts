import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  runWebappNamedRoot: vi.fn(),
  runWebappPgText: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappPgText: fakes.runWebappPgText,
}));

vi.mock('@/infra/db/saasIsolationOperationContext', () => ({
  runWithWebappDbOperationFamily: vi.fn((_family: string, fn: () => unknown) => fn()),
}));

vi.mock('@bersoncare/db-principal', () => ({
  runWithDbBootstrapPrincipal: vi.fn((_principal: unknown, fn: () => unknown) => fn()),
}));

import { createPgAppRuntimeSettingsPort } from './pgAppRuntimeSettings';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runtime settings public boundary', () => {
  it.each(['sms_fallback_enabled', 'smsc_api_key', 'not_registered_runtime_key'])(
    'rejects restricted, secret, or unregistered key %s before any SQL is executed',
    async (key) => {
      const port = createPgAppRuntimeSettingsPort();

      await expect(port.getEffective({
        key,
        scope: 'admin',
        organizationId: null,
        allowedAudiences: ['public'],
        operationFamily: 'public_auth_config',
      })).resolves.toBeNull();

      expect(fakes.runWebappNamedRoot).not.toHaveBeenCalled();
      expect(fakes.runWebappPgText).not.toHaveBeenCalled();
    },
  );

  it('routes the reviewed SMS fallback projection without admitting its restricted source', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{
        key: 'public_sms_fallback_enabled',
        scope: 'admin',
        organization_id: null,
        audience: 'public',
        value_json: { value: false },
      }],
    });
    const port = createPgAppRuntimeSettingsPort();

    await expect(port.getEffective({
      key: 'public_sms_fallback_enabled',
      scope: 'admin',
      organizationId: null,
      allowedAudiences: ['public'],
      operationFamily: 'public_auth_config',
    })).resolves.toMatchObject({
      key: 'public_sms_fallback_enabled',
      audience: 'public',
      valueJson: { value: false },
    });

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
    expect(fakes.runWebappNamedRoot.mock.calls[0]?.[1]).toBe(
      'app.read_public_runtime_setting(text,text)',
    );
    expect(fakes.runWebappNamedRoot.mock.calls[0]?.[2]).toEqual([
      'public_sms_fallback_enabled',
      'admin',
    ]);
    expect(fakes.runWebappPgText).not.toHaveBeenCalled();
  });

  it('routes a registered public auth-surface key through the pre-session definer only', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{
        key: 'auth_surface_staff_email_enabled',
        scope: 'admin',
        organization_id: null,
        audience: 'public',
        value_json: { value: true },
      }],
    });
    const port = createPgAppRuntimeSettingsPort();

    await expect(port.getEffective({
      key: 'auth_surface_staff_email_enabled',
      scope: 'admin',
      organizationId: null,
      allowedAudiences: ['public'],
      operationFamily: 'public_auth_config',
    })).resolves.toMatchObject({ key: 'auth_surface_staff_email_enabled', valueJson: { value: true } });

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
    expect(fakes.runWebappNamedRoot.mock.calls[0]?.[1]).toBe(
      'app.read_public_runtime_setting(text,text)',
    );
    expect(fakes.runWebappPgText).not.toHaveBeenCalled();
  });

  it('routes an organization setting through the authenticated resolver with exact org input', async () => {
    fakes.runWebappPgText.mockResolvedValueOnce({ rows: [] });
    const port = createPgAppRuntimeSettingsPort();

    await expect(port.getEffective({
      key: 'patient_booking_url',
      scope: 'admin',
      organizationId: '11111111-1111-4111-8111-111111111111',
      allowedAudiences: ['authenticated_client'],
      operationFamily: 'patient_runtime_config',
    })).resolves.toBeNull();

    expect(fakes.runWebappPgText).toHaveBeenCalledWith(
      expect.stringContaining('app.read_authenticated_runtime_setting'),
      [
        'patient_booking_url',
        'admin',
        '11111111-1111-4111-8111-111111111111',
        true,
      ],
    );
    expect(fakes.runWebappNamedRoot).not.toHaveBeenCalled();
  });
});
