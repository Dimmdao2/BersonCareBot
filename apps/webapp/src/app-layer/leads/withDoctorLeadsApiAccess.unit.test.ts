import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { withDoctorLeadsApiAccess } from './withDoctorLeadsApiAccess';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(() => ({ leads: {} })),
  requireClinicManagementApiContext: vi.fn(),
  requireEntitlementForRead: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  requireDoctorWorkspaceConfigModuleForApi: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireClinicManagementApiContext: fakes.requireClinicManagementApiContext,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForRead: fakes.requireEntitlementForRead,
  requireEntitlementForMutation: fakes.requireEntitlementForMutation,
}));
vi.mock('@/app-layer/guards/workspaceModuleAccess', () => ({
  requireDoctorWorkspaceConfigModuleForApi: fakes.requireDoctorWorkspaceConfigModuleForApi,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: <T>(_workspace: unknown, _source: string, fn: () => T): T => fn(),
}));

describe('doctor leads API access boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireClinicManagementApiContext.mockResolvedValue({
      ok: true,
      ctx: { organizationId: 'org-a' },
    });
    fakes.requireEntitlementForRead.mockResolvedValue({ ok: true });
    fakes.requireEntitlementForMutation.mockResolvedValue({ ok: true });
    fakes.requireDoctorWorkspaceConfigModuleForApi.mockResolvedValue({ ok: true, modules: {} });
  });

  it('keeps a successful mutation cleared through awaited guards and the physical write', async () => {
    const result = await runWithoutMechanicWriteClearance(() =>
      withDoctorLeadsApiAccess('mutation', 'doctor.leads.change', async () => {
        await Promise.resolve();
        assertMechanicWriteClearance('leads');
        return 'changed';
      }),
    );

    expect(result).toEqual({ ok: true, value: 'changed' });
  });

  it('does not grant write clearance to a read door', async () => {
    await expect(
      runWithoutMechanicWriteClearance(() =>
        withDoctorLeadsApiAccess('read', 'doctor.leads.read', () => {
          assertMechanicWriteClearance('leads');
          return 'unexpected';
        }),
      ),
    ).rejects.toThrow('mechanic write clearance required: leads');
  });
});
