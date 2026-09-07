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
}));

vi.mock('next/navigation', () => ({
  notFound: fakes.notFound,
  permanentRedirect: fakes.permanentRedirect,
}));
vi.mock('./loadDoctorWorkspaceShell', () => ({
  loadDoctorWorkspaceShell: fakes.loadDoctorWorkspaceShell,
}));

import DoctorBroadcastsPage from './broadcasts/page';
import DoctorClinicalTestsLayout from './clinical-tests/layout';
import DoctorCommentsPage from './comments/page';
import DoctorExercisesLayout from './exercises/layout';
import DoctorLfkTemplatesLayout from './lfk-templates/layout';
import DoctorMessagesPage from './messages/page';
import DoctorRecommendationsLayout from './recommendations/layout';
import DoctorReferencesLayout from './references/layout';
import DoctorTestSetsLayout from './test-sets/layout';
import DoctorTreatmentProgramPromoLayout from './treatment-program-promo/layout';
import DoctorTreatmentProgramTemplatesLayout from './treatment-program-templates/layout';

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

  it.each([
    ['clinical tests', DoctorClinicalTestsLayout],
    ['exercises', DoctorExercisesLayout],
    ['LFK templates', DoctorLfkTemplatesLayout],
    ['recommendations', DoctorRecommendationsLayout],
    ['references', DoctorReferencesLayout],
    ['test sets', DoctorTestSetsLayout],
    ['treatment program promo', DoctorTreatmentProgramPromoLayout],
    ['treatment program templates', DoctorTreatmentProgramTemplatesLayout],
  ] as const)('guards the complete rehabilitation catalog cluster: %s', async (_name, layout) => {
    fakes.loadDoctorWorkspaceShell.mockResolvedValue(shellWith('rehabilitation', false));
    await expect(layout({ children: 'catalog-child' })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('leaves a rehabilitation catalog child untouched when enabled', async () => {
    fakes.loadDoctorWorkspaceShell.mockResolvedValue(shellWith('rehabilitation', true));
    await expect(DoctorExercisesLayout({ children: 'exercise-catalog' })).resolves.toBe(
      'exercise-catalog',
    );
  });
});
