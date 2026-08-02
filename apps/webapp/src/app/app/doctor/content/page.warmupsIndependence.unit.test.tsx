import { describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorWorkspaceContext: vi.fn(),
  requireEntitlementForReadAction: vi.fn(),
  requireEntitlementForMutationAction: vi.fn(),
  getMechanicMutationAvailability: vi.fn(),
  getMechanicSurfaceVisibility: vi.fn(),
  contentHubShell: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceContext: fakes.requireDoctorWorkspaceContext,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForReadAction: fakes.requireEntitlementForReadAction,
  requireEntitlementForMutationAction: fakes.requireEntitlementForMutationAction,
  getMechanicMutationAvailability: fakes.getMechanicMutationAvailability,
  getMechanicSurfaceVisibility: fakes.getMechanicSurfaceVisibility,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: async (
    _workspace: unknown,
    _operation: string,
    fn: () => Promise<unknown>,
  ) => fn(),
}));
vi.mock('@/infra/logging/serverRuntimeLog', () => ({ logServerRuntimeError: vi.fn() }));
vi.mock('@/shared/ui/doctor/DoctorAppShell', () => ({
  DoctorAppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('./ContentHubShell', () => ({
  ContentHubShell: (props: unknown) => {
    fakes.contentHubShell(props);
    return <div>Редактор разминок</div>;
  },
}));

import DoctorContentPage from './page';

const organizationId = '11111111-1111-4111-8111-111111111111';

describe('doctor content hub — warmups entitlement independence', () => {
  it('keeps the warmup editor reachable when warmups are enabled and CMS pages are disabled', async () => {
    fakes.requireDoctorWorkspaceContext.mockResolvedValue({
      organizationId,
      session: { user: { userId: 'doctor-1', role: 'doctor' } },
    });
    fakes.requireEntitlementForReadAction.mockImplementation(
      async (_workspace: unknown, mechanic: string) =>
        mechanic === 'cms_pages'
          ? { ok: false, mechanic, reason: 'entitlement_required' }
          : { ok: true },
    );
    fakes.requireEntitlementForMutationAction.mockResolvedValue({
      ok: false,
      mechanic: 'patient_home_today',
      reason: 'entitlement_required',
    });
    fakes.getMechanicSurfaceVisibility.mockImplementation(
      async (_workspace: unknown, mechanic: string) => ({
        specialistNavigation: mechanic === 'warmups',
        patientNavigation: mechanic === 'warmups',
        directUrl: mechanic === 'warmups',
        warning: null,
      }),
    );
    fakes.getMechanicMutationAvailability.mockImplementation(
      async (_workspace: unknown, mechanic: string) =>
        mechanic === 'warmups'
          ? { available: true }
          : { available: false, reason: 'entitlement_required' },
    );
    fakes.buildAppDeps.mockReturnValue({
      contentPages: { listAll: async () => [] },
      contentSections: { listAll: async () => [] },
      materialRating: { listDoctorAggregates: async () => new Map() },
      courses: { listCoursesForDoctor: async () => [] },
    });

    const result = (await DoctorContentPage()) as ReactElement<{
      children: ReactElement<Record<string, unknown>>;
    }>;
    expect(result.props.children.props).toEqual(
      expect.objectContaining({
        cmsEnabled: false,
        warmupsEnabled: true,
        canManageCms: false,
        canManageWarmups: true,
      }),
    );
  });
});
