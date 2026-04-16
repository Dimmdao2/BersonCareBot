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
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("exercise_count");
    expect(sql).toContain("lfk_complex_template_exercises");
  });

  it("list runs lightweight thumbnail query by default when templates exist", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          title: "T",
          description: null,
          status: "draft",
          created_by: null,
          created_at: new Date(),
          updated_at: new Date(),
          exercise_count: 0,
        },
      ],
    });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkTemplatesPort();
    await port.list({ status: "draft" });
    expect(queryMock).toHaveBeenCalledTimes(2);
    const thumbSql = String(queryMock.mock.calls[1]?.[0] ?? "");
    expect(thumbSql).toContain("te_ranked");
    expect(thumbSql).toContain("lfk_complex_template_exercises");
    expect(thumbSql).toContain("lfk_exercise_media");
  });

  it("list uses full exercise join query when includeExerciseDetails is true", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          title: "T",
          description: null,
          status: "draft",
          created_by: null,
          created_at: new Date(),
          updated_at: new Date(),
          exercise_count: 0,
        },
      ],
    });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgLfkTemplatesPort();
    await port.list({ status: "draft", includeExerciseDetails: true });
    expect(queryMock).toHaveBeenCalledTimes(2);
    const sql = String(queryMock.mock.calls[1]?.[0] ?? "");
    expect(sql).toContain("exercise_title");
    expect(sql).not.toContain("te_ranked");
  });
});
