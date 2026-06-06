import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetPool, runWebappPgTextMock } = vi.hoisted(() => ({
  mockGetPool: vi.fn(),
  runWebappPgTextMock: vi.fn(),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: mockGetPool,
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlFromPgClient: (client: unknown) => client,
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

import { pgUserProjectionPort } from "./pgUserProjection";

describe("clearStaffAccountEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not_found_or_not_staff when user missing", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });

    const result = await pgUserProjectionPort.clearStaffAccountEmail("00000000-0000-4000-8000-000000000099");
    expect(result).toEqual({ ok: false, reason: "not_found_or_not_staff" });
  });

  it("returns already_empty when email is null", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ email: null }] });

    const result = await pgUserProjectionPort.clearStaffAccountEmail("00000000-0000-4000-8000-000000000001");
    expect(result).toEqual({ ok: false, reason: "already_empty" });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
  });

  it("clears email fields for staff user", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ email: "doc@example.org" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const userId = "00000000-0000-4000-8000-000000000002";
    const result = await pgUserProjectionPort.clearStaffAccountEmail(userId);
    expect(result).toEqual({ ok: true });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    const updateSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
    expect(updateSql).toContain("email = NULL");
    expect(updateSql).toContain("role IN ('doctor', 'admin')");
    expect(runWebappPgTextMock.mock.calls[1]?.[1]).toEqual([userId]);
  });
});
