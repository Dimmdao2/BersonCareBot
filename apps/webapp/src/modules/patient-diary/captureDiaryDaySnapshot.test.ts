import { describe, expect, it } from "vitest";
import {
  buildDiaryDayPlanFromLog,
  resolvePrimaryInstanceIdForDiaryDay,
  captureDiaryDaySnapshot,
} from "./captureDiaryDaySnapshot";
import { buildDiaryPlanChecklistItemIds } from "./diaryPlanChecklist";
import type { TreatmentProgramInstanceDetail, TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";

const patient = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const oldInst = "11111111-1111-4111-8111-111111111111";
const newInst = "22222222-2222-4222-8222-222222222222";
const itemOld = "33333333-3333-4333-8333-333333333333";

function makeSummary(id: string, updatedAt: string, status: "active" | "completed" = "active"): TreatmentProgramInstanceSummary {
  return {
    id,
    patientUserId: patient,
    templateId: null,
    assignedBy: null,
    assignmentSource: "promo",
    title: "Промо",
    status,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt,
    patientPlanLastOpenedAt: null,
  };
}

function makeCompletedDetail(): TreatmentProgramInstanceDetail {
  const now = "2026-05-01T00:00:00.000Z";
  return {
    id: oldInst,
    patientUserId: patient,
    templateId: null,
    assignedBy: null,
    assignmentSource: "promo",
    title: "Промо v1",
    status: "completed",
    createdAt: now,
    updatedAt: "2026-05-12T00:00:00.000Z",
    patientPlanLastOpenedAt: null,
    stages: [
      {
        id: "ssssssss-ssss-4sss-8sss-ssssssssssss",
        instanceId: oldInst,
        sourceStageId: null,
        title: "Этап 1",
        description: null,
        sortOrder: 1,
        localComment: null,
        skipReason: null,
        status: "completed",
        startedAt: now,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [
          {
            id: itemOld,
            stageId: "ssssssss-ssss-4sss-8sss-ssssssssssss",
            itemType: "exercise",
            itemRefId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            sortOrder: 0,
            comment: null,
            localComment: null,
            settings: null,
            snapshot: { title: "Упр" },
            completedAt: null,
            isActionable: true,
            status: "active",
            groupId: null,
            createdAt: now,
            lastViewedAt: now,
            effectiveComment: null,
          },
        ],
      },
    ],
  };
}

describe("resolvePrimaryInstanceIdForDiaryDay", () => {
  it("picks instance with more done on that day", () => {
    const rows = [
      { localDate: "2026-05-11", itemId: itemOld, instanceId: oldInst },
      { localDate: "2026-05-11", itemId: itemOld, instanceId: oldInst },
      { localDate: "2026-05-11", itemId: "44444444-4444-4444-8444-444444444444", instanceId: newInst },
    ];
    const instances = [
      makeSummary(oldInst, "2026-05-10T00:00:00.000Z", "completed"),
      makeSummary(newInst, "2026-05-12T00:00:00.000Z", "active"),
    ];
    expect(resolvePrimaryInstanceIdForDiaryDay("2026-05-11", rows, instances)).toBe(oldInst);
  });
});

describe("buildDiaryDayPlanFromLog", () => {
  it("uses completed instance checklist when done was on old promo instance", async () => {
    const doneRows = [{ localDate: "2026-05-11", itemId: itemOld, instanceId: oldInst }];
    const instances = [
      makeSummary(oldInst, "2026-05-10T00:00:00.000Z", "completed"),
      makeSummary(newInst, "2026-05-12T00:00:00.000Z", "active"),
    ];
    const plan = await buildDiaryDayPlanFromLog({
      localYmd: "2026-05-11",
      doneRows,
      instances,
      userId: patient,
      getInstanceForPatient: async (uid, iid) => (uid === patient && iid === oldInst ? makeCompletedDetail() : null),
    });
    expect(plan.planInstanceId).toBe(oldInst);
    expect(plan.planItemIds).toContain(itemOld);
    expect(plan.planDoneMask[plan.planItemIds.indexOf(itemOld)]).toBe(true);
  });

  it("preferInstanceId wins when set for promo refresh capture", async () => {
    const doneRows = [{ localDate: "2026-05-11", itemId: itemOld, instanceId: oldInst }];
    const instances = [makeSummary(oldInst, "2026-05-10T00:00:00.000Z", "active")];
    const plan = await buildDiaryDayPlanFromLog({
      localYmd: "2026-05-11",
      doneRows,
      instances,
      userId: patient,
      preferInstanceId: oldInst,
      getInstanceForPatient: async () => makeCompletedDetail(),
    });
    expect(plan.planInstanceId).toBe(oldInst);
    expect(buildDiaryPlanChecklistItemIds(makeCompletedDetail())).toContain(itemOld);
  });
});

describe("captureDiaryDaySnapshot", () => {
  it("builds plan from patient-wide log not only active instance", async () => {
    const detail = makeCompletedDetail();
    const row = await captureDiaryDaySnapshot(
      {
        reminders: { listRulesByUser: async () => [] },
        patientPractice: { listByUserInUtcRange: async () => [] },
        programActionLog: {
          listDoneItemsByLocalDateInWindowForPatient: async () => [
            { localDate: "2026-05-11", itemId: itemOld, instanceId: oldInst },
          ],
        } as never,
        treatmentProgramInstance: {
          listInstancesForPatient: async () => [makeSummary(oldInst, "2026-05-10T00:00:00.000Z", "completed")],
          getInstanceForPatient: async () => detail,
        },
      },
      {
        userId: patient,
        localYmd: "2026-05-11",
        iana: "Europe/Moscow",
        rules: [],
        instances: [makeSummary(oldInst, "2026-05-10T00:00:00.000Z", "completed")],
      },
    );
    expect(row.planInstanceId).toBe(oldInst);
    expect(row.planDoneMask.some(Boolean)).toBe(true);
  });
});
