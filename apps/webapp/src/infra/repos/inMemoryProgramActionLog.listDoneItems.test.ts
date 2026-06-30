import { describe, expect, it } from "vitest";
import { createInMemoryProgramActionLogPort } from "./inMemoryProgramActionLog";
import { createTreatmentProgramProgressService } from "@/modules/treatment-program/progress-service";
import { createInMemoryTreatmentProgramPersistence } from "@/app-layer/testing/treatmentProgramInstanceInMemory";

describe("createInMemoryProgramActionLogPort listDoneItemsByLocalDateInWindow", () => {
  it("returns distinct localDate and itemId pairs", async () => {
    const log = createInMemoryProgramActionLogPort();
    const instanceId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const patientUserId = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
    const itemId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    await log.insertAction({
      instanceId,
      instanceStageItemId: itemId,
      patientUserId,
      sessionId: null,
      actionType: "done",
      payload: null,
      note: null,
    });
    const rows = await log.listDoneItemsByLocalDateInWindow({
      instanceId,
      patientUserId,
      windowStartUtcIso: "2026-01-01T00:00:00.000Z",
      windowEndUtcExclusiveIso: "2027-01-01T00:00:00.000Z",
      displayIana: "Europe/Moscow",
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.some((r) => r.itemId === itemId)).toBe(true);
  });

  it("listDoneForStageItemInWindow: returns only done rows within window for the given stageItem", async () => {
    const log = createInMemoryProgramActionLogPort();
    const instanceId = "aaaaaaaa-bbbb-cccc-dddd-111111111111";
    const stageItemId = "cccccccc-cccc-cccc-cccc-111111111111";
    const patientUserId = "bbbbbbbb-bbbb-cccc-dddd-111111111111";

    // Insert a matching row inside the window
    await log.insertAction({
      instanceId,
      instanceStageItemId: stageItemId,
      patientUserId,
      sessionId: null,
      actionType: "done",
      payload: { source: "simple_item_complete", reps: 10, perceivedDifficulty: "hard" },
      note: null,
    });
    // Insert a row for a different stageItem (should be excluded)
    await log.insertAction({
      instanceId,
      instanceStageItemId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      patientUserId,
      sessionId: null,
      actionType: "done",
      payload: null,
      note: null,
    });

    const rows = await log.listDoneForStageItemInWindow({
      instanceId,
      instanceStageItemId: stageItemId,
      windowStartUtcIso: "2020-01-01T00:00:00.000Z",
      windowEndUtcExclusiveIso: "2099-01-01T00:00:00.000Z",
    });
    expect(rows.length).toBe(1);
    expect(rows[0]!.instanceStageItemId).toBe(stageItemId);
    expect(rows[0]!.payload?.reps).toBe(10);
  });

  it("listDoneForStageItemInWindow: empty when no rows in window", async () => {
    const log = createInMemoryProgramActionLogPort();
    const instanceId = "aaaaaaaa-bbbb-cccc-dddd-222222222222";
    const stageItemId = "cccccccc-cccc-cccc-cccc-222222222222";

    await log.insertAction({
      instanceId,
      instanceStageItemId: stageItemId,
      patientUserId: "bbbbbbbb-bbbb-cccc-dddd-222222222222",
      sessionId: null,
      actionType: "done",
      payload: null,
      note: null,
    });

    const rows = await log.listDoneForStageItemInWindow({
      instanceId,
      instanceStageItemId: stageItemId,
      // Window in the past before any insertions
      windowStartUtcIso: "2000-01-01T00:00:00.000Z",
      windowEndUtcExclusiveIso: "2001-01-01T00:00:00.000Z",
    });
    expect(rows.length).toBe(0);
  });

  it("listExerciseMetricsForWeek: aggregates reps/weightKg/difficulty from payload", async () => {
    const persistence = createInMemoryTreatmentProgramPersistence();
    const actionLog = createInMemoryProgramActionLogPort();
    const progress = createTreatmentProgramProgressService({
      instances: persistence.instancePort,
      tests: persistence.testAttemptsPort,
      actionLog,
    });

    const instanceId = "aaaaaaaa-bbbb-cccc-dddd-333333333333";
    const stageItemId = "cccccccc-cccc-cccc-cccc-333333333333";

    // Insert row with all metrics
    await actionLog.insertAction({
      instanceId,
      instanceStageItemId: stageItemId,
      patientUserId: "bbbbbbbb-bbbb-cccc-dddd-333333333333",
      sessionId: null,
      actionType: "done",
      payload: { reps: 12, weightKg: 5.5, perceivedDifficulty: "medium" },
      note: null,
    });
    // Insert row with partial metrics (only reps)
    await actionLog.insertAction({
      instanceId,
      instanceStageItemId: stageItemId,
      patientUserId: "bbbbbbbb-bbbb-cccc-dddd-333333333333",
      sessionId: null,
      actionType: "done",
      payload: { reps: 15 },
      note: null,
    });
    // Insert row with no metrics (just done)
    await actionLog.insertAction({
      instanceId,
      instanceStageItemId: stageItemId,
      patientUserId: "bbbbbbbb-bbbb-cccc-dddd-333333333333",
      sessionId: null,
      actionType: "done",
      payload: null,
      note: null,
    });

    const points = await progress.listExerciseMetricsForWeek({ instanceId, instanceStageItemId: stageItemId });

    expect(points.length).toBe(3);
    // All points have valid at (ISO string)
    expect(points.every((p) => typeof p.at === "string" && p.at.length > 0)).toBe(true);
    // sets is always null (Phase C not yet written)
    expect(points.every((p) => p.sets === null)).toBe(true);

    const withReps = points.find((p) => p.reps === 12);
    expect(withReps).toBeDefined();
    expect(withReps!.weightKg).toBe(5.5);
    expect(withReps!.difficulty).toBe("medium");

    const withRepsOnly = points.find((p) => p.reps === 15);
    expect(withRepsOnly).toBeDefined();
    expect(withRepsOnly!.weightKg).toBeNull();
    expect(withRepsOnly!.difficulty).toBeNull();

    const noMetrics = points.find((p) => p.reps === null && p.weightKg === null);
    expect(noMetrics).toBeDefined();
    expect(noMetrics!.difficulty).toBeNull();
  });

  it("listExerciseMetricsForWeek: returns empty array when no data", async () => {
    const persistence = createInMemoryTreatmentProgramPersistence();
    const actionLog = createInMemoryProgramActionLogPort();
    const progress = createTreatmentProgramProgressService({
      instances: persistence.instancePort,
      tests: persistence.testAttemptsPort,
      actionLog,
    });

    const points = await progress.listExerciseMetricsForWeek({
      instanceId: "aaaaaaaa-bbbb-cccc-dddd-444444444444",
      instanceStageItemId: "cccccccc-cccc-cccc-cccc-444444444444",
    });
    expect(points).toEqual([]);
  });

  it("listDoneItemsByLocalDateInWindowForPatient returns instanceId across programs", async () => {
    const log = createInMemoryProgramActionLogPort();
    const patientUserId = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
    const oldInst = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const itemId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    await log.insertAction({
      instanceId: oldInst,
      instanceStageItemId: itemId,
      patientUserId,
      actionType: "done",
      sessionId: null,
      payload: null,
      note: null,
    });
    const rows = await log.listDoneItemsByLocalDateInWindowForPatient({
      patientUserId,
      windowStartUtcIso: "2026-01-01T00:00:00.000Z",
      windowEndUtcExclusiveIso: "2027-01-01T00:00:00.000Z",
      displayIana: "Europe/Moscow",
    });
    expect(rows.some((r) => r.itemId === itemId && r.instanceId === oldInst)).toBe(true);
  });
});
