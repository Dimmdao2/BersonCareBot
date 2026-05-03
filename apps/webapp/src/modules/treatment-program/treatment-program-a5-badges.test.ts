import { describe, expect, it, beforeEach, vi } from "vitest";
import { createInMemoryTreatmentProgramPersistence } from "@/infra/repos/inMemoryTreatmentProgramInstance";
import { createTreatmentProgramInstanceService } from "./instance-service";
import { createTreatmentProgramService } from "./service";
import { createInMemoryTreatmentProgramPort } from "@/infra/repos/inMemoryTreatmentProgram";
import { createInMemoryTreatmentProgramItemRefValidationPort } from "@/infra/repos/inMemoryTreatmentProgramItemRefValidation";
import { createInMemoryTreatmentProgramItemSnapshotPort } from "@/infra/repos/inMemoryTreatmentProgramItemSnapshot";
import type { AppendTreatmentProgramEventInput } from "./types";

describe("PROGRAM_PATIENT_SHAPE A5 badges + mark viewed", () => {
  let persistence: ReturnType<typeof createInMemoryTreatmentProgramPersistence>;
  let svc: ReturnType<typeof createTreatmentProgramInstanceService>;

  beforeEach(() => {
    persistence = createInMemoryTreatmentProgramPersistence();
    const templates = createTreatmentProgramService(
      createInMemoryTreatmentProgramPort(),
      createInMemoryTreatmentProgramItemRefValidationPort(),
    );
    svc = createTreatmentProgramInstanceService({
      instances: persistence.instancePort,
      templates,
      snapshots: createInMemoryTreatmentProgramItemSnapshotPort(),
      itemRefs: createInMemoryTreatmentProgramItemRefValidationPort(),
      events: persistence.eventsPort,
      testAttempts: persistence.testAttemptsPort,
    });
  });

  it("markStageItemViewedIfNever updates only when lastViewedAt is null", async () => {
    const detail = await persistence.instancePort.createInstanceTree({
      templateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assignedBy: null,
      title: "P",
      stages: [
        {
          sourceStageId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          title: "S",
          description: null,
          sortOrder: 0,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          groups: [],
          items: [],
        },
      ],
    });
    const stageId = detail.stages[0]!.id;
    const added = await persistence.instancePort.addInstanceStageItem(detail.id, stageId, {
      itemType: "lesson",
      itemRefId: "11111111-1111-4111-8111-111111111111",
      sortOrder: 0,
      comment: null,
      settings: null,
      snapshot: { title: "L" },
      isActionable: null,
      status: "active",
      groupId: null,
    });
    expect(added!.lastViewedAt).toBeNull();
    const itemId = added!.id;
    const r1 = await persistence.instancePort.markStageItemViewedIfNever(
      detail.patientUserId,
      detail.id,
      itemId,
    );
    expect(r1.updated).toBe(true);
    const after = await persistence.instancePort.getInstanceForPatient(detail.patientUserId, detail.id);
    expect(after!.stages[0]!.items[0]!.lastViewedAt).not.toBeNull();
    const r2 = await persistence.instancePort.markStageItemViewedIfNever(detail.patientUserId, detail.id, itemId);
    expect(r2.updated).toBe(false);
  });

  it("patientPlanUpdatedBadgeForInstance uses patientPlanLastOpenedAt baseline", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-03T12:00:00.000Z") });
    const detail = await persistence.instancePort.createInstanceTree({
      templateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assignedBy: null,
      title: "P",
      stages: [
        {
          sourceStageId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          title: "S",
          description: null,
          sortOrder: 0,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          groups: [],
          items: [
            {
              itemType: "lesson",
              itemRefId: "11111111-1111-4111-8111-111111111111",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: { title: "L" },
              isActionable: null,
              status: "active",
              templateGroupId: null,
            },
          ],
        },
      ],
    });
    const ev = async (input: AppendTreatmentProgramEventInput) => persistence.eventsPort.appendEvent(input);
    vi.advanceTimersByTime(60_000);
    await ev({
      instanceId: detail.id,
      actorId: null,
      eventType: "item_added",
      targetType: "stage_item",
      targetId: detail.stages[0]!.items[0]!.id,
      payload: {},
      reason: null,
    });
    vi.useRealTimers();
    const beforeOpen = await svc.patientPlanUpdatedBadgeForInstance({
      patientUserId: detail.patientUserId,
      instanceId: detail.id,
    });
    expect(beforeOpen.show).toBe(true);
    const opened = await svc.patientRecordPlanOpened({ patientUserId: detail.patientUserId, instanceId: detail.id });
    expect(opened.recorded).toBe(true);
    const afterOpen = await svc.patientPlanUpdatedBadgeForInstance({
      patientUserId: detail.patientUserId,
      instanceId: detail.id,
    });
    expect(afterOpen.show).toBe(false);
  });

  it("patientRecordPlanOpened throws when instance not found for patient", async () => {
    await expect(
      svc.patientRecordPlanOpened({
        patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        instanceId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }),
    ).rejects.toThrow(/не найден/);
  });

  it("patientRecordPlanOpened does not touch DB marker when program is completed", async () => {
    const detail = await persistence.instancePort.createInstanceTree({
      templateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assignedBy: null,
      title: "P",
      stages: [
        {
          sourceStageId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          title: "S",
          description: null,
          sortOrder: 0,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          groups: [],
          items: [],
        },
      ],
    });
    await persistence.instancePort.updateInstanceMeta(detail.id, { status: "completed" });
    const r = await svc.patientRecordPlanOpened({
      patientUserId: detail.patientUserId,
      instanceId: detail.id,
    });
    expect(r.recorded).toBe(false);
    const after = await persistence.instancePort.getInstanceForPatient(detail.patientUserId, detail.id);
    expect(after!.patientPlanLastOpenedAt).toBeNull();
  });
});
