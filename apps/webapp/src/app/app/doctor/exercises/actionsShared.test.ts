import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LfkExerciseWriteOptions } from '@/modules/lfk-exercises/service';

const {
  archiveExerciseMock,
  createExerciseMock,
  getExerciseMock,
  listActiveItemsByCategoryCodeMock,
  listExercisesMock,
  requireDoctorWorkspaceContextMock,
  unarchiveExerciseMock,
  updateExerciseMock,
  webappReposAreInMemoryMock,
  withDoctorWorkspacePrincipalMock,
  principalState,
} = vi.hoisted(() => {
  const principalState = { inside: false };
  return {
    archiveExerciseMock: vi.fn(),
    createExerciseMock: vi.fn(),
    getExerciseMock: vi.fn(),
    listActiveItemsByCategoryCodeMock: vi.fn(),
    listExercisesMock: vi.fn(),
    requireDoctorWorkspaceContextMock: vi.fn(),
    unarchiveExerciseMock: vi.fn(),
    updateExerciseMock: vi.fn(),
    webappReposAreInMemoryMock: vi.fn(),
    withDoctorWorkspacePrincipalMock: vi.fn(
      async <T>(_workspace: { organizationId: string }, _source: string, fn: () => Promise<T>) => {
        principalState.inside = true;
        try {
          return await fn();
        } finally {
          principalState.inside = false;
        }
      },
    ),
    principalState,
  };
});

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceContext: requireDoctorWorkspaceContextMock,
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    lfkExercises: {
      archiveExercise: archiveExerciseMock,
      createExercise: createExerciseMock,
      getExercise: getExerciseMock,
      listExercises: listExercisesMock,
      unarchiveExercise: unarchiveExerciseMock,
      updateExercise: updateExerciseMock,
    },
    references: {
      listActiveItemsByCategoryCode: listActiveItemsByCategoryCodeMock,
    },
  }),
}));

vi.mock('@/config/env', () => ({
  env: { NODE_ENV: 'test' },
  webappReposAreInMemory: webappReposAreInMemoryMock,
}));

vi.mock('@/infra/repos/pgLfkExercises', () => ({
  pgListExerciseUsageForMediaIds: vi.fn().mockResolvedValue({}),
}));

import {
  archiveDoctorExerciseCore,
  bulkCreateExercisesFromMediaCore,
  saveDoctorExerciseCore,
  unarchiveDoctorExerciseCore,
} from './actionsShared';

const actorUserId = '00000000-0000-4000-8000-000000000001';
const exerciseId = '550e8400-e29b-41d4-a716-446655440000';
const mediaId = '650e8400-e29b-41d4-a716-446655440000';
const mediaId2 = '750e8400-e29b-41d4-a716-446655440000';

