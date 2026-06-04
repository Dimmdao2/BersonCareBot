/** @vitest-environment node */

import { describe, expect, it, vi, beforeEach } from "vitest";

const { pgAdvisoryXactLock, pgAdvisoryXactLockShared } = vi.hoisted(() => ({
  pgAdvisoryXactLock: vi.fn(),
  pgAdvisoryXactLockShared: vi.fn(),
}));

vi.mock("@/infra/db/pgAdvisoryLock", () => ({
  pgAdvisoryXactLock,
  pgAdvisoryXactLockShared,
}));

import { withTwoUserLifecycleLocksExclusive, withUserLifecycleLock } from "@/infra/userLifecycleLock";

describe("withUserLifecycleLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pgAdvisoryXactLock.mockResolvedValue(undefined);
    pgAdvisoryXactLockShared.mockResolvedValue(undefined);
  });

  it("runs exclusive lock after BEGIN and before callback body", async () => {
    const order: string[] = [];
    const query = vi.fn((sql: string) => {
      order.push(sql);
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    pgAdvisoryXactLock.mockImplementation(async () => {
      order.push("lock:exclusive");
    });
    const pool = {
      connect: () =>
        Promise.resolve({
          query,
          release: vi.fn(),
        }),
    };

    await withUserLifecycleLock(pool as never, "00000000-0000-4000-8000-000000000001", "exclusive", async (c) => {
      await c.query("SELECT 1");
      return "done";
    });

    expect(order[0]).toBe("BEGIN");
    expect(order[1]).toBe("lock:exclusive");
    expect(pgAdvisoryXactLock).toHaveBeenCalledWith(expect.anything(), "00000000-0000-4000-8000-000000000001");
    expect(order.some((s) => s.includes("SELECT 1"))).toBe(true);
    expect(order[order.length - 1]).toBe("COMMIT");
  });

  it("uses shared lock when mode is shared", async () => {
    const pool = {
      connect: () =>
        Promise.resolve({
          query: vi.fn(() => Promise.resolve({ rows: [], rowCount: 0 })),
          release: vi.fn(),
        }),
    };

    await withUserLifecycleLock(pool as never, "00000000-0000-4000-8000-000000000002", "shared", async () => "x");

    expect(pgAdvisoryXactLockShared).toHaveBeenCalledWith(expect.anything(), "00000000-0000-4000-8000-000000000002");
    expect(pgAdvisoryXactLock).not.toHaveBeenCalled();
  });
});

describe("withTwoUserLifecycleLocksExclusive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pgAdvisoryXactLock.mockResolvedValue(undefined);
  });

  it("acquires two exclusive locks in sorted user id order", async () => {
    const pool = {
      connect: () =>
        Promise.resolve({
          query: vi.fn(() => Promise.resolve({ rows: [], rowCount: 0 })),
          release: vi.fn(),
        }),
    };

    const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    await withTwoUserLifecycleLocksExclusive(pool as never, b, a, async () => "done");

    expect(pgAdvisoryXactLock).toHaveBeenCalledTimes(2);
    expect(pgAdvisoryXactLock.mock.calls[0]?.[1]).toBe(a);
    expect(pgAdvisoryXactLock.mock.calls[1]?.[1]).toBe(b);
  });
});
