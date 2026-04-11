/** @vitest-environment node */

import { describe, expect, it, vi } from "vitest";
import { withTwoUserLifecycleLocksExclusive, withUserLifecycleLock } from "@/infra/userLifecycleLock";

describe("withUserLifecycleLock", () => {
  it("runs exclusive lock SQL in transaction before callback body", async () => {
    const order: string[] = [];
    const query = vi.fn((sql: string) => {
      order.push(sql);
      return Promise.resolve({ rows: [], rowCount: 0 });
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
    expect(order[1]).toContain("pg_advisory_xact_lock");
    expect(order[1]).not.toContain("shared");
    expect(order.some((s) => s.includes("SELECT 1"))).toBe(true);
    expect(order[order.length - 1]).toBe("COMMIT");
  });

  it("uses shared lock when mode is shared", async () => {
    const order: string[] = [];
    const query = vi.fn((sql: string) => {
      order.push(sql);
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const pool = {
      connect: () =>
        Promise.resolve({
          query,
          release: vi.fn(),
        }),
    };

    await withUserLifecycleLock(pool as never, "00000000-0000-4000-8000-000000000002", "shared", async () => "x");

    expect(order[1]).toContain("pg_advisory_xact_lock_shared");
  });
});

describe("withTwoUserLifecycleLocksExclusive", () => {
  it("runs two pg_advisory_xact_lock queries each with $1 (not $2 with one param)", async () => {
    const order: string[] = [];
    const query = vi.fn((sql: string) => {
      order.push(sql);
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const pool = {
      connect: () =>
        Promise.resolve({
          query,
          release: vi.fn(),
        }),
    };

    const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    await withTwoUserLifecycleLocksExclusive(pool as never, b, a, async (c) => {
      await c.query("SELECT 1");
      return "done";
    });

    expect(order[0]).toBe("BEGIN");
    const lockSqls = order.filter((s) => s.includes("pg_advisory_xact_lock"));
    expect(lockSqls).toHaveLength(2);
    expect(lockSqls[0]).toContain("$1::text");
    expect(lockSqls[0]).not.toContain("$2");
    expect(lockSqls[1]).toContain("$1::text");
    expect(lockSqls[1]).not.toContain("$2");
    expect(order[order.length - 1]).toBe("COMMIT");
  });
});
