import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const runWebappTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
  runWebappTransaction: runWebappTransactionMock,
}));

import { createPgLfkAssignmentsPort } from "./pgLfkAssignments";

describe("createPgLfkAssignmentsPort", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappTransactionMock.mockReset();
    runWebappTransactionMock.mockImplementation(async (fn) => fn({ rollback: vi.fn() }));
  });

  it("throws when template is not published", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ id: "t1", title: "X", status: "draft" }],
    });

    const port = createPgLfkAssignmentsPort();
    await expect(
      port.assignPublishedTemplateToPatient({
        templateId: "t1",
        patientUserId: "00000000-0000-4000-8000-000000000001",
        assignedBy: null,
      }),
    ).rejects.toThrow(/не опубликован/);

    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
  });

  it("creates new complex and assignment for first assign", async () => {
    const exRow = {
      exercise_id: "e1",
      sort_order: 0,
      reps: null,
      sets: null,
      side: null,
      max_pain_0_10: null,
      comment: null,
    };
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [{ id: "t1", title: "Шаблон", status: "published" }],
      })
      .mockResolvedValueOnce({ rows: [exRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "cnew" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "anew" }] });

    const port = createPgLfkAssignmentsPort();
    const r = await port.assignPublishedTemplateToPatient({
      templateId: "t1",
      patientUserId: "00000000-0000-4000-8000-000000000001",
      assignedBy: "00000000-0000-4000-8000-000000000002",
    });
    expect(r.complexId).toBe("cnew");
    expect(r.assignmentId).toBe("anew");
    const joined = runWebappPgTextMock.mock.calls.map((c) => String(c[0])).join("\n");
    expect(joined).toContain("lfk_complex_exercises");
    expect(joined).toContain("local_comment");
    expect(joined).toContain("INSERT INTO patient_lfk_assignments");
  });

  it("updates existing assignment and deactivates prior complex", async () => {
    const exRow = {
      exercise_id: "e1",
      sort_order: 0,
      reps: null,
      sets: null,
      side: null,
      max_pain_0_10: null,
      comment: null,
    };
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [{ id: "t1", title: "Шаблон", status: "published" }],
      })
      .mockResolvedValueOnce({ rows: [exRow] })
      .mockResolvedValueOnce({ rows: [{ id: "asg-old", complex_id: "cold" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "cnew" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "asg-old" }] });

    const port = createPgLfkAssignmentsPort();
    const r = await port.assignPublishedTemplateToPatient({
      templateId: "t1",
      patientUserId: "00000000-0000-4000-8000-000000000001",
      assignedBy: null,
    });
    expect(r.assignmentId).toBe("asg-old");
    expect(r.complexId).toBe("cnew");
    const joined = runWebappPgTextMock.mock.calls.map((c) => String(c[0])).join("\n");
    expect(joined).toContain("UPDATE lfk_complexes SET is_active = false");
    expect(joined).toContain("UPDATE patient_lfk_assignments");
  });

  it("aborts assign when template has no exercises", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [{ id: "t1", title: "Шаблон", status: "published" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgLfkAssignmentsPort();
    await expect(
      port.assignPublishedTemplateToPatient({
        templateId: "t1",
        patientUserId: "00000000-0000-4000-8000-000000000001",
        assignedBy: null,
      }),
    ).rejects.toThrow(/нет упражнений/);
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
  });
});
