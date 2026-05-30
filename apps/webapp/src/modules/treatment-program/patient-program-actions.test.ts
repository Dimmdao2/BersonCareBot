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
import { createInMemoryPatientDiarySnapshotsPort } from "@/infra/repos/inMemoryPatientDiarySnapshots";
import { createTreatmentProgramService } from "./service";
import { createTreatmentProgramInstanceService } from "./instance-service";
import type { TreatmentProgramItemRefValidationPort, TreatmentProgramItemSnapshotPort } from "./ports";

const refA = "11111111-1111-4111-8111-111111111111";
const refB = "22222222-2222-4222-8222-222222222222";
const refC = "55555555-5555-4555-8555-555555555555";
const patient = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function instStageForTpl(inst: TreatmentProgramInstanceDetail, templateStageId: string) {
  const s = inst.stages.find((x) => x.sourceStageId === templateStageId);
  if (!s) throw new Error("instance stage not found");
  return s;
}

function makeDetail(over: Partial<TreatmentProgramInstanceDetail> = {}): TreatmentProgramInstanceDetail {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "11111111-1111-4111-8111-111111111111",
    patientUserId: patient,
    templateId: null,
    assignedBy: null,
    assignmentSource: "doctor",
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
        groups: [
          {
            id: "gggggggg-1111-4111-8111-111111111111",
            stageId: "22222222-2222-4222-8222-222222222222",
            sourceGroupId: null,
            title: "G",
            description: null,
            scheduleText: null,
            sortOrder: 0,
            systemKind: null,
          },
        ],
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
            groupId: "gggggggg-1111-4111-8111-111111111111",
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

  it("toggle checklist inserts done on each checked true; checked false clears day", async () => {
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
    const insertSpy = vi.spyOn(actionLog, "insertAction");
    const actions = createTreatmentProgramPatientActionService({
      instances: instPort,
      actionLog,
      patientDiarySnapshots: createInMemoryPatientDiarySnapshotsPort(),
      now: () => new Date("2026-05-03T12:00:00.000Z"),
      getAppDefaultTimezoneIana: async () => "UTC",
      getPatientCalendarTimezoneIana: async () => null,
    });

    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const g1 = await tplSvc.createTemplateStageGroup(s1.id, { title: "G" });
    await tplSvc.addStageItem(s1.id, { itemType: "lesson", itemRefId: refA, comment: null, groupId: g1.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    const itemId = instStageForTpl(inst, s1.id).items[0]!.id;
    const first = await actions.patientToggleChecklistItem({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
      checked: true,
    });
    expect(first).toContain(itemId);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy.mock.calls[0]![0]).toMatchObject({
      actionType: "done",
      payload: { source: "checklist_toggle" },
    });
    const second = await actions.patientToggleChecklistItem({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
      checked: true,
    });
    expect(second).toContain(itemId);
    expect(insertSpy).toHaveBeenCalledTimes(2);
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
      patientDiarySnapshots: createInMemoryPatientDiarySnapshotsPort(),
      now: () => new Date("2026-05-03T21:30:00.000Z"),
      getAppDefaultTimezoneIana: async () => "UTC",
      getPatientCalendarTimezoneIana: async () => "Europe/Helsinki",
    });

    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const g1 = await tplSvc.createTemplateStageGroup(s1.id, { title: "G" });
    await tplSvc.addStageItem(s1.id, { itemType: "lesson", itemRefId: refA, comment: null, groupId: g1.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    const itemId = instStageForTpl(inst, s1.id).items[0]!.id;
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

  it("listChecklistDoneToday includes totalCompletionEventsByItemId with LFK session dedupe", async () => {
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
      patientDiarySnapshots: createInMemoryPatientDiarySnapshotsPort(),
      now: () => new Date("2026-05-03T21:30:00.000Z"),
      getAppDefaultTimezoneIana: async () => "UTC",
      getPatientCalendarTimezoneIana: async () => null,
    });

    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const g1 = await tplSvc.createTemplateStageGroup(s1.id, { title: "G" });
    await tplSvc.addStageItem(s1.id, { itemType: "lesson", itemRefId: refA, comment: null, groupId: g1.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    const itemId = instStageForTpl(inst, s1.id).items[0]!.id;
    const sessionId = crypto.randomUUID();
    const ex1 = "33333333-3333-4333-8333-333333333333";
    const ex2 = "44444444-4444-4444-8444-444444444444";
    await actionLog.insertAction({
      instanceId: inst.id,
      instanceStageItemId: itemId,
      patientUserId: patient,
      actionType: "done",
      sessionId,
      payload: { source: "lfk_exercise_done", exerciseId: ex1 },
      note: null,
    });
    await actionLog.insertAction({
      instanceId: inst.id,
      instanceStageItemId: itemId,
      patientUserId: patient,
      actionType: "done",
      sessionId,
      payload: { source: "lfk_exercise_done", exerciseId: ex2 },
      note: null,
    });
    const snap = await actions.listChecklistDoneToday(patient, inst.id);
    expect(snap.totalCompletionEventsByItemId[itemId]).toBe(1);
  });

  it("getPatientPlanPassageStats aggregates window, activity days, and never-completed checklist items", async () => {
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
      patientDiarySnapshots: createInMemoryPatientDiarySnapshotsPort(),
      now: () => new Date("2026-05-05T15:00:00.000Z"),
      getAppDefaultTimezoneIana: async () => "UTC",
      getPatientCalendarTimezoneIana: async () => null,
    });

    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const g1 = await tplSvc.createTemplateStageGroup(s1.id, { title: "G" });
    await tplSvc.addStageItem(s1.id, { itemType: "lesson", itemRefId: refA, comment: null, groupId: g1.id });
    await tplSvc.addStageItem(s1.id, { itemType: "lesson", itemRefId: refB, comment: null, groupId: g1.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    const stage = instStageForTpl(inst, s1.id);
    const itemDone = stage.items[0]!;
    await actionLog.insertAction({
      instanceId: inst.id,
      instanceStageItemId: itemDone.id,
      patientUserId: patient,
      actionType: "done",
      sessionId: null,
      payload: { source: "checklist_toggle" },
      note: null,
    });

    const diarySnapshots = createInMemoryPatientDiarySnapshotsPort();
    await diarySnapshots.insertIfMissing({
      platformUserId: patient,
      localDate: "2026-05-05",
      iana: "UTC",
      warmupSlotLimit: 3,
      warmupDoneCount: 0,
      warmupAllDone: false,
      planInstanceId: inst.id,
      planItemIds: [itemDone.id],
      planDoneMask: [true],
    });
    const actionsWithSnap = createTreatmentProgramPatientActionService({
      instances: instPort,
      actionLog,
      patientDiarySnapshots: diarySnapshots,
      now: () => new Date("2026-05-05T15:00:00.000Z"),
      getAppDefaultTimezoneIana: async () => "UTC",
      getPatientCalendarTimezoneIana: async () => null,
    });

    const stats = await actionsWithSnap.getPatientPlanPassageStats(patient, inst.id);
    expect(stats.daysWithActivity).toBe(1);
    expect(stats.neverCompletedChecklistItemCount).toBe(1);
    expect(stats.calendarDaysInWindow).toBeGreaterThanOrEqual(1);
    expect(stats.avgCompletionsPerDay).toBeGreaterThan(0);
  });

  it("getPatientPlanPassageStats neverCompleted counts only patient-visible checklist rows (skips locked stages)", async () => {
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
      patientDiarySnapshots: createInMemoryPatientDiarySnapshotsPort(),
      now: () => new Date("2026-05-05T15:00:00.000Z"),
      getAppDefaultTimezoneIana: async () => "UTC",
      getPatientCalendarTimezoneIana: async () => null,
    });

    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const s2 = await tplSvc.createStage(tpl.id, { title: "Этап 2" });
    const g1 = await tplSvc.createTemplateStageGroup(s1.id, { title: "G1" });
    const g2 = await tplSvc.createTemplateStageGroup(s2.id, { title: "G2" });
    await tplSvc.addStageItem(s1.id, { itemType: "lesson", itemRefId: refA, comment: null, groupId: g1.id });
    await tplSvc.addStageItem(s2.id, { itemType: "lesson", itemRefId: refC, comment: null, groupId: g2.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    const stage1 = instStageForTpl(inst, s1.id);
    await actionLog.insertAction({
      instanceId: inst.id,
      instanceStageItemId: stage1.items[0]!.id,
      patientUserId: patient,
      actionType: "done",
      sessionId: null,
      payload: { source: "checklist_toggle" },
      note: null,
    });

    const stats = await actions.getPatientPlanPassageStats(patient, inst.id);
    expect(stats.neverCompletedChecklistItemCount).toBe(0);
  });

  it("patientAppendObservationNote rejects promo programs", async () => {
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
    const notifyDoctorOfProgramNote = vi.fn().mockResolvedValue(undefined);
    const actions = createTreatmentProgramPatientActionService({
      instances: instPort,
      actionLog,
      patientDiarySnapshots: createInMemoryPatientDiarySnapshotsPort(),
      getAppDefaultTimezoneIana: async () => "UTC",
      getPatientCalendarTimezoneIana: async () => null,
      resolvePatientLabel: async () => "Пациент",
      notifyDoctorOfProgramNote,
    });

    const tpl = await tplSvc.createTemplate({ title: "Промо", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const g1 = await tplSvc.createTemplateStageGroup(s1.id, { title: "G" });
    await tplSvc.addStageItem(s1.id, { itemType: "lesson", itemRefId: refA, comment: null, groupId: g1.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
      assignmentSource: "promo",
    });
    const itemId = instStageForTpl(inst, s1.id).items[0]!.id;

    await expect(
      actions.patientAppendObservationNote({
        patientUserId: patient,
        instanceId: inst.id,
        stageItemId: itemId,
        note: "Текст",
      }),
    ).rejects.toThrow(/промо/i);
    expect(notifyDoctorOfProgramNote).not.toHaveBeenCalled();
  });

  it("patientAppendObservationNote rejects course programs", async () => {
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
    const notifyDoctorOfProgramNote = vi.fn().mockResolvedValue(undefined);
    const actions = createTreatmentProgramPatientActionService({
      instances: instPort,
      actionLog,
      patientDiarySnapshots: createInMemoryPatientDiarySnapshotsPort(),
      getAppDefaultTimezoneIana: async () => "UTC",
      getPatientCalendarTimezoneIana: async () => null,
      resolvePatientLabel: async () => "Пациент",
      notifyDoctorOfProgramNote,
    });

    const tpl = await tplSvc.createTemplate({ title: "Курс", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const g1 = await tplSvc.createTemplateStageGroup(s1.id, { title: "G" });
    await tplSvc.addStageItem(s1.id, { itemType: "lesson", itemRefId: refA, comment: null, groupId: g1.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
      assignmentSource: "course",
    });
    const itemId = instStageForTpl(inst, s1.id).items[0]!.id;

    await expect(
      actions.patientAppendObservationNote({
        patientUserId: patient,
        instanceId: inst.id,
        stageItemId: itemId,
        note: "Текст",
      }),
    ).rejects.toThrow(/курса/i);
    expect(notifyDoctorOfProgramNote).not.toHaveBeenCalled();
  });

  it("patientAppendObservationNote notifies doctor for doctor-assigned programs", async () => {
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
    const insertSpy = vi.spyOn(actionLog, "insertAction");
    const notifyDoctorOfProgramNote = vi.fn().mockResolvedValue(undefined);
    const actions = createTreatmentProgramPatientActionService({
      instances: instPort,
      actionLog,
      patientDiarySnapshots: createInMemoryPatientDiarySnapshotsPort(),
      getAppDefaultTimezoneIana: async () => "UTC",
      getPatientCalendarTimezoneIana: async () => null,
      resolvePatientLabel: async () => "Иван П.",
      notifyDoctorOfProgramNote,
    });

    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const g1 = await tplSvc.createTemplateStageGroup(s1.id, { title: "G" });
    await tplSvc.addStageItem(s1.id, { itemType: "exercise", itemRefId: refA, comment: null, groupId: g1.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
      assignmentSource: "doctor",
    });
    const item = instStageForTpl(inst, s1.id).items[0]!;

    await actions.patientAppendObservationNote({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: item.id,
      note: "  Болит колено ",
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "note",
        note: "Болит колено",
        payload: { source: "patient_observation" },
      }),
    );
    expect(notifyDoctorOfProgramNote).toHaveBeenCalledWith({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: item.id,
      patientLabel: "Иван П.",
      exerciseTitle: "Пункт программы",
      noteText: "Болит колено",
    });
  });

  it("patientAppendObservationNote writes discussion message for doctor-assigned programs", async () => {
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
    const appendDiscussionMessage = vi.fn(async () => ({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      instanceStageItemId: "33333333-3333-4333-8333-333333333333",
      patientUserId: patient,
      senderRole: "patient" as const,
      origin: "patient_observation" as const,
      body: "ok",
      mediaFileId: null,
      supportMessageId: null,
      createdAt: "2026-05-03T10:00:00.000Z",
    }));
    const actions = createTreatmentProgramPatientActionService({
      instances: instPort,
      actionLog,
      patientDiarySnapshots: createInMemoryPatientDiarySnapshotsPort(),
      getAppDefaultTimezoneIana: async () => "UTC",
      getPatientCalendarTimezoneIana: async () => null,
      discussion: { appendMessage: appendDiscussionMessage },
    });

    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const g1 = await tplSvc.createTemplateStageGroup(s1.id, { title: "G" });
    await tplSvc.addStageItem(s1.id, { itemType: "exercise", itemRefId: refA, comment: null, groupId: g1.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
      assignmentSource: "doctor",
    });
    const item = instStageForTpl(inst, s1.id).items[0]!;

    await actions.patientAppendObservationNote({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: item.id,
      note: "  Болит колено ",
    });

    expect(appendDiscussionMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceStageItemId: item.id,
        patientUserId: patient,
        senderRole: "patient",
        origin: "patient_observation",
        body: "Болит колено",
      }),
    );
  });

  it("patientAppendDiscussionMedia writes action log and discussion message", async () => {
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
    const insertSpy = vi.spyOn(actionLog, "insertAction");
    const mediaId = "66666666-6666-4666-8666-666666666666";
    const appendDiscussionMessage = vi.fn(async () => ({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      instanceStageItemId: "33333333-3333-4333-8333-333333333333",
      patientUserId: patient,
      senderRole: "patient" as const,
      origin: "patient_observation" as const,
      body: null,
      mediaFileId: mediaId,
      supportMessageId: null,
      createdAt: "2026-05-03T10:00:00.000Z",
    }));
    const notifyDoctorOfProgramNote = vi.fn().mockResolvedValue(undefined);
    const actions = createTreatmentProgramPatientActionService({
      instances: instPort,
      actionLog,
      patientDiarySnapshots: createInMemoryPatientDiarySnapshotsPort(),
      getAppDefaultTimezoneIana: async () => "UTC",
      getPatientCalendarTimezoneIana: async () => null,
      resolvePatientLabel: async () => "Иван П.",
      notifyDoctorOfProgramNote,
      discussion: { appendMessage: appendDiscussionMessage },
    });

    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const g1 = await tplSvc.createTemplateStageGroup(s1.id, { title: "G" });
    await tplSvc.addStageItem(s1.id, { itemType: "exercise", itemRefId: refA, comment: null, groupId: g1.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
      assignmentSource: "doctor",
    });
    const item = instStageForTpl(inst, s1.id).items[0]!;

    await actions.patientAppendDiscussionMedia({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: item.id,
      mediaFileId: mediaId,
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "note",
        note: null,
        payload: { source: "patient_media", mediaFileId: mediaId },
      }),
    );
    expect(appendDiscussionMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceStageItemId: item.id,
        mediaFileId: mediaId,
        origin: "patient_observation",
      }),
    );
    expect(notifyDoctorOfProgramNote).toHaveBeenCalledWith(
      expect.objectContaining({ noteText: "Медиафайл" }),
    );
  });
});
