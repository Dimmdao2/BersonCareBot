import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clearSession, runtimeEnv } = vi.hoisted(() => ({
  clearSession: vi.fn(async () => undefined),
  runtimeEnv: {
    NODE_ENV: 'development' as 'development' | 'test' | 'production',
    ALLOW_DEV_AUTH_BYPASS: true,
  },
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ auth: { clearSession } }),
}));

vi.mock('@/config/env', () => ({
  env: runtimeEnv,
}));

import { GET } from './route';

describe('GET /api/auth/dev-public', () => {
  beforeEach(() => {
    clearSession.mockClear();
    runtimeEnv.NODE_ENV = 'development';
    runtimeEnv.ALLOW_DEV_AUTH_BYPASS = true;
  });

  it.each(['registration', 'specialist-registration', 'clinic-registration'])(
    'clears the session and opens the combined specialist+clinic registration surface for %s',
    async (view) => {
      const response = await GET(
        new Request(`http://127.0.0.1:5200/api/auth/dev-public?view=${view}`),
      );

      expect(clearSession).toHaveBeenCalledOnce();
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(
        'http://127.0.0.1:5200/app?devView=registration',
      );
      const setCookie = response.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain('bersoncare_platform=');
      expect(setCookie).toContain('bersoncare_messenger_surface=');
      expect(setCookie).toContain('Max-Age=0');
    },
  );

  it.each(['', 'login', 'unknown'])(
    'opens the clean public login surface for view=%s',
    async (view) => {
      const response = await GET(
        new Request(`http://127.0.0.1:5200/api/auth/dev-public?view=${view}`),
      );

      expect(clearSession).toHaveBeenCalledOnce();
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('http://127.0.0.1:5200/app');
    },
  );

  it('does not clear a session when the development flag is disabled', async () => {
    runtimeEnv.ALLOW_DEV_AUTH_BYPASS = false;

    const response = await GET(new Request('https://example.test/api/auth/dev-public'));

    expect(clearSession).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://example.test/app');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('remains fail-closed in production even if the raw flag is true', async () => {
    runtimeEnv.NODE_ENV = 'production';
    runtimeEnv.ALLOW_DEV_AUTH_BYPASS = true;

    const response = await GET(new Request('https://example.test/api/auth/dev-public'));

    expect(clearSession).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://example.test/app');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
