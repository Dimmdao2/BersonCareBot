import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClinicalTestWriteOptions } from "@/modules/tests/service";

const {
  archiveClinicalTestMock,
  createClinicalTestMock,
  getClinicalTestMock,
  listActiveItemsByCategoryCodeMock,
  requireDoctorWorkspaceContextMock,
  unarchiveClinicalTestMock,
  updateClinicalTestMock,
  withDoctorWorkspacePrincipalMock,
  principalState,
} = vi.hoisted(() => {
  const principalState = { inside: false };
  return {
    archiveClinicalTestMock: vi.fn(),
    createClinicalTestMock: vi.fn(),
    getClinicalTestMock: vi.fn(),
    listActiveItemsByCategoryCodeMock: vi.fn(),
    requireDoctorWorkspaceContextMock: vi.fn(),
    unarchiveClinicalTestMock: vi.fn(),
    updateClinicalTestMock: vi.fn(),
    withDoctorWorkspacePrincipalMock: vi.fn(
      async <T,>(_workspace: { organizationId: string }, _source: string, fn: () => Promise<T>) => {
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

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceContext: requireDoctorWorkspaceContextMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    clinicalTests: {
      archiveClinicalTest: archiveClinicalTestMock,
      createClinicalTest: createClinicalTestMock,
      getClinicalTest: getClinicalTestMock,
      unarchiveClinicalTest: unarchiveClinicalTestMock,
      updateClinicalTest: updateClinicalTestMock,
    },
    references: {
      listActiveItemsByCategoryCode: listActiveItemsByCategoryCodeMock,
    },
  }),
}));

import {
  archiveClinicalTestCore,
  saveClinicalTestCore,
  unarchiveClinicalTestCore,
} from "./actionsShared";

const actorUserId = "00000000-0000-4000-8000-000000000001";
const clinicalTestId = "550e8400-e29b-41d4-a716-446655440000";

function workspaceContext() {
  return {
    organizationId: "org-1",
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
  options: ClinicalTestWriteOptions | undefined,
  fn: () => Promise<T>,
) {
  expect(options?.runClinicalTestWrite).toBeDefined();
  return options!.runClinicalTestWrite!(fn);
}

describe("doctor clinical test action shared principal writes", () => {
  beforeEach(() => {
    archiveClinicalTestMock.mockReset();
    createClinicalTestMock.mockReset();
    getClinicalTestMock.mockReset();
    listActiveItemsByCategoryCodeMock.mockReset();
    requireDoctorWorkspaceContextMock.mockReset();
    unarchiveClinicalTestMock.mockReset();
    updateClinicalTestMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    principalState.inside = false;

    requireDoctorWorkspaceContextMock.mockResolvedValue(workspaceContext());
    listActiveItemsByCategoryCodeMock.mockResolvedValue([]);
  });

  it("creates a clinical test inside doctor workspace principal with the create source", async () => {
    createClinicalTestMock.mockImplementation(
      async (_input, _actorId, options: ClinicalTestWriteOptions) =>
        runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
          return { id: clinicalTestId };
        }),
    );

    const result = await saveClinicalTestCore(formWith({ title: " Новый тест " }));

    expect(result).toEqual({ ok: true, testId: clinicalTestId, wasUpdate: false });
    expect(createClinicalTestMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Новый тест" }),
      actorUserId,
      { runClinicalTestWrite: expect.any(Function) },
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceContext(),
      "doctor.clinical-tests.create",
      expect.any(Function),
    );
  });

  it("keeps update pre-read outside principal, then updates inside principal", async () => {
    getClinicalTestMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return { id: clinicalTestId, isArchived: false };
    });
    updateClinicalTestMock.mockImplementation(
      async (_id, _input, options: ClinicalTestWriteOptions) => {
        expect(principalState.inside).toBe(false);
        return runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
          return { id: clinicalTestId };
        });
      },
    );

    const result = await saveClinicalTestCore(formWith({ id: clinicalTestId, title: " Обновлено " }));

    expect(result).toEqual({ ok: true, testId: clinicalTestId, wasUpdate: true });
    expect(updateClinicalTestMock).toHaveBeenCalledWith(
      clinicalTestId,
      expect.objectContaining({ title: "Обновлено" }),
      { runClinicalTestWrite: expect.any(Function) },
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceContext(),
      "doctor.clinical-tests.update",
      expect.any(Function),
    );
  });

  it("archives and unarchives through source-tagged write options", async () => {
    archiveClinicalTestMock.mockImplementation(
      async (_id, _archiveOptions, options: ClinicalTestWriteOptions) =>
        runWriteOption(options, async () => {
          expect(principalState.inside).toBe(true);
        }),
    );
    unarchiveClinicalTestMock.mockImplementation(async (_id, options: ClinicalTestWriteOptions) =>
      runWriteOption(options, async () => {
        expect(principalState.inside).toBe(true);
      }),
    );

    expect(await archiveClinicalTestCore(formWith({ id: clinicalTestId }))).toEqual({
      kind: "archived",
      id: clinicalTestId,
    });
    expect(await unarchiveClinicalTestCore(formWith({ id: clinicalTestId }))).toEqual({
      kind: "unarchived",
      id: clinicalTestId,
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      1,
      workspaceContext(),
      "doctor.clinical-tests.archive",
      expect.any(Function),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenNthCalledWith(
      2,
      workspaceContext(),
      "doctor.clinical-tests.unarchive",
      expect.any(Function),
    );
  });
});
