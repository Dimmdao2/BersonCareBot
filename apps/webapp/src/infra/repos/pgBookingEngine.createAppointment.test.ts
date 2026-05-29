import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beAppointmentEvents,
  beAppointmentHistoryEvents,
  beAppointments,
} from "../../../db/schema/bookingEngine";

const insertOrder = vi.hoisted(() => [] as string[]);

const txInsert = vi.hoisted(() =>
  vi.fn((table: unknown) => {
    if (table === beAppointments) insertOrder.push("appointments");
    else if (table === beAppointmentEvents) insertOrder.push("events");
    else if (table === beAppointmentHistoryEvents) insertOrder.push("history");
    return {
      values: vi.fn(() => ({
        returning: vi.fn(async () => [
          {
            id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
            organizationId: "a0000000-0000-4000-8000-000000000001",
            branchId: null,
            roomId: null,
            specialistId: null,
            serviceId: null,
            platformUserId: null,
            startAt: "2026-06-01T10:00:00.000Z",
            endAt: "2026-06-01T11:00:00.000Z",
            durationMinutes: 60,
            source: "native",
            status: "created",
            originalStartAt: "2026-06-01T10:00:00.000Z",
            rescheduleCount: 0,
            paymentRef: null,
            packageUsageRef: null,
            phoneNormalized: null,
            createdAt: "2026-06-01T09:00:00.000Z",
            updatedAt: "2026-06-01T09:00:00.000Z",
          },
        ]),
      })),
    };
  }),
);

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: vi.fn(() => ({
    transaction: async (fn: (tx: { insert: typeof txInsert }) => unknown) => fn({ insert: txInsert }),
    execute: vi.fn(async () => ({ rows: [] })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
          orderBy: vi.fn(async () => []),
        })),
        orderBy: vi.fn(async () => []),
      })),
    })),
    insert: vi.fn(),
    update: vi.fn(),
  })),
}));

import { createPgBookingEnginePort } from "./pgBookingEngine";

describe("createPgBookingEnginePort.createAppointment", () => {
  beforeEach(() => {
    insertOrder.length = 0;
    txInsert.mockClear();
  });

  it("writes appointment and history events atomically in one transaction", async () => {
    const port = createPgBookingEnginePort();
    await port.createAppointment({
      organizationId: "a0000000-0000-4000-8000-000000000001",
      startAt: "2026-06-01T10:00:00.000Z",
      endAt: "2026-06-01T11:00:00.000Z",
      durationMinutes: 60,
      source: "native",
      status: "created",
    });
    expect(insertOrder).toEqual(["appointments", "events", "history"]);
  });
});
