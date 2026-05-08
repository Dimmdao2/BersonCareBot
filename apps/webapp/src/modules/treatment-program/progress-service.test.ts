import { describe, expect, it, beforeEach, vi } from "vitest";
import { createTreatmentProgramProgressService } from "./progress-service";
import { inferNormalizedDecisionFromScoring, scoringAllowsNumericDecisionInference, scoringConfigIsQualitative } from "./progress-scoring";
import { formatNormalizedTestDecisionRu, formatTreatmentProgramStageStatusRu } from "./types";
import { createInMemoryTreatmentProgramPersistence } from "@/app-layer/testing/treatmentProgramInstanceInMemory";
import { createInMemoryProgramActionLogPort } from "@/infra/repos/inMemoryProgramActionLog";

const patient = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const doctor = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const testId = "33333333-3333-4333-8333-333333333333";
const testIdQual2 = "44444444-4444-4444-8444-444444444444";
const tplStageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tplStage2Id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const tplGroupMain = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("treatment-program progress-service", () => {
  let persistence: ReturnType<typeof createInMemoryTreatmentProgramPersistence>;
  let actionLog: ReturnType<typeof createInMemoryProgramActionLogPort>;
  let progress: ReturnType<typeof createTreatmentProgramProgressService>;

  beforeEach(() => {
    persistence = createInMemoryTreatmentProgramPersistence();
    actionLog = createInMemoryProgramActionLogPort();
    progress = createTreatmentProgramProgressService({
      instances: persistence.instancePort,
      tests: persistence.testAttemptsPort,
      events: persistence.eventsPort,
      actionLog,
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
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
    expect(out.stages[0]!.startedAt).toBeTruthy();
  });

  it("stage started_at: doctor available → in_progress then idempotent in_progress keeps same started_at", async () => {
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
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
    const stageId = inst.stages[0]!.id;
    await progress.doctorSetStageStatus({
      instanceId: inst.id,
      stageId,
      status: "in_progress",
      doctorUserId: doctor,
    });
    let d = await persistence.instancePort.getInstanceById(inst.id);
    const first = d!.stages[0]!.startedAt;
    expect(first).toBeTruthy();
    await progress.doctorSetStageStatus({
      instanceId: inst.id,
      stageId,
      status: "in_progress",
      doctorUserId: doctor,
    });
    d = await persistence.instancePort.getInstanceById(inst.id);
    expect(d!.stages[0]!.startedAt).toBe(first);
  });

  it("stage started_at: createInstanceTree with initial in_progress sets started_at", async () => {
    const inst = await persistence.instancePort.createInstanceTree({
      templateId: "00000000-0000-4000-8000-000000000001",
      patientUserId: patient,
      assignedBy: null,
      title: "Программа",
      stages: [
        {
          sourceStageId: tplStageId,
          title: "Этап старт",
          description: null,
          sortOrder: 1,
          status: "in_progress",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [
            {
              itemType: "recommendation",
              itemRefId: "11111111-1111-4111-8111-111111111111",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: { title: "R" },
            },
          ],
        },
      ],
    });
    expect(inst.stages[0]!.startedAt).toBeTruthy();
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
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
          sortOrder: 2,
          status: "locked",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
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

  it("patientCompleteSimpleItem writes program_action_log done on each completion", async () => {
    const insertSpy = vi.spyOn(actionLog, "insertAction");
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          groups: [
            {
              sourceGroupId: tplGroupMain,
              title: "G",
              description: null,
              scheduleText: null,
              sortOrder: 0,
            },
          ],
          items: [
            {
              itemType: "lesson",
              itemRefId: "11111111-1111-4111-8111-111111111111",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: { title: "Урок" },
              templateGroupId: tplGroupMain,
            },
          ],
        },
      ],
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await progress.patientCompleteSimpleItem({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
    });
    await progress.patientCompleteSimpleItem({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
    });
    const simpleDoneCalls = insertSpy.mock.calls.filter(
      (c) => (c[0] as { payload?: { source?: string } }).payload?.source === "simple_item_complete",
    );
    expect(simpleDoneCalls).toHaveLength(2);
    expect(simpleDoneCalls[0]![0]).toMatchObject({
      actionType: "done",
      payload: { source: "simple_item_complete", itemType: "lesson" },
    });
    expect(simpleDoneCalls[1]![0]).toMatchObject({
      actionType: "done",
      payload: { source: "simple_item_complete", itemType: "lesson" },
    });
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [
            {
              itemType: "clinical_test",
              itemRefId: "44444444-4444-4444-8444-444444444444",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: {
                itemType: "clinical_test",
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
          sortOrder: 2,
          status: "locked",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
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

  it("D4/Q2: qualitative clinical_test — explicit normalizedDecision completes item and stage (no special branch)", async () => {
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [
            {
              itemType: "clinical_test",
              itemRefId: "44444444-4444-4444-8444-444444444444",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: {
                itemType: "clinical_test",
                title: "Набор",
                tests: [
                  {
                    testId,
                    title: "Qual",
                    scoringConfig: { schema_type: "qualitative", measure_items: [] },
                  },
                ],
              },
            },
          ],
        },
        {
          sourceStageId: tplStage2Id,
          title: "Этап 2",
          description: null,
          sortOrder: 2,
          status: "locked",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
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
      rawValue: { note: "субъективно норма" },
      normalizedDecision: "passed",
    });
    expect(out.stages[0]!.items[0]!.completedAt).not.toBeNull();
    expect(out.stages[0]!.status).toBe("completed");
    expect(out.stages[1]!.status).toBe("available");
    const details = await progress.listTestResultsForInstance(inst.id);
    expect(details).toHaveLength(1);
    expect(details[0]!.normalizedDecision).toBe("passed");
  });

  it("D4/Q2: two qualitative tests in set — both require explicit decision; then stage completes", async () => {
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [
            {
              itemType: "clinical_test",
              itemRefId: "55555555-5555-4555-8555-555555555555",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: {
                itemType: "clinical_test",
                tests: [
                  {
                    testId,
                    title: "A",
                    scoringConfig: { schema_type: "qualitative", measure_items: [] },
                  },
                  {
                    testId: testIdQual2,
                    title: "B",
                    scoringConfig: { schema_type: "qualitative", measure_items: [] },
                  },
                ],
              },
            },
          ],
        },
        {
          sourceStageId: tplStage2Id,
          title: "Этап 2",
          description: null,
          sortOrder: 2,
          status: "locked",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [],
        },
      ],
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await progress.patientSubmitTestResult({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
      testId,
      rawValue: {},
      normalizedDecision: "passed",
    });
    const mid = await persistence.instancePort.getInstanceForPatient(patient, inst.id);
    expect(mid!.stages[0]!.items[0]!.completedAt).toBeNull();
    const out = await progress.patientSubmitTestResult({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
      testId: testIdQual2,
      rawValue: { note: "ok" },
      normalizedDecision: "partial",
    });
    expect(out.stages[0]!.items[0]!.completedAt).not.toBeNull();
    expect(out.stages[0]!.status).toBe("completed");
    expect(out.stages[1]!.status).toBe("available");
  });

  it("D4/Q2: qualitative without normalizedDecision and without inferrable score — rejects", async () => {
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [
            {
              itemType: "clinical_test",
              itemRefId: "66666666-6666-4666-8666-666666666666",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: {
                tests: [
                  {
                    testId,
                    title: "Qual",
                    scoringConfig: { schema_type: "qualitative", measure_items: [] },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await expect(
      progress.patientSubmitTestResult({
        patientUserId: patient,
        instanceId: inst.id,
        stageItemId: itemId,
        testId,
        rawValue: { text: "no score" },
      }),
    ).rejects.toThrow(/итог/);
  });

  it("FIX-D4-L1: qualitative scoring with only numeric score (no normalizedDecision) — rejects", async () => {
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [
            {
              itemType: "clinical_test",
              itemRefId: "77777777-7777-4777-8777-777777777777",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: {
                tests: [
                  {
                    testId,
                    title: "Qual",
                    scoringConfig: { schema_type: "qualitative", measure_items: [] },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await expect(
      progress.patientSubmitTestResult({
        patientUserId: patient,
        instanceId: inst.id,
        stageItemId: itemId,
        testId,
        rawValue: { score: 7 },
      }),
    ).rejects.toThrow(/итог/);
  });

  it("A4: patientSubmitTestResult writes program_action_log marker and pending inbox lists it", async () => {
    const actionLog = createInMemoryProgramActionLogPort();
    const insertSpy = vi.spyOn(actionLog, "insertAction");
    const p = createTreatmentProgramProgressService({
      instances: persistence.instancePort,
      tests: persistence.testAttemptsPort,
      events: persistence.eventsPort,
      actionLog,
    });
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [
            {
              itemType: "clinical_test",
              itemRefId: "44444444-4444-4444-8444-444444444444",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: {
                itemType: "clinical_test",
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
          sortOrder: 2,
          status: "locked",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [],
        },
      ],
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await p.patientSubmitTestResult({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
      testId,
      rawValue: { score: 6 },
    });
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "done",
        payload: expect.objectContaining({
          source: "test_submitted",
          testResultId: expect.any(String),
          testId,
        }),
      }),
    );
    const pending = await p.listPendingTestEvaluationsForPatient(patient);
    expect(pending.some((x) => x.instanceId === inst.id && x.stageItemId === itemId)).toBe(true);
    const logRows = await p.listProgramActionLogForInstance(inst.id);
    expect(logRows.some((r) => r.payload?.source === "test_submitted")).toBe(true);
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [],
        },
        {
          sourceStageId: tplStage2Id,
          title: "Этап 2",
          description: null,
          sortOrder: 2,
          status: "locked",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
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
          sortOrder: 1,
          status: "locked",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [
            {
              itemType: "clinical_test",
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

  it("A2: этап с sort_order=0 не завершается автоматически при выполнении всех элементов", async () => {
    const inst = await persistence.instancePort.createInstanceTree({
      templateId: "00000000-0000-4000-8000-000000000001",
      patientUserId: patient,
      assignedBy: null,
      title: "Программа",
      stages: [
        {
          sourceStageId: tplStageId,
          title: "Общие",
          description: null,
          sortOrder: 0,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [
            {
              itemType: "recommendation",
              itemRefId: "11111111-1111-4111-8111-111111111111",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: { title: "R" },
            },
          ],
        },
      ],
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    const out = await progress.patientCompleteSimpleItem({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: itemId,
    });
    expect(out.stages[0]!.items[0]!.completedAt).not.toBeNull();
    expect(out.stages[0]!.status).not.toBe("completed");
  });

  it("A2: постоянная рекомендация — пациент не может отметить выполненной", async () => {
    const inst = await persistence.instancePort.createInstanceTree({
      templateId: "00000000-0000-4000-8000-000000000001",
      patientUserId: patient,
      assignedBy: null,
      title: "Программа",
      stages: [
        {
          sourceStageId: tplStageId,
          title: "Этап",
          description: null,
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [
            {
              itemType: "recommendation",
              itemRefId: "11111111-1111-4111-8111-111111111111",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: { title: "P" },
              isActionable: false,
              status: "active",
            },
          ],
        },
      ],
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await expect(
      progress.patientCompleteSimpleItem({
        patientUserId: patient,
        instanceId: inst.id,
        stageItemId: itemId,
      }),
    ).rejects.toThrow(/Постоянная рекомендация/);
  });

  it("A2: отключённый элемент — пациент не может отметить выполненным", async () => {
    const inst = await persistence.instancePort.createInstanceTree({
      templateId: "00000000-0000-4000-8000-000000000001",
      patientUserId: patient,
      assignedBy: null,
      title: "Программа",
      stages: [
        {
          sourceStageId: tplStageId,
          title: "Этап",
          description: null,
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [
            {
              itemType: "recommendation",
              itemRefId: "11111111-1111-4111-8111-111111111111",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: { title: "X" },
              status: "disabled",
            },
          ],
        },
      ],
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await expect(
      progress.patientCompleteSimpleItem({
        patientUserId: patient,
        instanceId: inst.id,
        stageItemId: itemId,
      }),
    ).rejects.toThrow(/отключён/);
  });

  it("A2: постоянная рекомендация не учитывается в автозавершении этапа", async () => {
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
          sortOrder: 1,
          status: "available",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [
            {
              itemType: "recommendation",
              itemRefId: "11111111-1111-4111-8111-111111111111",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: { title: "P" },
              isActionable: false,
            },
            {
              itemType: "recommendation",
              itemRefId: "22222222-2222-4222-8222-222222222222",
              sortOrder: 1,
              comment: null,
              settings: null,
              snapshot: { title: "A" },
              isActionable: true,
            },
          ],
        },
        {
          sourceStageId: tplStage2Id,
          title: "Этап 2",
          description: null,
          sortOrder: 2,
          status: "locked",
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          items: [
            {
              itemType: "recommendation",
              itemRefId: "33333333-3333-4333-8333-333333333333",
              sortOrder: 0,
              comment: null,
              settings: null,
              snapshot: { title: "B" },
            },
          ],
        },
      ],
    });
    const actionableId = inst.stages[0]!.items.find((i) => i.snapshot.title === "A")!.id;
    await progress.patientCompleteSimpleItem({
      patientUserId: patient,
      instanceId: inst.id,
      stageItemId: actionableId,
    });
    const after = await persistence.instancePort.getInstanceForPatient(patient, inst.id);
    expect(after!.stages[0]!.status).toBe("completed");
    expect(after!.stages[1]!.status).toBe("available");
  });
});

describe("progress-scoring", () => {
  it("infer passIfGte", () => {
    expect(inferNormalizedDecisionFromScoring({ passIfGte: 3 }, { score: 4 })).toBe("passed");
    expect(inferNormalizedDecisionFromScoring({ passIfGte: 3 }, { score: 2 })).toBeNull();
  });

  it("scoringAllowsNumericDecisionInference matches threshold keys used by infer", () => {
    expect(scoringAllowsNumericDecisionInference({ passIfGte: 3 })).toBe(true);
    expect(scoringAllowsNumericDecisionInference({ passIfLte: 1 })).toBe(true);
    expect(scoringAllowsNumericDecisionInference({ failIfLt: 2 })).toBe(true);
    expect(scoringAllowsNumericDecisionInference({ schema_type: "qualitative", measure_items: [] })).toBe(false);
    expect(scoringAllowsNumericDecisionInference(null)).toBe(false);
    expect(scoringAllowsNumericDecisionInference({})).toBe(false);
  });

  it("scoringConfigIsQualitative", () => {
    expect(scoringConfigIsQualitative({ schema_type: "qualitative", measure_items: [] })).toBe(true);
    expect(scoringConfigIsQualitative({ schema_type: "numeric", measure_items: [] })).toBe(false);
    expect(scoringConfigIsQualitative({ passIfGte: 1 })).toBe(false);
    expect(scoringConfigIsQualitative(null)).toBe(false);
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
