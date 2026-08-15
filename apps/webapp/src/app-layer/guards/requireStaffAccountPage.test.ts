import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  authPortsBound: false,
  ensureAuthModulePortsBound: vi.fn(),
  getCurrentSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`redirect:${target}`);
  }),
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: fakes.ensureAuthModulePortsBound,
}));
vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: fakes.getCurrentSession,
  getCurrentSessionForIdentitySelf: vi.fn(),
}));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureDbPrincipalContext: vi.fn(),
}));

import { requireStaffAccountPage } from './requireRole';

const ADMIN_SESSION = {
  user: {
    userId: 'd3361e0e-3600-4f47-a00a-4a37e718b7b0',
    role: 'admin',
    displayName: 'Admin',
    bindings: {},
  },
  issuedAt: 1,
  expiresAt: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.authPortsBound = false;
  fakes.ensureAuthModulePortsBound.mockImplementation(() => {
    fakes.authPortsBound = true;
  });
  fakes.getCurrentSession.mockImplementation(async () => {
    if (!fakes.authPortsBound) throw new Error('SessionUserPort is not bound');
    return ADMIN_SESSION;
  });
});

describe('requireStaffAccountPage', () => {
  it('binds the RSC auth ports before resolving the account session', async () => {
    await expect(requireStaffAccountPage()).resolves.toBe(ADMIN_SESSION);

    expect(fakes.ensureAuthModulePortsBound).toHaveBeenCalledOnce();
    expect(fakes.getCurrentSession).toHaveBeenCalledOnce();
  });
});
