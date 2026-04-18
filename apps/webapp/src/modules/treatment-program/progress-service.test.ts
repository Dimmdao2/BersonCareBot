import { describe, expect, it, beforeEach } from "vitest";
import { createTreatmentProgramProgressService } from "./progress-service";
import { inferNormalizedDecisionFromScoring } from "./progress-scoring";
import { formatNormalizedTestDecisionRu, formatTreatmentProgramStageStatusRu } from "./types";
import { createInMemoryTreatmentProgramPersistence } from "@/app-layer/testing/treatmentProgramInstanceInMemory";

const patient = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const doctor = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const testId = "33333333-3333-4333-8333-333333333333";
const tplStageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tplStage2Id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("treatment-program progress-service", () => {
  let persistence: ReturnType<typeof createInMemoryTreatmentProgramPersistence>;
  let progress: ReturnType<typeof createTreatmentProgramProgressService>;

  beforeEach(() => {
    persistence = createInMemoryTreatmentProgramPersistence();
    progress = createTreatmentProgramProgressService({
      instances: persistence.instancePort,
      tests: persistence.testAttemptsPort,
      events: persistence.eventsPort,
    });
  });

  it("§3: touch moves stage available → in_progress", async () => {
    const inst = await persistence.instancePort.createInstanceTree({
      templateId: "00000000-0000-4000-8000-000000000001",
      patientUserId: patient,
      assignedBy: null,
      title: "Программа",
      stages: [
        {
          sourceStageId: tplStageId,
          title: "Этап 1",
          description: null,
          sortOrder: 0,
          status: "available",
          items: [
            {
              itemType: "recommendation",
              itemRefId: "11111111-1111-4111-8111-111111111111",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: { itemType: "recommendation", title: "R" },
            },
          ],
        },
      ],
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    const out = await progress.patientTouchStageItem({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
    });
    expect(out.stages[0]!.status).toBe("in_progress");
  });

  it("§3: completing all items completes stage and unlocks next", async () => {
    const inst = await persistence.instancePort.createInstanceTree({
      templateId: "00000000-0000-4000-8000-000000000001",
      patientUserId: patient,
      assignedBy: null,
      title: "Программа",
      stages: [
        {
          sourceStageId: tplStageId,
          title: "Этап 1",
          description: null,
          sortOrder: 0,
          status: "available",
          items: [
            {
              itemType: "recommendation",
              itemRefId: "11111111-1111-4111-8111-111111111111",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: { title: "A" },
            },
          ],
        },
        {
          sourceStageId: tplStage2Id,
          title: "Этап 2",
          description: null,
          sortOrder: 1,
          status: "locked",
          items: [
            {
              itemType: "recommendation",
              itemRefId: "22222222-2222-4222-8222-222222222222",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: { title: "B" },
            },
          ],
        },
      ],
    });
    const item1 = inst.stages[0]!.items[0]!.id;
    await progress.patientCompleteSimpleItem({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: item1,
    });
    const after = await persistence.instancePort.getInstanceForPatient(patient, inst.id);
    expect(after!.stages[0]!.status).toBe("completed");
    expect(after!.stages[1]!.status).toBe("available");
  });

  it("test_results: scoring passIfGte and stage completion after all tests", async () => {
    const inst = await persistence.instancePort.createInstanceTree({
      templateId: "00000000-0000-4000-8000-000000000001",
      patientUserId: patient,
      assignedBy: null,
      title: "Программа",
      stages: [
        {
          sourceStageId: tplStageId,
          title: "Этап 1",
          description: null,
          sortOrder: 0,
          status: "available",
          items: [
            {
              itemType: "test_set",
              itemRefId: "44444444-4444-4444-8444-444444444444",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: {
                itemType: "test_set",
                title: "Набор",
                tests: [{ testId, title: "T1", scoringConfig: { passIfGte: 5 } }],
              },
            },
          ],
        },
        {
          sourceStageId: tplStage2Id,
          title: "Этап 2",
          description: null,
          sortOrder: 1,
          status: "locked",
          items: [],
        },
      ],
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    const out = await progress.patientSubmitTestResult({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
      testId,
      rawValue: { score: 6 },
    });
    expect(out.stages[0]!.items[0]!.completedAt).not.toBeNull();
    expect(out.stages[0]!.status).toBe("completed");
    expect(out.stages[1]!.status).toBe("available");
    const details = await progress.listTestResultsForInstance(inst.id);
    expect(details).toHaveLength(1);
    expect(details[0]!.normalizedDecision).toBe("passed");
    expect(details[0]!.decidedBy).toBeNull();
    const ev = await persistence.eventsPort.listEventsForInstance(inst.id);
    expect(ev.some((e) => e.eventType === "test_completed")).toBe(true);
    expect(ev.some((e) => e.eventType === "stage_completed")).toBe(true);
  });

  it("§8: stage_skipped записывается в treatment_program_events", async () => {
    const inst = await persistence.instancePort.createInstanceTree({
      templateId: "00000000-0000-4000-8000-000000000001",
      patientUserId: patient,
      assignedBy: null,
      title: "Программа",
      stages: [
        {
          sourceStageId: tplStageId,
          title: "Этап 1",
          description: null,
          sortOrder: 0,
          status: "available",
          items: [],
        },
      ],
    });
    const stageId = inst.stages[0]!.id;
    await progress.doctorSetStageStatus({
      instanceId: inst.id,
      stageId,
      status: "skipped",
      reason: "Не актуально",
      doctorUserId: doctor,
    });
    const ev = await persistence.eventsPort.listEventsForInstance(inst.id);
    const skip = ev.find((e) => e.eventType === "stage_skipped");
    expect(skip?.reason).toBe("Не актуально");
    expect(skip?.actorId).toBe(doctor);
  });

  it("doctor skip requires reason", async () => {
    const inst = await persistence.instancePort.createInstanceTree({
      templateId: "00000000-0000-4000-8000-000000000001",
      patientUserId: patient,
      assignedBy: null,
      title: "Программа",
      stages: [
        {
          sourceStageId: tplStageId,
          title: "Этап 1",
          description: null,
          sortOrder: 0,
          status: "available",
          items: [],
        },
      ],
    });
    const stageId = inst.stages[0]!.id;
    await expect(
      progress.doctorSetStageStatus({
        instanceId: inst.id,
        stageId,
        status: "skipped",
        reason: "  ",
        doctorUserId: doctor,
      }),
    ).rejects.toThrow(/причину/);

    const ok = await progress.doctorSetStageStatus({
      instanceId: inst.id,
      stageId,
      status: "skipped",
      reason: "Клинически не применимо",
      doctorUserId: doctor,
    });
    expect(ok.stages[0]!.status).toBe("skipped");
    expect(ok.stages[0]!.skipReason).toBe("Клинически не применимо");
  });

  it("skipped current stage unlocks next locked as available (§3)", async () => {
    const inst = await persistence.instancePort.createInstanceTree({
      templateId: "00000000-0000-4000-8000-000000000001",
      patientUserId: patient,
      assignedBy: null,
      title: "Программа",
      stages: [
        {
          sourceStageId: tplStageId,
          title: "Этап 1",
          description: null,
          sortOrder: 0,
          status: "available",
          items: [],
        },
        {
          sourceStageId: tplStage2Id,
          title: "Этап 2",
          description: null,
          sortOrder: 1,
          status: "locked",
          items: [],
        },
      ],
    });
    const s1 = inst.stages[0]!.id;
    const out = await progress.doctorSetStageStatus({
      instanceId: inst.id,
      stageId: s1,
      status: "skipped",
      reason: "Пациент не готов",
      doctorUserId: doctor,
    });
    expect(out.stages[0]!.status).toBe("skipped");
    expect(out.stages[1]!.status).toBe("available");
  });

  it("doctor can open locked stage", async () => {
    const inst = await persistence.instancePort.createInstanceTree({
      templateId: "00000000-0000-4000-8000-000000000001",
      patientUserId: patient,
      assignedBy: null,
      title: "Программа",
      stages: [
        {
          sourceStageId: tplStageId,
          title: "Этап 1",
          description: null,
          sortOrder: 0,
          status: "locked",
          items: [],
        },
      ],
    });
    const stageId = inst.stages[0]!.id;
    const out = await progress.doctorSetStageStatus({
      instanceId: inst.id,
      stageId,
      status: "available",
      doctorUserId: doctor,
    });
    expect(out.stages[0]!.status).toBe("available");
  });

  it("doctorOverrideTestResult sets decidedBy", async () => {
    const inst = await persistence.instancePort.createInstanceTree({
      templateId: "00000000-0000-4000-8000-000000000001",
      patientUserId: patient,
      assignedBy: null,
      title: "Программа",
      stages: [
        {
          sourceStageId: tplStageId,
          title: "Этап 1",
          description: null,
          sortOrder: 0,
          status: "available",
          items: [
            {
              itemType: "test_set",
              itemRefId: "44444444-4444-4444-8444-444444444444",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: {
                tests: [{ testId, scoringConfig: { passIfGte: 10 } }],
              },
            },
          ],
        },
      ],
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await progress.patientSubmitTestResult({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
      testId,
      rawValue: { score: 12 },
    });
    const list = await progress.listTestResultsForInstance(inst.id);
    const doctor = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const row = await progress.doctorOverrideTestResult({
      instanceId: inst.id,
      resultId: list[0]!.id,
      doctorUserId: doctor,
      normalizedDecision: "failed",
    });
    expect(row.normalizedDecision).toBe("failed");
    expect(row.decidedBy).toBe(doctor);
  });
});

describe("progress-scoring", () => {
  it("infer passIfGte", () => {
    expect(inferNormalizedDecisionFromScoring({ passIfGte: 3 }, { score: 4 })).toBe("passed");
    expect(inferNormalizedDecisionFromScoring({ passIfGte: 3 }, { score: 2 })).toBeNull();
  });
});

describe("stage status display (AUDIT_PHASE_6 FIX)", () => {
  it("formatTreatmentProgramStageStatusRu matches patient/doctor UI", () => {
    expect(formatTreatmentProgramStageStatusRu("in_progress")).toBe("в процессе");
    expect(formatTreatmentProgramStageStatusRu("locked")).toBe("заблокирован");
    expect(formatTreatmentProgramStageStatusRu("unknown_status")).toBe("unknown_status");
  });

  it("formatNormalizedTestDecisionRu matches patient/doctor test result labels", () => {
    expect(formatNormalizedTestDecisionRu("passed")).toBe("зачтено");
    expect(formatNormalizedTestDecisionRu("failed")).toBe("не зачтено");
    expect(formatNormalizedTestDecisionRu("partial")).toBe("частично");
  });
});
