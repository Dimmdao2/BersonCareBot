/** @vitest-environment node */

import { describe, expect, it, vi, beforeEach } from "vitest";

const { pgAdvisoryXactLock } = vi.hoisted(() => ({
  pgAdvisoryXactLock: vi.fn(),
}));

vi.mock("@/infra/db/pgAdvisoryLock", () => ({
  pgAdvisoryXactLock,
}));

import { withMultipartSessionLock } from "@/infra/multipartSessionLock";

describe("withMultipartSessionLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pgAdvisoryXactLock.mockResolvedValue(undefined);
  });

  it("locks multipart session key after BEGIN", async () => {
    const order: string[] = [];
    const query = vi.fn((sql: string) => {
      order.push(sql);
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const pool = {
      connect: () => Promise.resolve({ query, release: vi.fn() }),
    };

    await withMultipartSessionLock(pool as never, "sess-1", async () => "ok");

    expect(order[0]).toBe("BEGIN");
    expect(pgAdvisoryXactLock).toHaveBeenCalledWith(expect.anything(), "multipart_session:sess-1");
    expect(order[order.length - 1]).toBe("COMMIT");
  });
});
