import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const connectMock = vi.hoisted(() =>
  vi.fn(() => ({
    query: queryMock,
    release: vi.fn(),
  }))
);
const getPoolMock = vi.hoisted(() =>
  vi.fn(() => ({
    query: queryMock,
    connect: connectMock,
  }))
);

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { createPgLfkExercisesPort } from "./pgLfkExercises";

describe("createPgLfkExercisesPort", () => {
  beforeEach(() => {
    queryMock.mockReset();
    connectMock.mockClear();
  });

  it("list builds filter for load_type and archived", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkExercisesPort();
    await port.list({ loadType: "cardio", includeArchived: false });
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("load_type");
    expect(sql).toContain("is_archived = false");
  });

  it("archive updates is_archived", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });
    const port = createPgLfkExercisesPort();
    const ok = await port.archive("550e8400-e29b-41d4-a716-446655440000");
    expect(ok).toBe(true);
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("is_archived = true");
  });
});
