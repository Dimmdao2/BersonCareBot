import { beforeEach, describe, expect, it, vi } from "vitest";

const getDrizzleMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: getDrizzleMock,
}));

import { pgOperatorHealthWritePort } from "./pgOperatorHealthWrite";

describe("pgOperatorHealthWritePort provider alert cadence", () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
  });

  it("does not open a DB checkout for an empty incident set", async () => {
    await expect(
      pgOperatorHealthWritePort.markOpenIncidentsAlertSent({
        incidentIds: [],
        alertSentAtIso: "2026-07-22T07:00:00.000Z",
      }),
    ).resolves.toEqual({ updated: 0 });
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });

  it("updates only the selected still-open incident rows", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "incident-1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    getDrizzleMock.mockReturnValue({ update });

    await expect(
      pgOperatorHealthWritePort.markOpenIncidentsAlertSent({
        incidentIds: ["incident-1", "incident-1"],
        alertSentAtIso: "2026-07-22T07:00:00.000Z",
      }),
    ).resolves.toEqual({ updated: 1 });
    expect(set).toHaveBeenCalledWith({ alertSentAt: "2026-07-22T07:00:00.000Z" });
    expect(where).toHaveBeenCalledOnce();
  });
});
