import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LfkTemplateWriteOptions } from '@/modules/lfk-templates/service';

const {
  revalidatePathMock,
  redirectMock,
  requireDoctorAccessMock,
  requireDoctorWorkspaceContextMock,
  withDoctorWorkspacePrincipalMock,
  createTemplateMock,
  updateTemplateMock,
  updateExercisesMock,
  publishTemplateMock,
  archiveTemplateMock,
  unarchiveTemplateMock,
  getTemplateMock,
  getTemplateUsageMock,
  requireEntitlementForMutationActionMock,
  principalState,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn((target: string) => {
    throw new Error(`redirect:${target}`);
  }),
  requireDoctorAccessMock: vi.fn(),
  requireDoctorWorkspaceContextMock: vi.fn(),
  withDoctorWorkspacePrincipalMock: vi.fn(),
  createTemplateMock: vi.fn(),
  updateTemplateMock: vi.fn(),
  updateExercisesMock: vi.fn(),
  publishTemplateMock: vi.fn(),
  archiveTemplateMock: vi.fn(),
  unarchiveTemplateMock: vi.fn(),
  getTemplateMock: vi.fn(),
  getTemplateUsageMock: vi.fn(),
  requireEntitlementForMutationActionMock: vi.fn(),
  principalState: { inside: false },
}));

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const DOCTOR_USER_ID = '11111111-1111-4111-8111-111111111111';

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock('next/navigation', () => ({
  redirect: (...args: [string]) => redirectMock(...args),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorAccess: (...args: unknown[]) => requireDoctorAccessMock(...args),
  requireDoctorWorkspaceContext: (...args: unknown[]) => requireDoctorWorkspaceContextMock(...args),
}));

vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutationAction: (...args: unknown[]) =>
    requireEntitlementForMutationActionMock(...args),
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    lfkTemplates: {
      createTemplate: createTemplateMock,
      updateTemplate: updateTemplateMock,
      updateExercises: updateExercisesMock,
      publishTemplate: publishTemplateMock,
      archiveTemplate: archiveTemplateMock,
      unarchiveTemplate: unarchiveTemplateMock,
      getTemplate: getTemplateMock,
      getTemplateUsage: getTemplateUsageMock,
    },
  }),
}));

import {
  archiveDoctorLfkTemplate,
  createLfkTemplateDraftFromEditor,
  persistLfkTemplateDraft,
  publishLfkTemplateAction,
  unarchiveDoctorLfkTemplate,
} from './actions';

function workspaceContext() {
  return {
    organizationId: ORGANIZATION_ID,
    session: {
      user: {
        userId: DOCTOR_USER_ID,
      },
    },
  };
}

