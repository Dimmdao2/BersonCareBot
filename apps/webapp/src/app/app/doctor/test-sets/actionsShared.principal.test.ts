import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TestSetWriteOptions } from '@/modules/tests/service';

const {
  archiveTestSetMock,
  createTestSetMock,
  getTestSetMock,
  requireDoctorWorkspaceContextMock,
  setTestSetItemsMock,
  unarchiveTestSetMock,
  updateTestSetMock,
  withDoctorWorkspacePrincipalMock,
  principalState,
} = vi.hoisted(() => {
  const principalState = { inside: false };
  return {
    archiveTestSetMock: vi.fn(),
    createTestSetMock: vi.fn(),
    getTestSetMock: vi.fn(),
    requireDoctorWorkspaceContextMock: vi.fn(),
    setTestSetItemsMock: vi.fn(),
    unarchiveTestSetMock: vi.fn(),
    updateTestSetMock: vi.fn(),
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
    testSets: {
      archiveTestSet: archiveTestSetMock,
      createTestSet: createTestSetMock,
      getTestSet: getTestSetMock,
      setTestSetItems: setTestSetItemsMock,
      unarchiveTestSet: unarchiveTestSetMock,
      updateTestSet: updateTestSetMock,
    },
  }),
}));

import {
  archiveTestSetCore,
  createTestSetDraftCore,
  saveTestSetCore,
  saveTestSetItemsCore,
  unarchiveTestSetCore,
} from './actionsShared';

const actorUserId = '00000000-0000-4000-8000-000000000001';
const testSetId = '550e8400-e29b-41d4-a716-446655440000';
const clinicalTestId = '650e8400-e29b-41d4-a716-446655440000';

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

async function runWriteOption<T>(options: TestSetWriteOptions | undefined, fn: () => Promise<T>) {
  expect(options?.runTestSetWrite).toBeDefined();
  return options!.runTestSetWrite!(fn);
}

describe('doctor test set action shared principal writes', () => {
  beforeEach(() => {
    archiveTestSetMock.mockReset();
    createTestSetMock.mockReset();
    getTestSetMock.mockReset();
    requireDoctorWorkspaceContextMock.mockReset();
    setTestSetItemsMock.mockReset();
    unarchiveTestSetMock.mockReset();
    updateTestSetMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    principalState.inside = false;

    requireDoctorWorkspaceContextMock.mockResolvedValue(workspaceContext());
  });

  it('creates a test set inside doctor workspace principal with the create source', async () => {
    createTestSetMock.mockImplementation(async (_input, _actorId, options: TestSetWriteOptions) =>
      runWriteOption(options, async () => {
        expect(principalState.inside).toBe(true);
        return { id: testSetId };
      }),
    );

    const result = await createTestSetDraftCore({ title: ' Новый набор ' });

    expect(result).toEqual({ ok: true, setId: testSetId });
    expect(createTestSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Новый набор' }),
      actorUserId,
      { runTestSetWrite: expect.any(Function) },
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceContext(),
      'doctor.test-sets.create',
      expect.any(Function),
    );
  });

  it('keeps update pre-read outside principal, then updates metadata and items inside principal', async () => {
    getTestSetMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return { id: testSetId, isArchived: false, publicationStatus: 'draft' };
    });
    updateTestSetMock.mockImplementation(async (_id, _input, options: TestSetWriteOptions) => {
      expect(principalState.inside).toBe(false);
      return runWriteOption(options, async () => {
        expect(principalState.inside).toBe(true);
        return { id: testSetId };
      });
    });
    setTestSetItemsMock.mockImplementation(async (_id, _items, options: TestSetWriteOptions) => {
      expect(principalState.inside).toBe(false);
      return runWriteOption(options, async () => {
        expect(principalState.inside).toBe(true);
      });
    });

    const result = await saveTestSetCore(
      formWith({
        id: testSetId,
        title: ' Обновлено ',
        itemsPayload: JSON.stringify([{ testId: clinicalTestId }]),
      }),
    );

    expect(result).toEqual({ ok: true, setId: testSetId, wasUpdate: true });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      1,
      workspaceContext(),
      'doctor.test-sets.update',
      expect.any(Function),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      2,
      workspaceContext(),
      'doctor.test-sets.items.update',
      expect.any(Function),
    );
  });

  it('updates only items through the items source', async () => {
    getTestSetMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return { id: testSetId, isArchived: false };
    });
    setTestSetItemsMock.mockImplementation(async (_id, _items, options: TestSetWriteOptions) =>
      runWriteOption(options, async () => {
        expect(principalState.inside).toBe(true);
      }),
    );

    const result = await saveTestSetItemsCore(
      formWith({
        setId: testSetId,
        itemsPayload: JSON.stringify([{ testId: clinicalTestId }]),
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceContext(),
      'doctor.test-sets.items.update',
      expect.any(Function),
    );
  });

  it('archives and unarchives through source-tagged write options', async () => {
    archiveTestSetMock.mockImplementation(
      async (_id, _archiveOptions, options: TestSetWriteOptions) =>
        runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
        }),
    );
    unarchiveTestSetMock.mockImplementation(async (_id, options: TestSetWriteOptions) =>
      runWriteOption(options, async () => {
        expect(principalState.inside).toBe(true);
      }),
    );

    expect(await archiveTestSetCore(formWith({ id: testSetId }))).toEqual({
      kind: 'archived',
      id: testSetId,
    });
    expect(await unarchiveTestSetCore(formWith({ id: testSetId }))).toEqual({
      kind: 'unarchived',
      id: testSetId,
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      1,
      workspaceContext(),
      'doctor.test-sets.archive',
      expect.any(Function),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      2,
      workspaceContext(),
      'doctor.test-sets.unarchive',
      expect.any(Function),
    );
  });
});
