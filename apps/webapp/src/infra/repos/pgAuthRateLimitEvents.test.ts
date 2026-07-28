import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  checkAndRecordAuthRateLimitEvent,
  countActiveAuthRateLimitEvents,
  recordAndCountAuthRateLimitEvent,
  resetAuthRateLimitEvents,
} from "@/infra/repos/pgAuthRateLimitEvents";

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
    expect(insertSql).toContain("app.auth_rate_limit_record($1, $2)");
  });

  it("returns the post-record count for password backoff scheduling", async () => {
    runWebappTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ c: "4" }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });
      return fn({});
    });

    await expect(recordAndCountAuthRateLimitEvent({
      scope: "auth.password_identifier_failure",
      key: "password-email:v1:opaque",
      windowMs: 86_400_000,
      maxPerWindow: 10,
    })).resolves.toEqual({ limited: false, attempts: 5 });
  });

  it("counts and resets an exact active bucket through the existing accessors", async () => {
    runWebappTransactionMock
      .mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
        runWebappPgTextMock
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ c: "7" }] });
        return fn({});
      })
      .mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
        runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
        return fn({});
      });

    await expect(countActiveAuthRateLimitEvents({
      scope: "auth.password_identifier_failure",
      key: "password-email:v1:opaque",
      windowMs: 86_400_000,
    })).resolves.toBe(7);
    await expect(resetAuthRateLimitEvents({
      scope: "auth.password_identifier_failure",
      key: "password-email:v1:opaque",
    })).resolves.toBeUndefined();

    expect(
      runWebappPgTextMock.mock.calls.filter((call) =>
        String(call[0]).includes("app.auth_rate_limit_prune_key"),
      ),
    ).toHaveLength(2);
  });

  it("prunes stale rows for the full F0 scope before checking a pseudonymous key", async () => {
    runWebappTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<boolean>) => {
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [{ acquired: true }] })
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
      scopePrune: { retentionMs: 3_600_000, batchSize: 50_000 },
    })).resolves.toBe(false);

    expect(String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "")).toContain(
      "pg_try_advisory_xact_lock",
    );
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      "auth-rate-limit-scope-prune:patient.client_boot_report",
    ]);
    const pruneSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
    expect(pruneSql).toContain("app.auth_rate_limit_prune_scope($1, $2, $3)");
    expect(runWebappPgTextMock.mock.calls[1]?.[1]).toEqual([
      "patient.client_boot_report",
      expect.any(Date),
      1_000,
    ]);
    expect(runWebappPgTextMock.mock.calls[2]?.[1]).toEqual([
      "patient.client_boot_report",
      pseudonymousKey,
      expect.any(Date),
    ]);
  });

  it("skips the cleanup batch when another process holds the scope lock and preserves the limit decision", async () => {
    runWebappTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<boolean>) => {
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [{ acquired: false }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ c: "30" }] });
      return fn({});
    });

    await expect(checkAndRecordAuthRateLimitEvent({
      scope: "patient.client_boot_report",
      key: `client-boot:v1:${"b".repeat(64)}`,
      windowMs: 3_600_000,
      maxPerWindow: 30,
      scopePrune: { retentionMs: 3_600_000, batchSize: 500 },
    })).resolves.toBe(true);

    expect(runWebappPgTextMock).toHaveBeenCalledTimes(3);
    expect(String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "")).toContain(
      "app.auth_rate_limit_prune_key($1, $2, $3)",
    );
  });
});
