import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const clientQueryMock = vi.hoisted(() => vi.fn());
const connectMock = vi.hoisted(() =>
  vi.fn(async () => ({
    query: clientQueryMock,
    release: vi.fn(),
  })),
);
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ connect: connectMock })));

vi.mock("@/infra/db/runWebappSql", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/db/runWebappSql")>();
  return {
    ...actual,
    runWebappPgText: runWebappPgTextMock,
  };
});

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        orderBy: vi.fn(async () => []),
      })),
    })),
  })),
}));

import { createPgDoctorMotivationQuotesEditorPort } from "./pgDoctorMotivationQuotesEditor";

describe("pgDoctorMotivationQuotesEditor", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    clientQueryMock.mockReset();
    connectMock.mockClear();
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  it("upsertQuote updates existing row via runWebappPgText", async () => {
    const port = createPgDoctorMotivationQuotesEditorPort();
    await port.upsertQuote({
      id: "q1",
      bodyText: "Hello",
      author: "A",
      isActive: true,
      sortOrder: 2,
    });

    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("UPDATE motivational_quotes");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["q1", "Hello", "A", true, 2]);
  });

  it("upsertQuote inserts with next sort_order", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ n: "3" }] })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgDoctorMotivationQuotesEditorPort();
    await port.upsertQuote({
      bodyText: "New",
      author: null,
      isActive: false,
    });

    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("MAX(sort_order)");
    expect(String(runWebappPgTextMock.mock.calls[1]?.[0])).toContain("INSERT INTO motivational_quotes");
    expect(runWebappPgTextMock.mock.calls[1]?.[1]).toEqual(["New", null, false, 3]);
  });

  it("setQuoteArchived updates archived_at", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const port = createPgDoctorMotivationQuotesEditorPort();
    await port.setQuoteArchived("q1", true);

    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("archived_at");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]?.[0]).toBe("q1");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]?.[1]).toBeInstanceOf(Date);
  });

  it("setQuoteActive updates is_active", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const port = createPgDoctorMotivationQuotesEditorPort();
    await port.setQuoteActive("q1", false);

    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("is_active = $2");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["q1", false]);
  });

  it("reorderQuotes runs updates in transaction", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ id: "a" }, { id: "b" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const port = createPgDoctorMotivationQuotesEditorPort();
    await port.reorderQuotes(["b", "a"]);

    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(3);
    expect(runWebappPgTextMock.mock.calls[1]?.[1]).toEqual([0, "b"]);
    expect(runWebappPgTextMock.mock.calls[2]?.[1]).toEqual([1, "a"]);
  });

  it("reorderQuotes rolls back when id count mismatches db", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "a" }] });

    const port = createPgDoctorMotivationQuotesEditorPort();
    await expect(port.reorderQuotes(["a", "b"])).rejects.toThrow("mismatch");

    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQueryMock).not.toHaveBeenCalledWith("COMMIT");
  });

  it("reorderQuotes rolls back when ordered id is unknown", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "a" }, { id: "b" }] });

    const port = createPgDoctorMotivationQuotesEditorPort();
    await expect(port.reorderQuotes(["a", "missing"])).rejects.toThrow("unknown");

    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });
});
