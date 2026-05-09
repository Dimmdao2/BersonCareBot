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
});
