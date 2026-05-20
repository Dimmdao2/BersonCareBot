import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DateTime } from "luxon";
import { loadPatientDiaryWeekActivity } from "./loadPatientDiaryWeekActivity";
import { createInMemoryProgramActionLogPort } from "@/infra/repos/inMemoryProgramActionLog";
import {
  createInMemoryPatientDiarySnapshotsPort,
  resetInMemoryPatientDiarySnapshotsForTests,
} from "@/infra/repos/inMemoryPatientDiarySnapshots";
import { createInMemoryTreatmentProgramPersistence } from "@/infra/repos/inMemoryTreatmentProgramInstance";
import { createTreatmentProgramService } from "@/modules/treatment-program/service";
import { createTreatmentProgramInstanceService } from "@/modules/treatment-program/instance-service";
import { createInMemoryTreatmentProgramPort } from "@/app-layer/testing/treatmentProgramInMemory";
import { createInMemoryTreatmentProgramItemSnapshotPort } from "@/app-layer/testing/treatmentProgramInstanceInMemory";

const refA = "11111111-1111-4111-8111-111111111111";
const patient = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("loadPatientDiaryWeekActivity", () => {
  beforeEach(() => {
    resetInMemoryPatientDiarySnapshotsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows past plan stripes from snapshot after promo instance change", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-14T12:00:00.000Z"));

    const diarySnapshots = createInMemoryPatientDiarySnapshotsPort();
    const actionLog = createInMemoryProgramActionLogPort();
    const tplPort = createInMemoryTreatmentProgramPort();
    const itemRefs = { assertItemRefExists: vi.fn(async () => {}) };
    const tplSvc = createTreatmentProgramService(tplPort, itemRefs);
    const tpl = await tplSvc.createTemplate({ title: "Промо", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const g1 = await tplSvc.createTemplateStageGroup(s1.id, { title: "G" });
    await tplSvc.addStageItem(s1.id, { itemType: "lesson", itemRefId: refA, comment: null, groupId: g1.id });

    const { instancePort } = createInMemoryTreatmentProgramPersistence();
    const instSvc = createTreatmentProgramInstanceService({
      instances: instancePort,
      templates: tplSvc,
      snapshots: createInMemoryTreatmentProgramItemSnapshotPort(),
      itemRefs,
    });

    const oldInst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
      assignmentSource: "promo",
    });
    const itemId = oldInst.stages.find((s) => s.sortOrder > 0)!.items[0]!.id;

    await diarySnapshots.insertIfMissing({
      platformUserId: patient,
      localDate: "2026-05-12",
      iana: "UTC",
      warmupSlotLimit: 3,
      warmupDoneCount: 0,
      warmupAllDone: false,
      planInstanceId: oldInst.id,
      planItemIds: [itemId],
      planDoneMask: [true],
    });

    await instancePort.updateInstanceMeta(oldInst.id, { status: "completed" });
    await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
      assignmentSource: "promo",
    });

    const iana = "UTC";
    const weekStart = DateTime.fromISO("2026-05-11", { zone: iana }).startOf("day");
    const weekEnd = weekStart.plus({ days: 7 });

    const activity = await loadPatientDiaryWeekActivity(
      {
        reminders: { listRulesByUser: async () => [] },
        patientPractice: { listByUserInUtcRange: async () => [] },
        programActionLog: actionLog,
        treatmentProgramInstance: instancePort,
        diarySnapshots,
      },
      {
        userId: patient,
        weekStartMs: weekStart.toMillis(),
        weekEndMs: weekEnd.toMillis(),
        iana,
      },
    );

    const tueIdx = 1;
    expect(activity.planDays[tueIdx]?.items.some((it) => it.done)).toBe(true);
  });
});
