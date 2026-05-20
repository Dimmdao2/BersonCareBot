import { describe, expect, it } from "vitest";
import { createInMemoryProgramActionLogPort } from "./inMemoryProgramActionLog";

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
