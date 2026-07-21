import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exchangeIntegratorToken, runtimeEnv } = vi.hoisted(() => ({
  exchangeIntegratorToken: vi.fn(),
  runtimeEnv: {
    NODE_ENV: 'development' as 'development' | 'test' | 'production',
    ALLOW_DEV_AUTH_BYPASS: true,
  },
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ auth: { exchangeIntegratorToken } }),
}));

vi.mock('@/config/env', () => ({ env: runtimeEnv }));

import { GET } from './route';

describe('GET /api/auth/dev-bypass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeEnv.NODE_ENV = 'development';
    runtimeEnv.ALLOW_DEV_AUTH_BYPASS = true;
  });

  it('exchanges a known token only in explicitly enabled development', async () => {
    exchangeIntegratorToken.mockResolvedValue({
      session: { user: { role: 'doctor' } },
      redirectTo: '/app/doctor',
    });

    const response = await GET(
      new Request('http://127.0.0.1:5200/api/auth/dev-bypass?token=dev%3Adoctor'),
    );

    expect(exchangeIntegratorToken).toHaveBeenCalledWith('dev:doctor');
    expect(response.status).toBe(303);
  });

  it('remains fail-closed in production even if the raw flag is true', async () => {
    runtimeEnv.NODE_ENV = 'production';
    runtimeEnv.ALLOW_DEV_AUTH_BYPASS = true;

    const response = await GET(
      new Request('https://example.test/api/auth/dev-bypass?token=dev%3Aadmin'),
    );

    expect(exchangeIntegratorToken).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://example.test/app');
  });
});
