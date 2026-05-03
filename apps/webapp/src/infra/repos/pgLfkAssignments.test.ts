import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, releaseMock, connectMock, getPoolMock } = vi.hoisted(() => {
  const q = vi.fn();
  const r = vi.fn();
  const c = vi.fn(() => ({ query: q, release: r }));
  const gp = vi.fn(() => ({ connect: c }));
  return { queryMock: q, releaseMock: r, connectMock: c, getPoolMock: gp };
});

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { createPgLfkAssignmentsPort } from "./pgLfkAssignments";

describe("createPgLfkAssignmentsPort", () => {
  beforeEach(() => {
    queryMock.mockReset();
    connectMock.mockClear();
    releaseMock.mockClear();
  });

  it("rolls back when template is not published", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: "t1", title: "X", status: "draft" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgLfkAssignmentsPort();
    await expect(
      port.assignPublishedTemplateToPatient({
        templateId: "t1",
        patientUserId: "00000000-0000-4000-8000-000000000001",
        assignedBy: null,
      })
    ).rejects.toThrow(/не опубликован/);

    const rollbacks = queryMock.mock.calls.filter((c) => String(c[0]) === "ROLLBACK");
    expect(rollbacks.length).toBeGreaterThanOrEqual(1);
    expect(releaseMock).toHaveBeenCalled();
  });

  it("commits new complex and assignment for first assign", async () => {
    const exRow = {
      exercise_id: "e1",
      sort_order: 0,
      reps: null,
      sets: null,
      side: null,
      max_pain_0_10: null,
      comment: null,
    };
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: "t1", title: "Шаблон", status: "published" }],
      })
      .mockResolvedValueOnce({ rows: [exRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "cnew" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "anew" }] })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgLfkAssignmentsPort();
    const r = await port.assignPublishedTemplateToPatient({
      templateId: "t1",
      patientUserId: "00000000-0000-4000-8000-000000000001",
      assignedBy: "00000000-0000-4000-8000-000000000002",
    });
    expect(r.complexId).toBe("cnew");
    expect(r.assignmentId).toBe("anew");
    const joined = queryMock.mock.calls.map((c) => String(c[0])).join("\n");
    expect(joined).toContain("lfk_complex_exercises");
    expect(joined).toContain("local_comment");
    expect(joined).toContain("COMMIT");
  });
});
