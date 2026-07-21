import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TreatmentProgramInstancePort } from "@/modules/treatment-program/ports";

const getOrganizationIdMock = vi.hoisted(() => vi.fn<() => string | undefined>());
const runMutationMock = vi.hoisted(() => vi.fn());

vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: getOrganizationIdMock,
}));
vi.mock("@/infra/db/drizzleMutationTx", () => ({
  getDrizzleOrMutationTx: vi.fn(),
  runInDrizzleMutationTransaction: vi.fn(),
  runDrizzleMutationTransaction: runMutationMock,
}));
vi.mock("@/app-layer/db/drizzle", () => ({ getDrizzle: vi.fn() }));
vi.mock("@/infra/repos/pgOrgEntitlements", () => ({
  createPgOrgEntitlementsPort: () => ({}),
}));
vi.mock("@/modules/org-entitlements/service", () => ({ isMechanicEnabled: vi.fn() }));
vi.mock("@/infra/repos/pgTreatmentProgramItemSnapshot", () => ({
  createPgTreatmentProgramItemSnapshotPort: () => ({}),
}));

import { createPgTreatmentProgramInstancePort } from "./pgTreatmentProgramInstance";

const ORG_A = "10000000-0000-4000-8000-000000000001";
const ORG_B = "20000000-0000-4000-8000-000000000002";
const INSTANCE_ID = "30000000-0000-4000-8000-000000000003";
const STAGE_ID = "40000000-0000-4000-8000-000000000004";
const GROUP_ID = "50000000-0000-4000-8000-000000000005";
const PATIENT_ID = "60000000-0000-4000-8000-000000000006";
const MEDIA_ID = "70000000-0000-4000-8000-000000000007";
const EXERCISE_ID = "80000000-0000-4000-8000-000000000008";
const ITEM_ID = "90000000-0000-4000-8000-000000000009";

type DbRow = Record<string, unknown>;

function buildTx(params: {
  selectRows: DbRow[][];
  insertRows?: DbRow[][];
}) {
  const selectRows = [...params.selectRows];
  const insertRows = [...(params.insertRows ?? [])];
  const insertedValues: unknown[] = [];

  const select = vi.fn(() => {
    const rows = selectRows.shift() ?? [];
    const result = Object.assign(Promise.resolve(rows), {
      limit: vi.fn().mockResolvedValue(rows),
    });
    const scope: {
      where: () => typeof result;
      innerJoin: () => typeof scope;
    } = {
      where: () => result,
      innerJoin: () => scope,
    };
    return { from: () => scope };
  });

  const insert = vi.fn(() => ({
    values: vi.fn((values: unknown) => {
      insertedValues.push(values);
      const rows = insertRows.shift() ?? [];
      return { returning: vi.fn().mockResolvedValue(rows) };
    }),
  }));

  const update = vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  }));

  return { tx: { select, insert, update }, insert, insertedValues };
}

const baseInput: Parameters<
  TreatmentProgramInstancePort["createIndividualExerciseAndStageItem"]
>[0] = {
  instanceId: INSTANCE_ID,
  stageId: STAGE_ID,
  groupId: GROUP_ID,
  title: "Личное упражнение",
  description: null,
  regionRefIds: [],
  loadType: null,
  difficulty1_10: null,
  contraindications: null,
  tags: null,
  mediaId: null,
  saveToCatalog: false,
  createdBy: null,
  settings: null,
  localComment: null,
};

const exactInstance = { id: INSTANCE_ID, organizationId: ORG_A, patientUserId: PATIENT_ID };
const exactStage = { id: STAGE_ID, instanceId: INSTANCE_ID, organizationId: ORG_A, sortOrder: 1 };
const exactGroup = { id: GROUP_ID, stageId: STAGE_ID, organizationId: ORG_A, systemKind: null };
const readyPatientVideo = {
  id: MEDIA_ID,
  ownerKind: "organization",
  organizationId: ORG_A,
  status: "ready",
  mimeType: "video/mp4",
  folderOrganizationId: ORG_A,
  folderKind: "client_patient",
  folderPatientUserId: PATIENT_ID,
};

