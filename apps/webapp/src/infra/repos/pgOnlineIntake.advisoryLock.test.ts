/** @vitest-environment node */

import { describe, expect, it, vi, beforeEach } from "vitest";

const { pgAdvisoryXactLockShared } = vi.hoisted(() => ({
  pgAdvisoryXactLockShared: vi.fn(),
}));

vi.mock("@/infra/db/pgAdvisoryLock", () => ({
  pgAdvisoryXactLockShared,
}));

vi.mock("@/infra/db/client", () => ({
  getPool: vi.fn(),
}));

vi.mock("@/infra/repos/pgMediaFileIntakeResolve", () => ({
  resolveMediaFileForLfkAttachment: vi.fn(),
}));

import { getPool } from "@/infra/db/client";
import { createPgOnlineIntakePort } from "@/infra/repos/pgOnlineIntake";

describe("createPgOnlineIntakePort advisory locks", () => {
  const userId = "00000000-0000-4000-8000-0000000000aa";

  beforeEach(() => {
    vi.clearAllMocks();
    pgAdvisoryXactLockShared.mockResolvedValue(undefined);
  });

  function mockPool() {
    const order: string[] = [];
    const query = vi.fn((sql: string) => {
      order.push(sql);
      if (sql.includes("INSERT INTO online_intake_requests")) {
        return Promise.resolve({
          rows: [
            {
              id: "req-1",
              user_id: userId,
              type: "lfk",
              status: "new",
              summary: "x",
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    vi.mocked(getPool).mockReturnValue({
      connect: () => Promise.resolve({ query, release: vi.fn() }),
    } as never);
    return order;
  }

  it("createLfkRequest takes shared xact lock on user id before insert", async () => {
    const order = mockPool();
    const port = createPgOnlineIntakePort();

    await port.createLfkRequest({ userId, description: "test description here" });

    expect(order[0]).toBe("BEGIN");
    expect(pgAdvisoryXactLockShared).toHaveBeenCalledWith(expect.anything(), userId);
    expect(order.some((s) => s.includes("INSERT INTO online_intake_requests"))).toBe(true);
  });

  it("createNutritionRequest takes shared xact lock on user id before insert", async () => {
    const order = mockPool();
    const port = createPgOnlineIntakePort();

    await port.createNutritionRequest({ userId, description: "nutrition description" });

    expect(order[0]).toBe("BEGIN");
    expect(pgAdvisoryXactLockShared).toHaveBeenCalledWith(expect.anything(), userId);
    expect(order.some((s) => s.includes("INSERT INTO online_intake_requests"))).toBe(true);
  });
});
