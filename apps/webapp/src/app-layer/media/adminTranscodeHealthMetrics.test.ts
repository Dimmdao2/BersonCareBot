import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDrizzleMock, poolQueryMock } = vi.hoisted(() => ({
  getDrizzleMock: vi.fn(),
  poolQueryMock: vi.fn(),
}));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: getDrizzleMock,
}));

vi.mock("@/app-layer/db/client", () => ({
  getPool: vi.fn(() => ({ query: poolQueryMock })),
}));

vi.mock("@/app-layer/logging/logger", () => ({
  logger: { error: vi.fn() },
}));

import { loadAdminTranscodeHealthMetrics } from "./adminTranscodeHealthMetrics";

function mockSelectSequence(rowsPerCall: unknown[][]) {
  const selectMock = vi.fn();
  for (const rows of rowsPerCall) {
    const whereMock = vi.fn().mockResolvedValue(rows);
    const fromMock = vi.fn(() => ({ where: whereMock }));
    selectMock.mockImplementationOnce(() => ({ from: fromMock }));
  }
  getDrizzleMock.mockReturnValue({ select: selectMock });
  return selectMock;
}

describe("loadAdminTranscodeHealthMetrics", () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
    poolQueryMock.mockReset();
    poolQueryMock.mockResolvedValue({ rows: [{ c: "0" }] });
  });

  it("maps parallel aggregates and parses avg / oldest pending age", async () => {
    mockSelectSequence([
      [{ c: 4 }],
      [{ c: 1 }],
      [{ c: 10 }],
      [{ c: 2 }],
      [{ c: 20 }],
      [{ c: 3 }],
      [{ c: 100 }],
      [{ c: 5 }],
      [{ avgMs: "2500.75" }],
      [{ oldestSec: "90.25" }],
    ]);

    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ c: "42" }] })
      .mockResolvedValueOnce({ rows: [{ c: "7" }] });

    const result = await loadAdminTranscodeHealthMetrics();

    expect(result).toEqual({
      pendingCount: 4,
      processingCount: 1,
      doneLastHour: 10,
      failedLastHour: 2,
      doneLast24h: 20,
      failedLast24h: 3,
      doneLifetime: 100,
      failedLifetime: 5,
      avgProcessingMsDoneLastHour: 2501,
      oldestPendingAgeSeconds: 90,
      legacyReconcileCandidateCountWithinSizeCap: 42,
      readableVideoReadyWithHlsCount: 7,
    });
  });

  it("returns null oldest age when no pending jobs", async () => {
    mockSelectSequence([
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ avgMs: null }],
      [{ oldestSec: "999" }],
    ]);

    const result = await loadAdminTranscodeHealthMetrics();

    expect(result.pendingCount).toBe(0);
    expect(result.oldestPendingAgeSeconds).toBeNull();
  });

  it("returns null avg when avg row is empty or non-finite", async () => {
    mockSelectSequence([
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ avgMs: "" }],
      [{ oldestSec: null }],
    ]);

    const r1 = await loadAdminTranscodeHealthMetrics();
    expect(r1.avgProcessingMsDoneLastHour).toBeNull();

    mockSelectSequence([
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ c: 0 }],
      [{ avgMs: "not-a-number" }],
      [{ oldestSec: null }],
    ]);
    const r2 = await loadAdminTranscodeHealthMetrics();
    expect(r2.avgProcessingMsDoneLastHour).toBeNull();
  });
});