describe("pgTreatmentProgramInstance individual exercise boundaries", () => {
  beforeEach(() => {
    getOrganizationIdMock.mockReset();
    getOrganizationIdMock.mockReturnValue(ORG_A);
    runMutationMock.mockReset();
  });

  it("creates through the direct port only inside the exact organization", async () => {
    const exercise = {
      id: EXERCISE_ID,
      title: baseInput.title,
      description: null,
      contraindications: null,
      difficulty110: null,
      loadType: null,
      catalogScope: "personal",
    };
    const item = {
      id: ITEM_ID,
      stageId: STAGE_ID,
      itemType: "exercise",
      itemRefId: EXERCISE_ID,
      sortOrder: 0,
      comment: null,
      localComment: null,
      settings: null,
      snapshot: { title: baseInput.title, exerciseScope: "personal" },
      completedAt: null,
      isActionable: null,
      status: "active",
      groupId: GROUP_ID,
      createdAt: "2026-07-21T00:00:00.000Z",
      lastViewedAt: null,
    };
    const harness = buildTx({
      selectRows: [[exactInstance], [exactStage], [exactGroup], [{ max: -1 }]],
      insertRows: [[exercise], [item]],
    });
    runMutationMock.mockImplementation(
      (fn: (tx: typeof harness.tx) => Promise<unknown>) => fn(harness.tx),
    );

    const result = await createPgTreatmentProgramInstancePort().createIndividualExerciseAndStageItem(baseInput);

    expect(result).toMatchObject({ exerciseId: EXERCISE_ID, item: { id: ITEM_ID } });
    expect(harness.insertedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationId: ORG_A, catalogScope: "personal" }),
        expect.objectContaining({ organizationId: ORG_A, groupId: GROUP_ID }),
      ]),
    );
  });

  it("fails closed when a direct-port instance belongs to another organization", async () => {
    const harness = buildTx({ selectRows: [[{ ...exactInstance, organizationId: ORG_B }]] });
    runMutationMock.mockImplementation(
      (fn: (tx: typeof harness.tx) => Promise<unknown>) => fn(harness.tx),
    );

    await expect(
      createPgTreatmentProgramInstancePort().createIndividualExerciseAndStageItem(baseInput),
    ).resolves.toBeNull();
    expect(harness.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["another organization", { organizationId: ORG_B }],
    ["another patient", { folderPatientUserId: "a0000000-0000-4000-8000-00000000000a" }],
    ["a generic folder", { folderKind: "standard" }],
    ["a non-ready upload", { status: "pending" }],
  ])("rejects video from %s before writing the exercise", async (_label, mediaPatch) => {
    const harness = buildTx({
      selectRows: [[exactInstance], [exactStage], [exactGroup], [{ ...readyPatientVideo, ...mediaPatch }]],
    });
    runMutationMock.mockImplementation(
      (fn: (tx: typeof harness.tx) => Promise<unknown>) => fn(harness.tx),
    );

    await expect(
      createPgTreatmentProgramInstancePort().createIndividualExerciseAndStageItem({
        ...baseInput,
        mediaId: MEDIA_ID,
      }),
    ).rejects.toThrow("Видео не найдено или недоступно для этого пациента");
    expect(harness.insert).not.toHaveBeenCalled();
  });

  it("rejects a system group even when the port is called directly", async () => {
    const harness = buildTx({
      selectRows: [[exactInstance], [exactStage], [{ ...exactGroup, systemKind: "tests" }]],
    });
    runMutationMock.mockImplementation(
      (fn: (tx: typeof harness.tx) => Promise<unknown>) => fn(harness.tx),
    );

    await expect(
      createPgTreatmentProgramInstancePort().createIndividualExerciseAndStageItem(baseInput),
    ).rejects.toThrow("В группу «Тестирование» можно помещать только клинические тесты");
    expect(harness.insert).not.toHaveBeenCalled();
  });
});
