import { describe, expect, it, vi } from "vitest";
import { resolveMergePreviewIntegratorUserPresenceForTest } from "./mergePreviewIntegratorUserPresence";

describe("resolveMergePreviewIntegratorUserPresenceForTest", () => {
  it("returns ok with no rows when both webapp ids are null", async () => {
    const pool = { query: vi.fn() };
    const r = await resolveMergePreviewIntegratorUserPresenceForTest(pool as never, {
      targetIntegratorUserId: null,
      duplicateIntegratorUserId: null,
    });
    expect(r.checkStatus).toBe("ok");
    expect(pool.query).not.toHaveBeenCalled();
    expect(r.target.rowExistsInIntegratorDb).toBeNull();
    expect(r.duplicate.rowExistsInIntegratorDb).toBeNull();
  });

  it("marks phantom when id not returned from integrator", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: "6" }] }),
    };
    const r = await resolveMergePreviewIntegratorUserPresenceForTest(pool as never, {
      targetIntegratorUserId: "188908348",
      duplicateIntegratorUserId: "6",
    });
    expect(r.checkStatus).toBe("ok");
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM users"),
      expect.arrayContaining([["188908348", "6"]]),
    );
    expect(r.target.rowExistsInIntegratorDb).toBe(false);
    expect(r.duplicate.rowExistsInIntegratorDb).toBe(true);
  });

  it("dedupes same id on both sides", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: "7" }] }),
    };
    await resolveMergePreviewIntegratorUserPresenceForTest(pool as never, {
      targetIntegratorUserId: "7",
      duplicateIntegratorUserId: "7",
    });
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [["7"]]);
  });

  it("returns query_failed when integrator query throws", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("boom")),
    };
    const r = await resolveMergePreviewIntegratorUserPresenceForTest(pool as never, {
      targetIntegratorUserId: "1",
      duplicateIntegratorUserId: null,
    });
    expect(r.checkStatus).toBe("query_failed");
    expect(r.target.rowExistsInIntegratorDb).toBeNull();
  });
});
