import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceModuleEffective } from '@/modules/system-settings/doctorWorkspaceComposition';

const fakes = vi.hoisted(() => ({
  loadDoctorWorkspaceShell: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  permanentRedirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
  buildAppDeps: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: fakes.notFound,
  permanentRedirect: fakes.permanentRedirect,
}));
vi.mock('./loadDoctorWorkspaceShell', () => ({
  loadDoctorWorkspaceShell: fakes.loadDoctorWorkspaceShell,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));

import DoctorBroadcastsPage from './broadcasts/page';
import DoctorCommentsPage from './comments/page';
import DoctorExercisesLayout from './exercises/layout';
import DoctorMessagesPage from './messages/page';
import NewEncounterPage from './patients/[userId]/visits/new/page';
import EditEncounterPage from './patients/[userId]/visits/[visitId]/page';

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
} satisfies WorkspaceModuleEffective;

function shellWith(module: keyof WorkspaceModuleEffective, effective: boolean) {
  return { workspaceModules: { ...ALL_MODULES_OFF, [module]: effective } };
}

describe('workspace-module direct page projection', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['direct_chat', DoctorMessagesPage, '/app/doctor/communications?tab=chats'],
    ['program_comments', DoctorCommentsPage, '/app/doctor/communications?tab=comments'],
    ['mailings', DoctorBroadcastsPage, '/app/doctor/communications?tab=broadcasts'],
  ] as const)('guards %s before its legacy redirect', async (module, page, redirectHref) => {
    fakes.loadDoctorWorkspaceShell.mockResolvedValue(shellWith(module, false));
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(fakes.permanentRedirect).not.toHaveBeenCalled();

    fakes.loadDoctorWorkspaceShell.mockResolvedValue(shellWith(module, true));
    await expect(page()).rejects.toThrow(`NEXT_REDIRECT:${redirectHref}`);
  });

  it('guards a rehabilitation catalog route while leaving its child untouched when enabled', async () => {
    fakes.loadDoctorWorkspaceShell.mockResolvedValue(shellWith('rehabilitation', false));
    await expect(DoctorExercisesLayout({ children: 'exercise-catalog' })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );

    fakes.loadDoctorWorkspaceShell.mockResolvedValue(shellWith('rehabilitation', true));
    await expect(DoctorExercisesLayout({ children: 'exercise-catalog' })).resolves.toBe(
      'exercise-catalog',
    );
  });

  it.each([
    [
      'new encounter',
      () =>
        NewEncounterPage({
          params: Promise.resolve({ userId: '11111111-1111-4111-8111-111111111111' }),
          searchParams: Promise.resolve({}),
        }),
    ],
    [
      'encounter edit',
      () =>
        EditEncounterPage({
          params: Promise.resolve({
            userId: '11111111-1111-4111-8111-111111111111',
            visitId: '22222222-2222-4222-8222-222222222222',
          }),
        }),
    ],
  ])('denies the direct %s page before patient or encounter data is read', async (_label, page) => {
    fakes.loadDoctorWorkspaceShell.mockResolvedValue(shellWith('encounters', false));

    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
  });
});
