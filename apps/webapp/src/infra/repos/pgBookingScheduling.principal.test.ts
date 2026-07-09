import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDrizzleMock } = vi.hoisted(() => ({
  getDrizzleMock: vi.fn(),
}));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: getDrizzleMock,
}));

vi.mock("@/modules/booking-scheduling/service", () => ({
  buildSlotsForContext: vi.fn(),
}));

import { createPgBookingSchedulingPort } from "./pgBookingScheduling";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TMPL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function templateRow() {
  return {
    id: TMPL,
    organizationId: ORG,
    branchId: null,
    name: "Стандарт",
    startMinute: 540,
    endMinute: 1080,
    breaks: [],
    sortOrder: 0,
    isActive: true,
  };
}

describe("pgBookingScheduling principal-safe schedule template mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates schedule templates through db.transaction", async () => {
    const returning = vi.fn(async () => [templateRow()]);
    const values = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ values }));
    const tx = { insert };
    const db = {
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgBookingSchedulingPort(async () => ORG);
    const row = await port.createScheduleTemplate({
      organizationId: ORG,
      name: "Стандарт",
      startMinute: 540,
      endMinute: 1080,
    });

    expect(row).toEqual(expect.objectContaining({ id: TMPL, organizationId: ORG }));
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        branchId: null,
        name: "Стандарт",
        startMinute: 540,
        endMinute: 1080,
        breaks: [],
        sortOrder: 0,
        isActive: true,
      }),
    );
    expect(returning).toHaveBeenCalledTimes(1);
  });

  it("deletes schedule templates through db.transaction", async () => {
    const where = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const tx = { update };
    const db = {
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgBookingSchedulingPort(async () => ORG);
    await port.deleteScheduleTemplate(ORG, TMPL);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    expect(where).toHaveBeenCalledTimes(1);
  });
});
