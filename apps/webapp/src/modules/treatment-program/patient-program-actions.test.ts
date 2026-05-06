import { describe, expect, it, vi } from "vitest";
import {
  buildPatientProgramChecklistRows,
  createTreatmentProgramPatientActionService,
  localDayWindowIso,
} from "./patient-program-actions";
import type { TreatmentProgramInstanceDetail } from "./types";
import { createInMemoryTreatmentProgramPort } from "@/app-layer/testing/treatmentProgramInMemory";
import {
  createInMemoryTreatmentProgramInstancePort,
  createInMemoryTreatmentProgramItemSnapshotPort,
} from "@/app-layer/testing/treatmentProgramInstanceInMemory";
import { createInMemoryProgramActionLogPort } from "@/infra/repos/inMemoryProgramActionLog";
import { createTreatmentProgramService } from "./service";
import { createTreatmentProgramInstanceService } from "./instance-service";
import type { TreatmentProgramItemRefValidationPort, TreatmentProgramItemSnapshotPort } from "./ports";

const refA = "11111111-1111-4111-8111-111111111111";
const refB = "22222222-2222-4222-8222-222222222222";
const patient = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function makeDetail(over: Partial<TreatmentProgramInstanceDetail> = {}): TreatmentProgramInstanceDetail {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "11111111-1111-4111-8111-111111111111",
    patientUserId: patient,
    templateId: null,
    assignedBy: null,
    title: "Программа",
    status: "active",
    createdAt: now,
    updatedAt: now,
    patientPlanLastOpenedAt: null,
    stages: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        instanceId: "11111111-1111-4111-8111-111111111111",
        sourceStageId: null,
        title: "Этап 1",
        description: null,
        sortOrder: 1,
        localComment: null,
        skipReason: null,
        status: "available",
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            stageId: "22222222-2222-4222-8222-222222222222",
            itemType: "recommendation",
            itemRefId: refA,
            sortOrder: 0,
            comment: null,
            localComment: null,
            settings: null,
            snapshot: { title: "R" },
            completedAt: null,
            isActionable: true,
            status: "active",
            groupId: null,
            createdAt: now,
            lastViewedAt: now,
            effectiveComment: null,
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            stageId: "22222222-2222-4222-8222-222222222222",
            itemType: "recommendation",
            itemRefId: refB,
            sortOrder: 1,
            comment: null,
            localComment: null,
            settings: null,
            snapshot: { title: "P" },
            completedAt: null,
            isActionable: false,
            status: "active",
            groupId: null,
            createdAt: now,
            lastViewedAt: now,
            effectiveComment: null,
          },
          {
            id: "55555555-5555-4555-8555-555555555555",
            stageId: "22222222-2222-4222-8222-222222222222",
            itemType: "exercise",
            itemRefId: refB,
            sortOrder: 2,
            comment: null,
            localComment: null,
            settings: null,
            snapshot: { title: "E" },
            completedAt: null,
            isActionable: null,
            status: "disabled",
            groupId: null,
            createdAt: now,
            lastViewedAt: now,
            effectiveComment: null,
          },
        ],
      },
    ],
    ...over,
  };
}

