import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { DoctorCommunicationsShellProps } from './DoctorCommunicationsShell';
import type { WorkspaceModuleEffective } from '@/modules/system-settings/doctorWorkspaceComposition';
import { resolveCommunicationsSurface } from '@/modules/doctor-communications/communicationsSurface';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  loadDoctorWorkspaceShell: vi.fn(),
  loadBadges: vi.fn(),
  loadAudience: vi.fn(),
  loadComments: vi.fn(),
  loadPatients: vi.fn(),
  getMutationAvailability: vi.fn(),
  getDisplayTimeZone: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  permanentRedirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: fakes.notFound,
  permanentRedirect: fakes.permanentRedirect,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/analytics/loadAnalyticsAudience', () => ({
  loadDoctorAnalyticsAudience: fakes.loadAudience,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (_workspace: unknown, operation: () => unknown) => operation(),
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  getMechanicMutationAvailability: fakes.getMutationAvailability,
}));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: fakes.getDisplayTimeZone,
}));
vi.mock('../comments/loadDoctorExerciseCommentsForTab', () => ({
  loadDoctorExerciseCommentsForTab: fakes.loadComments,
}));
vi.mock('../comments/loadDoctorCommentPatients', () => ({
  loadDoctorCommentPatients: fakes.loadPatients,
}));
vi.mock('./loadDoctorCommunicationsBadges', () => ({
  loadDoctorCommunicationsBadges: fakes.loadBadges,
}));
vi.mock('../loadDoctorWorkspaceShell', () => ({
  loadDoctorWorkspaceShell: fakes.loadDoctorWorkspaceShell,
}));
vi.mock('./DoctorCommunicationsShell', () => ({
  DoctorCommunicationsShell: () => null,
}));

import DoctorCommunicationsPage from './page';

const ALL_MODULES_OFF = {
  medical_record: false,
  encounters: false,
  rehabilitation: false,
  direct_chat: false,
  program_comments: false,
  program_media: false,
  mailings: false,
  analytics: false,
  client_portal: false,
  video_meetings: false,
} satisfies WorkspaceModuleEffective;

const workspaceAccess = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  session: { user: { userId: 'doctor-1' } },
};

function useModules(modules: WorkspaceModuleEffective) {
  fakes.loadDoctorWorkspaceShell.mockResolvedValue({
    workspaceAccess,
    workspaceModules: modules,
    communicationsSurface: resolveCommunicationsSurface(modules, {
      direct_chat: 'all',
      program_comments: 'on_support',
    }),
  });
}

describe('communications workspace projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.buildAppDeps.mockReturnValue({
      doctorClients: {
        filterPatientUserIdsByClientChannel: async (ids: readonly string[]) => new Set(ids),
      },
    });
    fakes.loadAudience.mockResolvedValue({ excludedUserIds: [] });
    fakes.loadComments.mockResolvedValue({ items: [] });
    fakes.loadPatients.mockResolvedValue([]);
    fakes.loadBadges.mockResolvedValue({ chats: 2 });
    fakes.getMutationAvailability.mockResolvedValue({ available: true });
    fakes.getDisplayTimeZone.mockResolvedValue('Europe/Moscow');
  });

  it('selects the first effective child and loads only that child bootstrap', async () => {
    useModules({ ...ALL_MODULES_OFF, program_comments: true, mailings: true });

    const result = (await DoctorCommunicationsPage({
      searchParams: Promise.resolve({ tab: 'chats' }),
    })) as ReactElement<DoctorCommunicationsShellProps>;

    expect(fakes.loadComments).toHaveBeenCalledOnce();
    expect(fakes.loadPatients).toHaveBeenCalledOnce();
    expect(fakes.loadBadges).not.toHaveBeenCalled();
    expect(result.props.initialTab).toBe('comments');
  });

  it('loads no hidden child bootstrap and treats an empty communications shell as absent', async () => {
    useModules(ALL_MODULES_OFF);
    await expect(DoctorCommunicationsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(fakes.loadComments).not.toHaveBeenCalled();
    expect(fakes.loadPatients).not.toHaveBeenCalled();
    expect(fakes.loadBadges).not.toHaveBeenCalled();
  });

  it('moves legacy broadcasts tab links to the standalone broadcasts page', async () => {
    await expect(
      DoctorCommunicationsPage({
        searchParams: Promise.resolve({ tab: 'broadcasts', archive: '1' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/app/doctor/broadcasts?archive=1');
    expect(fakes.loadDoctorWorkspaceShell).not.toHaveBeenCalled();
  });
});
