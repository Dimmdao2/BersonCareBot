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

  it("prunes stale rows for the full F0 scope before checking a pseudonymous key", async () => {
    runWebappTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<boolean>) => {
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ c: "0" }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });
      return fn({});
    });

    const pseudonymousKey = `client-boot:v1:${"a".repeat(64)}`;
    await expect(checkAndRecordAuthRateLimitEvent({
      scope: "patient.client_boot_report",
      key: pseudonymousKey,
      windowMs: 3_600_000,
      maxPerWindow: 30,
      scopeRetentionMs: 3_600_000,
    })).resolves.toBe(false);

    expect(String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "")).toContain(
      "WHERE scope = $1 AND occurred_at <= $2",
    );
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      "patient.client_boot_report",
      expect.any(Date),
    ]);
    expect(runWebappPgTextMock.mock.calls[1]?.[1]).toEqual([
      "patient.client_boot_report",
      pseudonymousKey,
      expect.any(Date),
    ]);
  });
});
