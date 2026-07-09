import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDrizzleMock } = vi.hoisted(() => ({
  getDrizzleMock: vi.fn(),
}));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: getDrizzleMock,
}));

import { createPgClientHistoryPort } from "./pgClientHistory";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APPOINTMENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PATIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DOCTOR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const COMMENT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

describe("pgClientHistory principal-safe appointment comment mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates appointment staff comments through db.transaction", async () => {
    const returning = vi.fn(async () => [
      {
        id: COMMENT,
        organizationId: ORG,
        appointmentId: APPOINTMENT,
        platformUserId: PATIENT,
        authorId: DOCTOR,
        body: "Follow up",
        createdAt: "2026-07-09T00:00:00.000Z",
        updatedAt: "2026-07-09T00:00:00.000Z",
      },
    ]);
    const values = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ values }));
    const tx = { insert };
    const db = {
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgClientHistoryPort();
    const row = await port.createAppointmentComment({
      organizationId: ORG,
      appointmentId: APPOINTMENT,
      platformUserId: PATIENT,
      authorId: DOCTOR,
      body: "Follow up",
    });

    expect(row).toEqual({
      id: COMMENT,
      appointmentId: APPOINTMENT,
      platformUserId: PATIENT,
      authorId: DOCTOR,
      body: "Follow up",
      createdAt: "2026-07-09T00:00:00.000Z",
      updatedAt: "2026-07-09T00:00:00.000Z",
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        appointmentId: APPOINTMENT,
        platformUserId: PATIENT,
        authorId: DOCTOR,
        body: "Follow up",
      }),
    );
    expect(returning).toHaveBeenCalledTimes(1);
  });
});
