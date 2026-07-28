import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecommendationWriteOptions } from '@/modules/recommendations/service';

const {
  archiveRecommendationMock,
  createRecommendationMock,
  getRecommendationMock,
  listActiveItemsByCategoryCodeMock,
  requireDoctorWorkspaceContextMock,
  unarchiveRecommendationMock,
  updateRecommendationMock,
  withDoctorWorkspacePrincipalMock,
  principalState,
} = vi.hoisted(() => {
  const principalState = { inside: false };
  return {
    archiveRecommendationMock: vi.fn(),
    createRecommendationMock: vi.fn(),
    getRecommendationMock: vi.fn(),
    listActiveItemsByCategoryCodeMock: vi.fn(),
    requireDoctorWorkspaceContextMock: vi.fn(),
    unarchiveRecommendationMock: vi.fn(),
    updateRecommendationMock: vi.fn(),
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
    recommendations: {
      archiveRecommendation: archiveRecommendationMock,
      createRecommendation: createRecommendationMock,
      getRecommendation: getRecommendationMock,
      unarchiveRecommendation: unarchiveRecommendationMock,
      updateRecommendation: updateRecommendationMock,
    },
    references: {
      listActiveItemsByCategoryCode: listActiveItemsByCategoryCodeMock,
    },
  }),
}));

import {
  archiveRecommendationCore,
  saveRecommendationCore,
  unarchiveRecommendationCore,
} from './actionsShared';

const actorUserId = '00000000-0000-4000-8000-000000000001';
const recommendationId = '550e8400-e29b-41d4-a716-446655440000';

function workspaceContext() {
  return {
    organizationId: 'org-1',
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
  options: RecommendationWriteOptions | undefined,
  fn: () => Promise<T>,
) {
  expect(options?.runRecommendationWrite).toBeDefined();
  return options!.runRecommendationWrite!(fn);
}

describe('doctor recommendation action shared principal writes', () => {
  beforeEach(() => {
    archiveRecommendationMock.mockReset();
    createRecommendationMock.mockReset();
    getRecommendationMock.mockReset();
    listActiveItemsByCategoryCodeMock.mockReset();
    requireDoctorWorkspaceContextMock.mockReset();
    unarchiveRecommendationMock.mockReset();
    updateRecommendationMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    principalState.inside = false;

    requireDoctorWorkspaceContextMock.mockResolvedValue(workspaceContext());
    listActiveItemsByCategoryCodeMock.mockResolvedValue([]);
  });

  it('creates a recommendation inside doctor workspace principal with the create source', async () => {
    createRecommendationMock.mockImplementation(
      async (_input, _actorId, options: RecommendationWriteOptions) =>
        runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
          return { id: recommendationId };
        }),
    );

    const result = await saveRecommendationCore(formWith({ title: ' Новая рекомендация ' }));

    expect(result).toEqual({ ok: true, recommendationId, wasUpdate: false });
    expect(createRecommendationMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Новая рекомендация' }),
      actorUserId,
      { runRecommendationWrite: expect.any(Function) },
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceContext(),
      'doctor.recommendations.create',
      expect.any(Function),
    );
  });

  it('keeps update pre-read outside principal, then updates inside principal', async () => {
    getRecommendationMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return { id: recommendationId, isArchived: false };
    });
    updateRecommendationMock.mockImplementation(
      async (_id, _input, options: RecommendationWriteOptions) => {
        expect(principalState.inside).toBe(false);
        return runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
          return { id: recommendationId };
        });
      },
    );

    const result = await saveRecommendationCore(
      formWith({ id: recommendationId, title: ' Обновлено ' }),
    );

    expect(result).toEqual({ ok: true, recommendationId, wasUpdate: true });
    expect(updateRecommendationMock).toHaveBeenCalledWith(
      recommendationId,
      expect.objectContaining({ title: 'Обновлено' }),
      { runRecommendationWrite: expect.any(Function) },
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceContext(),
      'doctor.recommendations.update',
      expect.any(Function),
    );
  });

  it('archives and unarchives through source-tagged write options', async () => {
    archiveRecommendationMock.mockImplementation(
      async (_id, _archiveOptions, options: RecommendationWriteOptions) =>
        runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
        }),
    );
    unarchiveRecommendationMock.mockImplementation(
      async (_id, options: RecommendationWriteOptions) =>
        runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
        }),
    );

    expect(await archiveRecommendationCore(formWith({ id: recommendationId }))).toEqual({
      kind: 'archived',
      id: recommendationId,
    });
    expect(await unarchiveRecommendationCore(formWith({ id: recommendationId }))).toEqual({
      kind: 'unarchived',
      id: recommendationId,
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      1,
      workspaceContext(),
      'doctor.recommendations.archive',
      expect.any(Function),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      2,
      workspaceContext(),
      'doctor.recommendations.unarchive',
      expect.any(Function),
    );
  });
});