function formWith(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

async function runWriteOption<T>(
  options: LfkTemplateWriteOptions | undefined,
  fn: () => Promise<T>,
) {
  expect(options?.runTemplateWrite).toBeDefined();
  return options!.runTemplateWrite!(fn);
}

describe('doctor lfk template actions principal boundaries', () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
    redirectMock.mockClear();
    requireDoctorAccessMock.mockReset();
    requireDoctorWorkspaceContextMock.mockReset();
    requireDoctorWorkspaceContextMock.mockResolvedValue(workspaceContext());
    withDoctorWorkspacePrincipalMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      async <T>(_workspace: { organizationId: string }, _source: string, fn: () => Promise<T>) => {
        principalState.inside = true;
        try {
          return await fn();
        } finally {
          principalState.inside = false;
        }
      },
    );
    createTemplateMock.mockReset();
    updateTemplateMock.mockReset();
    updateExercisesMock.mockReset();
    publishTemplateMock.mockReset();
    archiveTemplateMock.mockReset();
    unarchiveTemplateMock.mockReset();
    getTemplateMock.mockReset();
    getTemplateUsageMock.mockReset();
    requireEntitlementForMutationActionMock.mockReset();
    requireEntitlementForMutationActionMock.mockResolvedValue({ ok: true });
    principalState.inside = false;
  });

  it('creates from editor with separate create and exercise-update principal sources', async () => {
    createTemplateMock.mockImplementation(
      async (_input, _actorId, options: LfkTemplateWriteOptions) =>
        runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
          return { id: 'tpl-1' };
        }),
    );
    updateExercisesMock.mockImplementation(
      async (_templateId, _exercises, options: LfkTemplateWriteOptions) =>
        runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
        }),
    );

    const result = await createLfkTemplateDraftFromEditor({
      title: 'Комплекс',
      description: null,
      exercises: [{ exerciseId: 'ex-1', sortOrder: 0 }],
    });

    expect(result).toEqual({ ok: true, id: 'tpl-1' });
    expect(createTemplateMock).toHaveBeenCalledWith(
      { title: 'Комплекс', description: null },
      DOCTOR_USER_ID,
      { runTemplateWrite: expect.any(Function) },
    );
    expect(updateExercisesMock).toHaveBeenCalledWith(
      'tpl-1',
      [{ exerciseId: 'ex-1', sortOrder: 0 }],
      { includePlatformBase: true, runTemplateWrite: expect.any(Function) },
    );
    expect(requireEntitlementForMutationActionMock).toHaveBeenCalledWith(
      workspaceContext(),
      'exercise_catalog',
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      1,
      workspaceContext(),
      'doctor.lfk-templates.create',
      expect.any(Function),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      2,
      workspaceContext(),
      'doctor.lfk-templates.update-exercises',
      expect.any(Function),
    );
    expect(requireDoctorAccessMock).not.toHaveBeenCalled();
    expect(principalState.inside).toBe(false);
  });

  it('removes platform-base composition from create when the workspace mutation gate denies it', async () => {
    requireEntitlementForMutationActionMock.mockResolvedValue({
      ok: false,
      mechanic: 'exercise_catalog',
      reason: 'commercial_read_only',
    });
    createTemplateMock.mockResolvedValue({ id: 'tpl-1' });

    const result = await createLfkTemplateDraftFromEditor({
      title: 'Комплекс',
      description: null,
      exercises: [{ exerciseId: 'platform-exercise', sortOrder: 0 }],
    });

    expect(result).toEqual({ ok: true, id: 'tpl-1' });
    expect(requireEntitlementForMutationActionMock).toHaveBeenCalledWith(
      workspaceContext(),
      'exercise_catalog',
    );
    expect(updateExercisesMock).toHaveBeenCalledWith(
      'tpl-1',
      [{ exerciseId: 'platform-exercise', sortOrder: 0 }],
      { includePlatformBase: false, runTemplateWrite: expect.any(Function) },
    );
  });

  it('keeps template pre-read outside principal before draft update writes', async () => {
    getTemplateMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return { id: 'tpl-1', status: 'draft' };
    });
    updateTemplateMock.mockImplementation(
      async (_templateId, _input, options: LfkTemplateWriteOptions) =>
        runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
        }),
    );
    updateExercisesMock.mockImplementation(
      async (_templateId, _exercises, options: LfkTemplateWriteOptions) =>
        runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
        }),
    );

    const result = await persistLfkTemplateDraft({
      templateId: 'tpl-1',
      title: 'Комплекс',
      description: 'Описание',
      exercises: [],
    });

    expect(result).toEqual({ ok: true });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      1,
      workspaceContext(),
      'doctor.lfk-templates.update',
      expect.any(Function),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      2,
      workspaceContext(),
      'doctor.lfk-templates.update-exercises',
      expect.any(Function),
    );
    expect(requireEntitlementForMutationActionMock).toHaveBeenCalledWith(
      workspaceContext(),
      'exercise_catalog',
    );
    expect(principalState.inside).toBe(false);
  });

  it('removes platform-base composition from draft updates when the mechanic is disabled', async () => {
    requireEntitlementForMutationActionMock.mockResolvedValue({
      ok: false,
      mechanic: 'exercise_catalog',
      reason: 'entitlement_required',
    });
    getTemplateMock.mockResolvedValue({ id: 'tpl-1', status: 'draft' });

    const result = await persistLfkTemplateDraft({
      templateId: 'tpl-1',
      title: 'Комплекс',
      description: null,
      exercises: [],
    });

    expect(result).toEqual({ ok: true });
    expect(requireEntitlementForMutationActionMock).toHaveBeenCalledWith(
      workspaceContext(),
      'exercise_catalog',
    );
    expect(updateExercisesMock).toHaveBeenCalledWith('tpl-1', [], {
      includePlatformBase: false,
      runTemplateWrite: expect.any(Function),
    });
  });

  it('does not enter principal when draft update pre-read misses', async () => {
    getTemplateMock.mockResolvedValue(null);

    const result = await persistLfkTemplateDraft({
      templateId: 'missing',
      title: 'Комплекс',
      description: null,
      exercises: [],
    });

    expect(result).toEqual({ ok: false, error: 'Шаблон не найден' });
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    expect(updateTemplateMock).not.toHaveBeenCalled();
    expect(updateExercisesMock).not.toHaveBeenCalled();
  });

  it('publishes under a publish principal source', async () => {
    publishTemplateMock.mockImplementation(async (_templateId, options: LfkTemplateWriteOptions) =>
      runWriteOption(options, async () => {
        expect(principalState.inside).toBe(true);
      }),
    );

    const result = await publishLfkTemplateAction('tpl-1');

    expect(result).toEqual({ ok: true });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceContext(),
      'doctor.lfk-templates.publish',
      expect.any(Function),
    );
    expect(principalState.inside).toBe(false);
  });

  it('archives and unarchives under distinct principal sources', async () => {
    archiveTemplateMock.mockImplementation(
      async (_templateId, _archiveOptions, options: LfkTemplateWriteOptions) =>
        runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
        }),
    );
    unarchiveTemplateMock.mockImplementation(
      async (_templateId, options: LfkTemplateWriteOptions) =>
        runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
        }),
    );

    await expect(
      archiveDoctorLfkTemplate(null, formWith({ id: 'tpl-1', acknowledgeUsageWarning: '1' })),
    ).rejects.toThrow('redirect:/app/doctor/lfk-templates');
    await expect(unarchiveDoctorLfkTemplate(null, formWith({ id: 'tpl-1' }))).rejects.toThrow(
      'redirect:/app/doctor/lfk-templates/tpl-1',
    );

    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      1,
      workspaceContext(),
      'doctor.lfk-templates.archive',
      expect.any(Function),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      2,
      workspaceContext(),
      'doctor.lfk-templates.unarchive',
      expect.any(Function),
    );
    expect(principalState.inside).toBe(false);
  });
});
