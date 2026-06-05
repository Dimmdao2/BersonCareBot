import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetPool } = vi.hoisted(() => ({
  mockGetPool: vi.fn(),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: mockGetPool,
}));

import { pgUserProjectionPort } from "./pgUserProjection";

describe("clearStaffAccountEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not_found_or_not_staff when user missing", async () => {
    const queryFn = vi.fn().mockResolvedValue({ rows: [] });
    mockGetPool.mockReturnValue({ query: queryFn });

    const result = await pgUserProjectionPort.clearStaffAccountEmail("00000000-0000-4000-8000-000000000099");
    expect(result).toEqual({ ok: false, reason: "not_found_or_not_staff" });
  });

  it("returns already_empty when email is null", async () => {
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ email: null }] });
    mockGetPool.mockReturnValue({ query: queryFn });

    const result = await pgUserProjectionPort.clearStaffAccountEmail("00000000-0000-4000-8000-000000000001");
    expect(result).toEqual({ ok: false, reason: "already_empty" });
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("clears email fields for staff user", async () => {
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ email: "doc@example.org" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mockGetPool.mockReturnValue({ query: queryFn });

    const userId = "00000000-0000-4000-8000-000000000002";
    const result = await pgUserProjectionPort.clearStaffAccountEmail(userId);
    expect(result).toEqual({ ok: true });
    expect(queryFn).toHaveBeenCalledTimes(2);
    const updateSql = queryFn.mock.calls[1]?.[0] as string;
    expect(updateSql).toContain("email = NULL");
    expect(updateSql).toContain("role IN ('doctor', 'admin')");
    expect(queryFn.mock.calls[1]?.[1]).toEqual([userId]);
  });
});
