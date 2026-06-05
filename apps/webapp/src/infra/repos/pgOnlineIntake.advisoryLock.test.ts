/** @vitest-environment node */

import { describe, expect, it, vi, beforeEach } from "vitest";

const { pgAdvisoryXactLockShared, runWebappPgTextMock, txEventOrder } = vi.hoisted(() => ({
  pgAdvisoryXactLockShared: vi.fn(),
  runWebappPgTextMock: vi.fn(),
  txEventOrder: [] as string[],
}));

vi.mock("@/infra/db/pgAdvisoryLock", () => ({
  pgAdvisoryXactLockShared,
}));

vi.mock("@/infra/db/client", () => ({
  getPool: vi.fn(),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlFromPgClient: (client: unknown) => client,
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

vi.mock("@/infra/repos/pgMediaFileIntakeResolve", () => ({
  resolveMediaFileForLfkAttachment: vi.fn(),
}));

import { getPool } from "@/infra/db/client";
import { createPgOnlineIntakePort } from "@/infra/repos/pgOnlineIntake";

const userId = "00000000-0000-4000-8000-0000000000aa";
const requestId = "00000000-0000-4000-8000-0000000000bb";

function requestRow(type: "lfk" | "nutrition") {
  return {
    id: "req-1",
    user_id: userId,
    type,
    status: "new",
    summary: "x",
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function recordTxEvent(event: string) {
  txEventOrder.push(event);
}

function mockDefaultRunWebappPgText() {
  runWebappPgTextMock.mockImplementation((sql: string) => {
    if (sql.includes("INSERT INTO online_intake_requests")) {
      recordTxEvent("insert_request");
      return Promise.resolve({
        rows: [requestRow(sql.includes("'lfk'") ? "lfk" : "nutrition")],
      });
    }
    if (sql.includes("SELECT * FROM online_intake_requests WHERE id = $1 FOR UPDATE")) {
      return Promise.resolve({ rows: [requestRow("lfk")] });
    }
    if (sql.includes("UPDATE online_intake_requests")) {
      return Promise.resolve({
        rows: [{ ...requestRow("lfk"), status: "in_review" }],
      });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

function mockPool() {
  const txOrder: string[] = [];
  const query = vi.fn((sql: string) => {
    txOrder.push(sql);
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  vi.mocked(getPool).mockReturnValue({
    connect: () => Promise.resolve({ query, release: vi.fn() }),
  } as never);
  return { txOrder, query };
}

describe("createPgOnlineIntakePort advisory locks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txEventOrder.length = 0;
    pgAdvisoryXactLockShared.mockImplementation(async () => {
      recordTxEvent("advisory_lock");
    });
    mockDefaultRunWebappPgText();
  });

  it("createLfkRequest: BEGIN → shared xact lock → INSERT (domain) → COMMIT", async () => {
    const { txOrder } = mockPool();
    const port = createPgOnlineIntakePort();

    await port.createLfkRequest({ userId, description: "test description here" });

    expect(txOrder[0]).toBe("BEGIN");
    expect(pgAdvisoryXactLockShared).toHaveBeenCalledWith(expect.anything(), userId);
    expect(txEventOrder.indexOf("advisory_lock")).toBeLessThan(txEventOrder.indexOf("insert_request"));
    expect(txOrder.at(-1)).toBe("COMMIT");
    expect(txOrder).not.toContain("ROLLBACK");
  });

  it("createNutritionRequest: BEGIN → shared xact lock → INSERT (domain) → COMMIT", async () => {
    const { txOrder } = mockPool();
    const port = createPgOnlineIntakePort();

    await port.createNutritionRequest({ userId, description: "nutrition description" });

    expect(txOrder[0]).toBe("BEGIN");
    expect(pgAdvisoryXactLockShared).toHaveBeenCalledWith(expect.anything(), userId);
    expect(txEventOrder.indexOf("advisory_lock")).toBeLessThan(txEventOrder.indexOf("insert_request"));
    expect(txOrder.at(-1)).toBe("COMMIT");
    expect(txOrder).not.toContain("ROLLBACK");
  });

  it("createLfkRequest rolls back and skips COMMIT when domain SQL fails", async () => {
    const { txOrder } = mockPool();
    runWebappPgTextMock.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO online_intake_requests")) {
        return Promise.reject(new Error("insert_failed"));
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const port = createPgOnlineIntakePort();

    await expect(port.createLfkRequest({ userId, description: "test description here" })).rejects.toThrow(
      "insert_failed",
    );

    expect(txOrder[0]).toBe("BEGIN");
    expect(txOrder).toContain("ROLLBACK");
    expect(txOrder).not.toContain("COMMIT");
  });
});

describe("createPgOnlineIntakePort changeStatus transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txEventOrder.length = 0;
    mockDefaultRunWebappPgText();
  });

  it("changeStatus uses Class C TX without advisory lock", async () => {
    const { txOrder } = mockPool();
    const port = createPgOnlineIntakePort();

    const updated = await port.changeStatus({
      requestId,
      toStatus: "in_review",
      changedBy: userId,
    });

    expect(pgAdvisoryXactLockShared).not.toHaveBeenCalled();
    expect(txOrder[0]).toBe("BEGIN");
    expect(txOrder.at(-1)).toBe("COMMIT");
    expect(
      runWebappPgTextMock.mock.calls.some((c) =>
        String(c[0]).includes("SELECT * FROM online_intake_requests WHERE id = $1 FOR UPDATE"),
      ),
    ).toBe(true);
    expect(updated.status).toBe("in_review");
  });

  it("changeStatus rolls back when request is missing", async () => {
    const { txOrder } = mockPool();
    runWebappPgTextMock.mockImplementation((sql: string) => {
      if (sql.includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const port = createPgOnlineIntakePort();

    await expect(
      port.changeStatus({ requestId, toStatus: "in_review", changedBy: userId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(txOrder).toContain("ROLLBACK");
    expect(txOrder).not.toContain("COMMIT");
  });
});
