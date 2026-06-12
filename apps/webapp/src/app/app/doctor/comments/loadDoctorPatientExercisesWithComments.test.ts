import { describe, it, expect } from "vitest";
import { loadDoctorPatientExercisesWithComments } from "./loadDoctorPatientExercisesWithComments";
import type { TreatmentProgramInstanceDetail, TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";

const PATIENT = "00000000-0000-4000-8000-000000000001";
const VIEWER  = "00000000-0000-4000-8000-00000000000d";
const INST1   = "00000000-0000-4000-8000-bbbb00000001";
const INST2   = "00000000-0000-4000-8000-bbbb00000002";

const STAGE_ACTIVE   = "00000000-0000-4000-8000-cccc00000001";
const STAGE_CLOSED   = "00000000-0000-4000-8000-cccc00000002";

const ITEM_A1 = "00000000-0000-4000-8000-dddd00000001"; // active stage
const ITEM_A2 = "00000000-0000-4000-8000-dddd00000002"; // active stage
const ITEM_C1 = "00000000-0000-4000-8000-dddd00000003"; // closed stage

function makeSummary(id: string, status: "active" | "completed" = "active"): TreatmentProgramInstanceSummary {
  return {
    id,
    patientUserId: PATIENT,
    templateId: null,
    assignedBy: null,
    assignmentSource: "doctor",
    title: `Программа ${id.slice(-4)}`,
    status,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    patientPlanLastOpenedAt: null,
  };
}

function makeStageItem(
  id: string,
  stageId: string,
  title: string,
  sortOrder = 1,
) {
  return {
    id,
    stageId,
    itemType: "exercise" as const,
    itemRefId: id,
    sortOrder,
    comment: null,
    localComment: null,
    settings: null,
    snapshot: { title },
    completedAt: null,
    isActionable: true,
    status: "active" as const,
    groupId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastViewedAt: null,
    effectiveComment: null,
  };
}

function makeDetail(instanceId: string, stages: TreatmentProgramInstanceDetail["stages"]): TreatmentProgramInstanceDetail {
  return {
    ...makeSummary(instanceId),
    stages,
  };
}

function makeDeps(
  summaries: TreatmentProgramInstanceSummary[],
  detail: TreatmentProgramInstanceDetail,
  unreadCounts: Array<{ stageItemId: string; total: number; unread: number; latestMessageAt: string | null }>,
) {
  return {
    treatmentProgramInstance: {
      listForPatientClinicalView: async () => summaries,
      getInstanceById: async () => detail,
    },
    programItemDiscussion: {
      listUnreadCountsForViewerByStageItems: async () => unreadCounts,
    },
  };
}

describe("loadDoctorPatientExercisesWithComments", () => {
  it("returns null when patient has no instances", async () => {
    const deps = {
      treatmentProgramInstance: {
        listForPatientClinicalView: async () => [],
        getInstanceById: async () => { throw new Error("should not be called"); },
      },
      programItemDiscussion: {
        listUnreadCountsForViewerByStageItems: async () => [],
      },
    };
    const result = await loadDoctorPatientExercisesWithComments(
      deps as unknown as Parameters<typeof loadDoctorPatientExercisesWithComments>[0],
      { patientUserId: PATIENT, viewerUserId: VIEWER },
    );
    expect(result).toBeNull();
  });

  it("returns empty groups when no exercises have comments", async () => {
    const summary = makeSummary(INST1);
    const detail = makeDetail(INST1, [
      {
        id: STAGE_ACTIVE,
        instanceId: INST1,
        sourceStageId: null,
        title: "Этап 1",
        description: null,
        sortOrder: 1,
        localComment: null,
        skipReason: null,
        status: "in_progress",
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [makeStageItem(ITEM_A1, STAGE_ACTIVE, "Упражнение 1")],
      },
    ]);

    const deps = makeDeps(
      [summary],
      detail,
      [{ stageItemId: ITEM_A1, total: 0, unread: 0, latestMessageAt: null }],
    );
    const result = await loadDoctorPatientExercisesWithComments(deps, {
      patientUserId: PATIENT,
      viewerUserId: VIEWER,
    });
    expect(result).not.toBeNull();
    expect(result!.groups).toHaveLength(0);
    expect(result!.totalExercisesWithComments).toBe(0);
    expect(result!.totalUnreadComments).toBe(0);
  });

  it("groups exercises by active vs closed stage", async () => {
    const summary = makeSummary(INST1);
    const detail = makeDetail(INST1, [
      {
        id: STAGE_ACTIVE,
        instanceId: INST1,
        sourceStageId: null,
        title: "Активный этап",
        description: null,
        sortOrder: 1,
        localComment: null,
        skipReason: null,
        status: "in_progress",
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [
          makeStageItem(ITEM_A1, STAGE_ACTIVE, "Упражнение A1"),
          makeStageItem(ITEM_A2, STAGE_ACTIVE, "Упражнение A2"),
        ],
      },
      {
        id: STAGE_CLOSED,
        instanceId: INST1,
        sourceStageId: null,
        title: "Закрытый этап",
        description: null,
        sortOrder: 2,
        localComment: null,
        skipReason: null,
        status: "completed",
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [makeStageItem(ITEM_C1, STAGE_CLOSED, "Упражнение C1")],
      },
    ]);

    const deps = makeDeps(
      [summary],
      detail,
      [
        { stageItemId: ITEM_A1, total: 3, unread: 2, latestMessageAt: "2026-06-10T12:00:00.000Z" },
        { stageItemId: ITEM_A2, total: 1, unread: 0, latestMessageAt: "2026-06-09T10:00:00.000Z" },
        { stageItemId: ITEM_C1, total: 5, unread: 1, latestMessageAt: "2026-05-01T10:00:00.000Z" },
      ],
    );

    const result = await loadDoctorPatientExercisesWithComments(deps, {
      patientUserId: PATIENT,
      viewerUserId: VIEWER,
    });

    expect(result).not.toBeNull();
    expect(result!.groups).toHaveLength(2);

    // Active stage first
    const activeGroup = result!.groups[0]!;
    expect(activeGroup.isActive).toBe(true);
    expect(activeGroup.stageTitle).toBe("Активный этап");
    expect(activeGroup.exercises).toHaveLength(2);

    // Closed stage second
    const closedGroup = result!.groups[1]!;
    expect(closedGroup.isActive).toBe(false);
    expect(closedGroup.stageTitle).toBe("Закрытый этап");
    expect(closedGroup.exercises).toHaveLength(1);
  });

  it("sorts exercises within stage by latestCommentAt DESC (newest first)", async () => {
    const summary = makeSummary(INST1);
    const detail = makeDetail(INST1, [
      {
        id: STAGE_ACTIVE,
        instanceId: INST1,
        sourceStageId: null,
        title: "Этап",
        description: null,
        sortOrder: 1,
        localComment: null,
        skipReason: null,
        status: "in_progress",
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [
          makeStageItem(ITEM_A1, STAGE_ACTIVE, "Упражнение A1", 1),
          makeStageItem(ITEM_A2, STAGE_ACTIVE, "Упражнение A2", 2),
        ],
      },
    ]);

    const deps = makeDeps(
      [summary],
      detail,
      [
        { stageItemId: ITEM_A1, total: 1, unread: 0, latestMessageAt: "2026-06-09T10:00:00.000Z" },
        { stageItemId: ITEM_A2, total: 2, unread: 1, latestMessageAt: "2026-06-11T10:00:00.000Z" },
      ],
    );

    const result = await loadDoctorPatientExercisesWithComments(deps, {
      patientUserId: PATIENT,
      viewerUserId: VIEWER,
    });

    expect(result!.groups[0]!.exercises[0]!.stageItemId).toBe(ITEM_A2); // newer
    expect(result!.groups[0]!.exercises[1]!.stageItemId).toBe(ITEM_A1); // older
  });

  it("totalExercisesWithComments and totalUnreadComments are correctly aggregated", async () => {
    const summary = makeSummary(INST1);
    const detail = makeDetail(INST1, [
      {
        id: STAGE_ACTIVE,
        instanceId: INST1,
        sourceStageId: null,
        title: "Этап",
        description: null,
        sortOrder: 1,
        localComment: null,
        skipReason: null,
        status: "in_progress",
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [
          makeStageItem(ITEM_A1, STAGE_ACTIVE, "A1"),
          makeStageItem(ITEM_A2, STAGE_ACTIVE, "A2"),
        ],
      },
    ]);

    const deps = makeDeps(
      [summary],
      detail,
      [
        { stageItemId: ITEM_A1, total: 3, unread: 2, latestMessageAt: "2026-06-11T10:00:00.000Z" },
        { stageItemId: ITEM_A2, total: 0, unread: 0, latestMessageAt: null }, // no comments, excluded
      ],
    );

    const result = await loadDoctorPatientExercisesWithComments(deps, {
      patientUserId: PATIENT,
      viewerUserId: VIEWER,
    });

    expect(result!.totalExercisesWithComments).toBe(1); // only ITEM_A1 has comments
    expect(result!.totalUnreadComments).toBe(2); // unread from ITEM_A1 only (ITEM_A2=0)
  });

  it("returns null when no active instance and includePastPrograms=false", async () => {
    const completedSummary = makeSummary(INST1, "completed");
    const deps = {
      treatmentProgramInstance: {
        listForPatientClinicalView: async () => [completedSummary],
        getInstanceById: async () => { throw new Error("should not be called"); },
      },
      programItemDiscussion: {
        listUnreadCountsForViewerByStageItems: async () => [],
      },
    };

    const result = await loadDoctorPatientExercisesWithComments(
      deps as unknown as Parameters<typeof loadDoctorPatientExercisesWithComments>[0],
      { patientUserId: PATIENT, viewerUserId: VIEWER },
      { includePastPrograms: false },
    );

    expect(result).toBeNull();
  });

  it("uses past instance when includePastPrograms=true and no active instance", async () => {
    const completedSummary = makeSummary(INST1, "completed");
    const detail = makeDetail(INST1, [
      {
        id: STAGE_ACTIVE,
        instanceId: INST1,
        sourceStageId: null,
        title: "Завершённый этап",
        description: null,
        sortOrder: 1,
        localComment: null,
        skipReason: null,
        status: "completed",
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [makeStageItem(ITEM_A1, STAGE_ACTIVE, "Упражнение")],
      },
    ]);

    const deps = makeDeps(
      [completedSummary],
      detail,
      [{ stageItemId: ITEM_A1, total: 2, unread: 0, latestMessageAt: "2026-05-01T10:00:00.000Z" }],
    );

    const result = await loadDoctorPatientExercisesWithComments(
      deps,
      { patientUserId: PATIENT, viewerUserId: VIEWER },
      { includePastPrograms: true },
    );

    expect(result).not.toBeNull();
    expect(result!.instanceId).toBe(INST1);
    expect(result!.groups).toHaveLength(1);
  });

  it("only includes exercise items (skips recommendations, lessons, clinical_tests)", async () => {
    const summary = makeSummary(INST1);
    const detail = makeDetail(INST1, [
      {
        id: STAGE_ACTIVE,
        instanceId: INST1,
        sourceStageId: null,
        title: "Этап",
        description: null,
        sortOrder: 1,
        localComment: null,
        skipReason: null,
        status: "in_progress",
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [
          makeStageItem(ITEM_A1, STAGE_ACTIVE, "Упражнение"),
          { ...makeStageItem(ITEM_A2, STAGE_ACTIVE, "Рекомендация"), itemType: "recommendation" as const },
        ],
      },
    ]);

    const deps = makeDeps(
      [summary],
      detail,
      [
        { stageItemId: ITEM_A1, total: 1, unread: 1, latestMessageAt: "2026-06-11T10:00:00.000Z" },
      ],
    );

    const result = await loadDoctorPatientExercisesWithComments(deps, {
      patientUserId: PATIENT,
      viewerUserId: VIEWER,
    });

    // Only exercise should appear; recommendation ITEM_A2 has no unread entry returned
    expect(result!.groups[0]!.exercises).toHaveLength(1);
    expect(result!.groups[0]!.exercises[0]!.stageItemId).toBe(ITEM_A1);
  });
});
