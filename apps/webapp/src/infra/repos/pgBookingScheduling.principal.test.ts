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
const WD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SPEC = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const WH = "ffffffff-ffff-4fff-8fff-ffffffffffff";

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

function rawWorkingDayRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WD,
    organization_id: ORG,
    specialist_id: SPEC,
    branch_id: null,
    room_id: null,
    work_date: "2026-07-10",
    start_minute: 540,
    end_minute: 1080,
    breaks: [],
    is_closed: false,
    ...overrides,
  };
}

function workingHoursRow() {
  return {
    id: WH,
    organizationId: ORG,
    specialistId: SPEC,
    branchId: null,
    roomId: null,
    weekday: 1,
    startMinute: 540,
    endMinute: 1080,
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

  it("upserts working days through db.transaction", async () => {
    const execute = vi.fn(async () => ({ rows: [rawWorkingDayRow()] }));
    const tx = { execute };
    const db = {
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgBookingSchedulingPort(async () => ORG);
    const rows = await port.upsertWorkingDays({
      organizationId: ORG,
      specialistId: SPEC,
      dates: ["2026-07-10"],
      startMinute: 540,
      endMinute: 1080,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        id: WD,
        organizationId: ORG,
        specialistId: SPEC,
        workDate: "2026-07-10",
        isClosed: false,
      }),
    ]);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("closes working days through db.transaction", async () => {
    const execute = vi.fn(async () => ({
      rows: [rawWorkingDayRow({ start_minute: null, end_minute: null, is_closed: true })],
    }));
    const tx = { execute };
    const db = {
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgBookingSchedulingPort(async () => ORG);
    const rows = await port.closeWorkingDays({
      organizationId: ORG,
      specialistId: SPEC,
      dates: ["2026-07-10"],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        id: WD,
        organizationId: ORG,
        specialistId: SPEC,
        startMinute: null,
        endMinute: null,
        isClosed: true,
      }),
    ]);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("clears working days through db.transaction", async () => {
    const where = vi.fn(async () => undefined);
    const deleteFrom = vi.fn(() => ({ where }));
    const tx = { delete: deleteFrom };
    const db = {
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgBookingSchedulingPort(async () => ORG);
    await port.clearWorkingDays({
      organizationId: ORG,
      specialistId: SPEC,
      dates: ["2026-07-10"],
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(deleteFrom).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it("creates working hours through db.transaction", async () => {
    const returning = vi.fn(async () => [workingHoursRow()]);
    const values = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ values }));
    const tx = { insert };
    const db = {
      insert: vi.fn(() => {
        throw new Error("db insert should not run outside transaction");
      }),
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgBookingSchedulingPort(async () => ORG);
    const row = await port.createWorkingHours({
      organizationId: ORG,
      specialistId: SPEC,
      weekday: 1,
      startMinute: 540,
      endMinute: 1080,
    });

    expect(row).toEqual(expect.objectContaining({ id: WH, organizationId: ORG }));
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("updates working hours through db.transaction", async () => {
    const returning = vi.fn(async () => [{ ...workingHoursRow(), endMinute: 1020 }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const tx = { update };
    const db = {
      update: vi.fn(() => {
        throw new Error("db update should not run outside transaction");
      }),
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgBookingSchedulingPort(async () => ORG);
    const row = await port.updateWorkingHours({
      organizationId: ORG,
      id: WH,
      endMinute: 1020,
    });

    expect(row).toEqual(expect.objectContaining({ id: WH, endMinute: 1020 }));
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("deactivates working hours through db.transaction", async () => {
    const where = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const tx = { update };
    const db = {
      update: vi.fn(() => {
        throw new Error("db update should not run outside transaction");
      }),
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgBookingSchedulingPort(async () => ORG);
    await port.deactivateWorkingHours(ORG, WH);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    expect(where).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
  });
});
