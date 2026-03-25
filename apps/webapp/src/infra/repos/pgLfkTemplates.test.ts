import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock, connect: vi.fn() })));

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { createPgLfkTemplatesPort } from "./pgLfkTemplates";

describe("createPgLfkTemplatesPort", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("list includes exercise_count subquery", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkTemplatesPort();
    await port.list({ status: "draft" });
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("exercise_count");
    expect(sql).toContain("lfk_complex_template_exercises");
  });
});