describe("patient-program-actions", () => {
  it("buildPatientProgramChecklistRows excludes persistent and disabled", () => {
    const rows = buildPatientProgramChecklistRows(makeDetail());
    const ids = rows.map((r) => r.item.id);
    expect(ids).toContain("33333333-3333-4333-8333-333333333333");
    expect(ids).not.toContain("44444444-4444-4444-8444-444444444444");
    expect(ids).not.toContain("55555555-5555-4555-8555-555555555555");
  });

  it("toggle checklist inserts done once per local calendar day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T12:00:00.000Z"));
    try {
    const tplPort = createInMemoryTreatmentProgramPort();
    const instPort = createInMemoryTreatmentProgramInstancePort();
    const itemRefs: TreatmentProgramItemRefValidationPort = { assertItemRefExists: vi.fn(async () => {}) };
    const tplSvc = createTreatmentProgramService(tplPort, itemRefs);
    const instSvc = createTreatmentProgramInstanceService({
      instances: instPort,
      templates: tplSvc,
      snapshots: createInMemoryTreatmentProgramItemSnapshotPort(),
      itemRefs,
    });
    const actionLog = createInMemoryProgramActionLogPort();
    const actions = createTreatmentProgramPatientActionService({
      instances: instPort,
      actionLog,
      now: () => new Date("2026-05-03T12:00:00.000Z"),
      getAppDefaultTimezoneIana: async () => "UTC",
      getPatientCalendarTimezoneIana: async () => null,
    });

    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1", sortOrder: 1 });
    await tplSvc.addStageItem(s1.id, { itemType: "lesson", itemRefId: refA, comment: null });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    const first = await actions.patientToggleChecklistItem({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
      checked: true,
    });
    expect(first).toContain(itemId);
    const second = await actions.patientToggleChecklistItem({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
      checked: true,
    });
    expect(second).toContain(itemId);
    const third = await actions.patientToggleChecklistItem({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
      checked: false,
    });
    expect(third).not.toContain(itemId);
    } finally {
      vi.useRealTimers();
    }
  });

  it("LFK post-session writes one done per exercise with shared session (note on first)", async () => {
    const tplPort = createInMemoryTreatmentProgramPort();
    const instPort = createInMemoryTreatmentProgramInstancePort();
    const itemRefs: TreatmentProgramItemRefValidationPort = { assertItemRefExists: vi.fn(async () => {}) };
    const baseSnapshots = createInMemoryTreatmentProgramItemSnapshotPort();
    const snapshots: TreatmentProgramItemSnapshotPort = {
      async buildSnapshot(type, itemRefId) {
        if (type === "lfk_complex") {
          return {
            itemType: "lfk_complex",
            title: "Комплекс",
            exercises: [
              { exerciseId: "e1111111-1111-4111-8111-111111111111", title: "Упр 1", sortOrder: 0 },
              { exerciseId: "e2222222-2222-4222-8222-222222222222", title: "Упр 2", sortOrder: 1 },
            ],
          };
        }
        return baseSnapshots.buildSnapshot(type, itemRefId);
      },
    };
    const tplSvc = createTreatmentProgramService(tplPort, itemRefs);
    const instSvc = createTreatmentProgramInstanceService({
      instances: instPort,
      templates: tplSvc,
      snapshots,
      itemRefs,
    });
    const actionLog = createInMemoryProgramActionLogPort();
    const insertSpy = vi.spyOn(actionLog, "insertAction");
    const actions = createTreatmentProgramPatientActionService({
      instances: instPort,
      actionLog,
      now: () => new Date("2026-05-03T12:00:00.000Z"),
      getAppDefaultTimezoneIana: async () => "UTC",
      getPatientCalendarTimezoneIana: async () => null,
    });

    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1", sortOrder: 1 });
    await tplSvc.addStageItem(s1.id, {
      itemType: "lfk_complex",
      itemRefId: refB,
      comment: null,
    });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await actions.patientSubmitLfkPostSession({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
      difficulty: "hard",
      note: "Устал",
    });
    expect(insertSpy).toHaveBeenCalledTimes(2);
    const calls = insertSpy.mock.calls.map((c) => c[0]);
    expect(calls[0]).toMatchObject({
      actionType: "done",
      note: "Устал",
      sessionId: expect.any(String),
      payload: {
        source: "lfk_exercise_done",
        exerciseId: "e1111111-1111-4111-8111-111111111111",
        difficulty: "hard",
      },
    });
    expect(calls[1]).toMatchObject({
      actionType: "done",
      note: null,
      sessionId: (calls[0] as { sessionId?: string }).sessionId,
      payload: {
        source: "lfk_exercise_done",
        exerciseId: "e2222222-2222-4222-8222-222222222222",
        difficulty: "hard",
      },
    });
  });

  it("localDayWindowIso uses Europe/Helsinki local midnight boundaries", () => {
    const now = new Date("2026-05-03T21:30:00.000Z");
    const win = localDayWindowIso(now, "Europe/Helsinki");
    expect(win.start).toBe("2026-05-03T21:00:00.000Z");
    expect(win.end).toBe("2026-05-04T21:00:00.000Z");
  });

  it("checklist uses patient timezone when provided", async () => {
    const tplPort = createInMemoryTreatmentProgramPort();
    const instPort = createInMemoryTreatmentProgramInstancePort();
    const itemRefs: TreatmentProgramItemRefValidationPort = { assertItemRefExists: vi.fn(async () => {}) };
    const tplSvc = createTreatmentProgramService(tplPort, itemRefs);
    const instSvc = createTreatmentProgramInstanceService({
      instances: instPort,
      templates: tplSvc,
      snapshots: createInMemoryTreatmentProgramItemSnapshotPort(),
      itemRefs,
    });
    const actionLog = createInMemoryProgramActionLogPort();
    const actions = createTreatmentProgramPatientActionService({
      instances: instPort,
      actionLog,
      now: () => new Date("2026-05-03T21:30:00.000Z"),
      getAppDefaultTimezoneIana: async () => "UTC",
      getPatientCalendarTimezoneIana: async () => "Europe/Helsinki",
    });

    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1", sortOrder: 1 });
    await tplSvc.addStageItem(s1.id, { itemType: "lesson", itemRefId: refA, comment: null });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await actions.patientToggleChecklistItem({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
      checked: true,
    });
    const listSpy = vi.spyOn(actionLog, "listDoneItemIdsInWindow");
    await actions.listChecklistDoneToday(patient, inst.id);
    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        windowStartIso: "2026-05-03T21:00:00.000Z",
        windowEndIso: "2026-05-04T21:00:00.000Z",
      }),
    );
  });
});
