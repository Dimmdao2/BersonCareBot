import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/shared/types/session';

const fakes = vi.hoisted(() => ({
  bound: false,
  cookie: '',
  writtenCookie: '',
  resolvedSurfaceHeader: '',
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
    set: (name: string, value: string) => {
      if (name === 'bersoncare_webapp_session') fakes.writtenCookie = value;
    },
  }),
  headers: async () =>
    new Headers(
      fakes.resolvedSurfaceHeader
        ? { 'x-bc-resolved-surface': fakes.resolvedSurfaceHeader }
        : undefined,
    ),
}));
vi.mock('@/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    ALLOW_DEV_AUTH_BYPASS: false,
    SESSION_COOKIE_SECRET: 'cold-composition-test-secret',
    APP_BASE_URL: 'https://therapysto.example.test',
    PATIENT_APP_ORIGIN: 'https://therapygo.example.test',
    PATIENT_APP_NAME: 'TherapyGo',
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
import { serializeResolvedSurface, type RequestSurface } from '@/shared/lib/surface/requestSurface';
import { getCurrentSessionForIdentitySelf, setSessionFromUser } from './service';

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
  fakes.writtenCookie = '';
  fakes.resolvedSurfaceHeader = '';
});

describe('cold route session composition', () => {
  it('binds the auth port in the route module graph before resolving the signed identity', async () => {
    await expect(getCurrentSessionForIdentitySelf()).resolves.toMatchObject({ user });

    expect(fakes.calls.slice(0, 2)).toEqual(['bind', 'require-port']);
    expect(fakes.findByUserId).toHaveBeenCalledWith(user.userId);
  });
});

function resolvedSurfaceHeader(surface: RequestSurface): string {
  return serializeResolvedSurface(
    surface === 'patient_branded'
      ? {
          surface,
          publicOrigin: 'https://clinic.example.test',
          organizationId: '00000000-0000-4000-8000-000000000201',
          clinicSlug: 'berson',
          effectivePatientBrand: {
            effectiveDisplayName: 'Clinic',
            patientAppName: 'Clinic App',
            accentToken: '#123456',
          },
          authPolicy: { availableMethods: ['email_code'], enabledMethods: ['email_code'] },
        }
      : {
          surface,
          publicOrigin: `https://${surface}.example.test`,
          authPolicy: { availableMethods: ['password'], enabledMethods: ['password'] },
        },
  );
}

describe('session audience follows the resolved product surface', () => {
  it.each([
    ['staff', 'client'],
    ['staff', 'admin'],
    ['platform_admin', 'doctor'],
    ['platform_admin', 'client'],
    ['patient_default', 'doctor'],
    ['patient_default', 'admin'],
    ['patient_branded', 'doctor'],
    ['patient_branded', 'admin'],
  ] as const)('does not mint a %s-host session for a %s account', async (surface, role) => {
    fakes.resolvedSurfaceHeader = resolvedSurfaceHeader(surface);

    await expect(setSessionFromUser({ ...user, role })).rejects.toThrow();

    expect(fakes.writtenCookie).toBe('');
  });

  it.each([
    ['staff', 'doctor'],
    ['platform_admin', 'admin'],
    ['patient_default', 'client'],
    ['patient_branded', 'client'],
  ] as const)('mints a %s-host session for its %s audience', async (surface, role) => {
    fakes.resolvedSurfaceHeader = resolvedSurfaceHeader(surface);

    await setSessionFromUser({ ...user, role });

    expect(fakes.writtenCookie).not.toBe('');
  });
});
