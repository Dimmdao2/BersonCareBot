import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorAccess: vi.fn(),
  requireDoctorWorkspaceContext: vi.fn(),
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(),
}));

import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorAccess, requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import type { MechanicAccessState } from '@/modules/org-entitlements/types';
import { executeBroadcastAction, listBroadcastAuditAction, saveDraftAction } from './actions';

const workspace = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  session: { user: { userId: '22222222-2222-4222-8222-222222222222' } },
};

function deniedEntitlements(state: Extract<MechanicAccessState, 'disabled' | 'read_only'>) {
  return {
    resolveMechanicAccess: async () => ({
      mechanic: 'mailings' as const,
      state,
      policySource: 'system' as const,
      warning: null,
    }),
  };
}

describe('mailing mutation entitlement boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireDoctorWorkspaceContext).mockResolvedValue(workspace as never);
    vi.mocked(requireDoctorAccess).mockResolvedValue(workspace.session as never);
  });

  it.each(['disabled', 'read_only'] as const)(
    'refuses a direct %s-tariff mailing send before it reaches broadcast delivery',
    async (state) => {
      const execute = vi.fn();
      vi.mocked(buildAppDeps).mockReturnValue({
        orgEntitlements: deniedEntitlements(state),
        doctorBroadcasts: { execute },
      } as unknown as ReturnType<typeof buildAppDeps>);

      await expect(executeBroadcastAction({} as never)).rejects.toThrow('Невозможно отправить рассылку');
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it.each(['disabled', 'read_only'] as const)(
    'refuses a direct %s-tariff draft creation before it reaches the draft port',
    async (state) => {
      const saveDraft = vi.fn();
      vi.mocked(buildAppDeps).mockReturnValue({
        orgEntitlements: deniedEntitlements(state),
        doctorBroadcastComposer: { saveDraft },
      } as unknown as ReturnType<typeof buildAppDeps>);

      await expect(saveDraftAction({} as never)).rejects.toThrow('Невозможно сохранить черновик рассылки');
      expect(saveDraft).not.toHaveBeenCalled();
    },
  );

  it('keeps sent-mailing history readable when the mailing mechanic is disabled', async () => {
    const entries = [{ id: 'sent-mailing' }];
    const listAudit = vi.fn().mockResolvedValue(entries);
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: deniedEntitlements('disabled'),
      doctorBroadcasts: { listAudit },
    } as unknown as ReturnType<typeof buildAppDeps>);

    await expect(listBroadcastAuditAction()).resolves.toEqual(entries);
    expect(listAudit).toHaveBeenCalledOnce();
  });
});
