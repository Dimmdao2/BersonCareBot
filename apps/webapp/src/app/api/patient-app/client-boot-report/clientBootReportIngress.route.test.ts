import { describe, expect, it, vi } from 'vitest';
import type { AuthRateLimitCheckParams } from '@/modules/auth/authRateLimitPort';

const fakes = vi.hoisted(() => ({
  flagDbRead: vi.fn(),
  rateLimitDbRead: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  env: { SESSION_COOKIE_SECRET: 'test-session-secret-16chars' },
  webappRuntimeDatabaseIsConfigured: () => true,
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: vi.fn(),
}));
vi.mock('@/app-layer/di/bindSystemSettingsConfigAdapter', () => ({
  ensureSystemSettingsConfigAdapterBound: vi.fn(),
}));
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: vi.fn(),
}));
vi.mock('@/infra/logging/logger', () => ({
  logger: { info: fakes.loggerInfo, warn: fakes.loggerWarn },
}));

function request(): Request {
  return new Request('http://test.local/api/patient-app/client-boot-report', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '203.0.113.10',
    },
    body: '{}',
  });
}

describe('POST /api/patient-app/client-boot-report ingress ceiling', () => {
  /** D6: calls past the owner-set cap must not amplify anonymous traffic into unbounded DB reads. */
  it('stops every DB-backed port before request 301 and later', async () => {
    vi.resetModules();
    fakes.flagDbRead.mockResolvedValue({
      key: 'patient_unsupported_client_fallback_enabled',
      scope: 'admin',
      organizationId: null,
      audience: 'public',
      valueJson: { value: true },
    });
    fakes.rateLimitDbRead.mockResolvedValue(false);

    const [{ bindAuthRateLimitDbPort }, { bindConfigAdapterPort }, { POST }] = await Promise.all([
      import('@/modules/auth/authRateLimits'),
      import('@/modules/system-settings/configAdapterPort'),
      import('./route'),
    ]);
    bindAuthRateLimitDbPort({
      checkAndRecord: (params: AuthRateLimitCheckParams) => fakes.rateLimitDbRead(params),
      recordAndCount: async () => ({ limited: false, attempts: 0 }),
    });
    bindConfigAdapterPort({
      runtimeSettings: {
        getClinicPlatformIntegrationAvailability: async () => null,
        getEffective: fakes.flagDbRead,
      },
      readAdminSystemSettingString: async () => null,
      readExactOrganizationAdminSystemSettingString: async () => null,
      readPublicAuthChannelConfigured: async () => false,
    });

    for (let attempt = 0; attempt < 300; attempt += 1) {
      expect((await POST(request())).status).toBe(400);
    }
    expect(fakes.flagDbRead).toHaveBeenCalledTimes(300);
    expect(fakes.rateLimitDbRead).toHaveBeenCalledTimes(300);

    expect((await POST(request())).status).toBe(429);
    expect((await POST(request())).status).toBe(429);
    expect(fakes.flagDbRead).toHaveBeenCalledTimes(300);
    expect(fakes.rateLimitDbRead).toHaveBeenCalledTimes(300);
  });
});
