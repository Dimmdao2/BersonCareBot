import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/shared/types/session';

const fakes = vi.hoisted(() => ({
  bound: false,
  cookie: '',
  calls: [] as string[],
  ensureAuthModulePortsBound: vi.fn(() => {
    fakes.calls.push('bind');
    fakes.bound = true;
  }),
  findByUserId: vi.fn(),
  getVerifiedEmailForUser: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'bersoncare_webapp_session' && fakes.cookie
        ? { name, value: fakes.cookie }
        : undefined,
    set: vi.fn(),
  }),
  headers: async () => new Headers(),
}));
vi.mock('@/config/env', () => ({
  devBypassDatabaseIdentityIsReadOnly: () => true,
  env: {
    NODE_ENV: 'test',
    ALLOW_DEV_AUTH_BYPASS: false,
    SESSION_COOKIE_SECRET: 'cold-composition-test-secret',
  },
  isProduction: false,
  webappRuntimeDatabaseIsConfigured: () => true,
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: fakes.ensureAuthModulePortsBound,
}));
vi.mock('@/modules/auth/sessionUserPort', () => ({
  requireSessionUserPort: () => {
    fakes.calls.push('require-port');
    if (!fakes.bound) throw new Error('SessionUserPort is not bound');
    return {
      findByUserId: fakes.findByUserId,
      getVerifiedEmailForUser: fakes.getVerifiedEmailForUser,
    };
  },
}));
vi.mock('@/app-layer/principal/sessionPrincipal', () => ({
  stampDbPrincipalFromSession: vi.fn(),
}));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
  runWithStaffSecuritySelfPrincipal: async (
    _userId: string,
    _source: string,
    fn: () => unknown,
  ) => fn(),
}));
vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureCorrelationId: vi.fn(),
  ensureDbPrincipalContext: vi.fn(),
}));
vi.mock('@/modules/auth/envRole', () => ({
  isVerifiedEmailGlobalAdminAsync: vi.fn(async () => false),
  reconcileDbRoleWithEnvRole: vi.fn(),
  resolveRoleAsync: vi.fn(),
  isWhitelistedAsync: vi.fn(),
}));
vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getIntegratorWebappEntrySecret: vi.fn(),
  getMaxBotApiKey: vi.fn(),
  getTelegramBotToken: vi.fn(),
}));

import { encodeSessionCookie } from './sessionCookie';
import { getCurrentSessionForIdentitySelf } from './service';

const user: SessionUser = {
  userId: '00000000-0000-4000-8000-000000000107',
  role: 'admin',
  displayName: 'Cold route admin',
  bindings: {},
  sessionEpoch: 7,
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.bound = false;
  fakes.calls.length = 0;
  fakes.findByUserId.mockResolvedValue(user);
  fakes.getVerifiedEmailForUser.mockResolvedValue(null);
  fakes.cookie = encodeSessionCookie({
    user,
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  });
});

describe('cold route session composition', () => {
  it('binds the auth port in the route module graph before resolving the signed identity', async () => {
    await expect(getCurrentSessionForIdentitySelf()).resolves.toMatchObject({ user });

    expect(fakes.calls.slice(0, 2)).toEqual(['bind', 'require-port']);
    expect(fakes.findByUserId).toHaveBeenCalledWith(user.userId);
  });
});
