/** @vitest-environment node */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";

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
const organizationId = "10000000-0000-4000-8000-000000000001";

function requestRow(type: "lfk" | "nutrition") {
  return {
    id: "req-1",
    user_id: userId,
    organization_id: null,
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
    if (sql.includes("FROM org_enrollments")) {
      return Promise.resolve({ rows: [{ organization_id: organizationId }] });
    }
    if (sql.includes("INSERT INTO online_intake_requests")) {
      recordTxEvent("insert_request");
      return Promise.resolve({
        rows: [{ ...requestRow(sql.includes("'lfk'") ? "lfk" : "nutrition"), organization_id: organizationId }],
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

  it("createLfkRequest stamps organization from active enrollment when no principal is set", async () => {
    mockPool();
    const port = createPgOnlineIntakePort();

    await port.createLfkRequest({ userId, description: "test description here" });

    const requestInsert = runWebappPgTextMock.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO online_intake_requests"),
    );
    expect(requestInsert?.[1]).toEqual(expect.arrayContaining([organizationId]));
    const answerInsert = runWebappPgTextMock.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO online_intake_answers"),
    );
    expect(answerInsert?.[1]).toEqual(expect.arrayContaining([organizationId]));
    const historyInsert = runWebappPgTextMock.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO online_intake_status_history"),
    );
    expect(historyInsert?.[1]).toEqual(expect.arrayContaining([organizationId]));
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

  it("changeStatus rolls back when current organization principal differs from request organization", async () => {
    const { txOrder } = mockPool();
    runWebappPgTextMock.mockImplementation((sql: string) => {
      if (sql.includes("FOR UPDATE")) {
        return Promise.resolve({
          rows: [{ ...requestRow("lfk"), organization_id: "20000000-0000-4000-8000-000000000002" }],
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const port = createPgOnlineIntakePort();

    await expect(
      runWithDbOrganizationPrincipal("10000000-0000-4000-8000-000000000001", () =>
        port.changeStatus({ requestId, toStatus: "in_review", changedBy: userId }),
      ),
    ).rejects.toThrow("organization_principal_mismatch");

    expect(txOrder).toContain("ROLLBACK");
    expect(txOrder).not.toContain("COMMIT");
  });
});
