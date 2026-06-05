import { describe, expect, it, vi, beforeEach } from "vitest";
import { checkAndRecordAuthRateLimitEvent } from "@/infra/repos/pgAuthRateLimitEvents";

const runWebappTransactionMock = vi.fn();
const runWebappSqlMock = vi.fn();
const runWebappPgTextMock = vi.fn();

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappTransaction: (...args: unknown[]) => runWebappTransactionMock(...args),
  runWebappSql: (...args: unknown[]) => runWebappSqlMock(...args),
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

describe("checkAndRecordAuthRateLimitEvent", () => {
  beforeEach(() => {
    runWebappTransactionMock.mockReset();
    runWebappSqlMock.mockReset();
    runWebappPgTextMock.mockReset();
  });

  it("returns true without insert when count is at max", async () => {
    runWebappTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<boolean>) => {
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ c: "40" }] });
      return fn({});
    });

    const limited = await checkAndRecordAuthRateLimitEvent({
      scope: "auth.check_phone",
      key: "+7900",
      windowMs: 3_600_000,
      maxPerWindow: 40,
    });

    expect(limited).toBe(true);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
  });

  it("records event and returns false when under max", async () => {
    runWebappTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<boolean>) => {
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ c: "2" }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });
      return fn({});
    });

    const limited = await checkAndRecordAuthRateLimitEvent({
      scope: "auth.oauth_start",
      key: "198.51.100.2",
      windowMs: 3_600_000,
      maxPerWindow: 60,
    });

    expect(limited).toBe(false);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(3);
    const insertSql = String(runWebappPgTextMock.mock.calls[2]?.[0] ?? "");
    expect(insertSql).toContain("INSERT INTO auth_rate_limit_events");
  });
});
