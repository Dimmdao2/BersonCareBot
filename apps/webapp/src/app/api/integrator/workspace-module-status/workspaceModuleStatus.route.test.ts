import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  resolveOrganizationWorkspaceModules: vi.fn(),
  verifyIntegratorSignature: vi.fn(),
  enterVerifiedIntegratorOrganizationPrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/workspaceModuleAccess', () => ({
  resolveOrganizationWorkspaceModules: fakes.resolveOrganizationWorkspaceModules,
}));
vi.mock('@/app-layer/integrator/verifyIntegratorSignature', () => ({
  verifyIntegratorSignature: fakes.verifyIntegratorSignature,
}));
vi.mock('@/app-layer/principal/integratorOrganizationPrincipal', () => ({
  enterVerifiedIntegratorOrganizationPrincipal: fakes.enterVerifiedIntegratorOrganizationPrincipal,
}));

import { POST } from './route';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function signedRequest(organizationId = ORGANIZATION_ID): Request {
  const body = JSON.stringify({ organizationId, module: 'mailings' });
  const idempotencyKey = `workspace-module-status:${createHash('sha256').update(body).digest('hex')}`;
  return new Request('http://webapp.test/api/integrator/workspace-module-status', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-bersoncare-timestamp': '1790000000',
      'x-bersoncare-signature': 'signed',
      'x-bersoncare-idempotency-key': idempotencyKey,
    },
    body,
  });
}

describe('POST /api/integrator/workspace-module-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.verifyIntegratorSignature.mockReturnValue(true);
    fakes.enterVerifiedIntegratorOrganizationPrincipal.mockReturnValue(true);
    fakes.buildAppDeps.mockReturnValue({ systemSettings: {} });
    fakes.resolveOrganizationWorkspaceModules.mockResolvedValue({ mailings: false });
  });

  it('rejects an unauthenticated status request before tenant resolution', async () => {
    fakes.verifyIntegratorSignature.mockReturnValue(false);

    const response = await POST(signedRequest());

    expect(response.status).toBe(401);
    expect(fakes.enterVerifiedIntegratorOrganizationPrincipal).not.toHaveBeenCalled();
    expect(fakes.resolveOrganizationWorkspaceModules).not.toHaveBeenCalled();
  });

  it('resolves and returns only the signed request organization status', async () => {
    const deps = { systemSettings: {} };
    fakes.buildAppDeps.mockReturnValue(deps);

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, enabled: false });
    expect(fakes.enterVerifiedIntegratorOrganizationPrincipal).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      'api/integrator/workspace-module-status:POST',
    );
    expect(fakes.resolveOrganizationWorkspaceModules).toHaveBeenCalledWith(
      deps,
      ORGANIZATION_ID,
    );
  });

  it('fails closed when the tenant-scoped resolver is unavailable', async () => {
    fakes.resolveOrganizationWorkspaceModules.mockRejectedValue(new Error('db unavailable'));

    const response = await POST(signedRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'internal_error' });
  });
});
