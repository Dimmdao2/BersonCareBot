import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const poolQueryMock = vi.hoisted(() => vi.fn());
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: poolQueryMock })));

vi.mock("@/infra/db/runWebappSql", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/db/runWebappSql")>();
  return {
    ...actual,
    runWebappPgText: runWebappPgTextMock,
    // Transaction wrapper just invokes the callback with a fake tx handle;
    // runWebappPgText is mocked so the handle is never dereferenced.
    runWebappTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
});

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { createPgEmailOtpPublicPort } from "./pgEmailOtpPublic";

describe("pgEmailOtpPublic.findOrCreatePublicEmailUser", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    poolQueryMock.mockReset();
  });

  it("merged-away email resolves to the CANONICAL user (no ghost account)", async () => {
    // 1) canonical SELECT (merged_into_id IS NULL) — no row
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    // 2) merged SELECT (merged_into_id IS NOT NULL) — merged-away row found
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "merged-user" }] });
    // resolveCanonicalUserId path on the pool:
    // a) selectPlatformUserById("merged-user") → points at canon-user
    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        id: "merged-user",
        phone_normalized: null,
        integrator_user_id: null,
        merged_into_id: "canon-user",
        display_name: "Old",
        role: "client",
      }],
    });
    // b) followMergedIntoChain: canon-user has no further redirect
    poolQueryMock.mockResolvedValueOnce({ rows: [{ merged_into_id: null }] });

    const port = createPgEmailOtpPublicPort();
    const result = await port.findOrCreatePublicEmailUser("old-merged@example.com");

    expect(result).toEqual({ userId: "canon-user", wasCreated: false });
    // No INSERT was attempted — only the two SELECTs went through the tx.
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    const insertCalls = runWebappPgTextMock.mock.calls.filter(
      (c) => String(c[0]).includes("INSERT"),
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("unknown email (no canonical, no merged row) falls through to INSERT", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] }); // canonical SELECT
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] }); // merged SELECT
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "new-user" }] }); // INSERT RETURNING

    const port = createPgEmailOtpPublicPort();
    const result = await port.findOrCreatePublicEmailUser("brand-new@example.com");

    expect(result).toEqual({ userId: "new-user", wasCreated: true });
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("existing canonical email returns it directly without touching merge resolution", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "existing-user" }] });

    const port = createPgEmailOtpPublicPort();
    const result = await port.findOrCreatePublicEmailUser("known@example.com");

    expect(result).toEqual({ userId: "existing-user", wasCreated: false });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });
});