function workspaceContext() {
  return {
    organizationId: 'org-1',
    membershipId: 'membership-1',
    membershipRole: 'doctor',
    specialistId: 'specialist-1',
    canManageOrganization: false,
    canManageAllSpecialists: false,
    session: {
      user: {
        userId: actorUserId,
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
  options: LfkExerciseWriteOptions | undefined,
  fn: () => Promise<T>,
) {
  expect(options?.runExerciseWrite).toBeDefined();
  return options!.runExerciseWrite!(fn);
}

describe('doctor exercise action shared principal writes', () => {
  beforeEach(() => {
    archiveExerciseMock.mockReset();
    createExerciseMock.mockReset();
    getExerciseMock.mockReset();
    listActiveItemsByCategoryCodeMock.mockReset();
    listExercisesMock.mockReset();
    requireDoctorWorkspaceContextMock.mockReset();
    unarchiveExerciseMock.mockReset();
    updateExerciseMock.mockReset();
    webappReposAreInMemoryMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    principalState.inside = false;

    requireDoctorWorkspaceContextMock.mockResolvedValue(workspaceContext());
    listActiveItemsByCategoryCodeMock.mockResolvedValue([]);
    webappReposAreInMemoryMock.mockReturnValue(true);
  });

  it('creates an exercise inside doctor workspace principal with the create source', async () => {
    createExerciseMock.mockImplementation(
      async (_input, _actorId, options: LfkExerciseWriteOptions) =>
        runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
          return { id: exerciseId };
        }),
    );

    const result = await saveDoctorExerciseCore(formWith({ title: ' Новое упражнение ' }));

    expect(result).toEqual({ ok: true, exerciseId, wasUpdate: false });
    expect(createExerciseMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Новое упражнение' }),
      actorUserId,
      { runExerciseWrite: expect.any(Function) },
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceContext(),
      'doctor.lfk-exercises.create',
      expect.any(Function),
    );
  });

  it('keeps update load and validation outside principal, then updates inside principal', async () => {
    getExerciseMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return { id: exerciseId, isArchived: false };
    });
    updateExerciseMock.mockImplementation(async (_id, _input, options: LfkExerciseWriteOptions) => {
      expect(principalState.inside).toBe(false);
      return runWriteOption(options, async () => {
        expect(principalState.inside).toBe(true);
        return { id: exerciseId };
      });
    });

    const result = await saveDoctorExerciseCore(formWith({ id: exerciseId, title: ' Обновлено ' }));

    expect(result).toEqual({ ok: true, exerciseId, wasUpdate: true });
    expect(getExerciseMock).toHaveBeenCalledWith(exerciseId);
    expect(updateExerciseMock).toHaveBeenCalledWith(
      exerciseId,
      expect.objectContaining({ title: 'Обновлено' }),
      { runExerciseWrite: expect.any(Function) },
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceContext(),
      'doctor.lfk-exercises.update',
      expect.any(Function),
    );
  });

  it('does not enter principal when save validation fails', async () => {
    const result = await saveDoctorExerciseCore(formWith({ title: '' }));

    expect(result).toEqual({ ok: false, error: 'Укажите название' });
    expect(createExerciseMock).not.toHaveBeenCalled();
    expect(updateExerciseMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it('does not enter principal when update target is missing', async () => {
    getExerciseMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return null;
    });

    const result = await saveDoctorExerciseCore(formWith({ id: exerciseId, title: 'Есть' }));

    expect(result).toEqual({ ok: false, error: 'Упражнение не найдено' });
    expect(updateExerciseMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it('archives inside doctor workspace principal with the archive source', async () => {
    archiveExerciseMock.mockImplementation(
      async (_id, _archiveOptions, options: LfkExerciseWriteOptions) => {
        expect(principalState.inside).toBe(false);
        return runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
        });
      },
    );

    const result = await archiveDoctorExerciseCore(
      formWith({ id: exerciseId, acknowledgeUsageWarning: '1' }),
    );

    expect(result).toEqual({ kind: 'archived', id: exerciseId });
    expect(archiveExerciseMock).toHaveBeenCalledWith(
      exerciseId,
      { acknowledgeUsageWarning: true },
      { runExerciseWrite: expect.any(Function) },
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceContext(),
      'doctor.lfk-exercises.archive',
      expect.any(Function),
    );
  });

  it('does not enter principal when archive id validation fails', async () => {
    const result = await archiveDoctorExerciseCore(formWith({ id: '' }));

    expect(result).toEqual({ kind: 'invalid', error: 'Не указано упражнение' });
    expect(archiveExerciseMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it('unarchives inside doctor workspace principal with the unarchive source', async () => {
    unarchiveExerciseMock.mockImplementation(async (_id, options: LfkExerciseWriteOptions) => {
      expect(principalState.inside).toBe(false);
      return runWriteOption(options, async () => {
        expect(principalState.inside).toBe(true);
      });
    });

    const result = await unarchiveDoctorExerciseCore(formWith({ id: exerciseId }));

    expect(result).toEqual({ kind: 'unarchived', id: exerciseId });
    expect(unarchiveExerciseMock).toHaveBeenCalledWith(exerciseId, {
      runExerciseWrite: expect.any(Function),
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceContext(),
      'doctor.lfk-exercises.unarchive',
      expect.any(Function),
    );
  });

  it('bulk creates each new media exercise inside principal after usage precheck outside principal', async () => {
    listExercisesMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return [];
    });
    createExerciseMock.mockImplementation(
      async (_input, _actorId, options: LfkExerciseWriteOptions) =>
        runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
          return { id: exerciseId };
        }),
    );

    const result = await bulkCreateExercisesFromMediaCore([
      { title: 'Первое', mediaUrl: `/api/media/${mediaId}`, mediaType: 'video' },
      { title: 'Второе', mediaUrl: `/api/media/${mediaId2}`, mediaType: 'image' },
    ]);

    expect(result).toEqual({
      ok: true,
      created: 2,
      skippedLinked: 0,
      failed: 0,
      createdIds: [exerciseId, exerciseId],
    });
    expect(listExercisesMock).toHaveBeenCalledWith({ includeArchived: false });
    expect(createExerciseMock).toHaveBeenCalledTimes(2);
    expect(createExerciseMock).toHaveBeenNthCalledWith(
      1,
      {
        title: 'Первое',
        media: [{ mediaUrl: `/api/media/${mediaId}`, mediaType: 'video', sortOrder: 0 }],
      },
      actorUserId,
      { runExerciseWrite: expect.any(Function) },
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledTimes(2);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      1,
      workspaceContext(),
      'doctor.lfk-exercises.bulk-create',
      expect.any(Function),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      2,
      workspaceContext(),
      'doctor.lfk-exercises.bulk-create',
      expect.any(Function),
    );
  });

  it('bulk create skips linked media without entering principal', async () => {
    listExercisesMock.mockResolvedValue([
      {
        id: exerciseId,
        media: [{ mediaUrl: `/api/media/${mediaId}` }],
      },
    ]);

    const result = await bulkCreateExercisesFromMediaCore([
      { title: 'Linked', mediaUrl: `/api/media/${mediaId}`, mediaType: 'video' },
    ]);

    expect(result).toEqual({ ok: true, created: 0, skippedLinked: 1, failed: 0, createdIds: [] });
    expect(createExerciseMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });
});
